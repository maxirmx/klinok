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

describe("AuthStore role projections", () => {
  it("enumerates observed role statuses without changing their storage format", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "klinok-auth-store-test-"));
    const store = new AuthStore(dataDir);
    stores.push({ dataDir, store });
    await store.open();

    await store.putObservedRole("account-1", "owner", "approved");
    await store.putObservedRole("account-1", "doctor", "pending");
    await store.putObservedRole("account-2", "administrator", "revoked");

    expect(await store.listObservedRoles()).toEqual(expect.arrayContaining([
      { accountId: "account-1", role: "owner", status: "approved" },
      { accountId: "account-1", role: "doctor", status: "pending" },
      { accountId: "account-2", role: "administrator", status: "revoked" },
    ]));
  });
});

describe("AuthStore device projections", () => {
  it("makes an observed revocation authoritative for auth sessions", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "klinok-auth-store-test-"));
    const store = new AuthStore(dataDir);
    stores.push({ dataDir, store });
    await store.open();
    const account: AuthAccount = {
      accountId: "account-1",
      email: "account-1@example.com",
      passwordHash: "hash",
      credentialStatus: "active",
      verificationState: "verified",
      createdAt: "2026-07-10T10:00:00.000Z",
      updatedAt: "2026-07-10T10:00:00.000Z",
      failureTimes: [],
      devices: [{
        deviceId: "device-1",
        accountId: "account-1",
        orbitIdentityId: "orbit-1",
        status: "active",
        userKeyVersion: 1,
        signingPublicKey: {},
        encryptionPublicKey: {},
        issuedAt: "2026-07-10T10:00:00.000Z",
        attestation: "attestation",
      }],
      enrollments: [],
      pendingOperations: [],
      sessionDigests: [],
    };
    await store.createAccount(account);
    await store.putSessionForAccount({
      digest: "session-1",
      accountId: account.accountId,
      csrfToken: "csrf-1",
      deviceId: "device-1",
      createdAt: "2026-07-10T10:00:00.000Z",
      lastSeenAt: "2026-07-10T10:00:00.000Z",
      absoluteExpiresAt: "2026-07-11T10:00:00.000Z",
    }, account);

    await store.applyObservedDeviceRevocation(account.accountId, "device-1");

    expect(await store.getSession("session-1")).toBeNull();
    expect(await store.getAccount(account.accountId)).toMatchObject({
      sessionDigests: [],
      devices: [expect.objectContaining({ deviceId: "device-1", status: "revoked" })],
    });
    await store.applyObservedDeviceRevocation(account.accountId, "device-1");
    expect((await store.getAccount(account.accountId))?.devices).toEqual([
      expect.objectContaining({ deviceId: "device-1", status: "revoked" }),
    ]);
  });
});

describe("AuthStore profile persistence", () => {
  it("writes an account and its directory profile in one batch", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "klinok-auth-store-test-"));
    const store = new AuthStore(dataDir);
    stores.push({ dataDir, store });
    await store.open();
    const account: AuthAccount = {
      accountId: "account-1",
      email: "account-1@example.com",
      passwordHash: "hash",
      credentialStatus: "active",
      verificationState: "verified",
      createdAt: "2026-07-10T10:00:00.000Z",
      updatedAt: "2026-07-10T10:00:00.000Z",
      failureTimes: [], devices: [], enrollments: [], pendingOperations: [], sessionDigests: [],
    };
    await store.createAccount(account);
    const changed = { ...account, updatedAt: "2026-07-11T10:00:00.000Z" };
    const profile = {
      accountId: account.accountId,
      firstName: "Анна",
      lastName: "Иванова",
      displayName: "Анна Иванова",
      updatedAt: changed.updatedAt,
    };
    await store.putDirectoryPet({
      petId: "pet-1",
      ownerAccountId: account.accountId,
      ownerDisplayName: "Старое Имя",
      species: "Собака",
      name: "Буся",
      updatedAt: "2026-07-10T12:00:00.000Z",
    });

    await store.putAccountAndDirectoryProfile(changed, profile);

    expect(await store.getAccount(account.accountId)).toEqual(changed);
    expect(await store.getDirectoryProfile(account.accountId)).toEqual(profile);
    expect(await store.getDirectoryPet("pet-1")).toMatchObject({
      ownerDisplayName: "Анна Иванова",
      species: "Собака",
      name: "Буся",
      updatedAt: "2026-07-10T12:00:00.000Z",
    });

    await store.putDirectoryProfile({
      ...profile,
      firstName: "Мария",
      displayName: "Мария Иванова",
      updatedAt: "2026-07-12T10:00:00.000Z",
    });
    const staleCreate = await store.createDirectoryProfile({
      ...profile,
      firstName: "Старое",
      displayName: "Старое Имя",
    });
    expect(staleCreate.displayName).toBe("Мария Иванова");
    expect((await store.getDirectoryProfile(account.accountId))?.displayName).toBe("Мария Иванова");
    expect(await store.getDirectoryPet("pet-1")).toMatchObject({ ownerDisplayName: "Мария Иванова" });

    await store.putDirectoryPet({
      ...(await store.getDirectoryPet("pet-1"))!,
      ownerDisplayName: "Устаревшее Имя",
    });
    expect(await store.getDirectoryPet("pet-1")).toMatchObject({ ownerDisplayName: "Мария Иванова" });
    expect(await store.listDirectoryPets()).toEqual([
      expect.objectContaining({ petId: "pet-1", ownerDisplayName: "Мария Иванова" }),
    ]);

    await store.deleteCredentialAccount(changed);
    expect(await store.getDirectoryProfile(account.accountId)).toBeNull();
    expect(await store.getDirectoryPet("pet-1")).toBeNull();
    await expect(store.putDirectoryPet({
      petId: "pet-after-deletion",
      ownerAccountId: account.accountId,
      ownerDisplayName: "Анна Иванова",
      species: "Собака",
      name: "Буся",
      updatedAt: "2026-07-13T10:00:00.000Z",
    })).resolves.toBe(false);
    expect(await store.getDirectoryPet("pet-after-deletion")).toBeNull();
  });

  it("rebases observed setup progress on the latest account and directory profile", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "klinok-auth-store-test-"));
    const store = new AuthStore(dataDir);
    stores.push({ dataDir, store });
    await store.open();
    const createdAt = "2026-07-10T10:00:00.000Z";
    const account: AuthAccount = {
      accountId: "account-1",
      email: "account-1@example.com",
      passwordHash: "hash",
      credentialStatus: "active",
      verificationState: "verified",
      createdAt,
      updatedAt: createdAt,
      failureTimes: [],
      setup: {
        profile: { firstName: "Старое", lastName: "Имя" },
        requestedRoles: ["owner"],
        ageConfirmed: true,
        personalDataConsentVersion: "1",
        userAgreementVersion: "1",
      },
      devices: [],
      enrollments: [],
      pendingOperations: [{ operationId: "old-operation", kind: "profile", createdAt }],
      sessionDigests: [],
    };
    await store.createAccount(account);

    const changedAt = "2026-07-11T10:00:00.000Z";
    const changed: AuthAccount = {
      ...account,
      updatedAt: changedAt,
      setup: {
        ...account.setup!,
        profile: { firstName: "Новое", lastName: "Имя" },
      },
      pendingOperations: [
        ...account.pendingOperations,
        { operationId: "new-operation", kind: "profile", createdAt: changedAt },
      ],
    };
    await store.putAccountAndDirectoryProfile(changed, {
      accountId: account.accountId,
      firstName: "Новое",
      lastName: "Имя",
      displayName: "Новое Имя",
      updatedAt: changedAt,
    });

    await store.applyObservedAccountProgress(account.accountId, "old-operation", true);

    const progressed = await store.getAccount(account.accountId);
    expect(progressed?.setup).toBeUndefined();
    expect(progressed).toMatchObject({
      pendingOperations: [{ operationId: "new-operation" }],
    });
    expect(await store.getDirectoryProfile(account.accountId)).toMatchObject({
      displayName: "Новое Имя",
      updatedAt: changedAt,
    });
  });
});

describe("AuthStore pet projections", () => {
  it("keeps tombstones terminal when an older live event is observed again", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "klinok-auth-store-test-"));
    const store = new AuthStore(dataDir);
    stores.push({ dataDir, store });
    await store.open();

    await store.putObservedPetOwner("pet-1", "owner-1");
    await store.putDirectoryPet({
      petId: "pet-1",
      ownerAccountId: "owner-1",
      ownerDisplayName: "Ольга Владелец",
      species: "Собака",
      name: "Буся",
      updatedAt: "2026-07-10T10:00:00.000Z",
    });
    expect(await store.getObservedPetOwner("pet-1")).toBe("owner-1");
    expect(await store.isObservedPetTombstoned("pet-1")).toBe(false);

    await store.deleteObservedPetOwner("pet-1");
    expect(await store.getObservedPetOwner("pet-1")).toBeNull();
    expect(await store.getDirectoryPet("pet-1")).toBeNull();
    expect(await store.isObservedPetTombstoned("pet-1")).toBe(true);

    await store.putObservedPetOwner("pet-1", "owner-1");
    await expect(store.putDirectoryPet({
      petId: "pet-1",
      ownerAccountId: "owner-1",
      ownerDisplayName: "Ольга Владелец",
      species: "Собака",
      name: "Буся",
      updatedAt: "2026-07-10T10:00:00.000Z",
    })).resolves.toBe(false);
    expect(await store.getObservedPetOwner("pet-1")).toBeNull();
    expect(await store.isObservedPetTombstoned("pet-1")).toBe(true);
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
