// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type { AppSnapshotDto, ClientCommand, Role } from "@klinok/contracts";

export type SyncReasonKey = "permission" | "parent" | "size" | "invalid" | "unknown";
export type SyncNotificationAction = "return" | "permissions" | "none";
export interface SyncNotification {
  notificationId: string;
  accountId: string;
  operationId: string;
  entityId: string;
  commandAction: string;
  code: string;
  reasonKey: SyncReasonKey;
  diagnosticId: string;
  createdAt: string;
  action: SyncNotificationAction;
  relatedRoute?: string;
  localDraft?: ClientCommand;
  dismissedAt?: string;
}
export interface OfflineSyncStatus {
  pendingCount: number;
  deferredCount: number;
  permanentNotificationCount: number;
  failedCount: number;
  syncing: boolean;
  connectionState: "connected" | "disconnected" | "error";
  lastError: string;
  oldestPendingAt?: string;
}

interface CachedSnapshot { key: string; accountId: string; role: Role; verifiedAt: string; snapshot: AppSnapshotDto }
interface QueuedCommand { operationId: string; accountId: string; role: Role; command: ClientCommand }
interface StoredNotification extends SyncNotification { key: string }
interface OfflineMeta { key: "active"; accountId: string; verifiedAt: string }

const DATABASE = "klinok-v3-offline";
const memory = {
  snapshots: new Map<string, CachedSnapshot>(), commands: new Map<string, QueuedCommand>(),
  notifications: new Map<string, StoredNotification>(), meta: null as OfflineMeta | null,
};

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function database(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const snapshots = db.createObjectStore("snapshots", { keyPath: "key" });
      snapshots.createIndex("accountId", "accountId");
      const commands = db.createObjectStore("commands", { keyPath: "operationId" });
      commands.createIndex("accountId", "accountId");
      const notifications = db.createObjectStore("notifications", { keyPath: "key" });
      notifications.createIndex("accountId", "accountId");
      db.createObjectStore("meta", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function allByAccount<T>(storeName: string, accountId: string): Promise<T[]> {
  const db = await database();
  if (!db) {
    const source = storeName === "commands" ? memory.commands : memory.notifications;
    return [...source.values()].filter((value) => value.accountId === accountId) as T[];
  }
  try {
    const transaction = db.transaction(storeName, "readonly");
    return await requestValue(transaction.objectStore(storeName).index("accountId").getAll(accountId)) as T[];
  } finally { db.close(); }
}

export function snapshotKey(accountId: string, role: Role): string { return `${accountId}:${role}`; }

export async function putCachedSnapshot(accountId: string, role: Role, snapshot: AppSnapshotDto, verifiedAt = new Date().toISOString()): Promise<void> {
  const value: CachedSnapshot = { key: snapshotKey(accountId, role), accountId, role, verifiedAt, snapshot };
  const db = await database();
  if (!db) { memory.snapshots.set(value.key, value); memory.meta = { key: "active", accountId, verifiedAt }; return; }
  try {
    const transaction = db.transaction(["snapshots", "meta"], "readwrite");
    transaction.objectStore("snapshots").put(value);
    transaction.objectStore("meta").put({ key: "active", accountId, verifiedAt } satisfies OfflineMeta);
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
  } finally { db.close(); }
}

export async function getCachedSnapshot(accountId: string, role: Role, leaseDays: number): Promise<AppSnapshotDto | null> {
  const key = snapshotKey(accountId, role);
  const db = await database();
  const value = db
    ? await (async () => { try { return await requestValue(db.transaction("snapshots", "readonly").objectStore("snapshots").get(key)) as CachedSnapshot | undefined; } finally { db.close(); } })()
    : memory.snapshots.get(key);
  if (!value || Date.now() - new Date(value.verifiedAt).getTime() > leaseDays * 86_400_000) return null;
  return value.snapshot;
}

export async function lastOfflineAccount(leaseDays: number): Promise<string | null> {
  const db = await database();
  const value = db
    ? await (async () => { try { return await requestValue(db.transaction("meta", "readonly").objectStore("meta").get("active")) as OfflineMeta | undefined; } finally { db.close(); } })()
    : memory.meta ?? undefined;
  if (!value || Date.now() - new Date(value.verifiedAt).getTime() > leaseDays * 86_400_000) return null;
  return value.accountId;
}

export async function enqueueCommand(accountId: string, role: Role, command: ClientCommand): Promise<void> {
  const value: QueuedCommand = { operationId: command.operationId, accountId, role, command };
  const db = await database();
  if (!db) { memory.commands.set(command.operationId, value); return; }
  try { await requestValue(db.transaction("commands", "readwrite").objectStore("commands").put(value)); } finally { db.close(); }
}

export async function listCommands(accountId: string): Promise<ClientCommand[]> {
  return (await allByAccount<QueuedCommand>("commands", accountId)).map((value) => value.command)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.operationId.localeCompare(right.operationId));
}

export async function removeCommand(operationId: string): Promise<void> {
  const db = await database();
  if (!db) { memory.commands.delete(operationId); return; }
  try { await requestValue(db.transaction("commands", "readwrite").objectStore("commands").delete(operationId)); } finally { db.close(); }
}

export async function recordNotification(notification: SyncNotification): Promise<void> {
  const value: StoredNotification = { ...notification, key: notification.notificationId };
  const db = await database();
  if (!db) { memory.notifications.set(value.key, value); return; }
  try { await requestValue(db.transaction("notifications", "readwrite").objectStore("notifications").put(value)); } finally { db.close(); }
}

export async function listNotifications(accountId: string): Promise<SyncNotification[]> {
  return (await allByAccount<StoredNotification>("notifications", accountId))
    .map(({ key, ...value }) => { void key; return value; }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function dismissNotification(accountId: string, notificationId: string): Promise<void> {
  const items = await listNotifications(accountId);
  const notification = items.find((item) => item.notificationId === notificationId);
  if (!notification) return;
  await recordNotification({ ...notification, dismissedAt: new Date().toISOString() });
}

export async function clearOfflineAccount(accountId: string): Promise<void> {
  const db = await database();
  if (!db) {
    for (const [key, value] of memory.snapshots) if (value.accountId === accountId) memory.snapshots.delete(key);
    for (const [key, value] of memory.commands) if (value.accountId === accountId) memory.commands.delete(key);
    for (const [key, value] of memory.notifications) if (value.accountId === accountId) memory.notifications.delete(key);
    if (memory.meta?.accountId === accountId) memory.meta = null;
    return;
  }
  try {
    const transaction = db.transaction(["snapshots", "commands", "notifications", "meta"], "readwrite");
    for (const storeName of ["snapshots", "commands", "notifications"] as const) {
      const store = transaction.objectStore(storeName);
      const keys = await requestValue(store.index("accountId").getAllKeys(accountId));
      for (const key of keys) store.delete(key);
    }
    const meta = await requestValue(transaction.objectStore("meta").get("active")) as OfflineMeta | undefined;
    if (meta?.accountId === accountId) transaction.objectStore("meta").delete("active");
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
  } finally { db.close(); }
}
