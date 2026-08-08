// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const authMocks = vi.hoisted(() => ({
  session: vi.fn(),
  logout: vi.fn(),
  revokeDevice: vi.fn(),
  deleteAccount: vi.fn(),
  updateProfile: vi.fn(),
  syncDirectoryProfile: vi.fn(),
  loadOwnDirectoryProfile: vi.fn(),
  loadOwnedDirectoryPets: vi.fn(),
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
  rotateCurrentDevice: vi.fn(),
  deleteAccount: vi.fn(),
  updateProfile: vi.fn(),
  refreshProjection: vi.fn(),
  decideRole: vi.fn(),
}));

const deviceVaultMocks = vi.hoisted(() => ({
  loadUserKeys: vi.fn(),
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
    updateProfile = authMocks.updateProfile;
    syncDirectoryProfile = authMocks.syncDirectoryProfile;
    loadOwnDirectoryProfile = authMocks.loadOwnDirectoryProfile;
    loadOwnedDirectoryPets = authMocks.loadOwnedDirectoryPets;
    syncDirectoryPet = authMocks.syncDirectoryPet;
    updateDirectoryUserProfile = authMocks.updateDirectoryUserProfile;
  }
  return { AuthClient, AuthClientError };
});

vi.mock("../src/repositories/deviceVault", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/repositories/deviceVault")>(),
  getLastActiveRole: vi.fn().mockReturnValue("owner"),
  loadUserKeys: deviceVaultMocks.loadUserKeys,
}));

vi.mock("../src/repositories", () => {
  const repository = {
    dispose: repositoryMocks.dispose,
    setActiveRole: repositoryMocks.setActiveRole,
    control: {
      snapshot: repositoryMocks.controlSnapshot,
      subscribe: vi.fn().mockReturnValue(() => undefined),
      revokeDevice: repositoryMocks.revokeDevice,
      rotateCurrentDevice: repositoryMocks.rotateCurrentDevice,
      deleteAccount: repositoryMocks.deleteAccount,
      updateProfile: repositoryMocks.updateProfile,
      refreshProjection: repositoryMocks.refreshProjection,
      decideRole: repositoryMocks.decideRole,
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
  decideRole,
  deleteAccount,
  dismissSyncNotification,
  logout,
  revokeDevice,
  syncDirectoryPet,
  updateProfile,
  updateAdministratorUserProfile,
} from "../src/appStore";
import { AuthClientError } from "../src/repositories/authClient";
import { useAlertStore } from "../src/stores/alert";

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  localStorage.clear();
  deviceVaultMocks.loadUserKeys.mockResolvedValue({ version: 1 });
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
    devices: [{
      deviceId: "device-1",
      accountId: "owner-1",
      orbitIdentityId: "orbit-1",
      status: "active",
      userKeyVersion: 1,
      signingPublicKey: {},
      encryptionPublicKey: {},
      issuedAt: "2026-07-22T00:00:00.000Z",
      attestation: "attestation",
    }],
    pendingQueue: [],
    notifications: [],
    events: [],
  });
  repositoryMocks.medicalSnapshot.mockResolvedValue({
    pets: [{
      petId: "pet-1",
      ownerAccountId: "owner-1",
      species: "Собака",
      name: "Бобик",
      updatedAt: "2026-07-22T00:00:00.000Z",
    }],
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
  authMocks.updateProfile.mockImplementation(async (profile: {
    firstName: string;
    lastName: string;
    patronymic?: string;
  }) => ({
    operationId: "self-profile-operation",
    profile: {
      accountId: "owner-1",
      ...profile,
      displayName: [profile.firstName, profile.patronymic, profile.lastName].filter(Boolean).join(" "),
      updatedAt: "2026-07-23T00:00:00.000Z",
    },
  }));
  repositoryMocks.revokeDevice.mockResolvedValue(undefined);
  repositoryMocks.rotateCurrentDevice.mockResolvedValue(undefined);
  repositoryMocks.deleteAccount.mockResolvedValue(undefined);
  repositoryMocks.updateProfile.mockResolvedValue(undefined);
  repositoryMocks.refreshProjection.mockResolvedValue(undefined);
  repositoryMocks.decideRole.mockResolvedValue(undefined);
  authMocks.syncDirectoryProfile.mockResolvedValue(undefined);
  authMocks.loadOwnDirectoryProfile.mockResolvedValue({
    accountId: "owner-1",
    firstName: "Иван",
    lastName: "Иванов",
    displayName: "Иван Иванов",
    updatedAt: "2026-07-22T00:00:00.000Z",
  });
  authMocks.loadOwnedDirectoryPets.mockResolvedValue({
    pets: [{
      petId: "pet-1",
      ownerAccountId: "owner-1",
      ownerDisplayName: "Иван Иванов",
      species: "Собака",
      name: "Бобик",
      updatedAt: "2026-07-22T00:00:00.000Z",
    }],
  });
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

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("app-store directory reconciliation", () => {
  it("refreshes the role projection before deciding a directory role request", async () => {
    await bootstrapApp(true);
    repositoryMocks.refreshProjection.mockClear();

    await decideRole({ accountId: "doctor-1", role: "doctor", status: "pending" }, "approved");

    expect(repositoryMocks.refreshProjection).toHaveBeenCalledOnce();
    expect(repositoryMocks.decideRole).toHaveBeenCalledWith({
      accountId: "doctor-1",
      role: "doctor",
      status: "approved",
      expectedStatus: "pending",
    });
    expect(repositoryMocks.refreshProjection.mock.invocationCallOrder[0])
      .toBeLessThan(repositoryMocks.decideRole.mock.invocationCallOrder[0]!);
  });

  it("does not overwrite an existing directory projection from a stale browser snapshot", async () => {
    await bootstrapApp(true);
    await vi.waitFor(() => expect(authMocks.loadOwnedDirectoryPets).toHaveBeenCalledOnce());

    expect(authMocks.syncDirectoryProfile).not.toHaveBeenCalled();
    expect(authMocks.syncDirectoryPet).not.toHaveBeenCalled();
  });

  it("republishes a locally newer pet projection after an interrupted dual write", async () => {
    repositoryMocks.medicalSnapshot.mockResolvedValueOnce({
      pets: [{
        petId: "pet-1",
        ownerAccountId: "owner-1",
        species: "Собака",
        name: "Буся",
        updatedAt: "2026-07-23T00:00:00.000Z",
      }],
      grants: [], accessRequests: [], records: [], confirmations: [], confirmedRecordIds: [], events: [],
    });

    await bootstrapApp(true);
    await vi.waitFor(() => expect(authMocks.syncDirectoryPet).toHaveBeenCalledWith({
      petId: "pet-1",
      species: "Собака",
      name: "Буся",
    }));
  });

  it("keeps a newer directory pet while the local projection catches up", async () => {
    authMocks.loadOwnedDirectoryPets.mockResolvedValueOnce({
      pets: [{
        petId: "pet-1",
        ownerAccountId: "owner-1",
        ownerDisplayName: "Иван Иванов",
        species: "Собака",
        name: "Буся",
        updatedAt: "2026-07-23T00:00:00.000Z",
      }],
    });

    await bootstrapApp(true);
    await vi.waitFor(() => expect(authMocks.loadOwnedDirectoryPets).toHaveBeenCalledOnce());

    expect(authMocks.syncDirectoryPet).not.toHaveBeenCalled();
  });

  it("finishes bootstrap without waiting for profile and pet directory synchronization", async () => {
    let resolveProfile!: () => void;
    authMocks.loadOwnDirectoryProfile.mockRejectedValueOnce(Object.assign(new Error("missing"), {
      code: "DIRECTORY_PROFILE_NOT_FOUND",
    }));
    authMocks.loadOwnedDirectoryPets.mockResolvedValueOnce({ pets: [] });
    authMocks.syncDirectoryProfile.mockImplementation(() => new Promise<void>((resolve) => { resolveProfile = resolve; }));

    await bootstrapApp(true);

    expect(appState.repositoryConnected).toBe(true);
    expect(appState.busy).toBe(false);
    expect(useAlertStore().alert).toBeNull();
    await vi.waitFor(() => expect(authMocks.syncDirectoryProfile).toHaveBeenCalledOnce());
    expect(authMocks.syncDirectoryPet).not.toHaveBeenCalled();

    resolveProfile();
    await vi.waitFor(() => expect(authMocks.syncDirectoryPet).toHaveBeenCalledOnce());
  });

  it("retries pending directory publication without requiring a reload", async () => {
    vi.useFakeTimers();
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    authMocks.syncDirectoryProfile
      .mockRejectedValueOnce(new Error("directory unavailable"))
      .mockResolvedValue(undefined);
    authMocks.loadOwnDirectoryProfile.mockRejectedValueOnce(Object.assign(new Error("missing"), {
      code: "DIRECTORY_PROFILE_NOT_FOUND",
    }));
    authMocks.loadOwnedDirectoryPets.mockResolvedValueOnce({ pets: [] });

    await bootstrapApp(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(authMocks.syncDirectoryProfile).toHaveBeenCalledOnce();
    expect(appState.directoryPendingCount).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(authMocks.syncDirectoryProfile).toHaveBeenCalledTimes(2);
    expect(appState.directoryPendingCount).toBe(0);
    consoleWarn.mockRestore();
  });

  it("does not report a terminal directory rejection as synchronized", async () => {
    await bootstrapApp(true);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    authMocks.syncDirectoryPet.mockRejectedValueOnce(
      new AuthClientError("PET_TOMBSTONED", "Питомец удалён.", 410),
    );

    await expect(syncDirectoryPet({ petId: "pet-terminal", species: "Собака", name: "Буся" }))
      .rejects.toMatchObject({ code: "PET_TOMBSTONED" });
    expect(appState.directoryPendingCount).toBe(0);
    consoleWarn.mockRestore();
  });

  it("does not make the user repeat a profile edit when its protected projection is delayed", async () => {
    await bootstrapApp(true);
    repositoryMocks.updateProfile.mockRejectedValueOnce(new Error("projection unavailable"));
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(updateProfile({ firstName: "Мария", lastName: "Иванова" }))
      .resolves.toEqual({ synchronized: false });

    expect(authMocks.updateProfile).toHaveBeenCalledOnce();
    expect(authMocks.syncDirectoryProfile).not.toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  it("lets a new profile save finish after an in-flight stale directory retry", async () => {
    let resolveStaleProfile!: () => void;
    authMocks.loadOwnDirectoryProfile.mockRejectedValueOnce(Object.assign(new Error("missing"), {
      code: "DIRECTORY_PROFILE_NOT_FOUND",
    }));
    authMocks.syncDirectoryProfile.mockImplementationOnce(() =>
      new Promise<void>((resolve) => { resolveStaleProfile = resolve; }));
    await bootstrapApp(true);
    await vi.waitFor(() => expect(authMocks.syncDirectoryProfile).toHaveBeenCalledOnce());

    const update = updateProfile({ firstName: "Мария", lastName: "Иванова" });
    await Promise.resolve();
    expect(authMocks.updateProfile).not.toHaveBeenCalled();

    resolveStaleProfile();
    await expect(update).resolves.toEqual({ synchronized: true });
    expect(authMocks.syncDirectoryProfile.mock.invocationCallOrder[0])
      .toBeLessThan(authMocks.updateProfile.mock.invocationCallOrder[0]!);
    expect(authMocks.syncDirectoryProfile).toHaveBeenCalledOnce();
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

  it("re-establishes the active role and clears stale projections on a forced reconnect", async () => {
    await bootstrapApp(true);
    repositoryMocks.setActiveRole.mockClear();

    await bootstrapApp(true);

    expect(repositoryMocks.setActiveRole).toHaveBeenCalledWith("owner", "owner-role-1");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    repositoryMocks.create.mockRejectedValueOnce(new Error("repository unavailable"));
    await bootstrapApp(true);
    expect(appState.activeRole).toBeNull();
    expect(appState.control.profile).toBeNull();
    expect(appState.medical.pets).toEqual([]);
    consoleError.mockRestore();
  });

  it("clears synchronization state after revoking the current device or deleting the account", async () => {
    await bootstrapApp(true);
    authMocks.revokeDevice.mockClear();
    repositoryMocks.revokeDevice.mockClear();
    await revokeDevice("device-1");
    expect(repositoryMocks.revokeDevice).toHaveBeenCalledWith("device-1");
    expect(authMocks.revokeDevice).toHaveBeenCalledWith("device-1");
    expect(authMocks.revokeDevice.mock.invocationCallOrder[0])
      .toBeLessThan(repositoryMocks.revokeDevice.mock.invocationCallOrder[0]!);
    expect(appState.syncNotifications).toEqual([]);

    await bootstrapApp(true);
    await deleteAccount();
    expect(authMocks.deleteAccount).toHaveBeenCalled();
    expect(repositoryMocks.deleteAccount).toHaveBeenCalledWith("delete-operation");
    expect(appState.syncNotifications).toEqual([]);
  });

  it("reconciles auth-revoked devices that are still active in the local projection", async () => {
    const currentDevice = {
      deviceId: "device-1",
      accountId: "owner-1",
      orbitIdentityId: "orbit-1",
      status: "active" as const,
      userKeyVersion: 1,
      signingPublicKey: {},
      encryptionPublicKey: {},
      issuedAt: "2026-07-22T00:00:00.000Z",
      attestation: "attestation",
    };
    authMocks.session.mockResolvedValue({
      authenticated: true,
      accountId: "owner-1",
      serverKeySetAvailable: true,
      setup: { requestedRoles: ["owner"] },
      device: currentDevice,
      devices: [currentDevice, { ...currentDevice, deviceId: "old-device", status: "revoked" }],
    });
    repositoryMocks.controlSnapshot.mockResolvedValue({
      profile: {
        accountId: "owner-1", revision: 1, firstName: "Иван", lastName: "Иванов",
        updatedAt: "2026-07-22T00:00:00.000Z",
      },
      profiles: [],
      roles: [{
        requestId: "owner-role-1", accountId: "owner-1", role: "owner", status: "approved",
        profileRevision: 1, requestedAt: "2026-07-22T00:00:00.000Z",
      }],
      allRoles: [],
      devices: [currentDevice, { ...currentDevice, deviceId: "old-device", status: "active" }],
      pendingQueue: [], notifications: [], events: [],
    });

    await bootstrapApp(true);

    expect(repositoryMocks.revokeDevice).toHaveBeenCalledWith("old-device");
    expect(repositoryMocks.rotateCurrentDevice).not.toHaveBeenCalled();
  });

  it("rotates the surviving device before revoking devices with the new key", async () => {
    const currentDevice = {
      deviceId: "device-1",
      accountId: "owner-1",
      orbitIdentityId: "orbit-1",
      status: "active" as const,
      userKeyVersion: 2,
      signingPublicKey: { kid: "new-signing" },
      encryptionPublicKey: { kid: "new-encryption" },
      issuedAt: "2026-07-23T00:00:00.000Z",
      attestation: "new-attestation",
    };
    const oldCurrentDevice = {
      ...currentDevice,
      userKeyVersion: 1,
      signingPublicKey: { kid: "old-signing" },
      encryptionPublicKey: { kid: "old-encryption" },
      issuedAt: "2026-07-22T00:00:00.000Z",
      attestation: "old-attestation",
    };
    const oldDevice = { ...oldCurrentDevice, deviceId: "old-device" };
    deviceVaultMocks.loadUserKeys.mockResolvedValue({ version: 2 });
    authMocks.session.mockResolvedValue({
      authenticated: true,
      accountId: "owner-1",
      serverKeySetAvailable: true,
      setup: { requestedRoles: ["owner"] },
      device: currentDevice,
      devices: [currentDevice, { ...oldDevice, status: "revoked" as const }],
    });
    const baseSnapshot = {
      profile: {
        accountId: "owner-1", revision: 1, firstName: "Иван", lastName: "Иванов",
        updatedAt: "2026-07-22T00:00:00.000Z",
      },
      profiles: [],
      roles: [{
        requestId: "owner-role-1", accountId: "owner-1", role: "owner" as const, status: "approved" as const,
        profileRevision: 1, requestedAt: "2026-07-22T00:00:00.000Z",
      }],
      allRoles: [], pendingQueue: [], notifications: [], events: [],
    };
    repositoryMocks.controlSnapshot
      .mockResolvedValueOnce({ ...baseSnapshot, devices: [oldCurrentDevice, oldDevice] })
      .mockResolvedValue({ ...baseSnapshot, devices: [currentDevice, oldDevice] });

    await bootstrapApp(true);

    expect(repositoryMocks.rotateCurrentDevice).toHaveBeenCalledWith(currentDevice);
    expect(repositoryMocks.revokeDevice).toHaveBeenCalledWith("old-device");
    expect(repositoryMocks.rotateCurrentDevice.mock.invocationCallOrder[0])
      .toBeLessThan(repositoryMocks.revokeDevice.mock.invocationCallOrder[0]!);
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
      allRoles: [],
      devices: [{
        deviceId: "bootstrap-device", accountId: "bootstrap-administrator", orbitIdentityId: "bootstrap-orbit",
        status: "active", userKeyVersion: 1, signingPublicKey: {}, encryptionPublicKey: {},
        issuedAt: "2026-07-22T00:00:00.000Z", attestation: "attestation",
      }],
      pendingQueue: [], notifications: [], events: [],
    });
    await bootstrapApp(true);

    await expect(updateAdministratorUserProfile("owner-2", {
      firstName: "Анна",
      lastName: "Иванова",
    })).resolves.toMatchObject({
      profile: { accountId: "owner-2", displayName: "Анна Иванова" },
      projectionSynchronized: true,
    });

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

  it("reports an administrator directory edit as pending when the target has no encryption recipient", async () => {
    authMocks.session.mockResolvedValue({
      authenticated: true,
      accountId: "bootstrap-administrator",
      serverKeySetAvailable: true,
      setup: { requestedRoles: ["administrator"] },
      device: {
        deviceId: "bootstrap-device", accountId: "bootstrap-administrator", orbitIdentityId: "bootstrap-orbit",
        status: "active", userKeyVersion: 1, signingPublicKey: {}, encryptionPublicKey: {},
        issuedAt: "2026-07-22T00:00:00.000Z", attestation: "attestation",
      },
    });
    repositoryMocks.controlSnapshot.mockResolvedValue({
      profile: {
        accountId: "bootstrap-administrator", revision: 1, firstName: "Начальный", lastName: "Администратор",
        updatedAt: "2026-07-22T00:00:00.000Z",
      },
      profiles: [],
      roles: [{
        requestId: "bootstrap-administrator-role", accountId: "bootstrap-administrator", role: "administrator",
        status: "approved", profileRevision: 1, requestedAt: "2026-07-22T00:00:00.000Z",
      }],
      allRoles: [],
      devices: [{
        deviceId: "bootstrap-device", accountId: "bootstrap-administrator", orbitIdentityId: "bootstrap-orbit",
        status: "active", userKeyVersion: 1, signingPublicKey: {}, encryptionPublicKey: {},
        issuedAt: "2026-07-22T00:00:00.000Z", attestation: "attestation",
      }],
      pendingQueue: [], notifications: [], events: [],
    });
    repositoryMocks.updateProfile.mockRejectedValueOnce(Object.assign(new Error("recipient missing"), {
      code: "PROFILE_RECIPIENT_UNAVAILABLE",
    }));
    await bootstrapApp(true);

    await expect(updateAdministratorUserProfile("owner-2", {
      firstName: "Анна",
      lastName: "Иванова",
    })).resolves.toMatchObject({ projectionSynchronized: false });
    expect(authMocks.updateDirectoryUserProfile).toHaveBeenCalledOnce();
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
