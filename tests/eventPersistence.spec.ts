// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProtocolState,
  deviceProjectionKey,
  exportUserKeySet,
  generateUserKeySet,
  signEvent,
  type SignedEvent,
} from "@klinok/protocol";
import { AttestationService } from "../auth-node/src/attestation";
import { closeBrowserHeliaStorage, createBrowserHeliaInit } from "../src/repositories/browserStorage";
import { createAndStoreUserKeys, loadUserKeys } from "../src/repositories/deviceVault";
import { IndexedDbEventTransport, MemoryEventTransport } from "../src/repositories/eventTransport";
import { getPetKey, putPetKey } from "../src/repositories/petKeyVault";
import { parentOrdered, recoverableDeviceAttestations, waitForInitialReplication } from "../src/repositories/orbitTransport";

const databaseNames = [
  "klinok-events-v2",
  "klinok-identity-v2",
  "klinok-pet-keys-v2",
  "klinok-test-helia-blocks",
  "klinok-test-helia-data",
];

function event(eventId: string, parents: string[] = []): SignedEvent {
  return {
    schemaVersion: 1,
    database: "control",
    eventId,
    operationId: `operation-${eventId}`,
    eventType: "profile.updated",
    aggregateId: "account",
    resourceId: "account",
    createdAt: `2026-07-15T10:00:0${parents.length}.000Z`,
    actorAccountId: "account",
    actorDeviceId: "device",
    orbitIdentityId: "identity",
    activeRole: "owner",
    parents,
    keyVersion: 1,
    proofIds: [],
    metadata: {},
    keyring: [],
    payload: { algorithm: "AES-GCM-256", iv: "iv", ciphertext: "ciphertext" },
    signature: { algorithm: "ECDSA-P256-SHA256", value: "signature" },
  };
}

async function deleteDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`Database ${name} is still open.`));
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const name of databaseNames) await deleteDatabase(name);
});

describe("durable browser event storage", () => {
  it("tracks account-scoped memory sync state and quarantines the full rejected dependency closure", async () => {
    const transport = new MemoryEventTransport("account");
    const databaseListener = vi.fn();
    const syncListener = vi.fn();
    const unsubscribeDatabase = transport.subscribe("control", databaseListener);
    const unsubscribeSync = transport.subscribeSyncStatus(syncListener);
    const root = {
      ...event("root-device"),
      eventType: "device.rotated",
      resourceId: "device",
      metadata: { requestId: "device-request" },
    };
    const operationSibling = {
      ...event("operation-sibling"),
      database: "medical" as const,
      operationId: root.operationId,
      eventType: "medical.record.created",
    };
    const sameDevice = {
      ...event("same-device"),
      operationId: "another-operation",
    };
    const dependent = {
      ...event("dependent"),
      actorDeviceId: "another-device",
      proofIds: [operationSibling.eventId],
      metadata: { priorAuthorizedEventIds: [root.eventId] },
    };
    const otherAccount = {
      ...event("other-account"),
      actorAccountId: "other",
      actorDeviceId: "other-device",
    };

    await transport.initialize();
    await transport.append(root);
    await transport.append(root);
    await transport.append(operationSibling);
    await transport.append(sameDevice);
    await transport.append(dependent);
    await transport.queueOutbox(root);
    await transport.queueOutbox(operationSibling);
    await transport.queueOutbox(sameDevice);
    await transport.queueOutbox(dependent);
    await transport.queueOutbox(otherAccount);
    await transport.recordRetry(root, "deferred", "EVENT_PARENT_MISSING", "2026-07-15T10:01:00.000Z");
    await transport.recordRetry(root, "transient", "TRANSPORT_UNAVAILABLE");
    await transport.recordRetry(otherAccount, "deferred", "EVENT_PARENT_MISSING");
    await transport.recordConflict({
      eventId: root.eventId,
      database: "control",
      code: "OLD",
      message: "old",
      createdAt: root.createdAt,
    });
    await transport.recordConflict({
      eventId: root.eventId,
      database: "control",
      code: "DEVICE_BINDING_INVALID",
      message: "updated",
      createdAt: root.createdAt,
    });
    await transport.removeConflict("missing-conflict");
    await transport.dismissNotification("missing-notification");

    expect(await transport.syncStatus()).toMatchObject({
      pendingCount: 4,
      deferredCount: 0,
      failedCount: 1,
      oldestPendingAt: root.createdAt,
    });

    const notification = await transport.recordPermanentRejection(root, "DEVICE_BINDING_INVALID");
    expect(notification).toMatchObject({
      action: "device",
      relatedRoute: "/profile#devices",
      affectedEventIds: expect.arrayContaining([
        root.eventId,
        operationSibling.eventId,
        sameDevice.eventId,
        dependent.eventId,
      ]),
    });
    expect(await transport.list("control")).toEqual([]);
    expect(await transport.list("medical")).toEqual([]);
    expect(await transport.pendingOutbox()).toEqual([otherAccount]);
    expect(await transport.listNotifications()).toEqual([notification]);
    expect(databaseListener).toHaveBeenCalled();
    expect(syncListener).toHaveBeenCalled();

    await transport.dismissNotification(notification.notificationId);
    expect(await transport.syncStatus()).toMatchObject({
      pendingCount: 0,
      permanentNotificationCount: 0,
      failedCount: 1,
    });
    await transport.removeConflict(root.eventId);
    await transport.removeRetry(root.eventId);
    await transport.removeOutbox(otherAccount.eventId);
    expect(await transport.syncStatus()).toMatchObject({ pendingCount: 0, failedCount: 0 });

    unsubscribeDatabase();
    unsubscribeSync();
    await transport.dispose();
  });

  it("builds permission and return routes for permanent sync notifications", async () => {
    const transport = new MemoryEventTransport();
    const permission = await transport.recordPermanentRejection(event("permission"), "ROLE_DECISION_FORBIDDEN");
    const doctorMedical = {
      ...event("medical-doctor"),
      database: "medical" as const,
      activeRole: "doctor" as const,
      aggregateId: "pet/id",
    };
    const returned = await transport.recordPermanentRejection(doctorMedical, "EVENT_SIGNATURE_INVALID");

    expect(permission).toMatchObject({ action: "permissions", relatedRoute: "/profile#roles" });
    expect(returned).toMatchObject({ action: "return", relatedRoute: "/doctor/pets/pet%2Fid" });
    expect(await transport.listNotifications()).toHaveLength(2);
  });

  it("caches remote events by key without scanning stores or re-entering an overridden list method", async () => {
    class RemoteCachingTransport extends IndexedDbEventTransport {
      listCalls = 0;

      override async list(database: "control" | "medical"): Promise<SignedEvent[]> {
        this.listCalls += 1;
        const local = await super.list(database);
        await this.cacheEvents([], false);
        return local;
      }

      cache(events: SignedEvent[]): Promise<Set<"control" | "medical">> {
        return this.cacheEvents(events, false);
      }
    }

    const transport = new RemoteCachingTransport();
    await transport.initialize();
    const saved = event("remote-event");
    const crossDatabaseDuplicate = { ...saved, database: "medical" as const };
    const getAll = vi.spyOn(IDBObjectStore.prototype, "getAll");

    await expect(transport.cache([saved, crossDatabaseDuplicate])).resolves.toEqual(new Set(["control"]));
    await expect(transport.cache([crossDatabaseDuplicate])).resolves.toEqual(new Set());
    expect(getAll).not.toHaveBeenCalled();
    expect(transport.listCalls).toBe(0);
    await expect(transport.list("control")).resolves.toEqual([saved]);
    await expect(transport.list("medical")).resolves.toEqual([]);
    expect(transport.listCalls).toBe(2);
    await transport.dispose();
  });

  it("rejects IndexedDB operations before initialization", async () => {
    const transport = new IndexedDbEventTransport();
    await expect(transport.list("control")).rejects.toThrow("Хранилище событий не инициализировано.");
  });

  it("revalidates a legacy cross-account attestation conflict for requeue", async () => {
    const attestation = await AttestationService.create();
    const authAttestationPublicKey = await attestation.publicJwk();
    const sharedDeviceId = "shared-browser-device";
    const firstKeys = await generateUserKeySet();
    const firstExported = await exportUserKeySet(firstKeys);
    const firstCertificate = await attestation.certificate({
      enrollmentId: "first-enrollment", operationId: "first-operation", accountId: "first-account",
      deviceId: sharedDeviceId, orbitIdentityId: `klinok-device-${sharedDeviceId}`, status: "active",
      signingPublicKey: firstExported.signingPublicKey, encryptionPublicKey: firstExported.encryptionPublicKey,
      createdAt: "2026-07-15T10:00:00.000Z",
    });
    const secondKeys = await generateUserKeySet();
    const secondExported = await exportUserKeySet(secondKeys);
    const secondCertificate = await attestation.certificate({
      enrollmentId: "second-enrollment", operationId: "second-operation", accountId: "second-account",
      deviceId: sharedDeviceId, orbitIdentityId: `klinok-device-${sharedDeviceId}`, status: "active",
      signingPublicKey: secondExported.signingPublicKey, encryptionPublicKey: secondExported.encryptionPublicKey,
      createdAt: "2026-07-15T10:01:00.000Z",
    });
    const secondEvent = await signEvent({
      schemaVersion: 1, database: "control", eventId: "second-attestation", operationId: "second-operation",
      eventType: "device.attested", aggregateId: "second-account", resourceId: sharedDeviceId,
      createdAt: "2026-07-15T10:01:00.000Z", actorAccountId: "second-account", actorDeviceId: sharedDeviceId,
      orbitIdentityId: `klinok-device-${sharedDeviceId}`, activeRole: "owner", parents: [], keyVersion: 1,
      proofIds: [], metadata: { certificate: secondCertificate as unknown as Record<string, unknown> }, keyring: [],
      payload: { algorithm: "AES-GCM-256", iv: "iv", ciphertext: "ciphertext" },
    }, secondKeys.signingPrivateKey);
    const state = createProtocolState("bootstrap-administrator");
    state.devices.set(deviceProjectionKey(firstCertificate.accountId, firstCertificate.deviceId), firstCertificate);

    await expect(recoverableDeviceAttestations(
      [secondEvent],
      [{ eventId: secondEvent.eventId, database: "control", code: "DEVICE_BINDING_INVALID", message: "legacy collision", createdAt: secondEvent.createdAt }],
      state,
      { authAttestationPublicKey },
    )).resolves.toEqual([secondEvent]);
  });

  it("retains events, pending work, and conflict history without carrying failure status into a new session", async () => {
    const first = new IndexedDbEventTransport();
    await first.initialize();
    const saved = event("event-1");
    await first.append(saved);
    await first.queueOutbox(saved);
    await first.recordConflict({
      eventId: "rejected-event",
      database: "control",
      code: "EVENT_REJECTED",
      message: "Rejected",
      createdAt: saved.createdAt,
    });
    expect(await first.syncStatus()).toMatchObject({ pendingCount: 1, failedCount: 1 });
    await first.dispose();

    const reopened = new IndexedDbEventTransport();
    await reopened.initialize();
    expect(await reopened.list("control")).toEqual([saved]);
    expect(await reopened.pendingOutbox()).toEqual([saved]);
    expect(await reopened.listConflicts()).toEqual([expect.objectContaining({ eventId: "rejected-event" })]);
    expect(await reopened.syncStatus()).toMatchObject({ pendingCount: 1, failedCount: 0 });
    await reopened.recordConflict({
      eventId: "current-session-rejection",
      database: "control",
      code: "EVENT_REJECTED",
      message: "Rejected in the current session",
      createdAt: saved.createdAt,
    });
    expect(await reopened.syncStatus()).toMatchObject({ pendingCount: 1, failedCount: 1 });
    await reopened.removeConflict("current-session-rejection");
    expect(await reopened.listConflicts()).toEqual([expect.objectContaining({ eventId: "rejected-event" })]);
    expect(await reopened.syncStatus()).toMatchObject({ pendingCount: 1, failedCount: 0 });
    await reopened.dispose();
  });

  it("retains user and pet encryption keys after reopening their vaults", async () => {
    const userKeys = await createAndStoreUserKeys("account");
    const dataKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    await putPetKey("account", "pet", 3, dataKey);
    const staleDataKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    await putPetKey("account", "pet", 2, staleDataKey);

    expect((await loadUserKeys("account"))?.version).toBe(userKeys.version);
    expect(await getPetKey("account", "pet")).toMatchObject({ version: 3, key: expect.any(CryptoKey) });
  });

  it("closes browser Helia stores before their IndexedDB databases are deleted", async () => {
    const storage = await createBrowserHeliaInit("klinok-test-helia");
    await closeBrowserHeliaStorage(storage);

    await expect(deleteDatabase("klinok-test-helia-blocks")).resolves.toBeUndefined();
    await expect(deleteDatabase("klinok-test-helia-data")).resolves.toBeUndefined();
  });

  it("orders queued descendants after their parents", () => {
    const root = event("root");
    const child = event("child", [root.eventId]);
    const grandchild = event("grandchild", [child.eventId]);
    expect(parentOrdered([grandchild, child, root]).map((item) => item.eventId)).toEqual(["root", "child", "grandchild"]);
  });

  it("falls back to deterministic ordering for a cyclic parent graph", () => {
    const first = event("cycle-a", ["cycle-b"]);
    const second = event("cycle-b", ["cycle-a"]);
    expect(parentOrdered([second, first]).map((item) => item.eventId)).toEqual(["cycle-a", "cycle-b"]);
  });

  it("prioritizes a newer device attestation ahead of a large medical queue", () => {
    const medical = Array.from({ length: 120 }, (_, index) => ({
      ...event(`medical-${index}`),
      database: "medical" as const,
      eventType: "medical.record.created",
      createdAt: `2026-07-15T09:${String(index % 60).padStart(2, "0")}:00.000Z`,
    }));
    const attestation = {
      ...event("attestation"),
      eventType: "device.attested",
      createdAt: "2026-07-15T11:00:00.000Z",
    };

    expect(parentOrdered([...medical, attestation])[0]?.eventId).toBe(attestation.eventId);
  });

  it("separates deferred work from account-scoped permanent notifications and rolls rejected operations back", async () => {
    class ObservableTransport extends IndexedDbEventTransport {
      updateConnectionState() {
        return this.setSyncState({ syncing: true, lastError: "retrying", connectionState: "error" });
      }
    }
    const transport = new ObservableTransport("account");
    await transport.initialize();
    const controlListener = vi.fn();
    const medicalListener = vi.fn();
    transport.subscribe("control", controlListener);
    transport.subscribe("medical", medicalListener);
    const root = event("root");
    const child = {
      ...event("child", [root.eventId]),
      operationId: root.operationId,
      database: "medical" as const,
      eventType: "medical.record.created",
    };
    const otherAccount = { ...event("other"), actorAccountId: "other-account" };
    await transport.append(root);
    await transport.append(child);
    await transport.queueOutbox(root);
    await transport.queueOutbox(child);
    await transport.queueOutbox(otherAccount);
    await transport.recordRetry(root, "deferred", "EVENT_PARENT_MISSING");
    await transport.recordRetry(otherAccount, "deferred", "EVENT_PARENT_MISSING");
    expect(controlListener).toHaveBeenCalled();
    expect(medicalListener).toHaveBeenCalled();

    expect(await transport.syncStatus()).toMatchObject({
      pendingCount: 2,
      deferredCount: 1,
      permanentNotificationCount: 0,
    });

    const notification = await transport.recordPermanentRejection(root, "ROLE_DECISION_FORBIDDEN");
    expect(notification?.affectedEventIds).toEqual(expect.arrayContaining([root.eventId, child.eventId]));
    expect(await transport.list("control")).not.toContainEqual(expect.objectContaining({ eventId: root.eventId }));
    expect(await transport.list("medical")).not.toContainEqual(expect.objectContaining({ eventId: child.eventId }));
    expect(await transport.syncStatus()).toMatchObject({
      pendingCount: 0,
      deferredCount: 0,
      permanentNotificationCount: 1,
    });
    expect(await transport.listNotifications()).toEqual([
      expect.objectContaining({ accountId: "account", operationId: root.operationId, reasonKey: "permission" }),
    ]);
    expect(controlListener).toHaveBeenCalledTimes(2);
    expect(medicalListener).toHaveBeenCalledTimes(2);

    await transport.dismissNotification("missing-notification");
    await transport.dismissNotification(notification!.notificationId);
    expect(await transport.syncStatus()).toMatchObject({ permanentNotificationCount: 0 });
    await transport.recordPermanentRejection(event("second-rejection"), "EVENT_SIGNATURE_INVALID");
    expect(await transport.listNotifications()).toHaveLength(2);
    await transport.removeRetry(otherAccount.eventId);
    await transport.removeOutbox(otherAccount.eventId);
    await transport.updateConnectionState();
    expect(await transport.syncStatus()).toMatchObject({
      syncing: true,
      lastError: "retrying",
      connectionState: "error",
    });
    await transport.dispose();
  });

  it("waits for OrbitDB to finish exchanging peer heads", async () => {
    const listeners = new Set<(...args: unknown[]) => void>();
    const ready = waitForInitialReplication({
      add: async () => undefined,
      iterator: async function* () {},
      close: async () => undefined,
      events: {
        on: (_name, listener) => listeners.add(listener),
        off: (_name, listener) => listeners.delete(listener),
      },
    }, 100);

    expect(listeners.size).toBe(1);
    for (const listener of listeners) listener("trusted-peer", []);
    await expect(ready).resolves.toBe(true);
    expect(listeners.size).toBe(0);
  });
});
