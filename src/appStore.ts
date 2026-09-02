// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, reactive, readonly } from "vue";
import type {
  AuthSessionDto,
  ControlSnapshot,
  DirectoryPageDto,
  DirectoryPetDto,
  DirectoryProfileDto,
  DirectoryUserDto,
  DoctorPetAccessDto,
  MedicalSnapshot,
  Role,
  RoleRequest,
  SessionDeviceDto,
} from "@klinok/contracts";
import { loadRuntimeConfig, type AppRuntimeConfig } from "./runtimeConfig";
import { suggestedDeviceName } from "./deviceName";
import { AuthClient, AuthClientError, type RegisterInput } from "./repositories/authClient";
import { KlinokRepository } from "./repositories";
import { clearOfflineAccount, lastOfflineAccount, listCommands, type OfflineSyncStatus, type SyncNotification } from "./repositories/offlineStore";
import { useAlertStore } from "./stores/alert";

const emptyControl = (): ControlSnapshot => ({
  profile: null, profiles: [], roles: [], allRoles: [], pendingQueue: [], notifications: [], roleAudit: [],
  ledger: { valid: true, height: 0, headHash: "0".repeat(64), verifiedAt: new Date(0).toISOString() },
});
const emptyMedical = (): MedicalSnapshot => ({ pets: [], grants: [], accessRequests: [], transferRequests: [], records: [], confirmations: [], confirmedRecordIds: [] });
const emptySync = (): OfflineSyncStatus => ({ pendingCount: 0, deferredCount: 0, permanentNotificationCount: 0, failedCount: 0, syncing: false, connectionState: "connected", lastError: "" });

type AuthSuccessCode = "registration" | "verification" | "recovery" | "password-reset";
export const AUTH_SUCCESS_MESSAGES = {
  registration: "Перейдите в Вашу программу электронной почты и откройте ссылку из письма для завершения регистрации.",
  verification: "Почта подтверждена, Вы можете войти в систему.",
  recovery: "Перейдите в Вашу программу электронной почты и откройте ссылку из письма для восстановления доступа.",
  "password-reset": "Пароль изменён. Вы можете войти в систему.",
} as const satisfies Record<AuthSuccessCode, string>;

const state = reactive({
  initialized: false, busy: false, session: { authenticated: false } as AuthSessionDto, activeRole: null as Role | null,
  control: emptyControl(), medical: emptyMedical(),
  syncNotifications: [] as SyncNotification[],
  sync: emptySync(), repositoryConnected: false,
});

let config: AppRuntimeConfig;
let auth: AuthClient;
let repository: KlinokRepository | null = null;
let repositoryGeneration = 0;
let controlUnsubscribe: (() => void) | null = null;
let medicalUnsubscribe: (() => void) | null = null;
let syncUnsubscribe: (() => void) | null = null;

const DEVICE_ID_KEY = "klinok:v3:device-id";
const DEVICE_NAME_KEY = "klinok:v3:device-name";
function deviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const value = crypto.randomUUID(); localStorage.setItem(DEVICE_ID_KEY, value); return value;
}
export function hasDeviceIdentity(): boolean { return Boolean(localStorage.getItem(DEVICE_ID_KEY)); }
export { suggestedDeviceName };
export function getDeviceName(): string { return localStorage.getItem(DEVICE_NAME_KEY) || suggestedDeviceName(); }
function setDeviceName(value: string): void { if (value.trim()) localStorage.setItem(DEVICE_NAME_KEY, value.trim()); }
function roleKey(accountId: string): string { return `klinok:v3:${accountId}:active-role`; }

function setAuthFeedback(input: { kind: "success"; code: AuthSuccessCode } | { kind: "error"; reason: unknown } | null): void {
  const alerts = useAlertStore();
  if (!input) alerts.clear();
  else if (input.kind === "success") alerts.success(AUTH_SUCCESS_MESSAGES[input.code]);
  else alerts.error(input.reason);
}

function beginAuthAction(): void { state.busy = true; setAuthFeedback(null); }

function preferredRole(accountId: string): Role {
  const saved = localStorage.getItem(roleKey(accountId));
  if (!saved && accountId === config.bootstrapAccountId) return "administrator";
  return saved === "administrator" || saved === "doctor" || saved === "owner" ? saved : "owner";
}

function disposeSubscriptions(): void {
  controlUnsubscribe?.(); medicalUnsubscribe?.(); syncUnsubscribe?.();
  controlUnsubscribe = null; medicalUnsubscribe = null; syncUnsubscribe = null;
}

async function connectRepository(session: AuthSessionDto): Promise<void> {
  const generation = ++repositoryGeneration;
  disposeSubscriptions();
  const previousRepository = repository; repository = null; await previousRepository?.dispose();
  state.repositoryConnected = false;
  if (!session.authenticated || !session.accountId) return;
  let role = preferredRole(session.accountId);
  const createdRepository = await KlinokRepository.create({
    client: auth,
    session: session as Required<Pick<AuthSessionDto, "accountId">> & AuthSessionDto,
    initialRole: role,
    offlineLeaseDays: config.offlineLeaseDays,
    onSessionInvalid: async () => {
      if (generation !== repositoryGeneration) return;
      repositoryGeneration += 1;
      disposeSubscriptions();
      const invalidRepository = repository; repository = null; await invalidRepository?.dispose();
      state.session = { authenticated: false };
      state.activeRole = null;
      state.control = emptyControl();
      state.medical = emptyMedical();
      state.sync = emptySync();
      state.syncNotifications = [];
      state.repositoryConnected = false;
    },
  });
  if (generation !== repositoryGeneration) { await createdRepository.dispose(); return; }
  repository = createdRepository;
  const roles = createdRepository.current.control.roles;
  const savedIsAvailable = roles.some((request) => request.role === role && request.status === "approved");
  if (!savedIsAvailable) {
    role = roles.find((request) => request.status === "approved")?.role ?? roles[0]?.role ?? role;
    if (role !== createdRepository.current.role) await createdRepository.setActiveRole(role);
  }
  state.activeRole = role;
  state.control = createdRepository.current.control;
  state.medical = createdRepository.current.medical;
  state.syncNotifications = await createdRepository.notifications();
  state.sync = await createdRepository.syncStatus();
  controlUnsubscribe = createdRepository.control.subscribe((snapshot) => { if (repository === createdRepository) state.control = snapshot; });
  medicalUnsubscribe = createdRepository.medical.subscribe((snapshot) => { if (repository === createdRepository) state.medical = snapshot; });
  syncUnsubscribe = createdRepository.subscribeSyncStatus((status) => {
    if (repository !== createdRepository) return;
    state.sync = status;
    void createdRepository.notifications().then((notifications) => { if (repository === createdRepository) state.syncNotifications = notifications; });
  });
  state.repositoryConnected = true;
}

export async function bootstrapApp(force = false): Promise<void> {
  if (state.initialized && !force) return;
  state.busy = true;
  try {
    config = await loadRuntimeConfig();
    auth = new AuthClient(config.apiBaseUrl);
    let session: AuthSessionDto;
    try {
      session = await auth.session();
    } catch (reason) {
      if (!(reason instanceof AuthClientError) || reason.code !== "NETWORK_UNAVAILABLE") throw reason;
      const accountId = await lastOfflineAccount(config.offlineLeaseDays);
      if (!accountId) throw reason;
      const device: SessionDeviceDto = {
        deviceId: deviceId(), deviceName: getDeviceName(), current: true, status: "active",
        createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), expiresAt: new Date(Date.now() + config.offlineLeaseDays * 86_400_000).toISOString(),
      };
      session = { authenticated: true, accountId, device, devices: [device] };
    }
    if (!session.authenticated) {
      const cachedAccountId = await lastOfflineAccount(config.offlineLeaseDays);
      if (cachedAccountId) await clearOfflineAccount(cachedAccountId);
    }
    state.session = session;
    await connectRepository(session);
    if (!session.authenticated) {
      state.activeRole = null; state.control = emptyControl(); state.medical = emptyMedical(); state.sync = emptySync();
    }
  } catch (reason) {
    repositoryGeneration += 1;
    disposeSubscriptions(); const failedRepository = repository; repository = null; await failedRepository?.dispose();
    state.repositoryConnected = false;
    setAuthFeedback({ kind: "error", reason });
  } finally { state.initialized = true; state.busy = false; }
}

export async function register(input: Omit<RegisterInput, "personalDataConsentVersion" | "userAgreementVersion">): Promise<void> {
  beginAuthAction();
  try {
    await auth.register({ ...input, personalDataConsentVersion: config.legal.personalDataConsent.version, userAgreementVersion: config.legal.userAgreement.version });
    setAuthFeedback({ kind: "success", code: "registration" });
  } catch (reason) { setAuthFeedback({ kind: "error", reason }); throw reason; } finally { state.busy = false; }
}
export async function verifyEmail(token: string): Promise<void> {
  beginAuthAction(); try { await auth.verifyEmail(token); setAuthFeedback({ kind: "success", code: "verification" }); }
  catch (reason) { setAuthFeedback({ kind: "error", reason }); throw reason; } finally { state.busy = false; }
}
export async function login(email: string, password: string, deviceName?: string): Promise<void> {
  beginAuthAction();
  try {
    const normalizedDeviceName = deviceName?.trim() || getDeviceName();
    await auth.login(email, password, deviceId(), normalizedDeviceName);
    setDeviceName(normalizedDeviceName);
    state.initialized = false; await bootstrapApp(true);
  } catch (reason) { setAuthFeedback({ kind: "error", reason }); throw reason; } finally { state.busy = false; }
}
async function clearLocalSession(accountId?: string): Promise<void> {
  repositoryGeneration += 1;
  disposeSubscriptions(); const previousRepository = repository; repository = null; await previousRepository?.dispose();
  if (accountId) await clearOfflineAccount(accountId);
  state.session = { authenticated: false }; state.activeRole = null; state.control = emptyControl(); state.medical = emptyMedical();
  state.sync = emptySync(); state.syncNotifications = []; state.repositoryConnected = false; state.busy = false;
}

export async function logout(all = false): Promise<boolean> {
  const accountId = state.session.accountId;
  if (accountId && (await listCommands(accountId)).length && typeof window !== "undefined" &&
    !window.confirm("Есть несинхронизированные изменения. Выйти и удалить их с этого устройства?")) return false;
  state.busy = true; setAuthFeedback(null);
  try {
    if (all) await auth.logoutAll();
    else {
      try { await auth.logout(); }
      catch (reason) {
        if (!(reason instanceof AuthClientError) || (reason.code !== "NETWORK_UNAVAILABLE" && reason.status !== 401)) throw reason;
      }
    }
    await clearLocalSession(accountId);
    return true;
  } catch (reason) {
    state.busy = false;
    throw reason;
  }
}
export async function revokeDevice(id: string): Promise<void> {
  await auth.revokeDevice(id);
  if (id === state.session.device?.deviceId) { await clearLocalSession(state.session.accountId); return; }
  state.session = await auth.session();
}
export async function renameDevice(id: string, name: string): Promise<void> {
  const normalizedName = name.trim();
  let result: Awaited<ReturnType<AuthClient["renameDevice"]>>;
  try {
    result = await auth.renameDevice(id, normalizedName);
  } catch (reason) {
    if (reason instanceof AuthClientError && reason.status === 404) state.session = await auth.session();
    throw reason;
  }
  const current = id === state.session.device?.deviceId;
  if (current) setDeviceName(result.deviceName);
  state.session = {
    ...state.session,
    ...(state.session.device && current ? { device: { ...state.session.device, deviceName: result.deviceName } } : {}),
    ...(state.session.devices ? {
      devices: state.session.devices.map((device) => device.deviceId === id ? { ...device, deviceName: result.deviceName } : device),
    } : {}),
  };
}
export async function deleteAccount(): Promise<void> {
  const accountId = state.session.accountId;
  await auth.deleteAccount(); repositoryGeneration += 1; disposeSubscriptions();
  const previousRepository = repository; repository = null; await previousRepository?.dispose();
  if (accountId) await clearOfflineAccount(accountId);
  state.session = { authenticated: false }; state.activeRole = null; state.control = emptyControl(); state.medical = emptyMedical(); state.repositoryConnected = false;
}
export async function forgotPassword(email: string): Promise<void> {
  beginAuthAction(); try { await auth.forgotPassword(email); setAuthFeedback({ kind: "success", code: "recovery" }); }
  catch (reason) { setAuthFeedback({ kind: "error", reason }); throw reason; } finally { state.busy = false; }
}
export async function resetPassword(token: string, password: string): Promise<void> {
  beginAuthAction(); try { await auth.resetPassword(token, password); setAuthFeedback({ kind: "success", code: "password-reset" }); }
  catch (reason) { setAuthFeedback({ kind: "error", reason }); throw reason; } finally { state.busy = false; }
}

export interface DirectoryProfileInput { firstName: string; lastName: string; patronymic?: string }
export async function updateProfile(input: DirectoryProfileInput): Promise<void> {
  const expectedRevision = state.control.profile?.revision;
  if (!expectedRevision) throw new Error("Профиль ещё не загружен.");
  try {
    await auth.updateProfile({ ...input, expectedRevision });
  } catch (reason) {
    if (reason instanceof AuthClientError && reason.status === 409) await repository?.refresh();
    throw reason;
  }
  await repository?.refresh();
}
export function searchDoctorDirectory(query = "", page = 1, pageSize = 20, sort = "name"): Promise<DirectoryPageDto<DirectoryProfileDto>> { return auth.searchDoctors(query, page, pageSize, sort); }
export function searchOwnerDirectory(query = "", page = 1, pageSize = 20): Promise<DirectoryPageDto<DirectoryProfileDto>> { return auth.searchOwners(query, page, pageSize); }
export function loadAdministratorUsers(query = "", pendingOnly = false, page = 1, pageSize = 20, sort = "name", direction = "asc"): Promise<DirectoryPageDto<DirectoryUserDto>> { return auth.searchUsers(query, pendingOnly, page, pageSize, sort, direction); }
export async function lookupAdministratorProfiles(accountIds: string[]): Promise<DirectoryProfileDto[]> {
  const profiles: DirectoryProfileDto[] = [];
  for (let index = 0; index < [...new Set(accountIds)].length; index += 200) profiles.push(...(await auth.lookupDirectoryProfiles([...new Set(accountIds)].slice(index, index + 200))).profiles);
  return profiles;
}
export async function updateAdministratorUserProfile(accountId: string, input: Pick<DirectoryProfileDto, "firstName" | "lastName" | "patronymic"> & { expectedRevision: number }) {
  try {
    const result = await auth.updateDirectoryUserProfile(accountId, input); await repository?.refresh(); return result;
  } catch (reason) {
    if (reason instanceof AuthClientError && reason.status === 409) await repository?.refresh();
    throw reason;
  }
}
export function lookupPetDirectory(petId: string): Promise<DirectoryPetDto> { return auth.lookupDirectoryPet(petId); }
export function searchPetDirectory(owner = "", pet = "", page = 1, pageSize = 20, sort = "owner", ownerAccountId = ""): Promise<DirectoryPageDto<DirectoryPetDto>> { return auth.searchDirectoryPets(owner, pet, page, pageSize, sort, ownerAccountId); }
export function loadDoctorPetAccesses(query = "", status: DoctorPetAccessDto["status"] | "all" = "all", page = 1, pageSize = 20, sort = "owner", direction = "asc"): Promise<DirectoryPageDto<DoctorPetAccessDto>> { return auth.getMyPetAccesses(query, status, page, pageSize, sort, direction); }
export async function updateCredentials(input: { email?: string; password?: string }): Promise<void> { const result = await auth.updateCredentials(input); state.session = { ...state.session, email: result.email }; }
export async function switchRole(role: Role): Promise<void> {
  const proof = state.control.roles.find((request) => request.role === role && request.status === "approved");
  if (!proof || !state.session.accountId) throw new Error("Эта роль недоступна.");
  await requireRepository().setActiveRole(role); state.activeRole = role; localStorage.setItem(roleKey(state.session.accountId), role);
}
export async function requestRole(role: Role): Promise<void> { await requireRepository().control.requestRole(role, state.control.profile?.revision ?? 1); }
export async function cancelRole(role: Role): Promise<void> { await requireRepository().control.cancelRole(role); }
export async function decideRole(request: Pick<RoleRequest, "accountId" | "requestId" | "revision" | "role"> & Partial<Pick<RoleRequest, "status">>, status: "approved" | "rejected" | "revoked", reason?: string): Promise<void> {
  await requireRepository().control.decideRole({ accountId: request.accountId, requestId: request.requestId, revision: request.revision, role: request.role, status, ...(request.status ? { expectedStatus: request.status } : {}), ...(reason ? { reason } : {}) });
}
export function getRepository(): KlinokRepository | null { return repository; }
export function requireRepository(): KlinokRepository { if (!repository) throw new Error("Хранилище данных ещё не подключено."); return repository; }
export function getConfig(): AppRuntimeConfig { return config; }
export async function dismissSyncNotification(notificationId: string): Promise<void> {
  await requireRepository().dismissNotification(notificationId); state.syncNotifications = await requireRepository().notifications(); state.sync = await requireRepository().syncStatus();
}

export const appState = readonly(state);
export const approvedRoles = computed(() => state.control.roles.filter((role) => role.status === "approved"));
