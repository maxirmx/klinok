// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it, vi } from "vitest";
import { KlinokRepository } from "../src/repositories";
import type { ControlRepository } from "../src/repositories/controlRepository";
import type { EventTransport } from "../src/repositories/eventTransport";
import type { MedicalRepository } from "../src/repositories/medicalRepository";

describe("Klinok repository facade", () => {
  it("delegates conflict, notification, status, role, and disposal operations", async () => {
    const unsubscribe = vi.fn();
    const listener = vi.fn();
    const transport = {
      listConflicts: vi.fn().mockResolvedValue([{ eventId: "conflict-1" }]),
      listNotifications: vi.fn().mockResolvedValue([{ notificationId: "notification-1" }]),
      dismissNotification: vi.fn().mockResolvedValue(undefined),
      syncStatus: vi.fn().mockResolvedValue({ pendingCount: 1 }),
      subscribeSyncStatus: vi.fn().mockReturnValue(unsubscribe),
      dispose: vi.fn().mockResolvedValue(undefined),
    } as unknown as EventTransport;
    const control = {
      setActiveRole: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
    } as unknown as ControlRepository;
    const medical = {
      setActiveRole: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
    } as unknown as MedicalRepository;
    const RepositoryConstructor = KlinokRepository as unknown as new (
      transport: EventTransport,
      control: ControlRepository,
      medical: MedicalRepository,
    ) => KlinokRepository;
    const repository = new RepositoryConstructor(transport, control, medical);

    await expect(repository.conflicts()).resolves.toEqual([{ eventId: "conflict-1" }]);
    await expect(repository.notifications()).resolves.toEqual([{ notificationId: "notification-1" }]);
    await repository.dismissNotification("notification-1");
    await expect(repository.syncStatus()).resolves.toEqual({ pendingCount: 1 });
    expect(repository.subscribeSyncStatus(listener)).toBe(unsubscribe);
    await repository.setActiveRole("doctor", "proof-1");
    await repository.dispose();

    expect(transport.dismissNotification).toHaveBeenCalledWith("notification-1");
    expect(transport.subscribeSyncStatus).toHaveBeenCalledWith(listener);
    expect(control.setActiveRole).toHaveBeenCalledWith("doctor", "proof-1");
    expect(medical.setActiveRole).toHaveBeenCalledWith("doctor", "proof-1");
    expect(control.dispose).toHaveBeenCalled();
    expect(medical.dispose).toHaveBeenCalled();
    expect(transport.dispose).toHaveBeenCalled();
  });

  it("provides an initialized in-memory transport factory", async () => {
    const transport = KlinokRepository.memoryTransport();
    await transport.initialize();
    await expect(transport.list("control")).resolves.toEqual([]);
  });
});
