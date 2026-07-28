// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SignedEvent } from "@klinok/protocol";
import { IndexedDbEventTransport, type SyncNotification } from "../src/repositories/eventTransport";
import { OrbitEventTransport } from "../src/repositories/orbitTransport";
import { createDefaultRuntimeConfig } from "../src/runtimeConfig";

function event(eventId: string, metadata: Record<string, unknown> = {}): SignedEvent {
  return {
    schemaVersion: 1,
    database: "control",
    eventId,
    operationId: `operation-${eventId}`,
    eventType: "profile.updated",
    aggregateId: "account",
    resourceId: "account",
    createdAt: `2026-07-20T10:00:${eventId.length.toString().padStart(2, "0")}.000Z`,
    actorAccountId: "account",
    actorDeviceId: "device",
    orbitIdentityId: "identity",
    activeRole: "owner",
    parents: [],
    keyVersion: 1,
    proofIds: [],
    metadata,
    keyring: [],
    payload: { algorithm: "AES-GCM-256", iv: "iv", ciphertext: "ciphertext" },
    signature: { algorithm: "ECDSA-P256-SHA256", value: "signature" },
  };
}

function transport() {
  return new OrbitEventTransport(createDefaultRuntimeConfig().p2p, "identity", "account");
}

type OrbitInternals = {
  disposing: boolean;
  retryDelay: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  flushPromise: Promise<void> | null;
  refreshPromise: Promise<void> | null;
  updateHandlers: Map<"control" | "medical", (...args: unknown[]) => void>;
  runtime: {
    helia: { stop(): Promise<unknown> };
    orbitdb: { stop(): Promise<unknown> };
    dbs: Record<"control" | "medical", {
      iterator(): AsyncIterable<unknown>;
      close(): Promise<void>;
      events?: {
        on?(name: string, listener: (...args: unknown[]) => void): void;
        off?(name: string, listener: (...args: unknown[]) => void): void;
      };
    }>;
    storage: {
      blockstore: { close(): Promise<void> };
      datastore: { close(): Promise<void> };
    };
  } | null;
  accessProjector: {
    import(events: SignedEvent[]): Promise<unknown>;
    listDeferred(): unknown[];
    listConflicts(): unknown[];
  };
  remoteList(db: { iterator(): AsyncIterable<unknown> }): Promise<SignedEvent[]>;
  refreshRemoteState(): Promise<void>;
  refreshRemoteStateNow(): Promise<void>;
  flushOutbox(): Promise<void>;
  flushOutboxNow(): Promise<void>;
  scheduleRetry(): void;
  setSyncState(input: {
    syncing?: boolean;
    lastError?: string;
    connectionState?: "connected" | "disconnected" | "error";
  }): Promise<void>;
};

function internals(value: OrbitEventTransport): OrbitInternals {
  return value as unknown as OrbitInternals;
}

async function deleteEventDatabase() {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("klinok-events-v2");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Event database is still open."));
  });
}

afterEach(async () => {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  await deleteEventDatabase();
});

describe("Orbit event synchronization", () => {
  it("merges remote events into the local cache and refreshes its projection once", async () => {
    const subject = transport();
    await IndexedDbEventTransport.prototype.initialize.call(subject);
    const remote = event("remote");
    const db = {
      iterator: async function* () {
        yield { payload: { value: { op: "ADD", value: remote } } };
        yield { payload: { value: { invalid: true } } };
      },
      close: vi.fn().mockResolvedValue(undefined),
    };
    const emptyDb = {
      iterator: async function* () {},
      close: vi.fn().mockResolvedValue(undefined),
    };
    const privateState = internals(subject);
    privateState.runtime = {
      helia: { stop: vi.fn().mockResolvedValue(undefined) },
      orbitdb: { stop: vi.fn().mockResolvedValue(undefined) },
      dbs: { control: db, medical: emptyDb },
      storage: {
        blockstore: { close: vi.fn().mockResolvedValue(undefined) },
        datastore: { close: vi.fn().mockResolvedValue(undefined) },
      },
    };
    vi.spyOn(privateState.accessProjector, "import").mockResolvedValue({
      accepted: [],
      deferred: [],
      conflicts: [],
    });

    await expect(privateState.remoteList(db)).resolves.toEqual([remote]);
    await expect(subject.list("control")).resolves.toEqual([remote]);
    await privateState.refreshRemoteStateNow();
    const refresh = Promise.resolve();
    privateState.refreshPromise = refresh;
    expect(privateState.refreshRemoteState()).toBe(refresh);
    privateState.refreshPromise = null;
    await privateState.refreshRemoteState();
    privateState.disposing = true;
    await expect(privateState.refreshRemoteStateNow()).resolves.toBeUndefined();
    privateState.disposing = false;

    privateState.refreshPromise = Promise.resolve();
    await subject.dispose();
    expect(db.close).toHaveBeenCalled();
  });

  it("acknowledges persisted events, quarantines rejected closures, and records deferred work", async () => {
    const subject = transport();
    const privateState = internals(subject);
    const persisted = event("persisted");
    const rejected = event("rejected");
    const quarantinedChild = event("quarantined-child");
    const deferred = event("deferred");
    const pending = [persisted, rejected, quarantinedChild, deferred];
    vi.spyOn(subject, "pendingOutbox")
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce([]);
    vi.spyOn(subject, "removeOutbox").mockResolvedValue(undefined);
    vi.spyOn(subject, "removeRetry").mockResolvedValue(undefined);
    vi.spyOn(subject, "removeConflict").mockResolvedValue(undefined);
    vi.spyOn(subject, "recordRetry").mockResolvedValue(undefined);
    vi.spyOn(subject, "recordPermanentRejection").mockResolvedValue({
      notificationId: "notification",
      accountId: "account",
      operationId: rejected.operationId,
      rootEventId: rejected.eventId,
      database: "control",
      eventType: rejected.eventType,
      code: "ROLE_DECISION_FORBIDDEN",
      reasonKey: "permission",
      diagnosticId: "diagnostic",
      affectedEventIds: [rejected.eventId, quarantinedChild.eventId],
      createdAt: rejected.createdAt,
      action: "permissions",
    } satisfies SyncNotification);
    const setSyncState = vi.spyOn(privateState, "setSyncState").mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [
        { eventId: "unknown", status: "persisted" },
        { eventId: persisted.eventId, status: "persisted" },
        { eventId: rejected.eventId, status: "rejected", code: "ROLE_DECISION_FORBIDDEN" },
        { eventId: quarantinedChild.eventId, status: "persisted" },
        { eventId: deferred.eventId, status: "deferred", code: "ROLE_PROOF_MISSING", message: "Waiting" },
      ],
    }))));

    await privateState.flushOutboxNow();

    expect(subject.removeOutbox).toHaveBeenCalledWith(persisted.eventId);
    expect(subject.recordPermanentRejection).toHaveBeenCalledWith(rejected, "ROLE_DECISION_FORBIDDEN");
    expect(subject.removeOutbox).not.toHaveBeenCalledWith(quarantinedChild.eventId);
    expect(subject.recordRetry).toHaveBeenCalledWith(
      deferred,
      "deferred",
      "ROLE_PROOF_MISSING",
      expect.any(String),
    );
    expect(setSyncState).toHaveBeenLastCalledWith({
      syncing: false,
      lastError: "Waiting",
      connectionState: "connected",
    });
    expect(privateState.retryDelay).toBe(1_000);
  });

  it("handles empty, oversized, invalid, and unavailable outbox submissions", async () => {
    vi.useFakeTimers();
    const subject = transport();
    const privateState = internals(subject);
    const setSyncState = vi.spyOn(privateState, "setSyncState").mockResolvedValue(undefined);
    const scheduleRetry = vi.spyOn(privateState, "scheduleRetry");

    vi.spyOn(subject, "pendingOutbox").mockResolvedValueOnce([]);
    await privateState.flushOutboxNow();
    expect(setSyncState).toHaveBeenCalledWith({ syncing: false, lastError: "" });

    const oversized = event("oversized", { body: "x".repeat(950_000) });
    vi.spyOn(subject, "pendingOutbox")
      .mockResolvedValueOnce([oversized])
      .mockResolvedValueOnce([oversized]);
    vi.spyOn(subject, "recordPermanentRejection").mockResolvedValue(null);
    await privateState.flushOutboxNow();
    expect(subject.recordPermanentRejection).toHaveBeenCalledWith(oversized, "EVENT_TOO_LARGE");
    expect(scheduleRetry).toHaveBeenCalled();

    const retrying = event("retrying");
    vi.mocked(subject.pendingOutbox)
      .mockResolvedValueOnce([retrying])
      .mockResolvedValueOnce([retrying]);
    const recordRetry = vi.spyOn(subject, "recordRetry").mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    await privateState.flushOutboxNow();
    expect(recordRetry).toHaveBeenCalledWith(retrying, "transient", "TRANSPORT_UNAVAILABLE");
    expect(setSyncState).toHaveBeenLastCalledWith(expect.objectContaining({
      connectionState: "disconnected",
      lastError: "Trusted node returned an invalid acknowledgement.",
    }));
    expect(privateState.retryDelay).toBe(2_000);

    if (privateState.retryTimer) clearTimeout(privateState.retryTimer);
    privateState.retryTimer = null;
    vi.mocked(subject.pendingOutbox)
      .mockResolvedValueOnce([retrying])
      .mockResolvedValueOnce([]);
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    await privateState.flushOutboxNow();
    expect(setSyncState).toHaveBeenLastCalledWith(expect.objectContaining({
      connectionState: "error",
      lastError: "Trusted node returned HTTP 503.",
    }));

    vi.mocked(subject.pendingOutbox).mockResolvedValueOnce([]);
    privateState.scheduleRetry();
    expect(privateState.retryTimer).not.toBeNull();
    privateState.scheduleRetry();
    await vi.runOnlyPendingTimersAsync();
  });

  it("coalesces concurrent flushes and skips work while disposing", async () => {
    const subject = transport();
    const privateState = internals(subject);
    const pending = Promise.resolve();
    privateState.flushPromise = pending;
    expect(privateState.flushOutbox()).toBe(pending);
    privateState.flushPromise = null;
    privateState.disposing = true;
    await expect(privateState.flushOutboxNow()).resolves.toBeUndefined();
    privateState.scheduleRetry();
    expect(privateState.retryTimer).toBeNull();
  });
});
