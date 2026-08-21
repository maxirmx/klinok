// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type {
  AppSnapshotDto,
  AuthSessionDto,
  ClientCommand,
  MedicalEncounterInput,
  PetProfile,
  PetProfileInput,
} from "@klinok/contracts";

const offlineState = vi.hoisted(() => ({
  commands: [] as Array<{ accountId: string; role: string; command: ClientCommand }>,
  notifications: [] as Array<Record<string, unknown>>,
  snapshots: new Map<string, AppSnapshotDto>(),
  clearCalls: [] as string[],
}));

vi.mock("../src/repositories/offlineStore", () => ({
  clearOfflineAccount: vi.fn(async (accountId: string) => {
    offlineState.clearCalls.push(accountId);
    offlineState.commands = offlineState.commands.filter((item) => item.accountId !== accountId);
    offlineState.notifications = offlineState.notifications.filter((item) => item.accountId !== accountId);
    for (const key of offlineState.snapshots.keys()) if (key.startsWith(`${accountId}:`)) offlineState.snapshots.delete(key);
  }),
  dismissNotification: vi.fn(async (accountId: string, notificationId: string) => {
    const notification = offlineState.notifications.find((item) => item.accountId === accountId && item.notificationId === notificationId);
    if (notification) notification.dismissedAt = "2026-08-10T01:00:00.000Z";
  }),
  enqueueCommand: vi.fn(async (accountId: string, role: string, command: ClientCommand) => {
    offlineState.commands.push({ accountId, role, command: structuredClone(command) });
  }),
  getCachedSnapshot: vi.fn(async (accountId: string, role: string) => offlineState.snapshots.get(`${accountId}:${role}`) ?? null),
  listCommands: vi.fn(async (accountId: string) => offlineState.commands.filter((item) => item.accountId === accountId).map((item) => structuredClone(item.command))),
  listNotifications: vi.fn(async (accountId: string) => offlineState.notifications.filter((item) => item.accountId === accountId).map((item) => ({ ...item }))),
  putCachedSnapshot: vi.fn(async (accountId: string, role: string, snapshot: AppSnapshotDto) => {
    offlineState.snapshots.set(`${accountId}:${role}`, structuredClone(snapshot));
  }),
  recordNotification: vi.fn(async (notification: Record<string, unknown>) => {
    offlineState.notifications = offlineState.notifications.filter((item) => item.notificationId !== notification.notificationId);
    offlineState.notifications.push({ ...notification });
  }),
  removeCommand: vi.fn(async (operationId: string) => {
    offlineState.commands = offlineState.commands.filter((item) => item.command.operationId !== operationId);
  }),
}));

import { AuthClientError, type AuthClient } from "../src/repositories/authClient";
import { KlinokRepository } from "../src/repositories";

const timestamp = "2026-08-10T00:00:00.000Z";

function petInput(name = "Барс"): PetProfileInput {
  return {
    name,
    species: "Кошка",
    breed: "Домашняя",
    sex: "Кастрированный самец",
    birthDate: "2020-01-02",
    color: "Чёрный",
    chip: "chip-1",
    brandMark: "mark-1",
    latestVaccination: { date: "2026-01-10", name: "Бешенство" },
    weightKg: 5,
    notes: "Здоров",
  };
}

function snapshot(role: AppSnapshotDto["role"] = "owner"): AppSnapshotDto {
  const pet: PetProfile = {
    ...petInput(), petId: "pet-1", ownerAccountId: "account-1", revision: 2, tombstoned: false, updatedAt: timestamp,
  };
  return {
    revision: 4,
    role,
    control: {
      profile: { accountId: "account-1", revision: 3, firstName: "Анна", patronymic: "Ивановна", lastName: "Петрова", updatedAt: timestamp },
      profiles: [
        { accountId: "account-1", revision: 3, firstName: "Анна", patronymic: "Ивановна", lastName: "Петрова", updatedAt: timestamp },
        { accountId: "doctor-1", revision: 2, firstName: "Иван", lastName: "Врач", updatedAt: timestamp },
      ],
      roles: [
        { requestId: "owner-role", accountId: "account-1", role: "owner", status: "approved", revision: 2, profileRevision: 3, requestedAt: timestamp },
        { requestId: "doctor-role", accountId: "account-1", role: "doctor", status: "approved", revision: 1, profileRevision: 3, requestedAt: timestamp },
      ],
      allRoles: [], pendingQueue: [], notifications: [], roleAudit: [],
      ledger: { valid: true, height: 4, headHash: "a".repeat(64), verifiedAt: timestamp },
    },
    medical: {
      pets: [pet],
      grants: [{
        grantId: "grant-1", petId: "pet-1", grantorAccountId: "account-1", granteeAccountId: "doctor-1",
        granteeDisplayName: "Иван Врач", actions: ["read", "write_unconfirmed"], revision: 3, status: "active", createdAt: timestamp,
      }],
      accessRequests: [{
        requestId: "request-1", petId: "pet-1", ownerAccountId: "account-1", requesterAccountId: "doctor-1",
        requesterDisplayName: "Иван Врач", status: "pending", revision: 2, requestedAt: timestamp,
      }],
      records: [{
        recordId: "record-1", petId: "pet-1", revision: 2, authorAccountId: "doctor-1", authorDisplayName: "Иван Врач",
        encounterDate: "2026-08-09", title: "Осмотр", text: "Жалоба", sections: {}, createdAt: timestamp, updatedAt: timestamp,
      }],
      confirmations: [], confirmedRecordIds: [],
    },
  };
}

function client(overrides: Partial<Record<"state" | "execute" | "session", Mock>> = {}): AuthClient {
  return {
    state: overrides.state ?? vi.fn(async (role: AppSnapshotDto["role"]) => snapshot(role)),
    execute: overrides.execute ?? vi.fn(async (commands: ClientCommand[]) => ({
      results: commands.map((command) => ({ operationId: command.operationId, status: "applied" as const })),
    })),
    session: overrides.session ?? vi.fn(async () => ({ authenticated: true, accountId: "account-1" } satisfies AuthSessionDto)),
  } as unknown as AuthClient;
}

const RepositoryConstructor = KlinokRepository as unknown as new (
  accountId: string,
  client: AuthClient,
  initialRole: AppSnapshotDto["role"],
  offlineLeaseDays: number,
  snapshot: AppSnapshotDto,
  onSessionInvalid?: () => void | Promise<void>,
) => KlinokRepository;

function bareRepository(api = client(), initial = snapshot(), onSessionInvalid?: () => void | Promise<void>): KlinokRepository {
  return new RepositoryConstructor("account-1", api, initial.role, 7, structuredClone(initial), onSessionInvalid);
}

function command(type: ClientCommand["type"], operationId: string, entityId = "pet-1", payload: Record<string, unknown> = {}): ClientCommand {
  return { operationId, type, activeRole: "owner", entityId, createdAt: timestamp, payload };
}

beforeEach(() => {
  offlineState.commands = [];
  offlineState.notifications = [];
  offlineState.snapshots.clear();
  offlineState.clearCalls = [];
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Klinok repository facade", () => {
  it("adapts control operations, revisions, subscriptions, and role decisions", async () => {
    const api = client();
    const repository = bareRepository(api);
    const listener = vi.fn();
    const unsubscribe = repository.control.subscribe(listener);

    await expect(repository.control.snapshot()).resolves.toMatchObject({ profile: { accountId: "account-1" } });
    await expect(repository.control.profile()).resolves.toMatchObject({ revision: 3 });
    await expect(repository.control.profile("doctor-1")).resolves.toMatchObject({ revision: 2 });
    await expect(repository.control.profile("missing")).resolves.toBeNull();
    await expect(repository.control.nextProfileRevision()).resolves.toBe(4);
    await expect(repository.control.nextProfileRevision("missing")).resolves.toBe(1);

    await repository.control.requestRole("owner", 99);
    await repository.control.cancelRole("administrator");
    await repository.control.cancelRole("owner");
    await repository.control.decideRole({
      accountId: "doctor-1", requestId: "request-role", revision: 4, role: "doctor", status: "rejected", reason: "Недостаточно данных",
    });
    await repository.control.refresh();
    repository.control.emit(snapshot().control);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    const callsBeforeUnsubscribedEmit = listener.mock.calls.length;
    repository.control.emit(snapshot().control);
    expect(listener).toHaveBeenCalledTimes(callsBeforeUnsubscribedEmit);

    const submitted = (api.execute as Mock).mock.calls.map(([commands]) => commands[0]);
    expect(submitted).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "role.request", expectedRevision: 2, payload: { role: "owner" } }),
      expect.objectContaining({ type: "role.cancel", expectedRevision: 2, payload: { role: "owner" } }),
      expect.objectContaining({
        type: "role.decide", entityId: "request-role", expectedRevision: 4,
        payload: { accountId: "doctor-1", role: "doctor", status: "rejected", reason: "Недостаточно данных" },
      }),
    ]));
    await repository.dispose();
  });

  it("adapts every medical mutation and validates authoritative targets", async () => {
    const repository = bareRepository();
    const executeOnline = vi.spyOn(repository, "executeOnline") as Mock;
    const executeOffline = vi.spyOn(repository, "executeOffline") as Mock;
    executeOnline.mockResolvedValue(undefined);
    executeOffline.mockResolvedValue(undefined);
    const ids = ["pet-new", "request-local-1", "request-new", "grant-new", "grant-direct", "grant-child", "record-new"];
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => ids.shift() ?? "generated-id");
    const listener = vi.fn();
    const unsubscribe = repository.medical.subscribe(listener);

    await expect(repository.medical.snapshot()).resolves.toMatchObject({ pets: [expect.objectContaining({ petId: "pet-1" })] });
    repository.medical.emit(snapshot().medical);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    await expect(repository.medical.createPet(petInput("  Мурка  "))).resolves.toBe("pet-new");
    await repository.medical.updatePet(repository.current.medical.pets[0]!);
    await expect(repository.medical.deletePet("missing")).rejects.toThrow("Питомец не найден");
    await repository.medical.deletePet("pet-1");

    executeOnline.mockResolvedValueOnce({ requestId: "request-server" });
    await expect(repository.medical.requestAccess("pet-1", "account-1")).resolves.toBe("request-server");
    await expect(repository.medical.requestAccess("pet-1")).resolves.toBe("request-new");
    await repository.medical.cancelAccessRequest("request-1");
    await repository.medical.cancelAccessRequest("missing-request");
    await repository.medical.rejectAccessRequest("request-1");
    await expect(repository.medical.approveAccessRequest("missing-request")).rejects.toThrow("Запрос не найден");
    await expect(repository.medical.approveAccessRequest("request-1")).resolves.toBe("grant-new");
    await expect(repository.medical.grantDoctor("pet-1", "doctor-2", ["read"])).resolves.toBe("grant-direct");
    await expect(repository.medical.delegateGrant("missing-grant", "doctor-2", ["read"]))
      .rejects.toThrow("Исходный доступ не найден");
    await expect(repository.medical.delegateGrant("grant-1", "doctor-2", ["read"], { granteeDisplayName: "Другой врач" }))
      .resolves.toBe("grant-child");

    await expect(repository.medical.revokeGrant("missing-grant")).rejects.toThrow("Доступ не найден");
    await repository.medical.revokeGrant("grant-1");
    await repository.medical.relinquishAccess("grant-1");
    await expect(repository.medical.disableGrantDelegation("missing-grant")).rejects.toThrow("Доступ не найден");
    await repository.medical.disableGrantDelegation("grant-1");
    repository.current.medical.grants[0]!.actions.push("delegate");
    await repository.medical.enableGrantDelegation("grant-1");

    await expect(repository.medical.saveRecord({
      petId: "pet-1", title: "Запись", text: "Комментарий", outcome: { selectedIds: [], comment: "Хорошо" },
    })).resolves.toBe("record-new");
    await expect(repository.medical.saveEncounter({
      recordId: "record-1", petId: "pet-1", encounterDate: "2026-08-10",
      sections: { "what-happened": { selectedIds: [], comment: "Повторно" }, outcome: { selectedIds: [], comment: "" } },
    }, "Повторный осмотр")).resolves.toBe("record-1");
    await expect(repository.medical.deleteRecord("pet-1", "missing-record")).rejects.toThrow("Медицинская запись не найдена");
    await repository.medical.deleteRecord("pet-1", "record-1");
    await repository.medical.confirmRecord("pet-1", "record-1", 2);

    expect(executeOffline).toHaveBeenCalledWith(expect.objectContaining({ type: "pet.create", entityId: "pet-new" }));
    expect(executeOffline).toHaveBeenCalledWith(expect.objectContaining({ type: "pet.update", expectedRevision: 2 }));
    expect(executeOffline).toHaveBeenCalledWith(expect.objectContaining({ type: "record.create", entityId: "record-new" }));
    expect(executeOffline).toHaveBeenCalledWith(expect.objectContaining({ type: "record.update", entityId: "record-1", expectedRevision: 2 }));
    expect(executeOnline).toHaveBeenCalledWith(expect.objectContaining({ type: "access.delegate", expectedRevision: 3 }));
    expect(executeOnline).toHaveBeenCalledWith(expect.objectContaining({ type: "access.actions.update", payload: { actions: ["read", "write_unconfirmed"] } }));
    expect(executeOnline).toHaveBeenCalledWith(expect.objectContaining({ type: "record.confirm", expectedRevision: 2 }));
    await repository.dispose();
  });

  it("queues dependent offline mutations and applies optimistic pets and medical sections", async () => {
    vi.useFakeTimers();
    const networkError = new AuthClientError("NETWORK_UNAVAILABLE", "offline", 0);
    const api = client({ execute: vi.fn().mockRejectedValue(networkError) });
    const repository = bareRepository(api, snapshot());
    const medicalListener = vi.fn();
    const syncListener = vi.fn();
    repository.medical.subscribe(medicalListener);
    repository.subscribeSyncStatus(syncListener);

    await repository.executeOffline({ type: "pet.create", entityId: "pet-offline", payload: petInput("  Рыжик  ") as unknown as Record<string, unknown> });
    await repository.executeOffline({ type: "pet.update", entityId: "pet-offline", expectedRevision: 1, payload: { input: petInput("Рыжик II") } });
    const encounter = {
      recordId: "record-offline", petId: "pet-1", encounterDate: "2026-08-10",
      sections: {
        "what-happened": { selectedIds: ["cough"], comment: "Кашель" },
        outcome: { selectedIds: ["stable"], comment: "Стабильно" },
        "general-data": { temperatureC: 38.5, weightKg: 5 },
        vaccination: { vaccineName: "Комплекс", batchNumber: "B1" },
        "therapeutic-appointment": { medications: [], procedures: [] },
        diagnosis: {
          preliminary: { customText: "Предварительный диагноз" },
          differential: { selectedIds: [], customTexts: [] },
          confirmed: { selectedId: "diagnosis.digestive.001", customText: "" },
        },
        "instrumental-tests": {
          studies: [{
            id: "123e4567-e89b-12d3-a456-426614174000",
            date: "2026-08-10",
            typeId: "instrumental.study.xray-thorax-abdomen",
            typeName: "Рентген грудной и брюшной полости",
            mode: "narrative",
            result: "Без патологии",
          }],
        },
      },
    } as unknown as MedicalEncounterInput;
    await repository.executeOffline({ type: "record.create", entityId: "record-offline", payload: { input: encounter, title: "Приём" } });
    await repository.executeOffline({ type: "record.update", entityId: "record-offline", expectedRevision: 1, payload: {
      input: { ...encounter, sections: { ...encounter.sections, "general-data": { text: "Свободный текст" }, vaccination: { text: "Нет" }, "therapeutic-appointment": { text: "Покой" }, "laboratory-tests": { text: "Старый лабораторный текст" } } },
    } });

    const queued = offlineState.commands.map((item) => item.command);
    expect(queued[1]!.dependsOn).toEqual([queued[0]!.operationId]);
    expect(queued[3]!.dependsOn).toEqual([queued[2]!.operationId]);
    expect(repository.current.medical.pets.find((pet) => pet.petId === "pet-offline")).toMatchObject({ name: "Рыжик II", revision: 2 });
    expect(repository.current.medical.records.find((record) => record.recordId === "record-offline")).toMatchObject({
      revision: 2,
      authorDisplayName: "Анна Ивановна Петрова",
      sections: {
        "what-happened": { templateVersion: "what-happened-v1" },
        outcome: { templateVersion: "outcome-v1" },
        "general-data": { templateVersion: "free-text-v0" },
        vaccination: { templateVersion: "free-text-v0" },
        "therapeutic-appointment": { templateVersion: "free-text-v0" },
        diagnosis: { templateVersion: "diagnosis-v2" },
        "instrumental-tests": { templateVersion: "instrumental-tests-v1" },
      },
    });
    expect(repository.current.medical.records.find((record) => record.recordId === "record-offline")
      ?.sections["laboratory-tests"]).toBeUndefined();
    await expect(repository.syncStatus()).resolves.toMatchObject({ pendingCount: 4, connectionState: "disconnected" });
    expect(medicalListener).toHaveBeenCalled();
    expect(syncListener).toHaveBeenCalled();
    await repository.dispose();
  });

  it("flushes applied work, records permanent rejections, and reports focused conflicts", async () => {
    const applied = command("pet.create", "op-applied", "pet-new");
    const duplicate = command("pet.update", "op-duplicate");
    const rejected = command("record.update", "op-rejected", "record-1", { input: { petId: "pet-1" } });
    const conflict = command("role.request", "op-conflict", "account-1", { role: "doctor" });
    offlineState.commands = [applied, duplicate, rejected, conflict].map((item) => ({ accountId: "account-1", role: "owner", command: item }));
    const api = client({ execute: vi.fn(async () => ({ results: [
      { operationId: "unknown", status: "applied" },
      { operationId: "op-applied", status: "applied" },
      { operationId: "op-duplicate", status: "duplicate" },
      { operationId: "op-rejected", status: "rejected", error: { code: "PET_GRANT_REQUIRED", message: "Нет доступа" } },
      { operationId: "op-conflict", status: "conflict", error: { code: "REVISION_CONFLICT", message: "Изменено" } },
    ] })) });
    const repository = bareRepository(api);

    await expect(repository.flush("op-conflict")).rejects.toMatchObject<AuthClientError>({ code: "REVISION_CONFLICT", status: 409 });
    expect(offlineState.commands).toEqual([]);
    expect(offlineState.notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operationId: "op-rejected", reasonKey: "permission", action: "permissions", relatedRoute: "/doctor/pets/pet-1",
      }),
      expect.objectContaining({
        operationId: "op-conflict", reasonKey: "invalid", action: "return", relatedRoute: "/profile#roles",
      }),
    ]));
    await expect(repository.syncStatus()).resolves.toMatchObject({ pendingCount: 0, permanentNotificationCount: 2, failedCount: 2 });
    await repository.dismissNotification(String(offlineState.notifications[0]!.notificationId));
    await expect(repository.notifications()).resolves.toHaveLength(2);
    await repository.dispose();
  });

  it("flushes more than fifty queued commands in ordered API-sized batches", async () => {
    const queued = Array.from({ length: 51 }, (_, index) => command("pet.update", `op-${index}`, `pet-${index}`));
    offlineState.commands = queued.map((item) => ({ accountId: "account-1", role: "owner", command: item }));
    const execute = vi.fn(async (batch: ClientCommand[]) => ({
      results: batch.map((item) => ({ operationId: item.operationId, status: "applied" as const })),
    }));
    const repository = bareRepository(client({ execute }));

    await repository.flush();

    expect(execute.mock.calls.map(([batch]) => batch.map((item: ClientCommand) => item.operationId))).toEqual([
      queued.slice(0, 50).map((item) => item.operationId),
      [queued[50]!.operationId],
    ]);
    expect(offlineState.commands).toEqual([]);
    await repository.dispose();
  });

  it("keeps only the unprocessed tail when a later outbox batch fails", async () => {
    vi.useFakeTimers();
    const queued = Array.from({ length: 51 }, (_, index) => command("pet.update", `op-${index}`, `pet-${index}`));
    offlineState.commands = queued.map((item) => ({ accountId: "account-1", role: "owner", command: item }));
    const execute = vi.fn()
      .mockResolvedValueOnce({ results: queued.slice(0, 50).map((item) => ({ operationId: item.operationId, status: "applied" as const })) })
      .mockRejectedValueOnce(new AuthClientError("NETWORK_UNAVAILABLE", "offline", 0));
    const repository = bareRepository(client({ execute }));

    await expect(repository.flush()).rejects.toMatchObject({ code: "NETWORK_UNAVAILABLE" });

    expect(execute.mock.calls.map(([batch]) => batch.length)).toEqual([50, 1]);
    expect(offlineState.commands.map((item) => item.command.operationId)).toEqual(["op-50"]);
    await expect(repository.syncStatus()).resolves.toMatchObject({ pendingCount: 1, connectionState: "disconnected" });
    await repository.dispose();
  });

  it("tracks server, network, authentication, and concurrent flush outcomes", async () => {
    vi.useFakeTimers();
    const queued = command("pet.create", "op-1", "pet-new");
    offlineState.commands = [{ accountId: "account-1", role: "owner", command: queued }];
    let rejectExecute!: (reason: unknown) => void;
    const pendingExecute = new Promise<never>((_resolve, reject) => { rejectExecute = reject; });
    const execute = vi.fn().mockReturnValueOnce(pendingExecute);
    const invalidated = vi.fn();
    const repository = bareRepository(client({ execute }), snapshot(), invalidated);
    const firstFlush = repository.flush();
    await Promise.resolve();
    await expect(repository.flush()).resolves.toBeUndefined();
    rejectExecute(new AuthClientError("SERVER_ERROR", "boom", 503));
    await expect(firstFlush).rejects.toMatchObject({ status: 503 });
    await expect(repository.syncStatus()).resolves.toMatchObject({ connectionState: "error", lastError: "boom", syncing: false });

    execute.mockRejectedValueOnce(new AuthClientError("AUTH_REQUIRED", "expired", 401));
    await expect(repository.flush()).rejects.toMatchObject({ status: 401 });
    expect(invalidated).toHaveBeenCalledOnce();
    expect(offlineState.clearCalls).toContain("account-1");
    await repository.dispose();
    await expect(repository.flush()).resolves.toBeUndefined();
  });

  it("refreshes snapshots, tolerates disconnection, invalidates expired sessions, and switches roles from cache", async () => {
    const pending = command("pet.create", "op-pending", "pet-pending", petInput("Локальный") as unknown as Record<string, unknown>);
    offlineState.commands = [{ accountId: "account-1", role: "owner", command: pending }];
    const state = vi.fn()
      .mockResolvedValueOnce(snapshot("owner"))
      .mockRejectedValueOnce(new AuthClientError("NETWORK_UNAVAILABLE", "offline", 0))
      .mockRejectedValueOnce(new AuthClientError("AUTH_REQUIRED", "expired", 401))
      .mockRejectedValueOnce(new Error("broken"));
    const invalidated = vi.fn();
    const repository = bareRepository(client({ state }), snapshot(), invalidated);

    await repository.refresh();
    expect(repository.current.medical.pets.some((pet) => pet.petId === "pet-pending")).toBe(true);
    await repository.refresh();
    await expect(repository.syncStatus()).resolves.toMatchObject({ connectionState: "disconnected" });
    await repository.refresh();
    expect(invalidated).toHaveBeenCalledOnce();
    await expect(repository.refresh()).rejects.toThrow("broken");

    const doctorSnapshot = snapshot("doctor");
    state.mockResolvedValueOnce(doctorSnapshot);
    await repository.setActiveRole("doctor");
    expect(repository.current.role).toBe("doctor");

    offlineState.snapshots.set("account-1:owner", snapshot("owner"));
    state.mockRejectedValueOnce(new AuthClientError("NETWORK_UNAVAILABLE", "offline", 0));
    await repository.setActiveRole("owner");
    expect(repository.current.role).toBe("owner");

    state.mockRejectedValueOnce(new AuthClientError("NETWORK_UNAVAILABLE", "offline", 0));
    await expect(repository.setActiveRole("administrator")).rejects.toMatchObject({ code: "NETWORK_UNAVAILABLE" });
    state.mockRejectedValueOnce(new Error("bad role"));
    await expect(repository.setActiveRole("administrator")).rejects.toThrow("bad role");
    await repository.dispose();
  });

  it("ignores a refresh response older than the snapshot already applied", async () => {
    let resolveOlder!: (value: AppSnapshotDto) => void;
    let resolveNewer!: (value: AppSnapshotDto) => void;
    const olderResponse = new Promise<AppSnapshotDto>((resolve) => { resolveOlder = resolve; });
    const newerResponse = new Promise<AppSnapshotDto>((resolve) => { resolveNewer = resolve; });
    const state = vi.fn().mockReturnValueOnce(olderResponse).mockReturnValueOnce(newerResponse);
    const repository = bareRepository(client({ state }));
    const older = snapshot();
    older.revision = 5;
    older.medical.pets[0]!.name = "Старый ответ";
    const newer = snapshot();
    newer.revision = 6;
    newer.medical.pets[0]!.name = "Новый ответ";

    const firstRefresh = repository.refresh();
    const secondRefresh = repository.refresh();
    resolveNewer(newer);
    await secondRefresh;
    resolveOlder(older);
    await firstRefresh;

    expect(repository.current).toMatchObject({ revision: 6, medical: { pets: [expect.objectContaining({ name: "Новый ответ" })] } });
    expect(offlineState.snapshots.get("account-1:owner")).toMatchObject({ revision: 6 });
    await repository.dispose();
  });

  it("creates repositories online or from a valid offline snapshot and wires lifecycle events", async () => {
    vi.useFakeTimers();
    const onlineClient = client();
    const session = { authenticated: true, accountId: "account-1" } as AuthSessionDto & Required<Pick<AuthSessionDto, "accountId">>;
    const online = await KlinokRepository.create({ client: onlineClient, session, initialRole: "owner", offlineLeaseDays: 7 });
    expect(offlineState.snapshots.get("account-1:owner")).toMatchObject({ revision: 4 });
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("focus"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    await online.dispose();

    offlineState.snapshots.set("account-1:doctor", snapshot("doctor"));
    const offlineClient = client({ state: vi.fn().mockRejectedValue(new AuthClientError("NETWORK_UNAVAILABLE", "offline", 0)) });
    const offline = await KlinokRepository.create({ client: offlineClient, session, initialRole: "doctor", offlineLeaseDays: 7 });
    expect(offline.current.role).toBe("doctor");
    await offline.dispose();

    offlineState.snapshots.delete("account-1:administrator");
    await expect(KlinokRepository.create({ client: offlineClient, session, initialRole: "administrator", offlineLeaseDays: 7 }))
      .rejects.toMatchObject({ code: "NETWORK_UNAVAILABLE" });
    await expect(KlinokRepository.create({
      client: client({ state: vi.fn().mockRejectedValue(new Error("state failed")) }), session, initialRole: "owner", offlineLeaseDays: 7,
    })).rejects.toThrow("state failed");
  });
});
