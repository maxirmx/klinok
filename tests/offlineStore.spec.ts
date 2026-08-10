// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshotDto, ClientCommand } from "@klinok/contracts";
import {
  clearOfflineAccount,
  enqueueCommand,
  getCachedSnapshot,
  lastOfflineAccount,
  listCommands,
  listNotifications,
  putCachedSnapshot,
  recordNotification,
  removeCommand,
  dismissNotification,
} from "../src/repositories/offlineStore";

afterEach(() => vi.unstubAllGlobals());

function snapshot(revision: number): AppSnapshotDto {
  return {
    revision, role: "owner",
    control: {
      profile: null, profiles: [], roles: [], allRoles: [], pendingQueue: [], notifications: [], roleAudit: [],
      ledger: { valid: true, height: revision, headHash: "a".repeat(64), verifiedAt: "2026-08-10T00:00:00.000Z" },
    },
    medical: { pets: [], grants: [], accessRequests: [], records: [], confirmations: [], confirmedRecordIds: [] },
  };
}

function command(operationId: string, createdAt: string): ClientCommand {
  return { operationId, type: "pet.create", activeRole: "owner", entityId: `pet-${operationId}`, createdAt, payload: {} };
}

describe("account-scoped offline storage", () => {
  it("permits snapshots only within the configured lease", async () => {
    const accountId = crypto.randomUUID();
    await putCachedSnapshot(accountId, "owner", snapshot(5), "2020-08-10T00:00:00.000Z");
    expect(await getCachedSnapshot(accountId, "owner", 7)).toBeNull();
    await putCachedSnapshot(accountId, "owner", snapshot(6));
    expect(await getCachedSnapshot(accountId, "owner", 7)).toMatchObject({ revision: 6 });
    expect(await lastOfflineAccount(7)).toBe(accountId);
    await clearOfflineAccount(accountId);
  });

  it("preserves command FIFO order and purges only the selected account", async () => {
    const firstAccount = crypto.randomUUID();
    const secondAccount = crypto.randomUUID();
    await enqueueCommand(firstAccount, "owner", command("later", "2026-08-10T00:01:00.000Z"));
    await enqueueCommand(firstAccount, "owner", command("earlier", "2026-08-10T00:00:00.000Z"));
    await enqueueCommand(secondAccount, "owner", command("other", "2026-08-10T00:00:00.000Z"));
    expect((await listCommands(firstAccount)).map((item) => item.operationId)).toEqual(["earlier", "later"]);

    await recordNotification({
      notificationId: `${firstAccount}:later`, accountId: firstAccount, operationId: "later", entityId: "pet-later",
      commandAction: "pet.updated", code: "REVISION_CONFLICT", reasonKey: "invalid",
      diagnosticId: "diag", createdAt: new Date().toISOString(), action: "return",
      localDraft: command("later", "2026-08-10T00:01:00.000Z"),
    });
    expect(await listNotifications(firstAccount)).toHaveLength(1);
    await clearOfflineAccount(firstAccount);
    expect(await listCommands(firstAccount)).toEqual([]);
    expect(await listNotifications(firstAccount)).toEqual([]);
    expect(await listCommands(secondAccount)).toHaveLength(1);
    await clearOfflineAccount(secondAccount);
  });

  it("supports the in-memory fallback when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const accountId = crypto.randomUUID();
    const otherAccountId = crypto.randomUUID();
    const queued = command("memory-command", "2026-08-10T00:00:00.000Z");

    await putCachedSnapshot(accountId, "owner", snapshot(7));
    await putCachedSnapshot(otherAccountId, "doctor", { ...snapshot(8), role: "doctor" });
    await enqueueCommand(accountId, "owner", queued);
    await recordNotification({
      notificationId: `${accountId}:memory-command`, accountId, operationId: "memory-command", entityId: "pet-memory",
      commandAction: "pet.created", code: "COMMAND_REJECTED", reasonKey: "invalid", diagnosticId: "diag-memory",
      createdAt: "2026-08-10T00:00:00.000Z", action: "return", localDraft: queued,
    });

    await expect(getCachedSnapshot(accountId, "owner", 7)).resolves.toMatchObject({ revision: 7 });
    await expect(lastOfflineAccount(7)).resolves.toBe(otherAccountId);
    await expect(listCommands(accountId)).resolves.toEqual([queued]);
    await dismissNotification(accountId, "missing-notification");
    await dismissNotification(accountId, `${accountId}:memory-command`);
    await expect(listNotifications(accountId)).resolves.toMatchObject([{ dismissedAt: expect.any(String) }]);
    await removeCommand("memory-command");
    await expect(listCommands(accountId)).resolves.toEqual([]);

    await clearOfflineAccount(accountId);
    await expect(getCachedSnapshot(accountId, "owner", 7)).resolves.toBeNull();
    await expect(listNotifications(accountId)).resolves.toEqual([]);
    await expect(getCachedSnapshot(otherAccountId, "doctor", 7)).resolves.toMatchObject({ revision: 8 });
    await clearOfflineAccount(otherAccountId);
  });
});
