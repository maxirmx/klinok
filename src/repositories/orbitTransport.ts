// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import {
  ACCESS_CONTROLLER_TYPES,
  describeOrbitEntryShape,
  extractSignedEvent,
  InMemorySignedEventRepository,
  KlinokIdentityProvider,
  shouldDeferEventVerification,
  verifySignedEvent,
  type DatabaseKind,
  type EventIngestResponse,
  type ProtocolState,
  type SignedEvent,
} from "@klinok/protocol";
import { closeBrowserHeliaStorage, createBrowserHeliaInit } from "./browserStorage";
import { IndexedDbEventTransport, type AuthorizationConflict } from "./eventTransport";
import type { P2PClientConfig } from "../runtimeConfig";

interface OrbitDb {
  address?: { toString(): string } | string;
  add(value: SignedEvent): Promise<unknown>;
  iterator(): AsyncIterable<unknown>;
  close(): Promise<void>;
  events?: { on?(name: string, listener: (...args: unknown[]) => void): void; off?(name: string, listener: (...args: unknown[]) => void): void };
}

export async function waitForInitialReplication(db: OrbitDb, timeoutMs = 5_000): Promise<boolean> {
  const events = db.events;
  if (!events?.on || !events.off) return false;
  const on = events.on.bind(events);
  const off = events.off.bind(events);
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    function joined() { finish(true); }
    function finish(replicated: boolean) {
      if (timer) clearTimeout(timer);
      off("join", joined);
      resolve(replicated);
    }
    on("join", joined);
    timer = setTimeout(() => finish(false), timeoutMs);
  });
}

function orbitValue(entry: unknown): SignedEvent | null {
  return extractSignedEvent(entry);
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function logP2p(level: "info" | "warn" | "error", event: string, details: Record<string, unknown> = {}) {
  const message = JSON.stringify({ level, event, ...details });
  if (level === "error") console.error(message);
  else if (level === "warn") console.warn(message);
  else console.info(message);
}

async function trustFingerprint(key: JsonWebKey | undefined): Promise<string> {
  if (!key) return "missing";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(key)));
  return [...new Uint8Array(digest)].slice(0, 8).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function parentOrdered(events: SignedEvent[]): SignedEvent[] {
  const ordered: SignedEvent[] = [];
  const remaining = new Map(events.map((event) => [event.eventId, event]));
  while (remaining.size) {
    let progressed = false;
    const priority = (event: SignedEvent) => {
      if (event.eventType === "device.attested" || event.eventType === "device.rotated") return 0;
      if (event.database === "control") return 1;
      return 2;
    };
    const candidates = [...remaining.values()].sort((left, right) =>
      priority(left) - priority(right) ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.eventId.localeCompare(right.eventId));
    for (const event of candidates) {
      const causalParents = [
        ...event.parents,
        ...((event.metadata.priorAuthorizedEventIds as string[] | undefined) ?? []),
      ];
      if (causalParents.some((parent) => remaining.has(parent))) continue;
      ordered.push(event);
      remaining.delete(event.eventId);
      progressed = true;
    }
    if (!progressed) {
      ordered.push(...candidates);
      break;
    }
  }
  return ordered;
}

export const MAX_OUTBOX_BATCH_BYTES = 900 * 1024;

export function sizeBoundEventBatch(
  events: SignedEvent[],
  maxBytes = MAX_OUTBOX_BATCH_BYTES,
  maxCount = 100,
): SignedEvent[] {
  const selected: SignedEvent[] = [];
  const ordered = parentOrdered(events).slice(0, maxCount);
  const encoder = new TextEncoder();
  for (const event of ordered) {
    const candidate = [...selected, event];
    const bytes = encoder.encode(JSON.stringify({ events: candidate })).byteLength;
    if (bytes > maxBytes) break;
    selected.push(event);
  }
  return selected;
}

export async function recoverableDeviceAttestations(
  events: SignedEvent[],
  conflicts: AuthorizationConflict[],
  state: ProtocolState,
  trust: Pick<P2PClientConfig, "authAttestationPublicKey" | "bootstrapSigningPublicKey">,
): Promise<SignedEvent[]> {
  const candidates = new Set(conflicts
    .filter((conflict) => conflict.code === "DEVICE_BINDING_INVALID")
    .map((conflict) => conflict.eventId));
  const recovered: SignedEvent[] = [];
  for (const event of events) {
    if (!candidates.has(event.eventId) || event.eventType !== "device.attested") continue;
    const result = await verifySignedEvent(event, state, {
      allowUnknownDevice: true,
      authAttestationPublicKey: trust.authAttestationPublicKey,
      bootstrapSigningPublicKey: trust.bootstrapSigningPublicKey,
      requireTrustedAttestation: true,
    });
    if (result.accepted) recovered.push(event);
  }
  return recovered;
}

function controller(
  state: ProtocolState,
  database: DatabaseKind,
  reject: (event: SignedEvent | undefined, code: string, details: Record<string, unknown>) => void,
  trust: Pick<P2PClientConfig, "authAttestationPublicKey" | "bootstrapSigningPublicKey" | "replayQuarantineEventIds">,
) {
  const type = ACCESS_CONTROLLER_TYPES[database];
  const factory = async () => ({
    type,
    address: `/${type}`,
    async canAppend(entry: { identity?: string; payload?: { value?: unknown }; value?: unknown }) {
      const baseDetails = { entryShape: describeOrbitEntryShape(entry), ...(entry.identity ? { entryIdentity: entry.identity } : {}) };
      if (!entry.identity) {
        reject(undefined, "ENTRY_IDENTITY_MISSING", baseDetails);
        return false;
      }
      const event = extractSignedEvent(entry);
      if (!event) {
        reject(undefined, "EVENT_PAYLOAD_INVALID", baseDetails);
        return false;
      }
      const details = { ...baseDetails, eventOrbitIdentity: event.orbitIdentityId };
      if (event.database !== database) {
        reject(event, "DATABASE_MISMATCH", details);
        return false;
      }
      const result = await verifySignedEvent(event, state, {
        allowUnknownDevice: event.eventType === "device.attested",
        authAttestationPublicKey: trust.authAttestationPublicKey,
        bootstrapSigningPublicKey: trust.bootstrapSigningPublicKey,
        requireTrustedAttestation: true,
      });
      if (shouldDeferEventVerification(result)) {
        logP2p("info", "p2p.authorization.deferred", {
          code: result.code,
          eventId: event.eventId,
          eventType: event.eventType,
          database: event.database,
          ...details,
        });
        return true;
      }
      if (!result.accepted) {
        if (result.code === "BOOTSTRAP_ANCHOR_MISMATCH" && trust.replayQuarantineEventIds.includes(event.eventId)) {
          logP2p("warn", "p2p.authorization.quarantined", {
            code: result.code,
            eventId: event.eventId,
            eventType: event.eventType,
            database: event.database,
            ...details,
          });
          return true;
        }
        reject(event, result.code ?? "EVENT_REJECTED", details);
        return false;
      }
      return true;
    },
  });
  return Object.assign(factory, { type });
}

export class OrbitEventTransport extends IndexedDbEventTransport {
  private runtime: {
    helia: { stop(): Promise<unknown> };
    orbitdb: { stop(): Promise<unknown> };
    dbs: Record<DatabaseKind, OrbitDb>;
    storage: Awaited<ReturnType<typeof createBrowserHeliaInit>>;
  } | null = null;
  private disposing = false;
  private readonly updateHandlers = new Map<DatabaseKind, () => void>();
  private readonly accessProjector: InMemorySignedEventRepository;
  private flushPromise: Promise<void> | null = null;
  private refreshPromise: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 1_000;
  private readonly onlineHandler = () => { void this.flushOutbox(); };

  constructor(
    private readonly config: P2PClientConfig,
    private readonly identityId: string,
    activeAccountId = "",
  ) {
    super(activeAccountId, config.dataGeneration);
    this.accessProjector = new InMemorySignedEventRepository(config.bootstrapAccountId, {
      authAttestationPublicKey: config.authAttestationPublicKey,
      bootstrapSigningPublicKey: config.bootstrapSigningPublicKey,
      requireTrustedAttestation: true,
      replayQuarantineEventIds: new Set(config.replayQuarantineEventIds),
    });
  }

  override async initialize() {
    await super.initialize();
    this.disposing = false;
    if (typeof window !== "undefined") window.addEventListener("online", this.onlineHandler);
    logP2p("info", "p2p.client.initialize.started", {
      configuredOrbitIdentity: this.identityId,
      trustedNodeMultiaddrs: this.config.trustedNodeMultiaddrs,
      dataGeneration: this.config.dataGeneration,
      authAttestationFingerprint: await trustFingerprint(this.config.authAttestationPublicKey),
      bootstrapSigningFingerprint: await trustFingerprint(this.config.bootstrapSigningPublicKey),
    });
    const [
      { createLibp2p }, { createHeliaLight }, { withBitswap }, { withHTTP }, { withLibp2p }, dagCbor, dagJson, json,
      { sha512 }, { createOrbitDB, useAccessController, useIdentityProvider }, { webSockets }, { bootstrap }, { identify }, { gossipsub }, { noise }, { yamux }, { multiaddr },
    ] = await Promise.all([
      import("libp2p"), import("helia"), import("@helia/bitswap"), import("@helia/http"), import("@helia/libp2p"),
      import("@ipld/dag-cbor"), import("@ipld/dag-json"), import("multiformats/codecs/json"), import("multiformats/hashes/sha2"),
      import("@orbitdb/core"), import("@libp2p/websockets"), import("@libp2p/bootstrap"), import("@libp2p/identify"),
      import("@libp2p/gossipsub"), import("@chainsafe/libp2p-noise"), import("@chainsafe/libp2p-yamux"), import("@multiformats/multiaddr"),
    ]);
    const rejected = (event: SignedEvent | undefined, code: string, details: Record<string, unknown>) => {
      logP2p("warn", "p2p.authorization.rejected", {
        code,
        eventId: event?.eventId,
        eventType: event?.eventType,
        database: event?.database,
        ...details,
      });
    };
    const controlAccess = controller(this.accessProjector.state, "control", rejected, this.config);
    const medicalAccess = controller(this.accessProjector.state, "medical", rejected, this.config);
    useIdentityProvider(KlinokIdentityProvider);
    useAccessController(controlAccess);
    useAccessController(medicalAccess);
    const bootstrapAddresses = this.config.trustedNodeMultiaddrs.filter((address) => address.includes("/p2p/"));
    const configuredAddresses = this.config.trustedNodeMultiaddrs.map((address) => multiaddr(address));
    const isTrustedAddress = (candidate: string) => this.config.trustedNodeMultiaddrs.some((configured) =>
      configured === candidate || configured.startsWith(`${candidate}/p2p/`) || candidate.startsWith(`${configured}/p2p/`));
    const libp2p = await createLibp2p({
      addresses: { listen: [] }, transports: [webSockets()], connectionEncrypters: [noise()], streamMuxers: [yamux()],
      connectionGater: { denyDialMultiaddr: (address) => !isTrustedAddress(address.toString()) },
      peerDiscovery: bootstrapAddresses.length ? [bootstrap({ list: bootstrapAddresses, tagTTL: Infinity })] : [],
      services: { identify: identify(), pubsub: gossipsub({ allowPublishToZeroTopicPeers: true }) },
    });
    libp2p.addEventListener("peer:connect", (connectionEvent) => {
      logP2p("info", "p2p.peer.connected", { peerId: String(connectionEvent.detail) });
      void this.flushOutbox();
    });
    libp2p.addEventListener("peer:disconnect", (connectionEvent) => {
      logP2p(this.disposing ? "info" : "warn", "p2p.peer.disconnected", {
        peerId: String(connectionEvent.detail),
        ...(this.disposing ? { reason: "client_dispose" } : {}),
      });
    });
    for (const address of configuredAddresses) {
      const multiaddrText = address.toString();
      logP2p("info", "p2p.dial.started", { multiaddr: multiaddrText });
      try {
        const connection = await libp2p.dial(address);
        logP2p("info", "p2p.dial.succeeded", { multiaddr: multiaddrText, peerId: connection.remotePeer.toString() });
      } catch (error) {
        logP2p("error", "p2p.dial.failed", { multiaddr: multiaddrText, error: errorMessage(error) });
      }
    }
    const storage = await createBrowserHeliaInit(`klinok-${this.config.dataGeneration}-${this.identityId}`);
    const helia = withBitswap(withLibp2p(withHTTP(createHeliaLight({ ...storage, codecs: [dagCbor, dagJson, json], hashers: [sha512] })), libp2p));
    await helia.start();
    const orbitdb = await createOrbitDB({
      ipfs: helia,
      identity: { id: this.identityId, provider: KlinokIdentityProvider },
      directory: `klinok-orbit-${this.config.dataGeneration}-${this.identityId}`,
    });
    logP2p("info", "p2p.client.started", {
      configuredOrbitIdentity: this.identityId,
      actualOrbitIdentity: orbitdb.identity.id,
      peerId: libp2p.peerId.toString(),
    });
    const control = await orbitdb.open(this.config.controlDatabaseAddress ?? this.config.controlDatabaseName, { type: "events", AccessController: controlAccess }) as OrbitDb;
    logP2p("info", "p2p.database.opened", { database: "control", address: control.address?.toString() });
    const controlReplicated = await waitForInitialReplication(control);
    logP2p(controlReplicated ? "info" : "warn", "p2p.database.initial-replication", { database: "control", replicated: controlReplicated });
    const medical = await orbitdb.open(this.config.medicalDatabaseAddress ?? this.config.medicalDatabaseName, { type: "events", AccessController: medicalAccess }) as OrbitDb;
    logP2p("info", "p2p.database.opened", { database: "medical", address: medical.address?.toString() });
    const medicalReplicated = await waitForInitialReplication(medical);
    logP2p(medicalReplicated ? "info" : "warn", "p2p.database.initial-replication", { database: "medical", replicated: medicalReplicated });
    const controlEvents = await this.remoteList(control);
    const medicalEvents = await this.remoteList(medical);
    const projection = await this.accessProjector.import([...controlEvents, ...medicalEvents]);
    await this.cacheEvents([...controlEvents, ...medicalEvents], false);
    logP2p("info", "p2p.client.projection.ready", {
      accepted: projection.accepted.length,
      deferred: this.accessProjector.listDeferred().length,
      conflicts: this.accessProjector.listConflicts().length,
      dataGeneration: this.config.dataGeneration,
    });
    const runtime = { helia, orbitdb, dbs: { control, medical }, storage };
    this.runtime = runtime;
    for (const database of ["control", "medical"] as const) {
      const handler = (...args: unknown[]) => {
        logP2p("info", "p2p.sync.update", { database, entryShape: describeOrbitEntryShape(args[0]) });
        void this.flushOutbox();
        void this.refreshRemoteState();
      };
      this.updateHandlers.set(database, handler);
      runtime.dbs[database].events?.on?.("update", handler);
    }
    await this.flushOutbox();
  }

  private async remoteList(db: OrbitDb): Promise<SignedEvent[]> {
    const result: SignedEvent[] = [];
    for await (const entry of db.iterator()) {
      const value = orbitValue(entry);
      if (value) result.push(value);
    }
    return result;
  }

  override async list(database: DatabaseKind): Promise<SignedEvent[]> {
    const local = await super.list(database);
    const remote = this.runtime ? await this.remoteList(this.runtime.dbs[database]) : [];
    const merged = new Map([...local, ...remote].map((event) => [event.eventId, event]));
    await this.cacheEvents(remote, false);
    return [...merged.values()];
  }

  private refreshRemoteState(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.refreshRemoteStateNow().finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  private async refreshRemoteStateNow(): Promise<void> {
    if (!this.runtime || this.disposing) return;
    const [control, medical] = await Promise.all([
      this.remoteList(this.runtime.dbs.control),
      this.remoteList(this.runtime.dbs.medical),
    ]);
    const projection = await this.accessProjector.import([...control, ...medical]);
    await this.cacheEvents([...control, ...medical]);
    logP2p("info", "p2p.client.projection.updated", {
      accepted: projection.accepted.length,
      deferred: this.accessProjector.listDeferred().length,
      conflicts: this.accessProjector.listConflicts().length,
    });
  }

  override async append(event: SignedEvent): Promise<void> {
    await super.append(event);
    await this.queueOutbox(event);
    logP2p("info", "p2p.append.queued", { eventId: event.eventId, eventType: event.eventType, database: event.database });
    void this.flushOutbox();
  }

  private flushOutbox(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.flushOutboxNow().finally(() => { this.flushPromise = null; });
    return this.flushPromise;
  }

  private async flushOutboxNow(): Promise<void> {
    if (this.disposing) return;
    const ordered = parentOrdered(await this.pendingOutbox());
    const pending = sizeBoundEventBatch(ordered);
    if (!pending.length) {
      const oversized = ordered[0];
      if (oversized) {
        const message = "Событие превышает допустимый размер синхронизации.";
        await this.recordPermanentRejection(oversized, "EVENT_TOO_LARGE");
        await this.setSyncState({ syncing: false, lastError: message });
        if ((await this.pendingOutbox()).length) this.scheduleRetry();
        return;
      }
      await this.setSyncState({ syncing: false, lastError: "" });
      return;
    }
    await this.setSyncState({ syncing: true });
    logP2p("info", "p2p.outbox.flush.started", { count: pending.length });
    try {
      const response = await fetch("/api/events", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: pending }),
      });
      if (!response.ok) throw new Error(`Trusted node returned HTTP ${response.status}.`);
      const body = await response.json() as EventIngestResponse;
      if (!body || !Array.isArray(body.results)) throw new Error("Trusted node returned an invalid acknowledgement.");
      let transientError = "";
      let acknowledged = 0;
      const quarantinedEventIds = new Set<string>();
      for (const result of body.results) {
        const event = pending.find((candidate) => candidate.eventId === result.eventId);
        if (!event || quarantinedEventIds.has(event.eventId)) continue;
        if (result.status === "persisted" || result.status === "duplicate") {
          await this.removeOutbox(result.eventId);
          await this.removeRetry(result.eventId);
          await this.removeConflict(result.eventId);
          acknowledged += 1;
          logP2p("info", "p2p.outbox.flush.succeeded", { eventId: event.eventId, eventType: event.eventType, database: event.database, status: result.status });
        } else if (result.status === "rejected") {
          const notification = await this.recordPermanentRejection(event, result.code ?? "EVENT_REJECTED");
          for (const eventId of notification?.affectedEventIds ?? []) quarantinedEventIds.add(eventId);
          acknowledged += 1;
          logP2p("warn", "p2p.outbox.flush.rejected", { eventId: event.eventId, eventType: event.eventType, database: event.database, code: result.code });
        } else {
          const nextRetryAt = new Date(Date.now() + this.retryDelay).toISOString();
          await this.recordRetry(event, "deferred", result.code ?? "AUTHORIZATION_DEPENDENCY_MISSING", nextRetryAt);
          if (result.code !== "EVENT_PARENT_MISSING" && result.code !== "DEVICE_UNKNOWN") {
            transientError = result.message ?? "The trusted node deferred an event.";
          }
        }
      }
      this.retryDelay = acknowledged ? 1_000 : Math.min(this.retryDelay * 2, 30_000);
      await this.setSyncState({ syncing: false, lastError: transientError, connectionState: "connected" });
    } catch (error) {
      const message = errorMessage(error);
      const connectionState = typeof navigator !== "undefined" && !navigator.onLine ? "disconnected" : "error";
      for (const event of pending) await this.recordRetry(event, "transient", "TRANSPORT_UNAVAILABLE");
      await this.setSyncState({ syncing: false, lastError: message, connectionState });
      logP2p("warn", "p2p.outbox.flush.failed", { count: pending.length, error: message });
      this.retryDelay = Math.min(this.retryDelay * 2, 30_000);
    }
    if ((await this.pendingOutbox()).length) this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.retryTimer || this.disposing) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flushOutbox();
    }, Math.round(this.retryDelay * (0.8 + Math.random() * 0.4)));
  }

  override async dispose() {
    this.disposing = true;
    if (typeof window !== "undefined") window.removeEventListener("online", this.onlineHandler);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    logP2p("info", "p2p.client.dispose.started", { configuredOrbitIdentity: this.identityId });
    if (this.runtime) {
      for (const database of ["control", "medical"] as const) {
        const handler = this.updateHandlers.get(database);
        if (handler) this.runtime.dbs[database].events?.off?.("update", handler);
      }
      this.updateHandlers.clear();
      if (this.flushPromise) await this.flushPromise;
      if (this.refreshPromise) await this.refreshPromise;
      for (const database of ["control", "medical"] as const) {
        await this.runtime.dbs[database].close();
      }
      await this.runtime.orbitdb.stop();
      await this.runtime.helia.stop();
      await closeBrowserHeliaStorage(this.runtime.storage);
      this.runtime = null;
    }
    await super.dispose();
    logP2p("info", "p2p.client.disposed", { configuredOrbitIdentity: this.identityId });
  }
}
