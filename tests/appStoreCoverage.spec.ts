// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { AppSnapshotDto, AuthSessionDto, Role } from "@klinok/contracts";
import type { OfflineSyncStatus } from "../src/repositories/offlineStore";

const harness = vi.hoisted(() => {
  class MockAuthClientError extends Error {
    constructor(readonly code: string, message: string, readonly status: number) { super(message); }
  }
  return {
    MockAuthClientError,
    auth: {} as Record<string, Mock>,
    repository: {} as Record<string, unknown>,
    createRepository: vi.fn(),
    createOptions: null as Record<string, unknown> | null,
    controlListener: null as ((value: unknown) => void) | null,
    medicalListener: null as ((value: unknown) => void) | null,
    syncListener: null as ((value: unknown) => void) | null,
    loadRuntimeConfig: vi.fn(),
    lastOfflineAccount: vi.fn(),
    clearOfflineAccount: vi.fn(),
    listCommands: vi.fn(),
    alert: { clear: vi.fn(), success: vi.fn(), error: vi.fn() },
  };
});

vi.mock("../src/runtimeConfig", () => ({ loadRuntimeConfig: harness.loadRuntimeConfig }));
vi.mock("../src/repositories/authClient", () => ({
  AuthClientError: harness.MockAuthClientError,
  AuthClient: class {
    constructor() { return harness.auth; }
  },
}));
vi.mock("../src/repositories", () => ({ KlinokRepository: { create: harness.createRepository } }));
vi.mock("../src/repositories/offlineStore", () => ({
  clearOfflineAccount: harness.clearOfflineAccount,
  lastOfflineAccount: harness.lastOfflineAccount,
  listCommands: harness.listCommands,
}));
vi.mock("../src/stores/alert", () => ({ useAlertStore: () => harness.alert }));

const timestamp = "2026-08-10T00:00:00.000Z";

function snapshot(role: Role = "owner", roles: Role[] = ["owner", "doctor"]): AppSnapshotDto {
  return {
    revision: 1,
    role,
    control: {
      profile: { accountId: "account-1", revision: 2, firstName: "Анна", lastName: "Петрова", updatedAt: timestamp },
      profiles: [],
      roles: roles.map((item, index) => ({
        requestId: `${item}-role`, accountId: "account-1", role: item, status: "approved" as const,
        revision: index + 1, profileRevision: 2, requestedAt: timestamp,
      })),
      allRoles: [], pendingQueue: [], notifications: [], roleAudit: [],
      ledger: { valid: true, height: 1, headHash: "a".repeat(64), verifiedAt: timestamp },
    },
    medical: { pets: [], grants: [], accessRequests: [], records: [], confirmations: [], confirmedRecordIds: [] },
  };
}

function authenticatedSession(accountId = "account-1"): AuthSessionDto {
  return {
    authenticated: true,
    accountId,
    email: "anna@example.ru",
    csrfToken: "csrf",
    device: {
      deviceId: "device-current", deviceName: "Ноутбук", current: true, status: "active",
      createdAt: timestamp, lastSeenAt: timestamp, expiresAt: "2026-09-10T00:00:00.000Z",
    },
    devices: [],
  };
}

function mockRepository(current = snapshot()): Record<string, unknown> {
  const control = {
    subscribe: vi.fn((listener: (value: unknown) => void) => { harness.controlListener = listener; return vi.fn(); }),
    requestRole: vi.fn(), cancelRole: vi.fn(), decideRole: vi.fn(),
  };
  const medical = {
    subscribe: vi.fn((listener: (value: unknown) => void) => { harness.medicalListener = listener; return vi.fn(); }),
  };
  return {
    current,
    control,
    medical,
    notifications: vi.fn().mockResolvedValue([]),
    syncStatus: vi.fn().mockResolvedValue({
      pendingCount: 0, deferredCount: 0, permanentNotificationCount: 0, failedCount: 0,
      syncing: false, connectionState: "connected", lastError: "",
    } satisfies OfflineSyncStatus),
    subscribeSyncStatus: vi.fn((listener: (value: unknown) => void) => { harness.syncListener = listener; return vi.fn(); }),
    setActiveRole: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    dismissNotification: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  harness.controlListener = null;
  harness.medicalListener = null;
  harness.syncListener = null;
  harness.createOptions = null;
  harness.loadRuntimeConfig.mockResolvedValue({
    apiBaseUrl: "/backend",
    offlineLeaseDays: 7,
    bootstrapAccountId: "bootstrap-administrator",
    legal: {
      personalDataConsent: { version: "consent-v1", href: "/consent" },
      userAgreement: { version: "terms-v1", href: "/terms" },
    },
  });
  harness.lastOfflineAccount.mockResolvedValue(null);
  harness.clearOfflineAccount.mockResolvedValue(undefined);
  harness.listCommands.mockResolvedValue([]);
  harness.repository = mockRepository();
  harness.createRepository.mockImplementation(async (options: Record<string, unknown>) => {
    harness.createOptions = options;
    return harness.repository;
  });
  harness.auth = {
    session: vi.fn().mockResolvedValue(authenticatedSession()),
    register: vi.fn().mockResolvedValue({ accepted: true }),
    verifyEmail: vi.fn().mockResolvedValue({ verified: true }),
    login: vi.fn().mockResolvedValue({ authenticated: true, accountId: "account-1", csrfToken: "csrf" }),
    logout: vi.fn().mockResolvedValue({ loggedOut: true }),
    logoutAll: vi.fn().mockResolvedValue({ loggedOut: true }),
    revokeDevice: vi.fn().mockResolvedValue({ revoked: true }),
    deleteAccount: vi.fn().mockResolvedValue({ operationId: "delete-account" }),
    forgotPassword: vi.fn().mockResolvedValue({ accepted: true }),
    resetPassword: vi.fn().mockResolvedValue({ reset: true }),
    updateProfile: vi.fn().mockResolvedValue({ operationId: "update-profile" }),
    searchDoctors: vi.fn().mockResolvedValue({ items: [] }),
    searchUsers: vi.fn().mockResolvedValue({ items: [] }),
    lookupDirectoryProfiles: vi.fn(async (accountIds: string[]) => ({ profiles: accountIds.map((accountId) => ({ accountId })) })),
    updateDirectoryUserProfile: vi.fn().mockResolvedValue({ operationId: "directory-profile" }),
    lookupDirectoryPet: vi.fn().mockResolvedValue({ petId: "pet-1" }),
    searchDirectoryPets: vi.fn().mockResolvedValue({ items: [] }),
    getMyPetAccesses: vi.fn().mockResolvedValue({ items: [] }),
    updateCredentials: vi.fn().mockResolvedValue({ updated: true, email: "new@example.ru" }),
  };
});

describe("application store orchestration", () => {
  it("connects an authenticated repository, falls back to an approved role, and handles session invalidation", async () => {
    localStorage.setItem("klinok:v3:account-1:active-role", "doctor");
    harness.repository = mockRepository(snapshot("doctor", ["owner"]));
    const store = await import("../src/appStore");

    await store.bootstrapApp();
    expect(harness.createRepository).toHaveBeenCalledWith(expect.objectContaining({ initialRole: "doctor", offlineLeaseDays: 7 }));
    expect((harness.repository.setActiveRole as Mock)).toHaveBeenCalledWith("owner");
    expect(store.appState.activeRole).toBe("owner");
    expect(store.appState.repositoryConnected).toBe(true);
    await store.bootstrapApp();
    expect(harness.loadRuntimeConfig).toHaveBeenCalledOnce();

    harness.controlListener?.(snapshot().control);
    harness.medicalListener?.(snapshot().medical);
    harness.syncListener?.({ pendingCount: 2, connectionState: "disconnected" });
    await Promise.resolve();
    expect(store.appState.sync.pendingCount).toBe(2);

    await (harness.createOptions?.onSessionInvalid as () => Promise<void>)();
    expect((harness.repository.dispose as Mock)).toHaveBeenCalled();
    expect(store.appState.session.authenticated).toBe(false);
    expect(store.appState.repositoryConnected).toBe(false);
    expect(store.getRepository()).toBeNull();
  });

  it("boots from an offline account and clears stale offline data for an anonymous session", async () => {
    harness.auth.session.mockRejectedValueOnce(new harness.MockAuthClientError("NETWORK_UNAVAILABLE", "offline", 0));
    harness.lastOfflineAccount.mockResolvedValueOnce("offline-account");
    const store = await import("../src/appStore");

    await store.bootstrapApp();
    expect(store.appState.session).toMatchObject({ authenticated: true, accountId: "offline-account" });
    expect(store.hasDeviceIdentity()).toBe(true);
    expect(store.getDeviceName()).toBe("Это устройство");

    harness.auth.session.mockResolvedValueOnce({ authenticated: false });
    harness.lastOfflineAccount.mockResolvedValueOnce("stale-account");
    await store.bootstrapApp(true);
    expect(harness.clearOfflineAccount).toHaveBeenCalledWith("stale-account");
    expect(store.appState.activeRole).toBeNull();
    expect(store.appState.medical.pets).toEqual([]);
  });

  it("reports bootstrap failures and disposes the previously connected repository", async () => {
    const store = await import("../src/appStore");
    await store.bootstrapApp();
    harness.auth.session.mockRejectedValueOnce(new Error("session failed"));

    await store.bootstrapApp(true);
    expect((harness.repository.dispose as Mock)).toHaveBeenCalled();
    expect(harness.alert.error).toHaveBeenCalledWith(expect.objectContaining({ message: "session failed" }));
    expect(store.appState.busy).toBe(false);
    expect(store.appState.initialized).toBe(true);
  });

  it("persists device identity during login and handles local logout safeguards", async () => {
    const store = await import("../src/appStore");
    await store.bootstrapApp();
    await store.login("anna@example.ru", "password", "  Рабочий ноутбук  ");
    expect(harness.auth.login).toHaveBeenCalledWith(
      "anna@example.ru", "password", expect.any(String), "Рабочий ноутбук",
    );
    expect(store.hasDeviceIdentity()).toBe(true);

    harness.listCommands.mockResolvedValueOnce([{ operationId: "pending" }]);
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await expect(store.logout()).resolves.toBe(false);
    expect(harness.auth.logout).not.toHaveBeenCalled();

    harness.listCommands.mockResolvedValueOnce([{ operationId: "pending" }]);
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    harness.auth.logout.mockRejectedValueOnce(new harness.MockAuthClientError("NETWORK_UNAVAILABLE", "offline", 0));
    await expect(store.logout()).resolves.toBe(true);
    expect(harness.clearOfflineAccount).toHaveBeenCalledWith("account-1");
    expect(store.appState.session.authenticated).toBe(false);

    harness.auth.session.mockResolvedValueOnce(authenticatedSession());
    await store.bootstrapApp(true);
    await expect(store.logout(true)).resolves.toBe(true);
    expect(harness.auth.logoutAll).toHaveBeenCalledOnce();
  });

  it("propagates unexpected logout failures without leaving the store busy", async () => {
    const store = await import("../src/appStore");
    await store.bootstrapApp();
    harness.auth.logout.mockRejectedValueOnce(new Error("logout failed"));

    await expect(store.logout()).rejects.toThrow("logout failed");
    expect(store.appState.busy).toBe(false);
  });

  it("refreshes other-device revocation and clears current-device and deleted accounts", async () => {
    const store = await import("../src/appStore");
    await store.bootstrapApp();
    harness.auth.session.mockResolvedValueOnce({ ...authenticatedSession(), email: "refreshed@example.ru" });
    await store.revokeDevice("device-other");
    expect(store.appState.session.email).toBe("refreshed@example.ru");

    await store.revokeDevice("device-current");
    expect(store.appState.session.authenticated).toBe(false);

    harness.auth.session.mockResolvedValueOnce(authenticatedSession());
    await store.bootstrapApp(true);
    await store.deleteAccount();
    expect(harness.auth.deleteAccount).toHaveBeenCalled();
    expect(harness.clearOfflineAccount).toHaveBeenCalledWith("account-1");
    expect(store.appState.repositoryConnected).toBe(false);
  });

  it("updates profiles, batches directory lookup, and delegates directory operations", async () => {
    const store = await import("../src/appStore");
    await store.bootstrapApp();
    await store.updateProfile({ firstName: "Мария", lastName: "Петрова" });
    expect(harness.auth.updateProfile).toHaveBeenCalledWith({ firstName: "Мария", lastName: "Петрова", expectedRevision: 2 });
    expect(harness.repository.refresh).toHaveBeenCalled();

    harness.auth.updateProfile.mockRejectedValueOnce(new harness.MockAuthClientError("REVISION_CONFLICT", "conflict", 409));
    await expect(store.updateProfile({ firstName: "Анна", lastName: "Петрова" })).rejects.toMatchObject({ status: 409 });
    expect(harness.repository.refresh).toHaveBeenCalledTimes(2);

    await store.searchDoctorDirectory("Иван", 2, 10, "name");
    await store.loadAdministratorUsers("Анна", true, 2, 10, "owner", "desc");
    const ids = Array.from({ length: 205 }, (_, index) => `account-${index}`);
    await expect(store.lookupAdministratorProfiles([...ids, ids[0]!])).resolves.toHaveLength(205);
    expect(harness.auth.lookupDirectoryProfiles).toHaveBeenCalledTimes(2);
    await store.updateAdministratorUserProfile("account-2", { firstName: "Иван", lastName: "Врач", expectedRevision: 2 });
    await store.lookupPetDirectory("pet-1");
    await store.searchPetDirectory("Анна", "Барс", 2, 10, "owner");
    await store.loadDoctorPetAccesses("Барс", "granted", 2, 10, "pet", "desc");
    await store.updateCredentials({ email: "new@example.ru" });
    expect(store.appState.session.email).toBe("new@example.ru");

    harness.auth.updateDirectoryUserProfile.mockRejectedValueOnce(new harness.MockAuthClientError("REVISION_CONFLICT", "conflict", 409));
    await expect(store.updateAdministratorUserProfile("account-2", { firstName: "Иван", lastName: "Врач", expectedRevision: 2 }))
      .rejects.toMatchObject({ status: 409 });
  });

  it("validates roles and delegates repository controls and notification dismissal", async () => {
    const store = await import("../src/appStore");
    await store.bootstrapApp();
    await expect(store.switchRole("administrator")).rejects.toThrow("Эта роль недоступна");
    await store.switchRole("doctor");
    expect((harness.repository.setActiveRole as Mock)).toHaveBeenCalledWith("doctor");
    expect(localStorage.getItem("klinok:v3:account-1:active-role")).toBe("doctor");

    await store.requestRole("doctor");
    await store.cancelRole("doctor");
    await store.decideRole({ accountId: "account-2", requestId: "role-2", revision: 3, role: "doctor", status: "pending" }, "approved", "Проверено");
    expect((harness.repository.control as Record<string, Mock>).requestRole).toHaveBeenCalledWith("doctor", 2);
    expect((harness.repository.control as Record<string, Mock>).decideRole).toHaveBeenCalledWith({
      accountId: "account-2", requestId: "role-2", revision: 3, role: "doctor", status: "approved", expectedStatus: "pending", reason: "Проверено",
    });

    (harness.repository.notifications as Mock).mockResolvedValueOnce([{ notificationId: "notice-1" }]);
    (harness.repository.syncStatus as Mock).mockResolvedValueOnce({ pendingCount: 1 });
    await store.dismissSyncNotification("notice-1");
    expect(harness.repository.dismissNotification).toHaveBeenCalledWith("notice-1");
    expect(store.getConfig()).toMatchObject({ apiBaseUrl: "/backend" });
    expect(store.requireRepository()).toBe(harness.repository);
    expect(store.approvedRoles.value.map((role) => role.role)).toEqual(["owner", "doctor"]);
  });

  it("rejects repository-dependent operations before bootstrap", async () => {
    const store = await import("../src/appStore");
    await expect(store.updateProfile({ firstName: "Анна", lastName: "Петрова" })).rejects.toThrow("Профиль ещё не загружен");
    expect(() => store.requireRepository()).toThrow("Хранилище данных ещё не подключено");
  });
});
