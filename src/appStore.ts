// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, reactive, readonly } from "vue";
import {
  exportUserKeySet,
  generateUserKeySet,
  stableSerialize,
  type AuthSessionDto,
  type DirectoryPageDto,
  type DirectoryPetDto,
  type DirectoryProfileDto,
  type DirectoryUserDto,
  type DoctorPetAccessDto,
  type ExportedUserKeySet,
  type Role,
  type RoleRequest,
  type UserKeySet,
} from "@klinok/protocol";
import { loadRuntimeConfig, type AppRuntimeConfig } from "./runtimeConfig";
import { AuthClient, AuthClientError, type RegisterInput } from "./repositories/authClient";
import {
  createAndStoreUserKeys,
  createEnrollmentKey,
  clearDeviceId,
  decryptAndStoreUserKeyBundle,
  encryptUserKeyBundle,
  getDeviceId,
  getLastActiveRole,
  getOrCreateDeviceId,
  getOrCreateDeviceName,
  importBootstrapRecoveryBundle,
  loadUserKeys,
  setDeviceName,
  setLastActiveRole,
  signBootstrapDeviceReplacement,
  storeExportedUserKeys,
} from "./repositories/deviceVault";
import { KlinokRepository } from "./repositories";
import type { ControlSnapshot, MedicalSnapshot } from "./repositories/types";
import type { EventSyncStatus, SyncNotification } from "./repositories/eventTransport";
import {
  enqueueDirectoryPet,
  enqueueDirectoryPetDeletion,
  enqueueDirectoryProfile,
  discardDirectoryProfileOperation,
  flushDirectoryOutbox,
  listDirectoryOutbox,
  type DirectoryOutboxFailure,
  type DirectoryPetInput,
  type DirectoryProfileInput,
} from "./directoryOutbox";
import { logInitializationError } from "./diagnostics";
import { useAlertStore } from "./stores/alert";

const emptyControl: ControlSnapshot = { profile: null, profiles: [], roles: [], allRoles: [], devices: [], pendingQueue: [], notifications: [], events: [] };
const emptyMedical: MedicalSnapshot = { pets: [], grants: [], accessRequests: [], records: [], confirmations: [], confirmedRecordIds: [], events: [] };
const emptySync: EventSyncStatus = {
  pendingCount: 0,
  deferredCount: 0,
  permanentNotificationCount: 0,
  failedCount: 0,
  syncing: false,
  connectionState: "connected",
  lastError: "",
};

type AuthSuccessCode = "registration" | "verification" | "recovery" | "password-reset" | "device-approved";

export const AUTH_SUCCESS_MESSAGES = {
  registration: "Перейдите в Вашу программу электронной почты и откройте ссылку из письма для завершения регистрации.",
  verification: "Почта подтверждена, Вы можете войти в систему.",
  recovery: "Перейдите в Вашу программу электронной почты и откройте ссылку из письма для восстановления доступа.",
  "password-reset": "Пароль изменён. Вы можете войти в систему.",
  "device-approved": "Устройство подтверждено. Ключи переданы по защищённому каналу.",
} as const satisfies Record<AuthSuccessCode, string>;

const state = reactive({
  initialized: false,
  busy: false,
  session: { authenticated: false } as AuthSessionDto,
  activeRole: null as Role | null,
  control: emptyControl,
  medical: emptyMedical,
  conflicts: [] as Array<{ eventId: string; code: string; message: string }>,
  syncNotifications: [] as SyncNotification[],
  devicePending: false,
  keyRecoveryRequired: false,
  sync: emptySync,
  directoryPendingCount: 0,
  repositoryConnected: false,
});

let config: AppRuntimeConfig;
let auth: AuthClient;
let repository: KlinokRepository | null = null;
let keys: UserKeySet | null = null;
let controlUnsubscribe: (() => void) | null = null;
let medicalUnsubscribe: (() => void) | null = null;
let syncUnsubscribe: (() => void) | null = null;
let directoryRetryTimer: ReturnType<typeof setTimeout> | null = null;
let directoryRetryDelayMs = 5_000;
let directoryMutationQueue: Promise<void> = Promise.resolve();

function setAuthFeedback(input: { kind: "success"; code: AuthSuccessCode } | { kind: "error"; reason: unknown } | null) {
  const alertStore = useAlertStore();
  if (!input) {
    alertStore.clear();
    return;
  }
  if (input.kind === "success") alertStore.success(AUTH_SUCCESS_MESSAGES[input.code]);
  else alertStore.error(input.reason);
}

function beginAuthAction() {
  state.busy = true;
  setAuthFeedback(null);
}

async function ensureDevice(session: AuthSessionDto): Promise<AuthSessionDto> {
  if (!session.accountId) return session;
  keys = await loadUserKeys(session.accountId);
  if (session.device) {
    state.devicePending = false;
    state.keyRecoveryRequired = false;
    if (session.device.deviceName) setDeviceName(session.device.deviceName);
    if (!keys || keys.version !== session.device.userKeyVersion) {
      if (session.serverKeySetAvailable) {
        keys = await storeExportedUserKeys(session.accountId, (await auth.getUserKeySet()).userKeySet);
      } else {
        const enrollment = session.enrollments?.find((item) => item.deviceId === session.device?.deviceId && item.status === "active" && item.encryptedKeyBundle);
        if (enrollment?.encryptedKeyBundle) keys = await decryptAndStoreUserKeyBundle(session.accountId, enrollment.encryptedKeyBundle);
        else state.keyRecoveryRequired = true;
      }
    }
    if (keys && !session.serverKeySetAvailable) {
      await auth.putUserKeySet(await exportUserKeySet(keys));
      session = { ...session, serverKeySetAvailable: true };
    }
    return session;
  }
  let deviceId = getOrCreateDeviceId();
  if (session.devices?.some((device) => device.deviceId === deviceId && device.status === "revoked")) {
    clearDeviceId();
    deviceId = getOrCreateDeviceId();
  }
  const existingPending = session.enrollments?.find((enrollment) => enrollment.deviceId === deviceId && enrollment.status === "pending");
  if (existingPending && !session.serverKeySetAvailable) {
    state.devicePending = true;
    return session;
  }
  const firstDevice = !(session.devices ?? []).some((device) => device.status === "active");
  let signingPublicKey: JsonWebKey | undefined;
  let encryptionPublicKey: JsonWebKey | undefined;
  let ephemeralPublicKey: JsonWebKey | undefined;
  let userKeySet: ExportedUserKeySet | undefined;
  if (!session.serverKeySetAvailable && firstDevice) {
    if (!keys && session.accountId === config.p2p.bootstrapAccountId) {
      state.keyRecoveryRequired = true;
      return session;
    }
    keys ??= await createAndStoreUserKeys(session.accountId);
    const exported = await exportUserKeySet(keys);
    userKeySet = exported;
    signingPublicKey = exported.signingPublicKey;
    encryptionPublicKey = exported.encryptionPublicKey;
  } else if (!session.serverKeySetAvailable) {
    ephemeralPublicKey = await createEnrollmentKey(session.accountId);
  }
  const result = await auth.enrollDevice({
    deviceId,
    deviceName: getOrCreateDeviceName(),
    orbitIdentityId: `klinok-device-${deviceId}`,
    ...(signingPublicKey ? { signingPublicKey } : {}),
    ...(encryptionPublicKey ? { encryptionPublicKey } : {}),
    ...(ephemeralPublicKey ? { ephemeralPublicKey } : {}),
    ...(userKeySet ? { userKeySet } : {}),
  });
  if (!result.certificate) {
    state.devicePending = true;
    return { ...session, enrollments: [...(session.enrollments ?? []), result.enrollment] };
  }
  if (result.userKeySet) keys = await storeExportedUserKeys(session.accountId, result.userKeySet);
  state.devicePending = false;
  state.keyRecoveryRequired = false;
  const enrollments = existingPending
    ? (session.enrollments ?? []).map((candidate) => candidate.enrollmentId === result.enrollment.enrollmentId ? result.enrollment : candidate)
    : [...(session.enrollments ?? []), result.enrollment];
  return { ...session, device: result.certificate, enrollments, serverKeySetAvailable: Boolean(result.userKeySet || session.serverKeySetAvailable) };
}

function chooseInitialRole(session: AuthSessionDto): Role {
  if (session.accountId && session.device) {
    const saved = getLastActiveRole(session.accountId, session.device.deviceId);
    if (saved === "administrator" || saved === "doctor" || saved === "owner") return saved;
  }
  return session.setup?.requestedRoles.includes("owner") ? "owner" : session.setup?.requestedRoles[0] ?? "owner";
}

async function reconcileAuthDevices(activeRepository: KlinokRepository, session: AuthSessionDto): Promise<void> {
  if (!session.accountId || !session.device) return;
  await activeRepository.control.refreshProjection();
  let snapshot = await activeRepository.control.snapshot();
  const authDevices = new Map((session.devices ?? []).map((device) => [device.deviceId, device]));
  const projectedCurrent = snapshot.devices.find((device) => device.deviceId === session.device?.deviceId);
  if (!projectedCurrent || projectedCurrent.status !== "active") {
    throw new Error("Состояние текущего устройства расходится с защищённым журналом. Повторите вход после синхронизации службы авторизации.");
  }
  const signingKeyMatches = stableSerialize(projectedCurrent.signingPublicKey) === stableSerialize(session.device.signingPublicKey);
  const encryptionKeyMatches = stableSerialize(projectedCurrent.encryptionPublicKey) === stableSerialize(session.device.encryptionPublicKey);
  if (projectedCurrent.userKeyVersion === session.device.userKeyVersion) {
    if (!signingKeyMatches || !encryptionKeyMatches) {
      throw new Error("Сертификаты текущего устройства конфликтуют. Повторно зарегистрируйте устройство.");
    }
  } else if (session.device.userKeyVersion !== projectedCurrent.userKeyVersion + 1) {
    throw new Error("Версии ключей устройства расходятся более чем на один шаг. Требуется повторная регистрация устройства.");
  } else if (typeof activeRepository.control.rotateCurrentDevice === "function") {
    await activeRepository.control.rotateCurrentDevice(session.device);
  }
  snapshot = await activeRepository.control.snapshot();
  for (const device of snapshot.devices) {
    if (device.deviceId !== session.device.deviceId && device.status === "active" &&
      authDevices.get(device.deviceId)?.status === "revoked") {
      await activeRepository.control.revokeDevice(device.deviceId);
    }
  }
}

function updateDirectoryPendingCount(accountId = state.session.accountId): void {
  state.directoryPendingCount = accountId ? listDirectoryOutbox(accountId).length : 0;
}

function cancelDirectoryRetry(resetDelay = true): void {
  if (directoryRetryTimer) clearTimeout(directoryRetryTimer);
  directoryRetryTimer = null;
  if (resetDelay) directoryRetryDelayMs = 5_000;
}

function scheduleDirectoryRetry(client: AuthClient, accountId: string, shouldContinue: () => boolean): void {
  if (directoryRetryTimer || !shouldContinue() || !listDirectoryOutbox(accountId).length) return;
  const delay = directoryRetryDelayMs;
  directoryRetryDelayMs = Math.min(directoryRetryDelayMs * 2, 60_000);
  directoryRetryTimer = setTimeout(() => {
    directoryRetryTimer = null;
    if (!shouldContinue()) return;
    void flushDirectoryMutations(client, accountId, shouldContinue)
      .catch((reason) => console.warn("Directory reconciliation retry failed.", reason));
  }, delay);
}

function runDirectoryMutation<T>(task: () => Promise<T>): Promise<T> {
  const operation = directoryMutationQueue.then(task);
  directoryMutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

function directoryFailureCode(reason: unknown): string {
  return reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "";
}

function isPermanentDirectoryFailure(reason: unknown): boolean {
  return [
    "PET_TOMBSTONED",
    "PET_OWNER_REQUIRED",
    "DIRECTORY_PET_INVALID",
    "DIRECTORY_PROFILE_INVALID",
  ].includes(directoryFailureCode(reason));
}

async function performDirectoryFlush(
  client: AuthClient,
  accountId: string,
  shouldContinue: () => boolean = () => state.session.authenticated === true && state.session.accountId === accountId,
): Promise<DirectoryOutboxFailure[]> {
  const failures = await flushDirectoryOutbox({
    accountId,
    syncProfile: (profile) => client.syncDirectoryProfile(profile),
    syncPet: (pet) => syncDirectoryPetWithClient(client, pet),
    deletePet: (petId) => client.deleteDirectoryPet(petId),
    shouldContinue,
    isPermanentFailure: ({ reason }) => isPermanentDirectoryFailure(reason),
    onFailure: ({ operation, reason }) => {
      console.warn(`Directory operation ${operation.kind} reconciliation failed.`, reason);
    },
  });
  if (state.session.accountId === accountId) updateDirectoryPendingCount(accountId);
  if (listDirectoryOutbox(accountId).length) scheduleDirectoryRetry(client, accountId, shouldContinue);
  else cancelDirectoryRetry();
  return failures;
}

function flushDirectoryMutations(
  client: AuthClient,
  accountId: string,
  shouldContinue: () => boolean = () => state.session.authenticated === true && state.session.accountId === accountId,
): Promise<DirectoryOutboxFailure[]> {
  return runDirectoryMutation(() => performDirectoryFlush(client, accountId, shouldContinue));
}

async function reconcileDirectoryState(
  client: AuthClient,
  accountId: string,
  profile: DirectoryProfileInput | null,
  pets: Array<DirectoryPetInput & { updatedAt: string }>,
  shouldContinue: () => boolean,
): Promise<void> {
  await runDirectoryMutation(async () => {
    await performDirectoryFlush(client, accountId, shouldContinue);
    if (!shouldContinue()) return;

    const pending = listDirectoryOutbox(accountId);
    if (profile && !pending.some((operation) => operation.kind === "profile.upsert")) {
      try {
        await client.loadOwnDirectoryProfile();
      } catch (reason) {
        const code = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "";
        if (code === "DIRECTORY_PROFILE_NOT_FOUND") {
          enqueueDirectoryProfile(accountId, profile);
        } else {
          console.warn("Directory profile comparison failed.", reason);
        }
      }
    }

    try {
      const publishedPets = new Map((await client.loadOwnedDirectoryPets()).pets.map((pet) => [pet.petId, pet]));
      if (!shouldContinue()) return;
      const currentPending = listDirectoryOutbox(accountId);
      for (const pet of pets) {
        const alreadyPending = currentPending.some((operation) => operation.kind !== "profile.upsert" &&
          (operation.kind === "pet.delete" ? operation.petId : operation.pet.petId) === pet.petId);
        const published = publishedPets.get(pet.petId);
        const locallyNewer = !published || pet.updatedAt > published.updatedAt;
        const contentDiffers = !published || published.species !== pet.species || published.name !== pet.name;
        if (!alreadyPending && locallyNewer && contentDiffers) {
          enqueueDirectoryPet(accountId, { petId: pet.petId, species: pet.species, name: pet.name });
        }
      }
    } catch (reason) {
      console.warn("Directory pet comparison failed.", reason);
    }

    updateDirectoryPendingCount(accountId);
    await performDirectoryFlush(client, accountId, shouldContinue);
  });
}

async function connectRepository(session: AuthSessionDto) {
  cancelDirectoryRetry();
  state.repositoryConnected = false;
  controlUnsubscribe?.(); controlUnsubscribe = null;
  medicalUnsubscribe?.(); medicalUnsubscribe = null;
  syncUnsubscribe?.(); syncUnsubscribe = null;
  await repository?.dispose();
  repository = null;
  state.activeRole = null;
  state.control = emptyControl;
  state.medical = emptyMedical;
  state.conflicts = [];
  state.sync = emptySync;
  state.syncNotifications = [];
  updateDirectoryPendingCount(session.accountId);
  if (!session.accountId || !session.device || !keys || state.keyRecoveryRequired) return;
  const accountId = session.accountId;
  const deviceId = session.device.deviceId;
  const initialRole = chooseInitialRole(session);
  repository = await KlinokRepository.create({
    config,
    session: { ...session, accountId: session.accountId, device: session.device },
    keys,
    initialRole,
  });
  const connectedRepository = repository;
  const connectedAuth = auth;
  state.repositoryConnected = true;
  await reconcileAuthDevices(connectedRepository, session);
  for (const operation of session.pendingOperations ?? []) {
    if (operation.kind === "profile" && operation.payload) {
      const firstName = String(operation.payload.firstName ?? "");
      const lastName = String(operation.payload.lastName ?? "");
      const patronymic = String(operation.payload.patronymic ?? "");
      if (firstName && lastName) await repository.control.updateProfile({
        accountId: session.accountId,
        revision: typeof repository.control.nextProfileRevision === "function"
          ? await repository.control.nextProfileRevision(session.accountId)
          : ((await repository.control.snapshot()).profile?.revision ?? 0) + 1,
        firstName,
        lastName,
        ...(patronymic ? { patronymic } : {}),
        updatedAt: new Date().toISOString(),
      }, operation.operationId);
    }
    if (operation.kind === "account_delete") await repository.control.deleteAccount(operation.operationId);
  }
  let roleSwitchQueue = Promise.resolve();
  const applyControlSnapshot = async (snapshot: ControlSnapshot): Promise<void> => {
    if (repository !== connectedRepository) return;
    state.control = snapshot;
    const approved = snapshot.roles.filter((role) => role.status === "approved");
    if (!state.activeRole || !approved.some((role) => role.role === state.activeRole)) {
      const preferred = approved.find((role) => role.role === initialRole) ?? approved[0];
      state.activeRole = null;
      if (!preferred) return;
      const switchTask = roleSwitchQueue.then(() => connectedRepository.setActiveRole(preferred.role, preferred.requestId));
      roleSwitchQueue = switchTask.catch(() => undefined);
      await switchTask;
      if (repository !== connectedRepository) return;
      const remainsApproved = state.control.roles.some((role) => role.status === "approved"
        && role.role === preferred.role
        && role.requestId === preferred.requestId);
      if (!remainsApproved) return;
      state.activeRole = preferred.role;
      setLastActiveRole(accountId, deviceId, preferred.role);
    }
  };
  await applyControlSnapshot(await connectedRepository.control.snapshot());
  controlUnsubscribe = connectedRepository.control.subscribe((snapshot) => {
    void applyControlSnapshot(snapshot).catch((reason) => {
      if (repository === connectedRepository) setAuthFeedback({ kind: "error", reason });
    });
  });
  const initialMedical = await connectedRepository.medical.snapshot();
  if (repository !== connectedRepository) return;
  state.medical = initialMedical;
  medicalUnsubscribe = connectedRepository.medical.subscribe((snapshot) => {
    if (repository === connectedRepository) state.medical = snapshot;
  });
  syncUnsubscribe = connectedRepository.subscribeSyncStatus((status) => {
    if (repository !== connectedRepository) return;
    state.sync = status;
    void (connectedRepository.notifications?.() ?? Promise.resolve([])).then((notifications) => {
      if (repository === connectedRepository) state.syncNotifications = notifications;
    });
  });
  const [conflicts, notifications] = await Promise.all([
    connectedRepository.conflicts(),
    connectedRepository.notifications?.() ?? Promise.resolve([]),
  ]);
  if (repository !== connectedRepository) return;
  state.conflicts = conflicts;
  state.syncNotifications = notifications;
  const directoryProfile = state.control.profile
    ? {
        firstName: state.control.profile.firstName,
        lastName: state.control.profile.lastName,
        ...(state.control.profile.patronymic ? { patronymic: state.control.profile.patronymic } : {}),
      }
    : null;
  const directoryPets = state.control.roles.some((role) => role.role === "owner" && role.status === "approved")
    ? state.medical.pets
      .filter((pet) => pet.ownerAccountId === accountId)
      .map((pet) => ({ petId: pet.petId, species: pet.species, name: pet.name, updatedAt: pet.updatedAt }))
    : [];
  void reconcileDirectoryState(
    connectedAuth,
    accountId,
    directoryProfile,
    directoryPets,
    () => repository === connectedRepository && auth === connectedAuth,
  ).catch((reason) => console.warn("Directory reconciliation failed.", reason));
}

export async function bootstrapApp(force = false) {
  if (state.initialized && !force) return;
  state.busy = true;
  if (useAlertStore().alert?.kind === "error") setAuthFeedback(null);
  let stage = "runtime-config.load";
  try {
    config = await loadRuntimeConfig();
    stage = "auth-client.create";
    auth = new AuthClient(config.authBaseUrl);
    stage = "auth-session.load";
    let session = await auth.session();
    if (session.authenticated) {
      stage = "device.ensure";
      session = await ensureDevice(session);
    }
    state.session = session;
    stage = "repository.connect";
    await connectRepository(session);
    stage = "session-state.apply";
    if (!session.authenticated) {
      state.activeRole = null;
      state.control = emptyControl;
      state.medical = emptyMedical;
      state.directoryPendingCount = 0;
    }
  } catch (reason) {
    cancelDirectoryRetry();
    controlUnsubscribe?.(); controlUnsubscribe = null;
    medicalUnsubscribe?.(); medicalUnsubscribe = null;
    syncUnsubscribe?.(); syncUnsubscribe = null;
    await repository?.dispose(); repository = null;
    state.repositoryConnected = false;
    logInitializationError("app.bootstrap.failed", stage, reason);
    setAuthFeedback({ kind: "error", reason });
  } finally {
    state.initialized = true;
    state.busy = false;
  }
}

export async function register(input: Omit<RegisterInput, "personalDataConsentVersion" | "userAgreementVersion">) {
  beginAuthAction();
  try {
    await auth.register({
      ...input,
      personalDataConsentVersion: config.legal.personalDataConsent.version,
      userAgreementVersion: config.legal.userAgreement.version,
    });
    setAuthFeedback({ kind: "success", code: "registration" });
  } catch (reason) { setAuthFeedback({ kind: "error", reason }); throw reason; } finally { state.busy = false; }
}

export async function verifyEmail(token: string) {
  beginAuthAction();
  try { await auth.verifyEmail(token); setAuthFeedback({ kind: "success", code: "verification" }); }
  catch (reason) { setAuthFeedback({ kind: "error", reason }); throw reason; } finally { state.busy = false; }
}

export async function login(email: string, password: string, deviceName?: string) {
  beginAuthAction();
  try {
    await auth.login(email, password, getDeviceId() ?? undefined);
    if (deviceName?.trim()) setDeviceName(deviceName);
    state.initialized = false;
    await bootstrapApp(true);
  }
  catch (reason) { setAuthFeedback({ kind: "error", reason }); throw reason; } finally { state.busy = false; }
}

export async function logout(all = false) {
  cancelDirectoryRetry();
  state.busy = true;
  setAuthFeedback(null);
  try { if (all) await auth.logoutAll(); else await auth.logout(); } finally {
    controlUnsubscribe?.(); controlUnsubscribe = null;
    medicalUnsubscribe?.(); medicalUnsubscribe = null;
    syncUnsubscribe?.(); syncUnsubscribe = null;
    await repository?.dispose(); repository = null; keys = null;
    state.session = { authenticated: false }; state.activeRole = null; state.control = emptyControl; state.medical = emptyMedical; state.sync = emptySync; state.syncNotifications = []; state.directoryPendingCount = 0; state.repositoryConnected = false; state.busy = false;
  }
}

export async function revokeDevice(deviceId: string) {
  const activeRepository = requireRepository();
  const currentDeviceId = state.session.device?.deviceId;
  let projectionFailure: unknown;
  let authRevoked = false;
  try {
    if (currentDeviceId && currentDeviceId !== deviceId && keys) {
      const nextKeys = await generateUserKeySet(keys.version + 1);
      const exported = await exportUserKeySet(nextKeys);
      const result = await auth.revokeDevice(deviceId, exported);
      authRevoked = true;
      keys = await storeExportedUserKeys(state.session.accountId!, exported);
      try {
        const revokedDeviceIds = new Set([deviceId, ...result.revokedDeviceIds]);
        if (result.certificate) revokedDeviceIds.delete(result.certificate.deviceId);
        for (const revokedId of revokedDeviceIds) await activeRepository.control.revokeDevice(revokedId);
        if (result.certificate) await activeRepository.control.rotateCurrentDevice(result.certificate);
      } catch (reason) {
        projectionFailure = reason;
      }
    } else {
      await auth.revokeDevice(deviceId);
      authRevoked = true;
      try {
        await activeRepository.control.revokeDevice(deviceId);
      } catch (reason) {
        projectionFailure = reason;
      }
      if (currentDeviceId === deviceId) clearDeviceId();
    }
  } finally {
    if (authRevoked) {
      cancelDirectoryRetry();
      await repository?.dispose();
      repository = null;
      controlUnsubscribe?.(); controlUnsubscribe = null;
      medicalUnsubscribe?.(); medicalUnsubscribe = null;
      syncUnsubscribe?.(); syncUnsubscribe = null;
      state.session = { authenticated: false };
      state.activeRole = null;
      state.control = emptyControl;
      state.medical = emptyMedical;
      state.repositoryConnected = false;
      state.sync = emptySync;
      state.syncNotifications = [];
      state.directoryPendingCount = 0;
    }
  }
  if (projectionFailure) {
    throw new Error("Устройство отозвано в службе входа, но защищённый журнал ещё не обновлён. Войдите снова: синхронизация продолжится автоматически.", { cause: projectionFailure });
  }
}

export async function deleteAccount() {
  const activeRepository = requireRepository();
  const { operationId } = await auth.deleteAccount();
  cancelDirectoryRetry();
  await activeRepository.control.deleteAccount(operationId);
  await repository?.dispose();
  repository = null;
  controlUnsubscribe?.(); controlUnsubscribe = null;
  medicalUnsubscribe?.(); medicalUnsubscribe = null;
  syncUnsubscribe?.(); syncUnsubscribe = null;
  state.session = { authenticated: false };
  state.activeRole = null;
  state.repositoryConnected = false;
  state.sync = emptySync;
  state.syncNotifications = [];
  state.directoryPendingCount = 0;
}

export async function forgotPassword(email: string) {
  beginAuthAction();
  try {
    await auth.forgotPassword(email);
    setAuthFeedback({ kind: "success", code: "recovery" });
  } catch (reason) {
    setAuthFeedback({ kind: "error", reason });
    throw reason;
  } finally {
    state.busy = false;
  }
}

export async function resetPassword(token: string, password: string) {
  beginAuthAction();
  try {
    await auth.resetPassword(token, password);
    setAuthFeedback({ kind: "success", code: "password-reset" });
  } catch (reason) {
    setAuthFeedback({ kind: "error", reason });
    throw reason;
  } finally {
    state.busy = false;
  }
}

export interface DirectorySynchronizationResult {
  synchronized: boolean;
}

export async function updateProfile(input: DirectoryProfileInput): Promise<DirectorySynchronizationResult> {
  if (!state.session.accountId) throw new Error("Необходимо войти в аккаунт.");
  const activeRepository = requireRepository();
  const accountId = state.session.accountId;
  const activeAuth = auth;
  const operation = await runDirectoryMutation(async () => {
    if (state.session.authenticated !== true || state.session.accountId !== accountId || auth !== activeAuth) {
      throw new Error("Сеанс изменился до сохранения профиля. Повторите операцию.");
    }
    const result = await activeAuth.updateProfile(input);
    if (result.profile) discardDirectoryProfileOperation(accountId);
    else enqueueDirectoryProfile(accountId, input);
    updateDirectoryPendingCount(accountId);
    return result;
  });
  let projectionSynchronized = true;
  try {
    await activeRepository.control.updateProfile({
      accountId,
      revision: typeof activeRepository.control.nextProfileRevision === "function"
        ? await activeRepository.control.nextProfileRevision(accountId)
        : (state.control.profile?.revision ?? 0) + 1,
      ...input,
      updatedAt: new Date().toISOString(),
    }, operation.operationId);
  } catch (reason) {
    projectionSynchronized = false;
    console.warn("Protected profile projection update is pending.", reason);
  }
  await flushDirectoryMutations(activeAuth, accountId);
  return {
    synchronized: projectionSynchronized &&
      !listDirectoryOutbox(accountId).some((item) => item.kind === "profile.upsert"),
  };
}

export function searchDoctorDirectory(query = "", page = 1, pageSize = 20, sort = "name"): Promise<DirectoryPageDto<DirectoryProfileDto>> {
  return auth.searchDoctors(query, page, pageSize, sort);
}

export function loadAdministratorUsers(query = "", pendingOnly = false, page = 1, pageSize = 20, sort = "name", direction = "asc"): Promise<DirectoryPageDto<DirectoryUserDto>> {
  return auth.searchUsers(query, pendingOnly, page, pageSize, sort, direction);
}

export async function lookupAdministratorProfiles(accountIds: string[]): Promise<DirectoryProfileDto[]> {
  if (!accountIds.length) return [];
  const uniqueIds = [...new Set(accountIds)];
  const profiles: DirectoryProfileDto[] = [];
  for (let index = 0; index < uniqueIds.length; index += 200) {
    profiles.push(...(await auth.lookupDirectoryProfiles(uniqueIds.slice(index, index + 200))).profiles);
  }
  return profiles;
}

export async function updateAdministratorUserProfile(
  accountId: string,
  input: Pick<DirectoryProfileDto, "firstName" | "lastName" | "patronymic">,
): Promise<{ profile: DirectoryProfileDto; projectionSynchronized: boolean }> {
  if (state.session.accountId !== config?.p2p.bootstrapAccountId || state.activeRole !== "administrator") {
    throw new Error("Изменять профили других пользователей может только начальный администратор.");
  }
  const activeRepository = requireRepository();
  const result = await auth.updateDirectoryUserProfile(accountId, input);
  try {
    await activeRepository.control.updateProfile({
      accountId,
      revision: typeof activeRepository.control.nextProfileRevision === "function"
        ? await activeRepository.control.nextProfileRevision(accountId)
        : (state.control.profiles.find((profile) => profile.accountId === accountId)?.revision ?? 0) + 1,
      firstName: result.profile.firstName,
      lastName: result.profile.lastName,
      ...(result.profile.patronymic ? { patronymic: result.profile.patronymic } : {}),
      updatedAt: result.profile.updatedAt,
    }, result.operationId);
    return { profile: result.profile, projectionSynchronized: true };
  } catch (reason) {
    console.warn("Protected administrator profile projection update is pending.", reason);
    return { profile: result.profile, projectionSynchronized: false };
  }
}

export function lookupPetDirectory(petId: string): Promise<DirectoryPetDto> {
  return auth.lookupDirectoryPet(petId);
}

export function searchPetDirectory(owner = "", pet = "", page = 1, pageSize = 20, sort = "owner"): Promise<DirectoryPageDto<DirectoryPetDto>> {
  return auth.searchDirectoryPets(owner, pet, page, pageSize, sort);
}

export function loadDoctorPetAccesses(query = "", status: DoctorPetAccessDto["status"] | "all" = "all", page = 1, pageSize = 20, sort = "owner", direction = "asc"): Promise<DirectoryPageDto<DoctorPetAccessDto>> {
  return auth.getMyPetAccesses(query, status, page, pageSize, sort, direction);
}

async function syncDirectoryPetWithClient(client: AuthClient, pet: DirectoryPetInput): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await client.syncDirectoryPet(pet);
      return;
    } catch (reason) {
      lastError = reason;
      if (!(reason instanceof AuthClientError) || reason.code !== "PET_PROJECTION_PENDING") throw reason;
      if (attempt === 4) break;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function syncDirectoryPet(pet: DirectoryPetInput): Promise<DirectorySynchronizationResult> {
  const accountId = state.session.accountId;
  if (!accountId) throw new Error("Необходимо войти в аккаунт.");
  const activeAuth = auth;
  return runDirectoryMutation(async () => {
    if (state.session.authenticated !== true || state.session.accountId !== accountId || auth !== activeAuth) {
      throw new Error("Сеанс изменился до публикации питомца. Повторите операцию.");
    }
    const operation = enqueueDirectoryPet(accountId, pet);
    updateDirectoryPendingCount(accountId);
    const failures = await performDirectoryFlush(activeAuth, accountId);
    const permanentFailure = failures.find((failure) => failure.operation.operationId === operation.operationId &&
      isPermanentDirectoryFailure(failure.reason));
    if (permanentFailure) throw permanentFailure.reason;
    const synchronized = !listDirectoryOutbox(accountId).some((candidate) =>
      candidate.kind === "pet.upsert" && candidate.pet.petId === pet.petId);
    return { synchronized };
  });
}

export async function deleteDirectoryPet(petId: string): Promise<DirectorySynchronizationResult> {
  const accountId = state.session.accountId;
  if (!accountId) throw new Error("Необходимо войти в аккаунт.");
  const activeAuth = auth;
  return runDirectoryMutation(async () => {
    if (state.session.authenticated !== true || state.session.accountId !== accountId || auth !== activeAuth) {
      throw new Error("Сеанс изменился до удаления питомца из каталога. Повторите операцию.");
    }
    const operation = enqueueDirectoryPetDeletion(accountId, petId);
    updateDirectoryPendingCount(accountId);
    const failures = await performDirectoryFlush(activeAuth, accountId);
    const permanentFailure = failures.find((failure) => failure.operation.operationId === operation.operationId &&
      directoryFailureCode(failure.reason) === "PET_OWNER_REQUIRED");
    if (permanentFailure) throw permanentFailure.reason;
    const synchronized = !listDirectoryOutbox(accountId).some((candidate) =>
      candidate.kind === "pet.delete" && candidate.petId === petId);
    return { synchronized };
  });
}

export async function updateCredentials(input: { email?: string; password?: string }) {
  const result = await auth.updateCredentials(input);
  state.session = { ...state.session, email: result.email };
}

export async function switchRole(role: Role): Promise<void> {
  const proof = state.control.roles.find((request) => request.role === role && request.status === "approved");
  if (!proof || !state.session.accountId || !state.session.device) throw new Error("Эта роль недоступна.");
  await requireRepository().setActiveRole(role, proof.requestId);
  state.activeRole = role;
  setLastActiveRole(state.session.accountId, state.session.device.deviceId, role);
}

export async function requestRole(role: Role) { await requireRepository().control.requestRole(role, state.control.profile?.revision ?? 1); }
export async function cancelRole(role: Role) { await requireRepository().control.cancelRole(role); }
export async function decideRole(
  request: Pick<RoleRequest, "accountId" | "role"> & Partial<Pick<RoleRequest, "status">>,
  status: "approved" | "rejected" | "revoked",
  reason?: string,
) {
  const activeRepository = requireRepository();
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await activeRepository.control.refreshProjection();
    try {
      await activeRepository.control.decideRole({
        accountId: request.accountId,
        role: request.role,
        status,
        ...(request.status ? { expectedStatus: request.status } : {}),
        ...(reason ? { reason } : {}),
      });
      return;
    } catch (reason) {
      lastError = reason;
      const retryable = reason instanceof Error && reason.message === "Заявка роли не найдена.";
      if (!retryable) throw reason;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  throw new Error("Заявка уже видна в каталоге, но ещё синхронизируется с защищённым журналом. Повторите решение через несколько секунд.", { cause: lastError });
}
export function getRepository() { return repository; }
export function requireRepository() {
  if (!repository) throw new Error("Хранилище данных ещё не подключено. Повторите операцию после восстановления соединения.");
  return repository;
}
export function getConfig() { return config; }

export async function dismissSyncNotification(notificationId: string): Promise<void> {
  const activeRepository = requireRepository();
  await activeRepository.dismissNotification(notificationId);
  state.syncNotifications = await activeRepository.notifications();
  state.sync = await activeRepository.syncStatus();
  useAlertStore().success("Уведомление закрыто.");
}

export async function importBootstrapRecovery(bundleText: string, passphrase: string) {
  state.busy = true;
  setAuthFeedback(null);
  try {
    if (!state.session.accountId || state.session.accountId !== config.p2p.bootstrapAccountId) {
      throw new Error("Пакет восстановления предназначен только для начального администратора.");
    }
    keys = await importBootstrapRecoveryBundle(state.session.accountId, bundleText, passphrase);
    state.keyRecoveryRequired = false;
    state.initialized = false;
    await bootstrapApp(true);
  } catch (reason) {
    const error = reason instanceof DOMException && reason.name === "OperationError"
      ? new Error("Не удалось расшифровать пакет. Проверьте, что выбран bootstrap-recovery.bundle.json от этого развёртывания и введена отдельная фраза KLINOK_RECOVERY_PASSPHRASE, а не пароль учётной записи.")
      : reason;
    setAuthFeedback({ kind: "error", reason: error });
  } finally {
    state.busy = false;
  }
}

export async function replaceLostBootstrapDevice(bundleText: string, passphrase: string) {
  state.busy = true;
  try {
    const accountId = state.session.accountId;
    if (!accountId || accountId !== config.p2p.bootstrapAccountId) {
      throw new Error("Замена утраченного устройства доступна только начальному администратору.");
    }
    const deviceId = getDeviceId();
    const enrollment = state.session.enrollments?.find((candidate) =>
      candidate.deviceId === deviceId && candidate.status === "pending");
    if (!deviceId || !enrollment) throw new Error("Запрос текущего устройства не найден. Обновите страницу и повторите попытку.");

    const recoveredKeys = await importBootstrapRecoveryBundle(accountId, bundleText, passphrase);
    const exported = await exportUserKeySet(recoveredKeys);
    const { challenge } = await auth.bootstrapDeviceReplacementChallenge();
    const payload = {
      action: "bootstrap-device-replacement" as const,
      challenge,
      accountId,
      deviceId,
      deviceName: enrollment.deviceName ?? getOrCreateDeviceName(),
      orbitIdentityId: enrollment.orbitIdentityId,
      userKeyVersion: exported.version,
      signingPublicKey: exported.signingPublicKey,
      encryptionPublicKey: exported.encryptionPublicKey,
    };
    const replacement = await auth.replaceBootstrapDevice(
      payload,
      await signBootstrapDeviceReplacement(payload, recoveredKeys.signingPrivateKey),
    );
    keys = recoveredKeys;
    state.initialized = false;
    await bootstrapApp(true);
    const activeRepository = requireRepository();
    for (const revokedDeviceId of replacement.revokedDeviceIds) {
      await activeRepository.control.revokeDevice(revokedDeviceId);
    }
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "OperationError") {
      throw new Error("Не удалось расшифровать пакет. Проверьте пакет восстановления и отдельную фразу KLINOK_RECOVERY_PASSPHRASE.");
    }
    throw reason;
  } finally {
    state.busy = false;
  }
}

export async function approveDeviceEnrollment(enrollmentId: string) {
  if (!keys) throw new Error("Ключи действующего устройства недоступны.");
  const enrollment = state.session.enrollments?.find((item) => item.enrollmentId === enrollmentId);
  if (!enrollment?.ephemeralPublicKey) throw new Error("Запрос устройства не содержит ключ переноса.");
  const exported = await exportUserKeySet(keys);
  await auth.approveEnrollment(
    enrollmentId,
    await encryptUserKeyBundle(enrollment.ephemeralPublicKey, keys),
    exported.signingPublicKey,
    exported.encryptionPublicKey,
  );
  setAuthFeedback({ kind: "success", code: "device-approved" });
  state.initialized = false;
  await bootstrapApp(true);
}

export async function rejectDeviceEnrollment(enrollmentId: string) {
  await auth.rejectEnrollment(enrollmentId);
  state.session = {
    ...state.session,
    enrollments: state.session.enrollments?.filter((item) => item.enrollmentId !== enrollmentId),
  };
}

export const appState = readonly(state);
export const approvedRoles = computed(() => state.control.roles.filter((role) => role.status === "approved"));
