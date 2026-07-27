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
import { IndexedDbEventTransport } from "../src/repositories/eventTransport";
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
    const transport = new IndexedDbEventTransport("account");
    await transport.initialize();
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

    await transport.dismissNotification(notification!.notificationId);
    expect(await transport.syncStatus()).toMatchObject({ permanentNotificationCount: 0 });
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
