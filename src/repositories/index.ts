// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type {
  AppSnapshotDto,
  AuthSessionDto,
  ClientCommand,
  CommandResult,
  ControlSnapshot,
  MedicalEncounterInput,
  MedicalRecordDraft,
  MedicalSnapshot,
  OutcomeSectionValue,
  PetGrantAction,
  PetProfile,
  PetProfileInput,
  Role,
  RoleRequest,
} from "@klinok/contracts";
import { normalizePetInput } from "../petProfile";
import { AuthClient, AuthClientError } from "./authClient";
import {
  clearOfflineAccount,
  dismissNotification,
  enqueueCommand,
  getCachedSnapshot,
  listCommands,
  listNotifications,
  putCachedSnapshot,
  recordNotification,
  removeCommand,
  type OfflineSyncStatus,
  type SyncNotification,
} from "./offlineStore";

type Listener<T> = (snapshot: T) => void;
type RoleDecisionInput = { accountId: string; requestId: string; revision: number; role: Role; status: "approved" | "rejected" | "revoked"; expectedStatus?: RoleRequest["status"]; reason?: string };
const COMMAND_BATCH_SIZE = 50;

function commandAction(type: ClientCommand["type"]): string {
  return {
    "pet.create": "pet.created", "pet.update": "pet.updated", "record.create": "medical.record.created",
    "record.update": "medical.record.updated", "role.request": "role.requested", "role.cancel": "role.cancelled",
    "role.decide": "role.updated", "pet.delete": "pet.tombstoned", "record.delete": "medical.record.deleted",
    "record.confirm": "medical.record.confirmed", "access.request": "grant.requested", "access.cancel": "grant.request.cancelled",
    "access.reject": "grant.request.rejected", "access.grant": "grant.created", "access.delegate": "grant.delegated",
    "access.revoke": "grant.revoked", "access.relinquish": "grant.relinquished", "access.actions.update": "grant.actions.updated",
  }[type];
}

function optimisticRecord(command: ClientCommand, snapshot: AppSnapshotDto): MedicalRecordDraft | null {
  if (command.type !== "record.create" && command.type !== "record.update") return null;
  const payload = command.payload as { input: MedicalEncounterInput; title?: string };
  const input = payload.input;
  const now = command.createdAt;
  const profile = snapshot.control.profile;
  const authorDisplayName = [profile?.firstName, profile?.patronymic, profile?.lastName].filter(Boolean).join(" ") || profile?.accountId || "";
  const previous = snapshot.medical.records.find((record) => record.recordId === command.entityId);
  const sections = Object.fromEntries(Object.entries(input.sections).map(([kind, value]) => [kind, {
    kind,
    templateVersion: kind === "what-happened" ? "what-happened-v1" : kind === "outcome" ? "outcome-v1"
      : kind === "general-data" && !(value && typeof value === "object" && "text" in value) ? "general-data-v1"
        : kind === "vaccination" && !(value && typeof value === "object" && "text" in value) ? "vaccination-v1"
          : kind === "therapeutic-appointment" && !(value && typeof value === "object" && "text" in value) ? "therapeutic-appointment-v1" : "free-text-v0",
    value, authorAccountId: profile?.accountId ?? "", authorDisplayName, updatedAt: now,
  }])) as MedicalRecordDraft["sections"];
  return {
    recordId: command.entityId, petId: input.petId, revision: previous ? previous.revision + 1 : 1,
    authorAccountId: previous?.authorAccountId ?? profile?.accountId ?? "", authorDisplayName: previous?.authorDisplayName ?? authorDisplayName,
    encounterDate: input.encounterDate, title: payload.title ?? previous?.title ?? "Что случилось",
    text: input.sections["what-happened"].comment, sections, createdAt: previous?.createdAt ?? now, updatedAt: now,
  };
}

function applyOptimistic(source: AppSnapshotDto, commands: ClientCommand[]): AppSnapshotDto {
  const snapshot = structuredClone(source);
  for (const command of commands) {
    if (command.type === "pet.create") {
      const input = normalizePetInput(command.payload as unknown as PetProfileInput);
      snapshot.medical.pets = snapshot.medical.pets.filter((pet) => pet.petId !== command.entityId).concat({
        ...input, petId: command.entityId, ownerAccountId: snapshot.control.profile?.accountId ?? "", revision: 1,
        tombstoned: false, updatedAt: command.createdAt,
      });
    } else if (command.type === "pet.update") {
      const payload = command.payload as { input: PetProfileInput };
      snapshot.medical.pets = snapshot.medical.pets.map((pet) => pet.petId === command.entityId
        ? { ...pet, ...normalizePetInput(payload.input), revision: pet.revision + 1, updatedAt: command.createdAt } : pet);
    } else {
      const record = optimisticRecord(command, snapshot);
      if (record) snapshot.medical.records = snapshot.medical.records.filter((item) => item.recordId !== record.recordId).concat(record);
    }
  }
  return snapshot;
}

class ApiControlRepository {
  private readonly listeners = new Set<Listener<ControlSnapshot>>();
  constructor(private readonly parent: KlinokRepository) {}
  emit(snapshot: ControlSnapshot): void { for (const listener of this.listeners) listener(snapshot); }
  subscribe(listener: Listener<ControlSnapshot>): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  snapshot(): Promise<ControlSnapshot> { return Promise.resolve(this.parent.current.control); }
  profile(accountId = this.parent.accountId): Promise<ControlSnapshot["profile"]> {
    return Promise.resolve(this.parent.current.control.profiles.find((profile) => profile.accountId === accountId) ?? null);
  }
  refresh(): Promise<void> { return this.parent.refresh(); }
  nextProfileRevision(accountId = this.parent.accountId): Promise<number> {
    return Promise.resolve((this.parent.current.control.profiles.find((profile) => profile.accountId === accountId)?.revision ?? 0) + 1);
  }
  async requestRole(role: Role, profileRevision: number): Promise<void> {
    void profileRevision;
    const existing = this.parent.current.control.roles.find((item) => item.role === role);
    await this.parent.executeOnline({ type: "role.request", entityId: this.parent.accountId, expectedRevision: existing?.revision, payload: { role } });
  }
  async cancelRole(role: Role): Promise<void> {
    const existing = this.parent.current.control.roles.find((item) => item.role === role);
    if (!existing) return;
    await this.parent.executeOnline({ type: "role.cancel", entityId: this.parent.accountId, expectedRevision: existing.revision, payload: { role } });
  }
  async decideRole(input: RoleDecisionInput): Promise<void> {
    await this.parent.executeOnline({
      type: "role.decide", entityId: input.requestId, expectedRevision: input.revision,
      payload: { accountId: input.accountId, role: input.role, status: input.status, ...(input.reason ? { reason: input.reason } : {}) },
    });
  }
  dispose(): Promise<void> { this.listeners.clear(); return Promise.resolve(); }
}

class ApiMedicalRepository {
  private readonly listeners = new Set<Listener<MedicalSnapshot>>();
  constructor(private readonly parent: KlinokRepository) {}
  emit(snapshot: MedicalSnapshot): void { for (const listener of this.listeners) listener(snapshot); }
  subscribe(listener: Listener<MedicalSnapshot>): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  snapshot(): Promise<MedicalSnapshot> { return Promise.resolve(this.parent.current.medical); }
  refresh(): Promise<void> { return this.parent.refresh(); }
  setActiveRole(role: Role): Promise<void> { return this.parent.setActiveRole(role); }

  async createPet(input: PetProfileInput): Promise<string> {
    const petId = crypto.randomUUID();
    await this.parent.executeOffline({ type: "pet.create", entityId: petId, payload: input as unknown as Record<string, unknown> });
    return petId;
  }
  async updatePet(pet: PetProfile): Promise<void> {
    const { petId, revision, ownerAccountId, tombstoned, updatedAt, ...input } = pet;
    void ownerAccountId; void tombstoned; void updatedAt;
    await this.parent.executeOffline({ type: "pet.update", entityId: petId, expectedRevision: revision, payload: { input } });
  }
  async deletePet(petId: string): Promise<void> {
    const pet = this.parent.current.medical.pets.find((candidate) => candidate.petId === petId);
    if (!pet) throw new Error("Питомец не найден.");
    await this.parent.executeOnline({ type: "pet.delete", entityId: petId, expectedRevision: pet.revision, payload: {} });
  }
  async requestAccess(petId: string, expectedOwnerAccountId?: string): Promise<string> {
    const requestId = crypto.randomUUID();
    const result = await this.parent.executeOnline<{ requestId: string }>({ type: "access.request", entityId: petId, payload: { requestId, expectedOwnerAccountId } });
    return result?.requestId ?? requestId;
  }
  async cancelAccessRequest(requestId: string): Promise<void> {
    const request = this.parent.current.medical.accessRequests.find((candidate) => candidate.requestId === requestId);
    await this.parent.executeOnline({ type: "access.cancel", entityId: requestId, expectedRevision: request?.revision, payload: {} });
  }
  async rejectAccessRequest(requestId: string): Promise<void> {
    const request = this.parent.current.medical.accessRequests.find((candidate) => candidate.requestId === requestId);
    await this.parent.executeOnline({ type: "access.reject", entityId: requestId, expectedRevision: request?.revision, payload: {} });
  }
  async approveAccessRequest(requestId: string): Promise<string> {
    const request = this.parent.current.medical.accessRequests.find((candidate) => candidate.requestId === requestId);
    if (!request) throw new Error("Запрос не найден.");
    return this.grantDoctor(request.petId, request.requesterAccountId, ["read", "write_unconfirmed"], {
      requestId, expectedRequestRevision: request.revision, granteeDisplayName: request.requesterDisplayName,
    });
  }
  async grantDoctor(petId: string, doctorAccountId: string, actions: PetGrantAction[], options: { requestId?: string; expectedRequestRevision?: number; granteeDisplayName?: string } = {}): Promise<string> {
    const grantId = crypto.randomUUID();
    await this.parent.executeOnline({ type: "access.grant", entityId: grantId, payload: { petId, doctorAccountId, actions, ...options } });
    return grantId;
  }
  async delegateGrant(parentGrantId: string, doctorAccountId: string, actions: PetGrantAction[], options: { granteeDisplayName?: string } = {}): Promise<string> {
    const parent = this.parent.current.medical.grants.find((candidate) => candidate.grantId === parentGrantId);
    if (!parent) throw new Error("Исходный доступ не найден.");
    const grantId = crypto.randomUUID();
    await this.parent.executeOnline({ type: "access.delegate", entityId: grantId, expectedRevision: parent.revision, payload: { petId: parent.petId, parentGrantId, doctorAccountId, actions, ...options } });
    return grantId;
  }
  async revokeGrant(grantId: string): Promise<void> { await this.changeGrant("access.revoke", grantId); }
  async relinquishAccess(grantId: string): Promise<void> { await this.changeGrant("access.relinquish", grantId); }
  async disableGrantDelegation(grantId: string): Promise<void> { await this.updateGrantActions(grantId, false); }
  async enableGrantDelegation(grantId: string): Promise<void> { await this.updateGrantActions(grantId, true); }
  private async changeGrant(type: "access.revoke" | "access.relinquish", grantId: string): Promise<void> {
    const grant = this.parent.current.medical.grants.find((candidate) => candidate.grantId === grantId);
    if (!grant) throw new Error("Доступ не найден.");
    await this.parent.executeOnline({ type, entityId: grantId, expectedRevision: grant.revision, payload: {} });
  }
  private async updateGrantActions(grantId: string, enabled: boolean): Promise<void> {
    const grant = this.parent.current.medical.grants.find((candidate) => candidate.grantId === grantId);
    if (!grant) throw new Error("Доступ не найден.");
    const actions = enabled ? [...new Set([...grant.actions, "delegate" as const])] : grant.actions.filter((action) => action !== "delegate");
    await this.parent.executeOnline({ type: "access.actions.update", entityId: grantId, expectedRevision: grant.revision, payload: { actions } });
  }
  saveRecord(input: { petId: string; title: string; text: string; outcome: OutcomeSectionValue; recordId?: string }): Promise<string> {
    return this.saveEncounter({
      petId: input.petId, encounterDate: new Date().toISOString().slice(0, 10),
      sections: { "what-happened": { selectedIds: [], comment: input.text }, outcome: input.outcome },
      ...(input.recordId ? { recordId: input.recordId } : {}),
    }, input.title);
  }
  async saveEncounter(input: MedicalEncounterInput, title = "Что случилось"): Promise<string> {
    const recordId = input.recordId ?? crypto.randomUUID();
    const previous = this.parent.current.medical.records.find((candidate) => candidate.recordId === recordId);
    await this.parent.executeOffline({
      type: previous ? "record.update" : "record.create", entityId: recordId,
      expectedRevision: previous?.revision, payload: { input: { ...input, recordId }, title },
    });
    return recordId;
  }
  async deleteRecord(_petId: string, recordId: string): Promise<void> {
    const record = this.parent.current.medical.records.find((candidate) => candidate.recordId === recordId);
    if (!record) throw new Error("Медицинская запись не найдена.");
    await this.parent.executeOnline({ type: "record.delete", entityId: recordId, expectedRevision: record.revision, payload: {} });
  }
  async confirmRecord(_petId: string, recordId: string, revision: number): Promise<void> {
    await this.parent.executeOnline({ type: "record.confirm", entityId: recordId, expectedRevision: revision, payload: {} });
  }
  dispose(): Promise<void> { this.listeners.clear(); return Promise.resolve(); }
}

interface CommandInput { type: ClientCommand["type"]; entityId: string; expectedRevision?: number; payload: Record<string, unknown> }

export class KlinokRepository {
  readonly control: ApiControlRepository;
  readonly medical: ApiMedicalRepository;
  current: AppSnapshotDto;
  private role: Role;
  private disposed = false;
  private syncing = false;
  private connectionState: OfflineSyncStatus["connectionState"] = "connected";
  private lastError = "";
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 1_000;
  private lastCommandTimestamp = 0;
  private readonly syncListeners = new Set<(status: OfflineSyncStatus) => void>();
  private readonly onOnline = () => void this.reconnect();
  private readonly onFocus = () => void this.refresh();
  private readonly onVisibility = () => { if (typeof document === "undefined" || document.visibilityState === "visible") void this.refresh(); };

  private constructor(
    readonly accountId: string,
    private readonly client: AuthClient,
    initialRole: Role,
    private readonly offlineLeaseDays: number,
    snapshot: AppSnapshotDto,
    private readonly onSessionInvalid?: () => void | Promise<void>,
  ) {
    this.role = initialRole;
    this.current = snapshot;
    this.control = new ApiControlRepository(this);
    this.medical = new ApiMedicalRepository(this);
  }

  static async create(options: { client: AuthClient; session: Required<Pick<AuthSessionDto, "accountId">> & AuthSessionDto; initialRole: Role; offlineLeaseDays: number; onSessionInvalid?: () => void | Promise<void> }): Promise<KlinokRepository> {
    let snapshot: AppSnapshotDto;
    try {
      snapshot = await options.client.state(options.initialRole);
      await putCachedSnapshot(options.session.accountId, options.initialRole, snapshot);
    } catch (reason) {
      if (!(reason instanceof AuthClientError) || reason.code !== "NETWORK_UNAVAILABLE") throw reason;
      const cached = await getCachedSnapshot(options.session.accountId, options.initialRole, options.offlineLeaseDays);
      if (!cached) throw reason;
      snapshot = cached;
    }
    const pending = await listCommands(options.session.accountId);
    const repository = new KlinokRepository(options.session.accountId, options.client, options.initialRole, options.offlineLeaseDays,
      applyOptimistic(snapshot, pending.filter((command) => command.activeRole === options.initialRole)), options.onSessionInvalid);
    repository.lastCommandTimestamp = pending.reduce((latest, command) => Math.max(latest, new Date(command.createdAt).getTime()), 0);
    repository.start();
    void repository.flush().then(() => repository.refresh()).catch(() => undefined);
    return repository;
  }

  private start(): void {
    this.pollTimer = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") void this.refresh();
    }, 5_000);
    if (typeof window !== "undefined") window.addEventListener("online", this.onOnline);
    if (typeof window !== "undefined") window.addEventListener("focus", this.onFocus);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onVisibility);
  }

  private command(input: CommandInput): ClientCommand {
    this.lastCommandTimestamp = Math.max(Date.now(), this.lastCommandTimestamp + 1);
    return {
      operationId: crypto.randomUUID(), type: input.type, activeRole: this.role, entityId: input.entityId,
      ...(input.expectedRevision !== undefined ? { expectedRevision: input.expectedRevision } : {}),
      createdAt: new Date(this.lastCommandTimestamp).toISOString(), payload: input.payload,
    };
  }

  async executeOnline<T = unknown>(input: CommandInput): Promise<T | undefined> {
    const command = this.command(input);
    const response = await this.client.execute([command]);
    const result = response.results[0];
    if (!result || (result.status !== "applied" && result.status !== "duplicate")) {
      throw new AuthClientError(result?.error?.code ?? "REQUEST_FAILED", result?.error?.message ?? "Операция не выполнена.", result?.status === "conflict" ? 409 : 400);
    }
    await this.refresh();
    return result.value as T | undefined;
  }

  async executeOffline(input: CommandInput): Promise<void> {
    const command = this.command(input);
    const queued = await listCommands(this.accountId);
    const dependency = queued.find((candidate) =>
      candidate.entityId === command.entityId
      && ((command.type === "pet.update" && candidate.type === "pet.create")
        || (command.type === "record.update" && candidate.type === "record.create")));
    if (dependency) command.dependsOn = [dependency.operationId];
    await enqueueCommand(this.accountId, this.role, command);
    this.current = applyOptimistic(this.current, [command]);
    this.emit();
    await this.emitSync();
    try { await this.flush(command.operationId); await this.refresh(); } catch (reason) {
      if (!(reason instanceof AuthClientError) || (reason.code !== "NETWORK_UNAVAILABLE" && reason.status < 500)) throw reason;
    }
  }

  private async rejection(command: ClientCommand, result: CommandResult): Promise<void> {
    const permission = ["ROLE_REQUIRED", "PET_GRANT_REQUIRED", "OWNER_SCOPE_FORBIDDEN"].includes(result.error?.code ?? "");
    const notification: SyncNotification = {
      notificationId: `${this.accountId}:${command.operationId}`, accountId: this.accountId, operationId: command.operationId,
      entityId: command.entityId, commandAction: commandAction(command.type), code: result.error?.code ?? "COMMAND_REJECTED",
      reasonKey: permission ? "permission" : "invalid", diagnosticId: crypto.randomUUID(),
      createdAt: new Date().toISOString(), action: permission ? "permissions" : "return",
      relatedRoute: command.type.startsWith("record.") ? `/doctor/pets/${encodeURIComponent(String((command.payload as { input?: { petId?: string } }).input?.petId ?? ""))}`
        : command.type === "pet.create" ? "/owner/pets/new"
          : command.type === "pet.update" ? `/owner/pets/${encodeURIComponent(command.entityId)}/edit` : "/profile#roles",
      localDraft: command,
    };
    await recordNotification(notification);
  }

  private scheduleRetry(): void {
    if (this.disposed || this.retryTimer) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, 60_000);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.reconnect();
    }, delay);
  }

  private async invalidateSession(): Promise<void> {
    await clearOfflineAccount(this.accountId);
    await this.onSessionInvalid?.();
  }

  private async reconnect(): Promise<void> {
    if (this.disposed) return;
    try {
      const session = await this.client.session();
      if (!session.authenticated || session.accountId !== this.accountId) {
        await this.invalidateSession();
        return;
      }
      await this.flush();
      await this.refresh();
      this.retryDelay = 1_000;
    } catch (reason) {
      if (reason instanceof AuthClientError && (reason.code === "NETWORK_UNAVAILABLE" || reason.status >= 500)) this.scheduleRetry();
    }
  }

  async flush(focusOperationId?: string): Promise<void> {
    if (this.disposed || this.syncing) return;
    const queued = await listCommands(this.accountId);
    if (!queued.length) return;
    this.syncing = true; await this.emitSync();
    try {
      let focusedError: AuthClientError | null = null;
      for (let offset = 0; offset < queued.length; offset += COMMAND_BATCH_SIZE) {
        const batch = queued.slice(offset, offset + COMMAND_BATCH_SIZE);
        const response = await this.client.execute(batch);
        for (const result of response.results) {
          const command = batch.find((candidate) => candidate.operationId === result.operationId);
          if (!command) continue;
          if (result.status === "applied" || result.status === "duplicate") await removeCommand(command.operationId);
          else {
            await this.rejection(command, result);
            await removeCommand(command.operationId);
            if (focusOperationId === command.operationId) focusedError = new AuthClientError(result.error?.code ?? "COMMAND_REJECTED", result.error?.message ?? "Операция не выполнена.", result.status === "conflict" ? 409 : 400);
          }
        }
      }
      this.connectionState = "connected"; this.lastError = "";
      this.retryDelay = 1_000;
      if (focusedError) {
        await this.refresh();
        throw focusedError;
      }
    } catch (reason) {
      if (reason instanceof AuthClientError && reason.status === 401) {
        await this.invalidateSession();
        throw reason;
      }
      if (reason instanceof AuthClientError && reason.code === "NETWORK_UNAVAILABLE") {
        this.connectionState = "disconnected"; this.lastError = "";
        this.scheduleRetry();
      } else {
        this.connectionState = "error"; this.lastError = reason instanceof Error ? reason.message : String(reason);
        if (reason instanceof AuthClientError && reason.status >= 500) this.scheduleRetry();
      }
      throw reason;
    } finally { this.syncing = false; await this.emitSync(); }
  }

  async refresh(): Promise<void> {
    if (this.disposed) return;
    const role = this.role;
    try {
      const snapshot = await this.client.state(role);
      if (this.disposed || role !== this.role || (this.current.role === role && snapshot.revision < this.current.revision)) return;
      const pending = await listCommands(this.accountId);
      if (this.disposed || role !== this.role || (this.current.role === role && snapshot.revision < this.current.revision)) return;
      this.current = applyOptimistic(snapshot, pending.filter((command) => command.activeRole === role));
      await putCachedSnapshot(this.accountId, role, snapshot);
      this.connectionState = "connected"; this.lastError = ""; this.emit(); await this.emitSync();
    } catch (reason) {
      if (reason instanceof AuthClientError && reason.code === "NETWORK_UNAVAILABLE") {
        this.connectionState = "disconnected"; this.lastError = ""; await this.emitSync(); return;
      }
      if (reason instanceof AuthClientError && reason.status === 401) {
        await this.invalidateSession();
        return;
      }
      throw reason;
    }
  }

  private emit(): void { this.control.emit(this.current.control); this.medical.emit(this.current.medical); }
  private async status(): Promise<OfflineSyncStatus> {
    const commands = await listCommands(this.accountId);
    const notifications = (await listNotifications(this.accountId)).filter((item) => !item.dismissedAt);
    return {
      pendingCount: commands.length, deferredCount: 0, permanentNotificationCount: notifications.length,
      failedCount: notifications.length, syncing: this.syncing, connectionState: this.connectionState, lastError: this.lastError,
      ...(commands[0] ? { oldestPendingAt: commands[0].createdAt } : {}),
    };
  }
  private async emitSync(): Promise<void> { const status = await this.status(); for (const listener of this.syncListeners) listener(status); }
  syncStatus(): Promise<OfflineSyncStatus> { return this.status(); }
  subscribeSyncStatus(listener: (status: OfflineSyncStatus) => void): () => void { this.syncListeners.add(listener); void this.status().then(listener); return () => this.syncListeners.delete(listener); }
  notifications(): Promise<SyncNotification[]> { return listNotifications(this.accountId); }
  async dismissNotification(notificationId: string): Promise<void> { await dismissNotification(this.accountId, notificationId); await this.emitSync(); }
  async setActiveRole(role: Role): Promise<void> {
    const previousRole = this.role;
    this.role = role;
    try {
      const snapshot = await this.client.state(role);
      if (this.disposed) return;
      await putCachedSnapshot(this.accountId, role, snapshot);
      this.current = applyOptimistic(snapshot, (await listCommands(this.accountId)).filter((command) => command.activeRole === role));
    } catch (reason) {
      if (!(reason instanceof AuthClientError) || reason.code !== "NETWORK_UNAVAILABLE") { this.role = previousRole; throw reason; }
      const cached = await getCachedSnapshot(this.accountId, role, this.offlineLeaseDays);
      if (!cached) { this.role = previousRole; throw reason; }
      this.current = applyOptimistic(cached, (await listCommands(this.accountId)).filter((command) => command.activeRole === role));
    }
    this.emit(); await this.emitSync();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.pollTimer = null;
    this.retryTimer = null;
    if (typeof window !== "undefined") window.removeEventListener("online", this.onOnline);
    if (typeof window !== "undefined") window.removeEventListener("focus", this.onFocus);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisibility);
    this.syncListeners.clear();
    await this.control.dispose(); await this.medical.dispose();
  }
}
