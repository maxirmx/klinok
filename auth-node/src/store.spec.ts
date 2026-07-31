// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuthStore, type AuthAccount } from "./store.js";

const stores: Array<{ dataDir: string; store: AuthStore }> = [];

afterEach(async () => {
  for (const { dataDir, store } of stores.splice(0)) {
    await store.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

describe("AuthStore markers", () => {
  it("distinguishes missing markers from persisted markers", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "klinok-auth-store-test-"));
    const store = new AuthStore(dataDir);
    stores.push({ dataDir, store });
    await store.open();

    expect(await store.hasMarker("mail:event-1")).toBe(false);
    await store.putMarker("mail:event-1");
    expect(await store.hasMarker("mail:event-1")).toBe(true);
    expect(await store.hasMarker("mail:event-2")).toBe(false);
  });
});

describe("AuthStore pending registrations", () => {
  it("removes an unchanged account, email index, and verification token", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "klinok-auth-store-test-"));
    const store = new AuthStore(dataDir);
    stores.push({ dataDir, store });
    await store.open();
    const account: AuthAccount = {
      accountId: "pending-account",
      email: "pending@example.com",
      passwordHash: "hash",
      credentialStatus: "pending_verification",
      verificationState: "pending",
      createdAt: "2026-07-10T10:00:00.000Z",
      updatedAt: "2026-07-10T10:00:00.000Z",
      failureTimes: [],
      devices: [],
      enrollments: [],
      pendingOperations: [],
      sessionDigests: [],
    };
    await store.createAccount(account);
    await store.putToken({
      digest: "verification-digest",
      accountId: account.accountId,
      kind: "verification",
      expiresAt: "2026-07-11T10:00:00.000Z",
    });

    expect(await store.rollbackPendingRegistration(account.accountId, account.email, "verification-digest")).toBe(true);
    expect(await store.getAccount(account.accountId)).toBeNull();
    expect(await store.getAccountByEmail(account.email)).toBeNull();
    expect(await store.getToken("verification", "verification-digest")).toBeNull();
  });
});
