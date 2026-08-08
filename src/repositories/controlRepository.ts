// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import {
  decryptPayload,
  deviceProjectionKey,
  InMemorySignedEventRepository,
  stableSerialize,
  unwrapDataKey,
  type AccountProfile,
  type ActiveRoleContext,
  type ConsentReceipt,
  type DeviceCertificate,
  type RegistrationSetupDto,
  type Role,
  type RoleStatus,
  type SignedEvent,
  type UserKeySet,
} from "@klinok/protocol";
import { EventFactory } from "./eventFactory";
import type { EventTransport } from "./eventTransport";
import type { ControlSnapshot, RoleDecisionInput } from "./types";
import { loadUserKeys } from "./deviceVault";
import { localOperationErrorText } from "../russianMessages";

type Listener = (snapshot: ControlSnapshot) => void;

function roleKey(accountId: string, role: Role) { return `${accountId}:${role}`; }

export class ControlRepository {
  readonly signed: InMemorySignedEventRepository;
  private readonly factory: EventFactory;
  private readonly listeners = new Set<Listener>();
  private events: SignedEvent[] = [];
  private unsubscribe: (() => void) | null = null;
  private reloadQueue: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(
    private readonly transport: EventTransport,
    private context: ActiveRoleContext,
    private readonly keys: UserKeySet,
    private readonly certificate: DeviceCertificate,
    bootstrapAccountId: string,
    signed?: InMemorySignedEventRepository,
  ) {
    this.signed = signed ?? new InMemorySignedEventRepository(bootstrapAccountId);
    this.factory = new EventFactory({ context, keys });
  }

  setActiveRole(role: Role, roleProofId: string) {
    this.context = { ...this.context, role, roleProofId };
    this.factory.setContext(this.context);
  }

  async initialize(setup?: RegistrationSetupDto, deviceOperationId?: string): Promise<void> {
    this.disposed = false;
    await this.reloadNow();
    this.unsubscribe = this.transport.subscribe("control", () => { void this.queueReload(); });
    if (!this.signed.state.devices.has(deviceProjectionKey(this.context.accountId, this.context.deviceId))) {
      await this.append(await this.factory.create({
        database: "control",
        eventType: "device.attested",
        aggregateId: this.context.accountId,
        resourceId: this.context.deviceId,
        ...(deviceOperationId ? { operationId: deviceOperationId } : {}),
        metadata: { certificate: this.certificate as unknown as Record<string, unknown> },
        cleartext: { certificate: this.certificate },
        recipients: [this.certificate],
      }));
    }
    if (setup && this.context.accountId === this.signed.state.bootstrapAccountId && !this.signed.state.roles.has(roleKey(this.context.accountId, "administrator"))) {
      await this.append(await this.factory.create({
        database: "control",
        eventType: "account.bootstrap",
        aggregateId: this.context.accountId,
        resourceId: "bootstrap-administrator-role",
        parents: [this.latestDeviceEventId()],
        metadata: { role: "administrator", status: "approved" },
        cleartext: setup,
        recipients: [this.certificate],
      }));
    }
    if (setup && !this.events.some((event) => event.eventType === "profile.updated" && event.aggregateId === this.context.accountId)) {
      await this.updateProfile({ accountId: this.context.accountId, revision: 1, ...setup.profile, updatedAt: new Date().toISOString() });
    }
    if (setup && !this.events.some((event) => event.eventType === "consent.accepted" && event.aggregateId === this.context.accountId)) {
      const consent: ConsentReceipt = {
        accountId: this.context.accountId,
        acceptedAt: new Date().toISOString(),
        ageConfirmed: true,
        personalDataConsentVersion: setup.personalDataConsentVersion,
        userAgreementVersion: setup.userAgreementVersion,
        signature: `signed-event:${this.context.deviceId}`,
      };
      await this.append(await this.factory.create({
        database: "control", eventType: "consent.accepted", aggregateId: this.context.accountId,
        metadata: {
          accountId: this.context.accountId,
          personalDataConsentVersion: setup.personalDataConsentVersion,
          userAgreementVersion: setup.userAgreementVersion,
        },
        cleartext: consent, parents: [this.latestDeviceEventId()].filter(Boolean),
        recipients: this.profileRecipients().length ? this.profileRecipients() : [this.certificate],
      }));
    }
    if (setup) {
      for (const role of setup.requestedRoles) {
        if (this.context.accountId === this.signed.state.bootstrapAccountId && role === "administrator") continue;
        if (!this.signed.state.roles.has(roleKey(this.context.accountId, role))) await this.requestRole(role, 1);
      }
    }
    const active = this.signed.state.roles.get(roleKey(this.context.accountId, this.context.role));
    if (active?.request.status === "approved") this.setActiveRole(this.context.role, active.request.requestId);
    await this.emit();
  }

  private latestDeviceEventId(): string {
    return this.events.findLast((event) => event.eventType === "device.attested" &&
      event.aggregateId === this.context.accountId && event.resourceId === this.context.deviceId)?.eventId ?? "";
  }

  private queueReload(): Promise<void> {
    return this.runProjectionMutation(() => this.disposed ? Promise.resolve() : this.reloadNow());
  }

  async runProjectionMutation<T>(task: () => Promise<T>): Promise<T> {
    const operation = this.reloadQueue.then(task);
    this.reloadQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async reloadNow() {
    const [controlEvents, medicalEvents] = await Promise.all([
      this.transport.list("control"),
      this.transport.list("medical"),
    ]);
    if (this.disposed) return;
    await this.signed.replace([...controlEvents, ...medicalEvents]);
    if (this.disposed) return;
    this.events = this.signed.list().filter((event) => event.database === "control");
    for (const conflict of this.signed.takeNewConflicts()) {
      if (this.disposed) return;
      await this.transport.recordPermanentRejection(conflict.event, conflict.result.code ?? "EVENT_REJECTED");
    }
    await this.emit();
  }

  async refreshProjection(): Promise<void> {
    await this.queueReload();
  }

  private async append(event: SignedEvent) {
    return this.runProjectionMutation(async () => {
      try {
        await this.signed.append(event);
        await this.transport.append(event);
        this.events = this.signed.list().filter((candidate) => candidate.database === "control");
        await this.emit();
      } catch (reason) {
        const code = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "EVENT_REJECTED";
        throw Object.assign(new Error(localOperationErrorText(code)), { code });
      }
    });
  }

  private ownRecipients(): DeviceCertificate[] {
    return [...this.signed.state.devices.values()].filter((device) => device.accountId === this.context.accountId && device.status === "active");
  }

  private profileRecipients(accountId = this.context.accountId, extraAccountIds: string[] = []): DeviceCertificate[] {
    const accountIds = new Set([accountId, ...extraAccountIds]);
    for (const projection of this.signed.state.roles.values()) {
      if (projection.request.role === "administrator" && projection.request.status === "approved") accountIds.add(projection.request.accountId);
    }
    return [...this.signed.state.devices.values()].filter((device) => device.status === "active" && accountIds.has(device.accountId));
  }

  private async decrypt<T>(event: SignedEvent): Promise<T | null> {
    const envelope = event.keyring.find((item) => item.recipientId === this.context.accountId);
    if (!envelope) return null;
    try {
      const keys = envelope.keyVersion === this.keys.version ? this.keys : await loadUserKeys(this.context.accountId, envelope.keyVersion);
      if (!keys) return null;
      return decryptPayload<T>(event.payload, await unwrapDataKey(envelope, keys.encryptionPrivateKey));
    } catch {
      return null;
    }
  }

  async updateProfile(profile: AccountProfile, operationId?: string): Promise<void> {
    if (operationId && this.events.some((event) => event.eventType === "profile.updated" && event.operationId === operationId)) return;
    const latestRevision = Math.max(0, ...this.events
      .filter((event) => event.eventType === "profile.updated" && event.aggregateId === profile.accountId)
      .map((event) => Number(event.metadata.revision) || 0));
    if (!Number.isInteger(profile.revision) || profile.revision <= latestRevision) {
      throw Object.assign(new Error(localOperationErrorText("PROFILE_REVISION_STALE")), {
        code: "PROFILE_REVISION_STALE",
      });
    }
    const parent = this.events
      .filter((event) => event.eventType === "profile.updated" && event.aggregateId === profile.accountId)
      .sort((left, right) => Number(right.metadata.revision ?? 0) - Number(left.metadata.revision ?? 0) ||
        right.createdAt.localeCompare(left.createdAt))[0]?.eventId;
    const recipients = this.profileRecipients(profile.accountId);
    if (profile.accountId !== this.context.accountId && !recipients.some((device) => device.accountId === profile.accountId)) {
      throw Object.assign(new Error("The target account has no active profile encryption recipient."), {
        code: "PROFILE_RECIPIENT_UNAVAILABLE",
      });
    }
    await this.append(await this.factory.create({
      database: "control", eventType: "profile.updated", aggregateId: profile.accountId,
      ...(operationId ? { operationId } : {}),
      metadata: { accountId: profile.accountId, revision: profile.revision }, cleartext: profile,
      parents: parent ? [parent] : [this.latestDeviceEventId()].filter(Boolean),
      recipients: recipients.length ? recipients : [this.certificate],
    }));
  }

  async nextProfileRevision(accountId = this.context.accountId): Promise<number> {
    await this.refreshProjection();
    const latestRevision = Math.max(0, ...[...this.signed.state.events.values()]
      .filter((event) => event.eventType === "profile.updated" && event.aggregateId === accountId)
      .map((event) => Number(event.metadata.revision) || 0));
    return latestRevision + 1;
  }

  async requestRole(role: Role, profileRevision: number): Promise<void> {
    const current = this.signed.state.roles.get(roleKey(this.context.accountId, role));
    const administrator = this.signed.state.roles.get(roleKey(this.context.accountId, "administrator"));
    const administratorApprovesOwnDoctorRole = role === "doctor" &&
      this.context.role === "administrator" && administrator?.request.status === "approved";
    const status: RoleStatus = role === "owner" || administratorApprovesOwnDoctorRole ? "approved" : "pending";
    const eventType = current ? "role.resubmitted" : status === "approved" ? "role.approved" : "role.requested";
    const requestId = current?.request.requestId ?? crypto.randomUUID();
    const operationId = crypto.randomUUID();
    const transition = await this.factory.create({
      database: "control", eventType, aggregateId: this.context.accountId,
      resourceId: requestId, operationId,
      parents: current ? [current.eventId] : [],
      metadata: {
        requestId, accountId: this.context.accountId, role, status,
        profileRevision, requestedAt: new Date().toISOString(),
      },
      cleartext: { role, status, profileRevision }, recipients: this.ownRecipients().length ? this.ownRecipients() : [this.certificate],
      ...(administratorApprovesOwnDoctorRole ? { proofIds: [administrator.request.requestId] } : {}),
    });
    await this.append(transition);
    await this.appendRoleCompanions(transition, this.ownRecipients(), { role, status, profileRevision });
  }

  async cancelRole(role: Role): Promise<void> {
    const current = this.signed.state.roles.get(roleKey(this.context.accountId, role));
    if (!current) return;
    const operationId = crypto.randomUUID();
    const transition = await this.factory.create({
      database: "control", eventType: "role.cancelled", aggregateId: this.context.accountId,
      resourceId: current.request.requestId, operationId, parents: [current.eventId],
      metadata: { requestId: current.request.requestId, accountId: this.context.accountId, role, status: "not_requested", profileRevision: current.request.profileRevision },
      cleartext: { role }, recipients: this.ownRecipients(),
    });
    await this.append(transition);
    await this.appendRoleCompanions(transition, this.ownRecipients(), { role, status: "not_requested" });
  }

  async decideRole(input: RoleDecisionInput): Promise<void> {
    const current = this.signed.state.roles.get(roleKey(input.accountId, input.role));
    if (!current) throw new Error("Заявка роли не найдена.");
    if (current.request.status === input.status) return;
    if (input.expectedStatus && current.request.status !== input.expectedStatus) {
      throw Object.assign(new Error("Статус заявки изменился. Обновите список и повторите действие."), {
        code: "ROLE_STATUS_CHANGED",
      });
    }
    const operationId = crypto.randomUUID();
    const restoring = input.status === "approved" &&
      ["not_requested", "rejected", "revoked"].includes(current.request.status);
    const recipients = [...this.signed.state.devices.values()].filter((device) =>
      device.status === "active" && (device.accountId === input.accountId || device.accountId === this.context.accountId),
    );
    const decision = await this.factory.create({
      database: "control", eventType: restoring ? "role.restored" : `role.${input.status}`, aggregateId: input.accountId,
      resourceId: current.request.requestId, operationId, parents: [current.eventId],
      metadata: {
        requestId: current.request.requestId,
        accountId: input.accountId,
        role: input.role,
        status: input.status,
        profileRevision: current.request.profileRevision,
        ...(input.status === "revoked" ? {
          priorAuthorizedEventIds: this.signed.list()
            .filter((event) => event.database === "medical" && event.actorAccountId === input.accountId)
            .map((event) => event.eventId),
        } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
      },
      cleartext: input, recipients,
    });
    await this.append(decision);
    await this.appendRoleCompanions(decision, recipients, input);
    if (input.role === "administrator" && input.status === "approved") await this.rewrapProfilesForAdministrator(input.accountId, operationId);
  }

  private async appendRoleCompanions(transition: SignedEvent, recipients: DeviceCertificate[], cleartext: unknown): Promise<void> {
    for (const companion of [
      { eventType: "audit.role-transition", resourceId: `audit-${transition.eventId}` },
      { eventType: "notification.role-transition", resourceId: `notification-${transition.eventId}` },
      { eventType: "email.role-transition", resourceId: `email-${transition.eventId}` },
    ]) {
      await this.append(await this.factory.create({
        database: "control", ...companion, aggregateId: transition.aggregateId, operationId: transition.operationId,
        parents: [transition.eventId], metadata: {
          accountId: transition.aggregateId,
          role: transition.metadata.role,
          status: transition.metadata.status,
        },
        cleartext, recipients,
      }));
    }
  }

  private async rewrapProfilesForAdministrator(accountId: string, operationId: string): Promise<void> {
    const latest = new Map<string, { source: SignedEvent; profile: AccountProfile }>();
    for (const event of this.events) {
      if (event.eventType !== "profile.updated" && event.eventType !== "profile.key.rewrapped") continue;
      const profile = await this.decrypt<AccountProfile>(event);
      if (!profile) continue;
      const current = latest.get(profile.accountId);
      if (!current || profile.revision > current.profile.revision ||
        (profile.revision === current.profile.revision && profile.updatedAt > current.profile.updatedAt)) {
        latest.set(profile.accountId, { source: event, profile });
      }
    }
    for (const { source, profile } of latest.values()) {
      await this.append(await this.factory.create({
        database: "control", eventType: "profile.key.rewrapped", aggregateId: profile.accountId,
        resourceId: source.eventId, operationId, parents: [source.eventId],
        metadata: { accountId: profile.accountId, revision: profile.revision, sourceEventId: source.eventId, newAdministratorAccountId: accountId },
        cleartext: profile, recipients: this.profileRecipients(profile.accountId, [accountId]),
      }));
    }
  }

  async deleteAccount(operationId: string): Promise<void> {
    if (this.events.some((event) => event.eventType === "account.deleted" && event.operationId === operationId)) return;
    const parent = this.events
      .filter((event) => event.eventType === "profile.updated" && event.aggregateId === this.context.accountId)
      .sort((left, right) => Number(right.metadata.revision ?? 0) - Number(left.metadata.revision ?? 0) ||
        right.createdAt.localeCompare(left.createdAt))[0]?.eventId;
    await this.append(await this.factory.create({
      database: "control", eventType: "account.deleted", aggregateId: this.context.accountId,
      operationId, metadata: { accountId: this.context.accountId }, cleartext: { deletedAt: new Date().toISOString() },
      parents: parent ? [parent] : [], recipients: this.ownRecipients(),
    }));
  }

  async revokeDevice(deviceId: string): Promise<void> {
    const projected = this.signed.state.devices.get(deviceProjectionKey(this.context.accountId, deviceId));
    if (!projected || projected.status === "revoked") return;
    const parent = this.events.findLast((event) => event.eventType.startsWith("device.") &&
      event.aggregateId === this.context.accountId && event.resourceId === deviceId)?.eventId;
    await this.append(await this.factory.create({
      database: "control", eventType: "device.revoked", aggregateId: this.context.accountId, resourceId: deviceId,
      metadata: { accountId: this.context.accountId, deviceId }, cleartext: { revokedAt: new Date().toISOString() },
      parents: parent ? [parent] : [], recipients: this.ownRecipients(),
    }));
  }

  async rotateCurrentDevice(certificate: DeviceCertificate): Promise<void> {
    const projected = this.signed.state.devices.get(deviceProjectionKey(this.context.accountId, certificate.deviceId));
    if (projected?.status === "active" && projected.userKeyVersion >= certificate.userKeyVersion &&
      stableSerialize(projected.signingPublicKey) === stableSerialize(certificate.signingPublicKey) &&
      stableSerialize(projected.encryptionPublicKey) === stableSerialize(certificate.encryptionPublicKey)) return;
    if (!projected || projected.status !== "active") {
      throw Object.assign(new Error("The current device is not active in the protected journal."), {
        code: "DEVICE_ROTATION_SOURCE_UNAVAILABLE",
      });
    }
    const rotationKeys = projected.userKeyVersion === this.keys.version
      ? this.keys
      : await loadUserKeys(this.context.accountId, projected.userKeyVersion);
    if (!rotationKeys) {
      throw Object.assign(new Error("The previous device key is unavailable for rotation."), {
        code: "DEVICE_ROTATION_KEY_UNAVAILABLE",
      });
    }
    const parent = this.events.findLast((event) => event.eventType.startsWith("device.") &&
      event.aggregateId === this.context.accountId && event.resourceId === certificate.deviceId)?.eventId;
    const rotationFactory = new EventFactory({
      context: { ...this.context, userKeyVersion: projected.userKeyVersion },
      keys: rotationKeys,
    });
    await this.append(await rotationFactory.create({
      database: "control", eventType: "device.rotated", aggregateId: this.context.accountId, resourceId: certificate.deviceId,
      metadata: { accountId: this.context.accountId, certificate: certificate as unknown as Record<string, unknown> },
      cleartext: { certificate }, parents: parent ? [parent] : [], recipients: this.ownRecipients(),
    }));
  }

  async snapshot(): Promise<ControlSnapshot> {
    await this.reloadQueue;
    return this.buildSnapshot();
  }

  async profile(accountId = this.context.accountId): Promise<AccountProfile | null> {
    let profile: AccountProfile | null = null;
    for (const event of this.events) {
      if (!["profile.updated", "profile.key.rewrapped"].includes(event.eventType) || event.aggregateId !== accountId) continue;
      const candidate = await this.decrypt<AccountProfile>(event);
      if (candidate && (!profile || candidate.revision > profile.revision ||
        (candidate.revision === profile.revision && candidate.updatedAt > profile.updatedAt))) {
        profile = candidate;
      }
    }
    return profile;
  }

  private async buildSnapshot(): Promise<ControlSnapshot> {
    let profile: AccountProfile | null = null;
    const profiles = new Map<string, AccountProfile>();
    const notifications: ControlSnapshot["notifications"] = [];
    for (const event of this.events) {
      if (event.eventType === "profile.updated" || event.eventType === "profile.key.rewrapped") {
        const value = await this.decrypt<AccountProfile>(event);
        if (value) {
          const current = profiles.get(value.accountId);
          if (!current || value.revision > current.revision ||
            (value.revision === current.revision && value.updatedAt > current.updatedAt)) {
            profiles.set(value.accountId, value);
            if (event.aggregateId === this.context.accountId) profile = value;
          }
        }
      }
      if (event.eventType === "notification.role-transition" && event.aggregateId === this.context.accountId) {
        notifications.push({ id: event.eventId, title: "Статус роли изменён", message: String(event.metadata.status ?? ""), createdAt: event.createdAt });
      }
    }
    const roles = [...this.signed.state.roles.values()].map((value) => value.request);
    return {
      profile,
      profiles: [...profiles.values()],
      roles: roles.filter((role) => role.accountId === this.context.accountId),
      allRoles: roles,
      devices: [...this.signed.state.devices.values()].filter((device) => device.accountId === this.context.accountId),
      pendingQueue: roles.filter((role) => role.status === "pending"),
      notifications,
      events: [...this.events],
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    void this.snapshot().then(listener);
    return () => this.listeners.delete(listener);
  }

  private async emit() {
    if (!this.listeners.size) return;
    const snapshot = await this.buildSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  async dispose() {
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.listeners.clear();
  }
}
