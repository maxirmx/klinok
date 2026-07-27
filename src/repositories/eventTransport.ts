// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type { DatabaseKind, SignedEvent } from "@klinok/protocol";
import { syncReasonKeyForCode } from "../russianMessages";

export interface AuthorizationConflict {
  eventId: string;
  database: DatabaseKind;
  code: string;
  message: string;
  createdAt: string;
}

export type SyncReasonKey =
  | "device"
  | "permission"
  | "parent"
  | "signature"
  | "size"
  | "invalid"
  | "unknown";

export type SyncNotificationAction = "return" | "device" | "permissions" | "none";

export interface SyncNotification {
  notificationId: string;
  accountId: string;
  operationId: string;
  rootEventId: string;
  database: DatabaseKind;
  eventType: string;
  code: string;
  reasonKey: SyncReasonKey;
  diagnosticId: string;
  affectedEventIds: string[];
  createdAt: string;
  action: SyncNotificationAction;
  relatedRoute?: string;
  dismissedAt?: string;
}

export interface SyncRetryState {
  eventId: string;
  accountId: string;
  status: "deferred" | "transient";
  code: string;
  attemptCount: number;
  firstAttemptAt: string;
  lastAttemptAt: string;
  nextRetryAt?: string;
}

export interface QuarantinedEvent {
  eventId: string;
  event: SignedEvent;
  code: string;
  diagnosticId: string;
  quarantinedAt: string;
}

export interface EventSyncStatus {
  pendingCount: number;
  deferredCount: number;
  permanentNotificationCount: number;
  /** Kept for internal callers while the UI uses permanentNotificationCount. */
  failedCount: number;
  syncing: boolean;
  connectionState: "connected" | "disconnected" | "error";
  lastError: string;
  oldestPendingAt?: string;
}

export interface EventTransport {
  initialize(): Promise<void>;
  list(database: DatabaseKind): Promise<SignedEvent[]>;
  append(event: SignedEvent): Promise<void>;
  subscribe(database: DatabaseKind, listener: () => void): () => void;
  listConflicts(): Promise<AuthorizationConflict[]>;
  recordConflict(conflict: AuthorizationConflict): Promise<void>;
  removeConflict(eventId: string): Promise<void>;
  listNotifications(): Promise<SyncNotification[]>;
  dismissNotification(notificationId: string): Promise<void>;
  recordPermanentRejection(event: SignedEvent, code: string): Promise<SyncNotification | null>;
  recordRetry(event: SignedEvent, status: SyncRetryState["status"], code: string, nextRetryAt?: string): Promise<void>;
  removeRetry(eventId: string): Promise<void>;
  pendingOutbox(): Promise<SignedEvent[]>;
  queueOutbox(event: SignedEvent): Promise<void>;
  removeOutbox(eventId: string): Promise<void>;
  syncStatus(): Promise<EventSyncStatus>;
  subscribeSyncStatus(listener: (status: EventSyncStatus) => void): () => void;
  dispose(): Promise<void>;
}

function dependencies(event: SignedEvent): string[] {
  return [
    ...event.parents,
    ...event.proofIds,
    ...((event.metadata.priorAuthorizedEventIds as string[] | undefined) ?? []),
  ];
}

function rejectionClosure(events: SignedEvent[], root: SignedEvent): SignedEvent[] {
  const affected = new Set(events
    .filter((event) => event.eventId === root.eventId || event.operationId === root.operationId)
    .map((event) => event.eventId));
  let progressed = true;
  while (progressed) {
    progressed = false;
    const affectedReferences = new Set<string>();
    for (const event of events) {
      if (!affected.has(event.eventId)) continue;
      affectedReferences.add(event.eventId);
      affectedReferences.add(event.resourceId);
      for (const key of ["requestId", "grantId", "roleProofId"] as const) {
        const value = event.metadata[key];
        if (typeof value === "string") affectedReferences.add(value);
      }
    }
    for (const event of events) {
      if (affected.has(event.eventId)) continue;
      const sameRejectedDevice = root.eventType.startsWith("device.") &&
        event.actorAccountId === root.actorAccountId &&
        event.actorDeviceId === root.actorDeviceId;
      if (sameRejectedDevice || dependencies(event).some((value) => affectedReferences.has(value))) {
        affected.add(event.eventId);
        progressed = true;
      }
    }
  }
  return events.filter((event) => affected.has(event.eventId));
}

function notificationFor(event: SignedEvent, code: string, affectedEventIds: string[]): SyncNotification {
  const reason = syncReasonKeyForCode(code);
  const medicalRoute = event.activeRole === "doctor"
    ? `/doctor/pets/${encodeURIComponent(event.aggregateId)}`
    : `/owner/pets/${encodeURIComponent(event.aggregateId)}`;
  return {
    notificationId: `${event.actorAccountId}:${event.operationId}`,
    accountId: event.actorAccountId,
    operationId: event.operationId,
    rootEventId: event.eventId,
    database: event.database,
    eventType: event.eventType,
    code,
    reasonKey: reason,
    diagnosticId: crypto.randomUUID(),
    affectedEventIds,
    createdAt: new Date().toISOString(),
    action: reason === "device" ? "device" : reason === "permission" ? "permissions" : "return",
    relatedRoute: reason === "device"
      ? "/profile#devices"
      : reason === "permission"
        ? "/profile#roles"
        : event.database === "medical"
          ? medicalRoute
          : "/profile",
  };
}

function emptyStatus(): EventSyncStatus {
  return {
    pendingCount: 0,
    deferredCount: 0,
    permanentNotificationCount: 0,
    failedCount: 0,
    syncing: false,
    connectionState: "connected",
    lastError: "",
  };
}

export class MemoryEventTransport implements EventTransport {
  private readonly events = new Map<DatabaseKind, SignedEvent[]>([["control", []], ["medical", []]]);
  private readonly conflicts: AuthorizationConflict[] = [];
  private readonly outbox = new Map<string, SignedEvent>();
  private readonly retries = new Map<string, SyncRetryState>();
  private readonly notifications = new Map<string, SyncNotification>();
  private readonly quarantine = new Map<string, QuarantinedEvent>();
  private readonly listeners = new Map<DatabaseKind, Set<() => void>>([["control", new Set()], ["medical", new Set()]]);
  private readonly syncListeners = new Set<(status: EventSyncStatus) => void>();

  constructor(private readonly activeAccountId = "") {}

  async initialize() {}
  async list(database: DatabaseKind) { return [...(this.events.get(database) ?? [])]; }
  async append(event: SignedEvent) {
    const events = this.events.get(event.database)!;
    if (events.some((candidate) => candidate.eventId === event.eventId)) return;
    events.push(event);
    for (const listener of this.listeners.get(event.database) ?? []) listener();
  }
  subscribe(database: DatabaseKind, listener: () => void) {
    this.listeners.get(database)!.add(listener);
    return () => this.listeners.get(database)!.delete(listener);
  }
  async listConflicts() { return [...this.conflicts]; }
  async recordConflict(conflict: AuthorizationConflict) {
    const index = this.conflicts.findIndex((candidate) => candidate.eventId === conflict.eventId);
    if (index >= 0) this.conflicts[index] = conflict;
    else this.conflicts.push(conflict);
    await this.emitSyncStatus();
  }
  async removeConflict(eventId: string) {
    const index = this.conflicts.findIndex((conflict) => conflict.eventId === eventId);
    if (index >= 0) this.conflicts.splice(index, 1);
    await this.emitSyncStatus();
  }
  async listNotifications() {
    return [...this.notifications.values()]
      .filter((item) => !this.activeAccountId || item.accountId === this.activeAccountId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
  async dismissNotification(notificationId: string) {
    const item = this.notifications.get(notificationId);
    if (item) this.notifications.set(notificationId, { ...item, dismissedAt: new Date().toISOString() });
    await this.emitSyncStatus();
  }
  async recordPermanentRejection(event: SignedEvent, code: string) {
    const all = [...this.events.values()].flat();
    const affected = rejectionClosure(all, event);
    for (const item of affected) {
      const events = this.events.get(item.database)!;
      const index = events.findIndex((candidate) => candidate.eventId === item.eventId);
      if (index >= 0) events.splice(index, 1);
      this.outbox.delete(item.eventId);
      this.retries.delete(item.eventId);
      this.quarantine.set(item.eventId, {
        eventId: item.eventId,
        event: item,
        code,
        diagnosticId: crypto.randomUUID(),
        quarantinedAt: new Date().toISOString(),
      });
    }
    const notification = notificationFor(event, code, affected.map((item) => item.eventId));
    this.notifications.set(notification.notificationId, notification);
    for (const database of new Set(affected.map((item) => item.database))) {
      for (const listener of this.listeners.get(database) ?? []) listener();
    }
    await this.emitSyncStatus();
    return notification;
  }
  async recordRetry(event: SignedEvent, status: SyncRetryState["status"], code: string, nextRetryAt?: string) {
    const previous = this.retries.get(event.eventId);
    const now = new Date().toISOString();
    this.retries.set(event.eventId, {
      eventId: event.eventId,
      accountId: event.actorAccountId,
      status,
      code,
      attemptCount: (previous?.attemptCount ?? 0) + 1,
      firstAttemptAt: previous?.firstAttemptAt ?? now,
      lastAttemptAt: now,
      ...(nextRetryAt ? { nextRetryAt } : {}),
    });
    await this.emitSyncStatus();
  }
  async removeRetry(eventId: string) {
    this.retries.delete(eventId);
    await this.emitSyncStatus();
  }
  async pendingOutbox() { return [...this.outbox.values()]; }
  async queueOutbox(event: SignedEvent) {
    this.outbox.set(event.eventId, event);
    await this.emitSyncStatus();
  }
  async removeOutbox(eventId: string) {
    this.outbox.delete(eventId);
    await this.emitSyncStatus();
  }
  async syncStatus() {
    const pending = [...this.outbox.values()].filter((event) => !this.activeAccountId || event.actorAccountId === this.activeAccountId);
    const retries = [...this.retries.values()].filter((item) => !this.activeAccountId || item.accountId === this.activeAccountId);
    const unread = (await this.listNotifications()).filter((item) => !item.dismissedAt);
    return {
      ...emptyStatus(),
      pendingCount: pending.length,
      deferredCount: retries.filter((item) => item.status === "deferred").length,
      permanentNotificationCount: unread.length,
      failedCount: unread.length + this.conflicts.length,
      ...(pending[0] ? { oldestPendingAt: pending.map((event) => event.createdAt).sort()[0] } : {}),
    };
  }
  subscribeSyncStatus(listener: (status: EventSyncStatus) => void) {
    this.syncListeners.add(listener);
    void this.syncStatus().then(listener);
    return () => this.syncListeners.delete(listener);
  }
  protected async emitSyncStatus() {
    const status = await this.syncStatus();
    for (const listener of this.syncListeners) listener(status);
  }
  async dispose() {}
}

const DB_NAME = "klinok-events-v2";
const DB_VERSION = 1;
const EVENT_STORES = ["control", "medical"] as const;
const STORES = [...EVENT_STORES, "conflicts", "outbox", "notifications", "retry", "quarantine"] as const;
type StoreName = (typeof STORES)[number];

export class IndexedDbEventTransport implements EventTransport {
  private db: IDBDatabase | null = null;
  private readonly listeners = new Map<DatabaseKind, Set<() => void>>([["control", new Set()], ["medical", new Set()]]);
  private readonly syncListeners = new Set<(status: EventSyncStatus) => void>();
  private readonly sessionConflictIds = new Set<string>();
  protected syncing = false;
  protected lastSyncError = "";
  protected connectionState: EventSyncStatus["connectionState"] = "connected";

  constructor(
    protected readonly activeAccountId = "",
    protected readonly dataGeneration = "v2",
  ) {}

  async initialize() {
    this.sessionConflictIds.clear();
    this.syncing = false;
    this.lastSyncError = "";
    this.connectionState = "connected";
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        for (const store of STORES) {
          if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store, {
            keyPath: store === "notifications" ? "notificationId" : "eventId",
          });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private requireDb() {
    if (!this.db) throw new Error("Хранилище событий не инициализировано.");
    return this.db;
  }

  private getAll<T>(store: StoreName): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const request = this.requireDb().transaction(store, "readonly").objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  }

  private put(store: StoreName, value: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.requireDb().transaction(store, "readwrite");
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private delete(store: StoreName, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.requireDb().transaction(store, "readwrite");
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async list(database: DatabaseKind): Promise<SignedEvent[]> {
    return this.getAll<SignedEvent>(database);
  }

  protected async cacheEvents(events: SignedEvent[], notify = true): Promise<Set<DatabaseKind>> {
    const candidates = new Map<string, SignedEvent>();
    for (const event of events) {
      if (!candidates.has(event.eventId)) candidates.set(event.eventId, event);
    }
    if (!candidates.size) return new Set();
    const databases = await new Promise<Set<DatabaseKind>>((resolve, reject) => {
      const tx = this.requireDb().transaction([...EVENT_STORES], "readwrite");
      const stored = new Set<DatabaseKind>();
      for (const event of candidates.values()) {
        let checksRemaining = EVENT_STORES.length;
        let exists = false;
        const checked = () => {
          checksRemaining -= 1;
          if (!checksRemaining && !exists) {
            tx.objectStore(event.database).add(event);
            stored.add(event.database);
          }
        };
        for (const database of EVENT_STORES) {
          const request = tx.objectStore(database).getKey(event.eventId);
          request.onsuccess = () => {
            if (request.result !== undefined) exists = true;
            checked();
          };
        }
      }
      tx.oncomplete = () => resolve(stored);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    if (!databases.size) return databases;
    if (notify) {
      for (const database of databases) for (const listener of this.listeners.get(database) ?? []) listener();
    }
    return databases;
  }

  async append(event: SignedEvent): Promise<void> {
    await this.cacheEvents([event]);
  }

  subscribe(database: DatabaseKind, listener: () => void): () => void {
    this.listeners.get(database)!.add(listener);
    return () => this.listeners.get(database)!.delete(listener);
  }

  async listConflicts(): Promise<AuthorizationConflict[]> {
    return this.getAll<AuthorizationConflict>("conflicts");
  }

  async recordConflict(conflict: AuthorizationConflict): Promise<void> {
    await this.put("conflicts", conflict);
    this.sessionConflictIds.add(conflict.eventId);
    await this.emitSyncStatus();
  }

  async removeConflict(eventId: string): Promise<void> {
    await this.delete("conflicts", eventId);
    this.sessionConflictIds.delete(eventId);
    await this.emitSyncStatus();
  }

  async listNotifications(): Promise<SyncNotification[]> {
    return (await this.getAll<SyncNotification>("notifications"))
      .filter((item) => !this.activeAccountId || item.accountId === this.activeAccountId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async dismissNotification(notificationId: string): Promise<void> {
    const item = (await this.listNotifications()).find((candidate) => candidate.notificationId === notificationId);
    if (!item) return;
    await this.put("notifications", { ...item, dismissedAt: new Date().toISOString() });
    await this.emitSyncStatus();
  }

  async recordPermanentRejection(event: SignedEvent, code: string): Promise<SyncNotification | null> {
    const all = [...await this.list("control"), ...await this.list("medical")];
    const affected = rejectionClosure(all, event);
    const diagnosticId = crypto.randomUUID();
    const notification = {
      ...notificationFor(event, code, affected.map((item) => item.eventId)),
      diagnosticId,
    };
    const stores = ["control", "medical", "outbox", "retry", "quarantine", "notifications"] satisfies StoreName[];
    await new Promise<void>((resolve, reject) => {
      const tx = this.requireDb().transaction(stores, "readwrite");
      for (const item of affected) {
        tx.objectStore(item.database).delete(item.eventId);
        tx.objectStore("outbox").delete(item.eventId);
        tx.objectStore("retry").delete(item.eventId);
        tx.objectStore("quarantine").put({
          eventId: item.eventId,
          event: item,
          code,
          diagnosticId,
          quarantinedAt: notification.createdAt,
        } satisfies QuarantinedEvent);
      }
      tx.objectStore("notifications").put(notification);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    for (const database of new Set(affected.map((item) => item.database))) {
      for (const listener of this.listeners.get(database) ?? []) listener();
    }
    await this.emitSyncStatus();
    return notification;
  }

  async recordRetry(event: SignedEvent, status: SyncRetryState["status"], code: string, nextRetryAt?: string): Promise<void> {
    const previous = (await this.getAll<SyncRetryState>("retry")).find((item) => item.eventId === event.eventId);
    const now = new Date().toISOString();
    await this.put("retry", {
      eventId: event.eventId,
      accountId: event.actorAccountId,
      status,
      code,
      attemptCount: (previous?.attemptCount ?? 0) + 1,
      firstAttemptAt: previous?.firstAttemptAt ?? now,
      lastAttemptAt: now,
      ...(nextRetryAt ? { nextRetryAt } : {}),
    } satisfies SyncRetryState);
    await this.emitSyncStatus();
  }

  async removeRetry(eventId: string): Promise<void> {
    await this.delete("retry", eventId);
    await this.emitSyncStatus();
  }

  async pendingOutbox(): Promise<SignedEvent[]> {
    return this.getAll<SignedEvent>("outbox");
  }

  async queueOutbox(event: SignedEvent): Promise<void> {
    await this.put("outbox", event);
    await this.emitSyncStatus();
  }

  async removeOutbox(eventId: string): Promise<void> {
    await this.delete("outbox", eventId);
    await this.emitSyncStatus();
  }

  async syncStatus(): Promise<EventSyncStatus> {
    const [outbox, retries, notifications] = await Promise.all([
      this.pendingOutbox(),
      this.getAll<SyncRetryState>("retry"),
      this.listNotifications(),
    ]);
    const pending = outbox.filter((event) => !this.activeAccountId || event.actorAccountId === this.activeAccountId);
    const accountRetries = retries.filter((item) => !this.activeAccountId || item.accountId === this.activeAccountId);
    const unread = notifications.filter((item) => !item.dismissedAt);
    return {
      pendingCount: pending.length,
      deferredCount: accountRetries.filter((item) => item.status === "deferred").length,
      permanentNotificationCount: unread.length,
      failedCount: unread.length + this.sessionConflictIds.size,
      syncing: this.syncing,
      connectionState: this.connectionState,
      lastError: this.lastSyncError,
      ...(pending.length ? { oldestPendingAt: pending.map((event) => event.createdAt).sort()[0] } : {}),
    };
  }

  subscribeSyncStatus(listener: (status: EventSyncStatus) => void): () => void {
    this.syncListeners.add(listener);
    void this.syncStatus().then(listener);
    return () => this.syncListeners.delete(listener);
  }

  protected async setSyncState(input: {
    syncing?: boolean;
    lastError?: string;
    connectionState?: EventSyncStatus["connectionState"];
  }): Promise<void> {
    if (input.syncing !== undefined) this.syncing = input.syncing;
    if (input.lastError !== undefined) this.lastSyncError = input.lastError;
    if (input.connectionState !== undefined) this.connectionState = input.connectionState;
    await this.emitSyncStatus();
  }

  protected async emitSyncStatus(): Promise<void> {
    if (!this.syncListeners.size) return;
    const status = await this.syncStatus();
    for (const listener of this.syncListeners) listener(status);
  }

  async dispose(): Promise<void> {
    this.db?.close();
    this.db = null;
    this.sessionConflictIds.clear();
    this.syncing = false;
    this.lastSyncError = "";
    this.connectionState = "connected";
  }
}
