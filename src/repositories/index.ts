// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import {
  InMemorySignedEventRepository,
  type ActiveRoleContext,
  type AuthSessionDto,
  type Role,
  type UserKeySet,
} from "@klinok/protocol";
import type { AppRuntimeConfig } from "../runtimeConfig";
import { logInitializationError } from "../diagnostics";
import { ControlRepository } from "./controlRepository";
import {
  IndexedDbEventTransport,
  MemoryEventTransport,
  type EventSyncStatus,
  type EventTransport,
  type SyncNotification,
} from "./eventTransport";
import { MedicalRepository } from "./medicalRepository";
import { OrbitEventTransport } from "./orbitTransport";

export class KlinokRepository {
  readonly control: ControlRepository;
  readonly medical: MedicalRepository;

  private constructor(
    private readonly transport: EventTransport,
    control: ControlRepository,
    medical: MedicalRepository,
  ) {
    this.control = control;
    this.medical = medical;
  }

  static async create(options: {
    config: AppRuntimeConfig;
    session: Required<Pick<AuthSessionDto, "accountId" | "device">> & AuthSessionDto;
    keys: UserKeySet;
    initialRole: Role;
    transport?: EventTransport;
  }): Promise<KlinokRepository> {
    let stage = "context.create";
    try {
      const context: ActiveRoleContext = {
        accountId: options.session.accountId,
        deviceId: options.session.device.deviceId,
        orbitIdentityId: options.session.device.orbitIdentityId,
        role: options.initialRole,
        roleProofId: `setup:${options.initialRole}`,
        userKeyVersion: options.keys.version,
      };
      stage = "verifier.create";
      const signed = new InMemorySignedEventRepository(options.config.p2p.bootstrapAccountId, {
        authAttestationPublicKey: options.config.p2p.authAttestationPublicKey,
        bootstrapSigningPublicKey: options.config.p2p.bootstrapSigningPublicKey,
        requireTrustedAttestation: options.config.p2p.enabled,
        replayQuarantineEventIds: new Set(options.config.p2p.replayQuarantineEventIds),
      });
      stage = "transport.create";
      const transport = options.transport ?? (options.config.p2p.enabled
        ? new OrbitEventTransport(options.config.p2p, context.orbitIdentityId, context.accountId)
        : new IndexedDbEventTransport(context.accountId, options.config.p2p.dataGeneration));
      stage = "transport.initialize";
      await transport.initialize();
      stage = "control.create";
      const control = new ControlRepository(transport, context, options.keys, options.session.device, options.config.p2p.bootstrapAccountId, signed);
      stage = "medical.create";
      const medical = new MedicalRepository(transport, context, options.keys, options.session.device, control);
      const enrollment = options.session.enrollments?.find((candidate) => candidate.deviceId === options.session.device.deviceId);
      stage = "control.initialize";
      await control.initialize(options.session.setup, enrollment?.operationId);
      stage = "medical.initialize";
      await medical.initialize();
      return new KlinokRepository(transport, control, medical);
    } catch (reason) {
      logInitializationError("repository.create.failed", stage, reason);
      throw reason;
    }
  }

  static memoryTransport() { return new MemoryEventTransport(); }

  async setActiveRole(role: Role, roleProofId: string): Promise<void> {
    this.control.setActiveRole(role, roleProofId);
    await this.medical.setActiveRole(role, roleProofId);
  }

  async conflicts() {
    return this.transport.listConflicts();
  }

  notifications(): Promise<SyncNotification[]> { return this.transport.listNotifications(); }

  dismissNotification(notificationId: string): Promise<void> {
    return this.transport.dismissNotification(notificationId);
  }

  syncStatus(): Promise<EventSyncStatus> { return this.transport.syncStatus(); }

  subscribeSyncStatus(listener: (status: EventSyncStatus) => void): () => void {
    return this.transport.subscribeSyncStatus(listener);
  }

  async dispose() {
    await this.control.dispose();
    await this.medical.dispose();
    await this.transport.dispose();
  }
}
