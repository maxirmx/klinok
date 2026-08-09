// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import {
  ACCESS_CONTROLLER_TYPES,
  extractSignedEvent,
  InMemorySignedEventRepository,
  KlinokIdentityProvider,
  roleProjectionKey,
  shouldDeferEventVerification,
  verifySignedEvent,
  type ProtocolState,
  type Role,
  type RoleStatus,
  type SignedEvent,
} from "@klinok/protocol";
import type { AuthConfig } from "./config.js";
import type { Mailer } from "./mailer.js";
import type { AuthStore } from "./store.js";

interface ObserverRuntime {
  dbs: Array<{
    address?: { toString(): string } | string;
    iterator(): AsyncIterable<unknown>;
    close(): Promise<void>;
    events?: { on?(event: string, callback: () => void): void; off?(event: string, callback: () => void): void };
  }>;
  orbitdb: { stop(): Promise<unknown> };
  helia: { stop(): Promise<unknown> };
}

const roleLabels: Record<Role, string> = {
  administrator: "Администратор",
  doctor: "Врач",
  owner: "Владелец",
};

function roleLabel(role: unknown): string {
  return roleLabels[role as Role] ?? String(role);
}

function valueFrom(entry: unknown): SignedEvent | null {
  return extractSignedEvent(entry);
}

async function waitForDatabaseJoin(database: ObserverRuntime["dbs"][number], timeoutMs = 5_000): Promise<boolean> {
  const events = database.events;
  if (!events?.on || !events.off) return false;
  return new Promise((resolve) => {
    const joined = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    const finish = (replicated: boolean) => {
      clearTimeout(timer);
      events.off?.("join", joined);
      resolve(replicated);
    };
    events.on?.("join", joined);
  });
}

export function roleStatusMailText(role: unknown, status: unknown): string {
  const localizedRole = roleLabel(role);
  const messages: Record<RoleStatus, string> = {
    not_requested: `Запрос роли «${localizedRole}» отменён.`,
    pending: `Ваша заявка на роль «${localizedRole}» ожидает подтверждения.`,
    approved: `Ваша роль «${localizedRole}» подтверждена.`,
    rejected: `Ваша заявка на роль «${localizedRole}» отклонена.`,
    revoked: `Ваша роль «${localizedRole}» отозвана.`,
  };
  return messages[status as RoleStatus] ?? `Статус роли «${localizedRole}» изменён.`;
}

export function roleRequestMailText(displayName: string | null | undefined, role: unknown): string {
  const requesterName = displayName?.trim() || "с неуказанным ФИО";
  return `Пользователь ${requesterName} запросил роль «${roleLabel(role)}».`;
}

function observerAccessController(
  state: ProtocolState,
  authAttestationPublicKey: JsonWebKey,
  bootstrapSigningPublicKey: JsonWebKey | undefined,
  database: "control" | "medical",
  replayQuarantineEventIds: ReadonlySet<string>,
) {
  const type = ACCESS_CONTROLLER_TYPES[database];
  const factory = async () => ({
    type,
    address: `/${type}`,
    async canAppend(entry: { identity?: string; payload?: { value?: unknown }; value?: unknown }) {
      if (!entry.identity) return false;
      const event = extractSignedEvent(entry);
      if (!event) {
        console.warn(JSON.stringify({
          level: "warn",
          event: "auth.control-observer.authorization.rejected",
          code: "EVENT_PAYLOAD_INVALID",
        }));
        return false;
      }
      const result = await verifySignedEvent(event, state, {
        allowUnknownDevice: event.eventType === "device.attested",
        authAttestationPublicKey,
        bootstrapSigningPublicKey,
        requireTrustedAttestation: true,
      });
      if (shouldDeferEventVerification(result)) {
        console.log(JSON.stringify({
          level: "info",
          event: "auth.control-observer.authorization.deferred",
          code: result.code,
          eventId: event.eventId,
          eventType: event.eventType,
        }));
        return true;
      }
      if (!result.accepted) {
        if (result.code === "BOOTSTRAP_ANCHOR_MISMATCH" && replayQuarantineEventIds.has(event.eventId)) {
          console.warn(JSON.stringify({
            level: "warn",
            event: "auth.control-observer.authorization.quarantined",
            code: result.code,
            eventId: event.eventId,
            eventType: event.eventType,
          }));
          return true;
        }
        console.warn(JSON.stringify({
          level: "warn",
          event: "auth.control-observer.authorization.rejected",
          code: result.code,
          eventId: event.eventId,
          eventType: event.eventType,
        }));
        return false;
      }
      return true;
    },
  });
  return Object.assign(factory, { type });
}

export class ControlPlaneObserver {
  private runtime: ObserverRuntime | null = null;
  private updateHandler: (() => void) | null = null;
  private readonly projector: InMemorySignedEventRepository;
  private processing: Promise<void> = Promise.resolve();
  private ready: boolean;

  constructor(
    private readonly config: AuthConfig,
    private readonly store: AuthStore,
    private readonly mailer: Mailer,
    private readonly authAttestationPublicKey: JsonWebKey,
  ) {
    this.projector = new InMemorySignedEventRepository(config.bootstrapAccountId, {
      authAttestationPublicKey,
      bootstrapSigningPublicKey: config.bootstrapSigningPublicKey,
      requireTrustedAttestation: true,
      replayQuarantineEventIds: new Set(config.controlObserver.replayQuarantineEventIds),
    });
    this.ready = !config.controlObserver.enabled;
  }

  private get state(): ProtocolState {
    return this.projector.state;
  }

  isReady(): boolean {
    return this.ready;
  }

  metrics() {
    return {
      ready: this.ready,
      accepted: this.projector.list().length,
      deferred: this.projector.listDeferred().length,
      conflicts: this.projector.listConflicts().length,
    };
  }

  async start(): Promise<void> {
    if (!this.config.controlObserver.enabled) return;
    const [
      { createLibp2p }, { createHeliaLight }, { withBitswap }, { withHTTP }, { withLibp2p }, dagCbor, dagJson, json,
      { sha512 }, { createOrbitDB, useAccessController, useIdentityProvider }, { webSockets }, { bootstrap }, { identify }, { gossipsub }, { noise }, { yamux }, { multiaddr }, { LevelBlockstore },
    ] = await Promise.all([
      import("libp2p"), import("helia"), import("@helia/bitswap"), import("@helia/http"), import("@helia/libp2p"),
      import("@ipld/dag-cbor"), import("@ipld/dag-json"), import("multiformats/codecs/json"), import("multiformats/hashes/sha2"),
      import("@orbitdb/core"), import("@libp2p/websockets"), import("@libp2p/bootstrap"), import("@libp2p/identify"),
      import("@libp2p/gossipsub"), import("@chainsafe/libp2p-noise"), import("@chainsafe/libp2p-yamux"), import("@multiformats/multiaddr"), import("blockstore-level"),
    ]);
    this.ready = false;
    const replayQuarantineEventIds = new Set(this.config.controlObserver.replayQuarantineEventIds);
    const controlAccess = observerAccessController(this.state, this.authAttestationPublicKey, this.config.bootstrapSigningPublicKey, "control", replayQuarantineEventIds);
    const medicalAccess = observerAccessController(this.state, this.authAttestationPublicKey, this.config.bootstrapSigningPublicKey, "medical", replayQuarantineEventIds);
    useIdentityProvider(KlinokIdentityProvider);
    useAccessController(controlAccess);
    useAccessController(medicalAccess);
    const peerAddresses = this.config.controlObserver.trustedNodeMultiaddrs;
    console.log(JSON.stringify({ level: "info", event: "auth.control-observer.starting", trustedNodeMultiaddrs: peerAddresses }));
    const discovery = peerAddresses.filter((item) => item.includes("/p2p/"));
    const configuredAddresses = peerAddresses.map((item) => multiaddr(item));
    const libp2p = await createLibp2p({
      addresses: { listen: [] }, transports: [webSockets()], connectionEncrypters: [noise()], streamMuxers: [yamux()],
      peerDiscovery: discovery.length ? [bootstrap({ list: discovery, tagTTL: Infinity })] : [],
      services: { identify: identify(), pubsub: gossipsub({ allowPublishToZeroTopicPeers: true }) },
    });
    for (const address of configuredAddresses) {
      try {
        const connection = await libp2p.dial(address);
        console.log(JSON.stringify({ level: "info", event: "auth.control-observer.dial.succeeded", multiaddr: address.toString(), peerId: connection.remotePeer.toString() }));
      } catch (error) {
        console.error(JSON.stringify({ level: "error", event: "auth.control-observer.dial.failed", multiaddr: address.toString(), error: error instanceof Error ? error.message : String(error) }));
      }
    }
    const blockstore = new LevelBlockstore(`${this.config.dataDir}/observer-blocks`);
    const helia = withBitswap(withLibp2p(withHTTP(createHeliaLight({ blockstore, codecs: [dagCbor, dagJson, json], hashers: [sha512] })), libp2p));
    await helia.start();
    const orbitdb = await createOrbitDB({ ipfs: helia, id: "klinok-auth-observer", directory: `${this.config.dataDir}/observer-orbitdb` });
    const controlDb = await orbitdb.open(this.config.controlObserver.databaseAddress ?? this.config.controlObserver.databaseName, { type: "events", AccessController: controlAccess });
    const controlReplicated = await waitForDatabaseJoin(controlDb);
    console.log(JSON.stringify({
      level: controlReplicated ? "info" : "warn",
      event: "auth.control-observer.database.opened",
      database: "control",
      address: controlDb.address?.toString(),
      replicated: controlReplicated,
    }));
    const medicalDb = await orbitdb.open(this.config.controlObserver.medicalDatabaseAddress ?? this.config.controlObserver.medicalDatabaseName ?? "klinok-medical-v4", { type: "events", AccessController: medicalAccess });
    const medicalReplicated = await waitForDatabaseJoin(medicalDb);
    console.log(JSON.stringify({
      level: medicalReplicated ? "info" : "warn",
      event: "auth.control-observer.database.opened",
      database: "medical",
      address: medicalDb.address?.toString(),
      replicated: medicalReplicated,
    }));
    this.runtime = { dbs: [controlDb, medicalDb], orbitdb, helia };
    this.updateHandler = () => void this.process();
    for (const db of this.runtime.dbs) db.events?.on?.("update", this.updateHandler);
    await this.process();
    this.ready = true;
    console.log(JSON.stringify({
      level: "info",
      event: "auth.control-observer.ready",
      dataGeneration: this.config.dataGeneration,
      ...this.metrics(),
    }));
  }

  ingest(value: unknown): Promise<boolean> {
    const event = valueFrom(value);
    if (!event) return Promise.resolve(false);
    let accepted = false;
    this.processing = this.processing.catch(() => undefined).then(async () => {
      if (this.state.knownEvents.has(event.eventId)) {
        await this.handleAcceptedEvent(event);
        accepted = true;
        return;
      }
      const projection = await this.projector.import([event]);
      for (const acceptedEvent of projection.accepted) await this.handleAcceptedEvent(acceptedEvent);
      if (projection.deferred.length) {
        console.log(JSON.stringify({
          level: "info",
          event: "auth.control-observer.event.deferred",
          code: projection.deferred[0]?.result.code,
          eventId: event.eventId,
          eventType: event.eventType,
        }));
        return;
      }
      if (projection.conflicts.length) {
        console.warn(JSON.stringify({
          level: "warn",
          event: "auth.control-observer.event.rejected",
          code: projection.conflicts[0]?.result.code,
          eventId: event.eventId,
          eventType: event.eventType,
        }));
        return;
      }
      accepted = projection.accepted.some((candidate) => candidate.eventId === event.eventId);
    });
    return this.processing.then(() => accepted);
  }

  private process(): Promise<void> {
    this.processing = this.processing.catch(() => undefined).then(() => this.processNow());
    return this.processing;
  }

  private async processNow(): Promise<void> {
    if (!this.runtime) return;
    const events: SignedEvent[] = [];
    for (const db of this.runtime.dbs) {
      for await (const entry of db.iterator()) {
        const event = valueFrom(entry);
        if (event) events.push(event);
      }
    }
    const projection = await this.projector.import(events);
    for (const event of projection.accepted) await this.handleAcceptedEvent(event);
    for (const conflict of projection.conflicts) {
      console.warn(JSON.stringify({
        level: "warn",
        event: "auth.control-observer.event.rejected",
        code: conflict.result.code,
        eventId: conflict.event.eventId,
        eventType: conflict.event.eventType,
      }));
    }
    console.log(JSON.stringify({
      level: "info",
      event: "auth.control-observer.projection.updated",
      accepted: projection.accepted.length,
      deferred: this.projector.listDeferred().length,
      conflicts: this.projector.listConflicts().length,
    }));
  }

  private async handleAcceptedEvent(event: SignedEvent): Promise<void> {
    if (event.eventType.startsWith("role.")) {
      await this.store.putObservedRole(
        String(event.metadata.accountId ?? event.aggregateId),
        event.metadata.role as "administrator" | "doctor" | "owner",
        event.metadata.status as RoleStatus,
      );
    }
    if (event.eventType.startsWith("pet.") && event.metadata.ownerAccountId) {
      const petId = String(event.metadata.petId ?? event.aggregateId);
      if (event.eventType === "pet.tombstoned") {
        await this.store.deleteObservedPetOwner(petId);
      } else {
        await this.store.putObservedPetOwner(petId, String(event.metadata.ownerAccountId));
      }
    }
    if (["grant.created", "grant.delegated"].includes(event.eventType) && event.metadata.grant) {
      await this.store.putObservedGrant(event.metadata.grant as never);
    }
    if (["grant.revoked", "grant.relinquished", "grant.actions.updated"].includes(event.eventType)) {
      const grant = this.state.grants.get(event.resourceId);
      if (grant) await this.store.putObservedGrant(grant);
    }
    if (["grant.requested", "grant.request.cancelled", "grant.request.rejected"].includes(event.eventType)) {
      const projection = this.state.grantRequests.get(event.resourceId);
      if (projection) await this.store.putObservedAccessRequest(projection.request);
    }
    if (event.eventType === "grant.created") {
      const requestId = String(event.metadata.requestId ?? "");
      const projection = requestId ? this.state.grantRequests.get(requestId) : undefined;
      if (projection) await this.store.putObservedAccessRequest(projection.request);
    }
    const accountId = String(event.metadata.accountId ?? event.aggregateId);
    let account = await this.store.getAccount(accountId);
    if (account) {
      if (event.eventType === "device.revoked") {
        account = await this.store.applyObservedDeviceRevocation(accountId, event.resourceId);
        if (!account) return;
      }
      const pendingOperations = account.pendingOperations.filter((operation) => operation.operationId !== event.operationId);
      const setupComplete = Boolean(account.setup &&
        account.setup.requestedRoles.every((role) => this.state.roles.has(roleProjectionKey(account!.accountId, role))) &&
        [...this.state.events.values()].some((candidate) => candidate.eventType === "profile.updated" && candidate.aggregateId === account!.accountId) &&
        [...this.state.events.values()].some((candidate) => candidate.eventType === "consent.accepted" && candidate.aggregateId === account!.accountId));
      if (event.eventType === "account.deleted") {
        await this.store.deleteCredentialAccount({ ...account, pendingOperations });
        account = null;
      } else if (pendingOperations.length !== account.pendingOperations.length || setupComplete) {
        account = await this.store.applyObservedAccountProgress(accountId, event.operationId, setupComplete);
      }
    }
    if (event.eventType !== "email.role-transition") return;
    const eventMailHandled = await this.store.hasMarker(`mail:${event.eventId}`);
    const transitionEventId = event.parents[0];
    const legacyMailHandled = Boolean(transitionEventId && await this.store.hasMarker(`mail:${transitionEventId}`));
    if (eventMailHandled) return;
    if (legacyMailHandled) {
      await this.store.putMarker(`mail:${event.eventId}`);
      return;
    }
    if (account) {
      await this.mailer.send({
        to: account.email,
        subject: "Статус роли изменён",
        text: roleStatusMailText(event.metadata.role, event.metadata.status),
      });
      console.log(JSON.stringify({
        level: "info",
        event: "auth.control-observer.role-mail.sent",
        eventId: event.eventId,
        accountId,
        role: event.metadata.role,
        status: event.metadata.status,
      }));
    } else {
      console.warn(JSON.stringify({
        level: "warn",
        event: "auth.control-observer.role-mail.recipient-missing",
        eventId: event.eventId,
        accountId,
        role: event.metadata.role,
        status: event.metadata.status,
      }));
    }
    if (event.metadata.status === "pending") {
      const requesterProfile = await this.store.getDirectoryProfile(accountId);
      for (const projection of this.state.roles.values()) {
        if (projection.request.role !== "administrator" || projection.request.status !== "approved") continue;
        const administrator = await this.store.getAccount(projection.request.accountId);
        if (administrator) {
          await this.mailer.send({
            to: administrator.email,
            subject: "Новая заявка на роль",
            text: roleRequestMailText(requesterProfile?.displayName, event.metadata.role),
          });
        }
      }
    }
    await this.store.putMarker(`mail:${event.eventId}`);
  }

  async stop(): Promise<void> {
    if (!this.runtime) return;
    if (this.updateHandler) for (const db of this.runtime.dbs) db.events?.off?.("update", this.updateHandler);
    for (const db of this.runtime.dbs) await db.close();
    await this.runtime.orbitdb.stop();
    await this.runtime.helia.stop();
    this.runtime = null;
    this.ready = !this.config.controlObserver.enabled;
  }
}
