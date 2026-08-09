// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import {
  applyAcceptedEvent,
  reconcileEffectiveEvents,
  reduceSignedEvents,
  type ProjectionConflict,
  type ProjectionResult,
} from "./reducers.js";
import { createProtocolState, verifySignedEvent } from "./authorization.js";
import type { ProtocolState, SignedEvent, VerificationOptions } from "./types.js";

export class InMemorySignedEventRepository {
  state: ProtocolState;
  readonly deferred = new Map<string, ProjectionConflict>();
  private readonly events = new Map<string, SignedEvent>();
  private readonly permanentConflicts = new Map<string, ProjectionConflict>();
  private readonly newConflicts: ProjectionConflict[] = [];
  private readonly listeners = new Set<(events: SignedEvent[]) => void>();

  constructor(bootstrapAccountId?: string, private readonly verificationOptions: VerificationOptions = {}) {
    this.state = createProtocolState(bootstrapAccountId);
  }

  list(): SignedEvent[] {
    return [...this.events.values()];
  }

  listDeferred(): ProjectionConflict[] {
    return [...this.deferred.values()];
  }

  listConflicts(): ProjectionConflict[] {
    return [...this.permanentConflicts.values()];
  }

  get conflicts(): ProjectionConflict[] {
    return this.listConflicts();
  }

  takeNewConflicts(): ProjectionConflict[] {
    return this.newConflicts.splice(0);
  }

  subscribe(listener: (events: SignedEvent[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.list());
    return () => this.listeners.delete(listener);
  }

  async append(event: SignedEvent): Promise<void> {
    if (this.events.has(event.eventId)) return;
    const result = await verifySignedEvent(event, this.state, { ...this.verificationOptions, allowUnknownDevice: event.eventType === "device.attested" });
    if (!result.accepted) throw Object.assign(new Error(result.message ?? result.code), { code: result.code });
    this.events.set(event.eventId, event);
    applyAcceptedEvent(event, this.state);
    reconcileEffectiveEvents(this.list(), this.state);
    for (const listener of this.listeners) listener(this.list());
  }

  async import(events: SignedEvent[]): Promise<ProjectionResult> {
    const candidates = new Map<string, SignedEvent>();
    for (const conflict of this.deferred.values()) candidates.set(conflict.event.eventId, conflict.event);
    for (const event of events) {
      if (!this.events.has(event.eventId) && !this.permanentConflicts.has(event.eventId)) candidates.set(event.eventId, event);
    }
    const quarantined: ProjectionConflict[] = [];
    for (const [eventId, event] of candidates) {
      if (!this.verificationOptions.replayQuarantineEventIds?.has(eventId)) continue;
      const result = await verifySignedEvent(event, this.state, {
        ...this.verificationOptions,
        allowUnknownDevice: event.eventType === "device.attested",
      });
      if (result.code !== "BOOTSTRAP_ANCHOR_MISMATCH") continue;
      const conflict = { event, result };
      candidates.delete(eventId);
      this.deferred.delete(eventId);
      this.state.knownEvents.add(eventId);
      if (!this.permanentConflicts.has(eventId)) this.newConflicts.push(conflict);
      this.permanentConflicts.set(eventId, conflict);
      quarantined.push(conflict);
    }
    const projection = await reduceSignedEvents([...candidates.values()], this.state, this.verificationOptions);
    for (const eventId of candidates.keys()) this.deferred.delete(eventId);
    for (const event of projection.accepted) {
      this.events.set(event.eventId, event);
      this.permanentConflicts.delete(event.eventId);
    }
    for (const conflict of projection.deferred) this.deferred.set(conflict.event.eventId, conflict);
    for (const conflict of projection.conflicts) {
      if (!this.permanentConflicts.has(conflict.event.eventId)) this.newConflicts.push(conflict);
      this.permanentConflicts.set(conflict.event.eventId, conflict);
    }
    reconcileEffectiveEvents(this.list(), this.state);
    if (projection.accepted.length || projection.conflicts.length || quarantined.length) {
      for (const listener of this.listeners) listener(this.list());
    }
    return { ...projection, conflicts: [...quarantined, ...projection.conflicts] };
  }

  async replace(events: SignedEvent[]): Promise<ProjectionResult> {
    const replacement = new InMemorySignedEventRepository(
      this.state.bootstrapAccountId,
      this.verificationOptions,
    );
    const projection = await replacement.import(events);
    this.state = replacement.state;
    this.events.clear();
    for (const [eventId, event] of replacement.events) this.events.set(eventId, event);
    this.deferred.clear();
    for (const [eventId, conflict] of replacement.deferred) this.deferred.set(eventId, conflict);
    this.permanentConflicts.clear();
    for (const [eventId, conflict] of replacement.permanentConflicts) this.permanentConflicts.set(eventId, conflict);
    this.newConflicts.splice(0, this.newConflicts.length, ...replacement.newConflicts);
    for (const listener of this.listeners) listener(this.list());
    return projection;
  }
}
