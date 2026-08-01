// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const authMocks = vi.hoisted(() => ({
  session: vi.fn(),
  logout: vi.fn(),
  revokeDevice: vi.fn(),
  deleteAccount: vi.fn(),
  syncDirectoryProfile: vi.fn(),
  syncDirectoryPet: vi.fn(),
  updateDirectoryUserProfile: vi.fn(),
}));

const repositoryMocks = vi.hoisted(() => ({
  create: vi.fn(),
  dispose: vi.fn().mockResolvedValue(undefined),
  setActiveRole: vi.fn().mockResolvedValue(undefined),
  controlSnapshot: vi.fn(),
  medicalSnapshot: vi.fn(),
  notifications: vi.fn(),
  dismissNotification: vi.fn(),
  syncStatus: vi.fn(),
  syncListener: null as ((status: Record<string, unknown>) => void) | null,
  revokeDevice: vi.fn(),
  deleteAccount: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("../src/runtimeConfig", () => ({
  loadRuntimeConfig: vi.fn().mockResolvedValue({
    authBaseUrl: "",
    legal: {
      personalDataConsent: { version: "consent-v1", href: "/consent" },
      userAgreement: { version: "terms-v1", href: "/terms" },
    },
    p2p: { bootstrapAccountId: "bootstrap-administrator" },
  }),
}));

vi.mock("../src/repositories/authClient", () => {
  class AuthClientError extends Error {
    constructor(readonly code: string, message: string, readonly status: number) {
      super(message);
    }
  }
  class AuthClient {
    session = authMocks.session;
    logout = authMocks.logout;
    revokeDevice = authMocks.revokeDevice;
    deleteAccount = authMocks.deleteAccount;
    syncDirectoryProfile = authMocks.syncDirectoryProfile;
    syncDirectoryPet = authMocks.syncDirectoryPet;
    updateDirectoryUserProfile = authMocks.updateDirectoryUserProfile;
  }
  return { AuthClient, AuthClientError };
});

vi.mock("../src/repositories/deviceVault", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/repositories/deviceVault")>(),
  getLastActiveRole: vi.fn().mockReturnValue("owner"),
  loadUserKeys: vi.fn().mockResolvedValue({ version: 1 }),
}));

vi.mock("../src/repositories", () => {
  const repository = {
    dispose: repositoryMocks.dispose,
    setActiveRole: repositoryMocks.setActiveRole,
    control: {
      snapshot: repositoryMocks.controlSnapshot,
      subscribe: vi.fn().mockReturnValue(() => undefined),
      revokeDevice: repositoryMocks.revokeDevice,
      deleteAccount: repositoryMocks.deleteAccount,
      updateProfile: repositoryMocks.updateProfile,
    },
    medical: {
      snapshot: repositoryMocks.medicalSnapshot,
      subscribe: vi.fn().mockReturnValue(() => undefined),
    },
    conflicts: vi.fn().mockResolvedValue([]),
    notifications: repositoryMocks.notifications,
    dismissNotification: repositoryMocks.dismissNotification,
    syncStatus: repositoryMocks.syncStatus,
    subscribeSyncStatus: vi.fn((listener: (status: Record<string, unknown>) => void) => {
      repositoryMocks.syncListener = listener;
      return () => undefined;
    }),
  };
  repositoryMocks.create.mockResolvedValue(repository);
  return { KlinokRepository: { create: repositoryMocks.create } };
});

import {
  appState,
  bootstrapApp,
  deleteAccount,
  dismissSyncNotification,
  logout,
  revokeDevice,
  updateAdministratorUserProfile,
} from "../src/appStore";
import { useAlertStore } from "../src/stores/alert";

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  authMocks.session.mockResolvedValue({
    authenticated: true,
    accountId: "owner-1",
    serverKeySetAvailable: true,
    setup: { requestedRoles: ["owner"] },
    device: {
      deviceId: "device-1",
      accountId: "owner-1",
      orbitIdentityId: "orbit-1",
      status: "active",
      userKeyVersion: 1,
      signingPublicKey: {},
      encryptionPublicKey: {},
      issuedAt: "2026-07-22T00:00:00.000Z",
      attestation: "attestation",
    },
  });
  repositoryMocks.controlSnapshot.mockResolvedValue({
    profile: {
      accountId: "owner-1",
      revision: 1,
      firstName: "Иван",
      lastName: "Иванов",
      updatedAt: "2026-07-22T00:00:00.000Z",
    },
    profiles: [],
    roles: [{
      requestId: "owner-role-1",
      accountId: "owner-1",
      role: "owner",
      status: "approved",
      profileRevision: 1,
      requestedAt: "2026-07-22T00:00:00.000Z",
    }],
    allRoles: [],
    devices: [],
    pendingQueue: [],
    notifications: [],
    events: [],
  });
  repositoryMocks.medicalSnapshot.mockResolvedValue({
    pets: [{ petId: "pet-1", species: "Собака", name: "Бобик" }],
    grants: [],
    accessRequests: [],
    records: [],
    confirmations: [],
    confirmedRecordIds: [],
    events: [],
  });
  repositoryMocks.notifications.mockResolvedValue([]);
  repositoryMocks.dismissNotification.mockResolvedValue(undefined);
  repositoryMocks.syncStatus.mockResolvedValue({
    pendingCount: 0,
    deferredCount: 0,
    permanentNotificationCount: 0,
    failedCount: 0,
    syncing: false,
    connectionState: "connected",
    lastError: "",
  });
  repositoryMocks.syncListener = null;
  authMocks.logout.mockResolvedValue(undefined);
  authMocks.revokeDevice.mockResolvedValue({ revokedDeviceIds: [] });
  authMocks.deleteAccount.mockResolvedValue({ operationId: "delete-operation" });
  repositoryMocks.revokeDevice.mockResolvedValue(undefined);
  repositoryMocks.deleteAccount.mockResolvedValue(undefined);
  repositoryMocks.updateProfile.mockResolvedValue(undefined);
  authMocks.syncDirectoryPet.mockResolvedValue(undefined);
  authMocks.updateDirectoryUserProfile.mockResolvedValue({
    operationId: "profile-operation",
    profile: {
      accountId: "owner-2",
      firstName: "Анна",
      lastName: "Иванова",
      displayName: "Анна Иванова",
      updatedAt: "2026-07-23T00:00:00.000Z",
    },
  });
});

describe("app-store directory reconciliation", () => {
  it("finishes bootstrap without waiting for profile and pet directory synchronization", async () => {
    let resolveProfile!: () => void;
    authMocks.syncDirectoryProfile.mockImplementation(() => new Promise<void>((resolve) => { resolveProfile = resolve; }));

    await bootstrapApp(true);

    expect(appState.repositoryConnected).toBe(true);
    expect(appState.busy).toBe(false);
    expect(useAlertStore().alert).toBeNull();
    expect(authMocks.syncDirectoryProfile).toHaveBeenCalledOnce();
    expect(authMocks.syncDirectoryPet).not.toHaveBeenCalled();

    resolveProfile();
    await vi.waitFor(() => expect(authMocks.syncDirectoryPet).toHaveBeenCalledOnce());
  });

  it("refreshes notification state from sync updates and after dismissal", async () => {
    await bootstrapApp(true);
    const notification = {
      notificationId: "notification-1",
      accountId: "owner-1",
      operationId: "operation-1",
      rootEventId: "event-1",
      database: "control",
      eventType: "profile.updated",
      code: "EVENT_REJECTED",
      reasonKey: "invalid",
      diagnosticId: "diagnostic-1",
      affectedEventIds: ["event-1"],
      createdAt: "2026-07-22T00:00:00.000Z",
      action: "return",
    };
    repositoryMocks.notifications.mockResolvedValue([notification]);
    repositoryMocks.syncListener?.({
      pendingCount: 0,
      deferredCount: 0,
      permanentNotificationCount: 1,
      failedCount: 1,
      syncing: false,
      connectionState: "connected",
      lastError: "",
    });
    await vi.waitFor(() => expect(appState.syncNotifications).toEqual([notification]));

    repositoryMocks.notifications.mockResolvedValue([]);
    await dismissSyncNotification(notification.notificationId);
    expect(repositoryMocks.dismissNotification).toHaveBeenCalledWith(notification.notificationId);
    expect(appState.syncNotifications).toEqual([]);
    expect(useAlertStore().alert?.text).toBe("Уведомление закрыто.");
  });

  it("clears repository and synchronization state on logout", async () => {
    await bootstrapApp(true);
    await logout();

    expect(authMocks.logout).toHaveBeenCalledOnce();
    expect(repositoryMocks.dispose).toHaveBeenCalled();
    expect(appState.repositoryConnected).toBe(false);
    expect(appState.syncNotifications).toEqual([]);
  });

  it("clears synchronization state after revoking the current device or deleting the account", async () => {
    await bootstrapApp(true);
    await revokeDevice("device-1");
    expect(repositoryMocks.revokeDevice).toHaveBeenCalledWith("device-1");
    expect(authMocks.revokeDevice).toHaveBeenCalledWith("device-1");
    expect(appState.syncNotifications).toEqual([]);

    await bootstrapApp(true);
    await deleteAccount();
    expect(authMocks.deleteAccount).toHaveBeenCalled();
    expect(repositoryMocks.deleteAccount).toHaveBeenCalledWith("delete-operation");
    expect(appState.syncNotifications).toEqual([]);
  });

  it("propagates the auth operation ID and next target revision to the control profile", async () => {
    authMocks.session.mockResolvedValue({
      authenticated: true,
      accountId: "bootstrap-administrator",
      serverKeySetAvailable: true,
      setup: { requestedRoles: ["administrator"] },
      device: {
        deviceId: "bootstrap-device",
        accountId: "bootstrap-administrator",
        orbitIdentityId: "bootstrap-orbit",
        status: "active",
        userKeyVersion: 1,
        signingPublicKey: {},
        encryptionPublicKey: {},
        issuedAt: "2026-07-22T00:00:00.000Z",
        attestation: "attestation",
      },
    });
    repositoryMocks.controlSnapshot.mockResolvedValue({
      profile: {
        accountId: "bootstrap-administrator",
        revision: 1,
        firstName: "Начальный",
        lastName: "Администратор",
        updatedAt: "2026-07-22T00:00:00.000Z",
      },
      profiles: [{
        accountId: "owner-2",
        revision: 4,
        firstName: "Старое",
        lastName: "Имя",
        updatedAt: "2026-07-22T00:00:00.000Z",
      }],
      roles: [{
        requestId: "bootstrap-administrator-role",
        accountId: "bootstrap-administrator",
        role: "administrator",
        status: "approved",
        profileRevision: 1,
        requestedAt: "2026-07-22T00:00:00.000Z",
      }],
      allRoles: [], devices: [], pendingQueue: [], notifications: [], events: [],
    });
    await bootstrapApp(true);

    await expect(updateAdministratorUserProfile("owner-2", {
      firstName: "Анна",
      lastName: "Иванова",
    })).resolves.toMatchObject({ accountId: "owner-2", displayName: "Анна Иванова" });

    expect(authMocks.updateDirectoryUserProfile).toHaveBeenCalledWith("owner-2", {
      firstName: "Анна",
      lastName: "Иванова",
    });
    expect(repositoryMocks.updateProfile).toHaveBeenCalledWith({
      accountId: "owner-2",
      revision: 5,
      firstName: "Анна",
      lastName: "Иванова",
      updatedAt: "2026-07-23T00:00:00.000Z",
    }, "profile-operation");
  });

  it("logs the bootstrap stage and preserves the original repository error", async () => {
    const originalError = Object.assign(new Error("Bootstrap device does not match the pinned trust anchor."), {
      code: "BOOTSTRAP_ANCHOR_MISMATCH",
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    repositoryMocks.create.mockRejectedValueOnce(originalError);

    await bootstrapApp(true);

    const call = consoleError.mock.calls.find(([entry]) => String(entry).includes("app.bootstrap.failed"));
    expect(call?.[1]).toBe(originalError);
    expect(JSON.parse(String(call?.[0]))).toMatchObject({
      level: "error",
      event: "app.bootstrap.failed",
      stage: "repository.connect",
      errorName: "Error",
      errorMessage: "Bootstrap device does not match the pinned trust anchor.",
      errorCode: "BOOTSTRAP_ANCHOR_MISMATCH",
    });
    expect(appState.repositoryConnected).toBe(false);
    consoleError.mockRestore();
  });
});
