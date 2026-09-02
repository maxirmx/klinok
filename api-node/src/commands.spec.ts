// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it, vi } from "vitest";
import { CommandService, validateMedicalEncounter } from "./commands.js";
import { Ledger } from "./ledger.js";

const timestamp = "2026-08-10T00:00:00.000Z";

function transferHarness(options: {
  transfer?: Record<string, unknown>;
  petRevision?: number;
  petOwner?: string;
  ownerTwoProfileRevision?: number;
  ownerTwoAvailable?: boolean;
} = {}) {
  const pet = {
    pet_id: "pet-1", owner_account_id: options.petOwner ?? "owner-1", revision: options.petRevision ?? 4,
    name: "Ёжик", species: "Кошка", breed: "Домашняя", created_at: timestamp, updated_at: timestamp, deleted_at: null,
  } as Record<string, unknown>;
  let transfer = options.transfer ? { ...options.transfer } : undefined;
  const profiles: Record<string, Record<string, unknown>> = {
    "owner-1": { account_id: "owner-1", email: "one@example.ru", credential_status: "active", profile_revision: 2, first_name: "Алёна", last_name: "Ёлкина", patronymic: null, updated_at: timestamp },
    ...(options.ownerTwoAvailable === false ? {} : {
      "owner-2": { account_id: "owner-2", email: "two@example.ru", credential_status: "active", profile_revision: options.ownerTwoProfileRevision ?? 3, first_name: "Иван", last_name: "Петров", patronymic: null, updated_at: timestamp },
    }),
  };
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [], rowCount: 1 };
    if (sql.startsWith("SELECT actor_account_id")) return { rows: [], rowCount: 0 };
    if (sql.startsWith("SELECT credential_status")) return { rows: [{ credential_status: "active" }], rowCount: 1 };
    if (sql.startsWith("SELECT 1 FROM roles")) return { rows: [{}], rowCount: 1 };
    if (sql.startsWith("SELECT * FROM pets WHERE pet_id")) return { rows: [pet], rowCount: 1 };
    if (sql.startsWith("SELECT a.account_id")) {
      const ids = params[0] as string[];
      const rows = ids.flatMap((id) => profiles[id] ? [profiles[id]] : []);
      return { rows, rowCount: rows.length };
    }
    if (sql.startsWith("SELECT * FROM pet_ownership_transfers WHERE pet_id")) {
      const rows = transfer?.status === "pending" ? [transfer] : [];
      return { rows, rowCount: rows.length };
    }
    if (sql.startsWith("SELECT pet_id,")) {
      return { rows: transfer ? [{
        pet_id: transfer.pet_id,
        from_owner_account_id: transfer.from_owner_account_id,
        to_owner_account_id: transfer.to_owner_account_id,
      }] : [], rowCount: transfer ? 1 : 0 };
    }
    if (sql.startsWith("INSERT INTO pet_ownership_transfers")) {
      transfer = {
        transfer_request_id: params[0], pet_id: params[1], pet_revision: params[2],
        from_owner_account_id: params[3], from_owner_profile_revision: params[4],
        to_owner_account_id: params[5], to_owner_profile_revision: params[6], initiated_by_account_id: params[7],
        status: "pending", revision: 1, created_at: timestamp,
      };
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("SELECT * FROM pet_ownership_transfers WHERE transfer_request_id")) {
      return { rows: transfer ? [transfer] : [], rowCount: transfer ? 1 : 0 };
    }
    if (sql.startsWith("SELECT t.*,p.name AS pet_name")) {
      const joined = transfer ? {
        ...transfer,
        pet_name: pet.name,
        pet_species: pet.species,
        from_owner_display_name: "Алёна Ёлкина",
        to_owner_display_name: "Иван Петров",
      } : undefined;
      return { rows: joined ? [joined] : [], rowCount: joined ? 1 : 0 };
    }
    if (sql.startsWith("UPDATE pet_ownership_transfers SET status=$2")) {
      transfer = { ...transfer, status: params[1], revision: Number(transfer?.revision) + 1, decided_at: timestamp, decided_by: params[2] };
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("UPDATE pet_ownership_transfers SET status='invalidated'")) {
      transfer = { ...transfer, status: "invalidated", revision: Number(transfer?.revision) + 1, decided_at: timestamp, decided_by: params[1] };
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("UPDATE pet_ownership_transfers SET status='completed'")) {
      transfer = { ...transfer, status: "completed", revision: Number(transfer?.revision) + 1, decided_at: timestamp, decided_by: params[1] };
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("UPDATE pets SET owner_account_id")) {
      pet.owner_account_id = params[1];
      pet.revision = Number(pet.revision) + 1;
      return { rows: [pet], rowCount: 1 };
    }
    if (sql.startsWith("SELECT DISTINCT a.email") && sql.includes("access_requests")) return { rows: [{ email: "pending-doctor@example.ru" }], rowCount: 1 };
    if (sql.startsWith("SELECT DISTINCT a.email") && sql.includes("access_grants")) return { rows: [{ email: "active-doctor@example.ru" }], rowCount: 1 };
    if (sql.startsWith("UPDATE access_requests") || sql.startsWith("UPDATE access_grants")) return { rows: [], rowCount: 1 };
    if (sql.startsWith("SELECT email FROM accounts")) {
      const profile = profiles[String(params[0])];
      return { rows: profile ? [{ email: profile.email }] : [], rowCount: profile ? 1 : 0 };
    }
    if (sql.startsWith("INSERT INTO email_outbox") || sql.startsWith("INSERT INTO operation_receipts")) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const client = { query };
  const database = { transaction: vi.fn(async (work: (value: typeof client) => Promise<unknown>) => work(client)) };
  const ledger = {
    isValid: vi.fn(() => true), append: vi.fn(async () => ({ height: 1, blockHash: "a".repeat(64) })), noteCommitted: vi.fn(),
  } as unknown as Ledger;
  return {
    service: new CommandService(database as never, ledger),
    query,
    pet,
    transfer: () => transfer,
  };
}

function pendingTransfer(initiatedBy = "owner-1"): Record<string, unknown> {
  return {
    transfer_request_id: "transfer-1", pet_id: "pet-1", pet_revision: 4,
    from_owner_account_id: "owner-1", from_owner_profile_revision: 2,
    to_owner_account_id: "owner-2", to_owner_profile_revision: 3,
    initiated_by_account_id: initiatedBy, status: "pending", revision: 1, created_at: timestamp,
  };
}

async function confirmVaccinationAgainst(current: { confirmed: unknown; profile: unknown }, encounterDate: string, recordId = "record-1") {
  const record = {
    record_id: recordId, pet_id: "pet-1", revision: 2, author_account_id: "doctor-1", author_display_name: "Иван Врач",
    encounter_date: encounterDate, title: "Вакцинация", text: "", sections: {
      vaccination: { value: { currentVaccineName: "Новая вакцина" } },
    }, created_at: timestamp, updated_at: timestamp,
  };
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    void _params;
    if (sql.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [], rowCount: 1 };
    if (sql.startsWith("SELECT actor_account_id")) return { rows: [], rowCount: 0 };
    if (sql.startsWith("SELECT credential_status")) return { rows: [{ credential_status: "active" }], rowCount: 1 };
    if (sql.startsWith("SELECT * FROM medical_records")) return { rows: [record], rowCount: 1 };
    if (sql.startsWith("SELECT * FROM pets")) return { rows: [{
      pet_id: "pet-1", owner_account_id: "owner-1", latest_confirmed_vaccination: current.confirmed,
      latest_vaccination: current.profile,
    }], rowCount: 1 };
    if (sql.startsWith("SELECT 1 FROM roles")) return { rows: [{ "?column?": 1 }], rowCount: 1 };
    if (sql.startsWith("SELECT 1 FROM medical_record_confirmations")) return { rows: [], rowCount: 0 };
    if (sql.startsWith("SELECT email FROM accounts")) return { rows: [{ email: "doctor@example.ru" }], rowCount: 1 };
    if (sql.startsWith("INSERT INTO medical_record_confirmations")) return { rows: [{
      confirmation_id: "confirmation-1", pet_id: "pet-1", record_id: recordId, record_revision: 2,
      owner_account_id: "owner-1", confirmed_at: timestamp, applied_profile_weight_kg: null,
      applied_profile_chip: null, applied_profile_latest_vaccination: null,
    }], rowCount: 1 };
    if (sql.startsWith("UPDATE pets") || sql.startsWith("UPDATE pet_ownership_transfers")
      || sql.startsWith("INSERT INTO email_outbox") || sql.startsWith("INSERT INTO operation_receipts")) {
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const client = { query };
  const database = { transaction: vi.fn(async (work: (value: typeof client) => Promise<unknown>) => work(client)) };
  const ledger = {
    isValid: vi.fn(() => true), append: vi.fn(async () => ({ height: 1, blockHash: "a".repeat(64) })), noteCommitted: vi.fn(),
  } as unknown as Ledger;
  const service = new CommandService(database as never, ledger);
  const result = await service.execute({ accountId: "owner-1" }, {
    operationId: `confirm-${recordId}`, type: "record.confirm", activeRole: "owner", entityId: recordId,
    expectedRevision: 2, createdAt: timestamp, payload: {},
  });
  const update = query.mock.calls.find(([sql]) => String(sql).startsWith("UPDATE pets"));
  const insert = query.mock.calls.find(([sql]) => String(sql).startsWith("INSERT INTO medical_record_confirmations"));
  if (!update || !insert) throw new Error("Expected confirmation projection queries.");
  return { result, updateParams: update[1] ?? [], insertParams: insert[1] ?? [] };
}

describe("command boundary", () => {
  it("creates outgoing and incoming transfer requests only from authoritative parties", async () => {
    const outgoing = transferHarness();
    await expect(outgoing.service.execute({ accountId: "owner-1" }, {
      operationId: "op-transfer-out", type: "transfer.request", activeRole: "owner", entityId: "transfer-out",
      createdAt: timestamp, payload: {
        petId: "pet-1", toOwnerAccountId: "owner-2", expectedFromOwnerAccountId: "owner-1",
        expectedPetRevision: 4, expectedFromOwnerProfileRevision: 2, expectedToOwnerProfileRevision: 3,
        ownershipLossAcknowledged: true,
      },
    })).resolves.toMatchObject({ status: "applied", value: { transferRequestId: "transfer-out", status: "pending" } });
    expect(outgoing.query.mock.calls.find(([sql]) => String(sql).startsWith("INSERT INTO email_outbox"))?.[1]?.[1]).toBe("two@example.ru");

    const incoming = transferHarness();
    await expect(incoming.service.execute({ accountId: "owner-2" }, {
      operationId: "op-transfer-in", type: "transfer.request", activeRole: "owner", entityId: "transfer-in",
      createdAt: timestamp, payload: {
        petId: "pet-1", toOwnerAccountId: "owner-2", expectedFromOwnerAccountId: "owner-1",
        expectedPetRevision: 4, expectedFromOwnerProfileRevision: 2, expectedToOwnerProfileRevision: 3,
        ownershipLossAcknowledged: false,
      },
    })).resolves.toMatchObject({ status: "applied", value: { initiatedByAccountId: "owner-2" } });
    expect(incoming.query.mock.calls.find(([sql]) => String(sql).startsWith("INSERT INTO email_outbox"))?.[1]?.[1]).toBe("one@example.ru");
  });

  it("requires ownership-loss acknowledgement and rejects self or duplicate transfers", async () => {
    const missingAcknowledgement = transferHarness();
    await expect(missingAcknowledgement.service.execute({ accountId: "owner-1" }, {
      operationId: "op-missing-ack", type: "transfer.request", activeRole: "owner", entityId: "transfer-1",
      createdAt: timestamp, payload: {
        petId: "pet-1", toOwnerAccountId: "owner-2", expectedFromOwnerAccountId: "owner-1",
        expectedPetRevision: 4, expectedFromOwnerProfileRevision: 2, expectedToOwnerProfileRevision: 3,
      },
    })).resolves.toMatchObject({ status: "rejected", error: { code: "OWNERSHIP_LOSS_ACKNOWLEDGEMENT_REQUIRED" } });

    const duplicate = transferHarness({ transfer: pendingTransfer() });
    await expect(duplicate.service.execute({ accountId: "owner-2" }, {
      operationId: "op-duplicate", type: "transfer.request", activeRole: "owner", entityId: "transfer-2",
      createdAt: timestamp, payload: {
        petId: "pet-1", toOwnerAccountId: "owner-2", expectedFromOwnerAccountId: "owner-1",
        expectedPetRevision: 4, expectedFromOwnerProfileRevision: 2, expectedToOwnerProfileRevision: 3,
      },
    })).resolves.toMatchObject({ status: "rejected", error: { code: "TRANSFER_ALREADY_PENDING" } });
  });

  it("rejects stale, self, unrelated-party, and unavailable-Owner requests", async () => {
    const command = (overrides: Record<string, unknown> = {}) => ({
      operationId: `op-${crypto.randomUUID()}`, type: "transfer.request" as const, activeRole: "owner" as const,
      entityId: `transfer-${crypto.randomUUID()}`, createdAt: timestamp, payload: {
        petId: "pet-1", toOwnerAccountId: "owner-2", expectedFromOwnerAccountId: "owner-1",
        expectedPetRevision: 4, expectedFromOwnerProfileRevision: 2, expectedToOwnerProfileRevision: 3,
        ownershipLossAcknowledged: true, ...overrides,
      },
    });
    await expect(transferHarness({ petRevision: 5 }).service.execute({ accountId: "owner-1" }, command()))
      .resolves.toMatchObject({ status: "conflict", error: { code: "TRANSFER_TARGET_STALE" } });
    await expect(transferHarness().service.execute({ accountId: "owner-1" }, command({ toOwnerAccountId: "owner-1" })))
      .resolves.toMatchObject({ status: "rejected", error: { code: "TRANSFER_TO_SELF" } });
    await expect(transferHarness().service.execute({ accountId: "owner-3" }, command()))
      .resolves.toMatchObject({ status: "rejected", error: { code: "TRANSFER_PARTY_REQUIRED" } });
    await expect(transferHarness({ ownerTwoAvailable: false }).service.execute({ accountId: "owner-1" }, command()))
      .resolves.toMatchObject({ status: "rejected", error: { code: "TRANSFER_OWNER_UNAVAILABLE" } });
  });

  it("atomically completes a transfer and revokes every previous Doctor access", async () => {
    const harness = transferHarness({ transfer: pendingTransfer("owner-1") });
    await expect(harness.service.execute({ accountId: "owner-2" }, {
      operationId: "op-accept", type: "transfer.accept", activeRole: "owner", entityId: "transfer-1",
      expectedRevision: 1, createdAt: timestamp, payload: {},
    })).resolves.toMatchObject({ status: "applied", revision: 2, value: { status: "completed" } });

    expect(harness.pet).toMatchObject({ owner_account_id: "owner-2", revision: 5 });
    expect(harness.transfer()).toMatchObject({ status: "completed", revision: 2, decided_by: "owner-2" });
    expect(harness.query.mock.calls.some(([sql]) => String(sql).startsWith("UPDATE access_requests"))).toBe(true);
    expect(harness.query.mock.calls.some(([sql]) => String(sql).startsWith("UPDATE access_grants"))).toBe(true);
    expect(harness.query.mock.calls.filter(([sql]) => String(sql).startsWith("INSERT INTO email_outbox"))).toHaveLength(4);
    const ownerLock = harness.query.mock.calls.findIndex(([sql]) => String(sql).startsWith("SELECT a.account_id"));
    const transferLock = harness.query.mock.calls.findIndex(([sql]) => String(sql).startsWith("SELECT * FROM pet_ownership_transfers WHERE transfer_request_id"));
    expect(ownerLock).toBeGreaterThan(-1);
    expect(transferLock).toBeGreaterThan(ownerLock);
  });

  it("requires the current Owner acknowledgement when an incoming request is accepted", async () => {
    const harness = transferHarness({ transfer: pendingTransfer("owner-2") });
    await expect(harness.service.execute({ accountId: "owner-1" }, {
      operationId: "op-accept-no-ack", type: "transfer.accept", activeRole: "owner", entityId: "transfer-1",
      expectedRevision: 1, createdAt: timestamp, payload: {},
    })).resolves.toMatchObject({ status: "rejected", error: { code: "OWNERSHIP_LOSS_ACKNOWLEDGEMENT_REQUIRED" } });
    expect(harness.pet.owner_account_id).toBe("owner-1");
  });

  it("invalidates a stale accepted request and commits a conflict receipt", async () => {
    const harness = transferHarness({ transfer: pendingTransfer("owner-1"), ownerTwoProfileRevision: 4 });
    await expect(harness.service.execute({ accountId: "owner-2" }, {
      operationId: "op-stale", type: "transfer.accept", activeRole: "owner", entityId: "transfer-1",
      expectedRevision: 1, createdAt: timestamp, payload: {},
    })).resolves.toMatchObject({ status: "conflict", revision: 2, error: { code: "TRANSFER_REQUEST_STALE" } });
    expect(harness.transfer()).toMatchObject({ status: "invalidated", revision: 2 });
    expect(harness.pet.owner_account_id).toBe("owner-1");
    const receipt = harness.query.mock.calls.find(([sql]) => String(sql).startsWith("INSERT INTO operation_receipts"));
    expect(JSON.parse(String(receipt?.[1]?.[3]))).toMatchObject({ status: "conflict", error: { code: "TRANSFER_REQUEST_STALE" } });
  });

  it("lets only the initiator cancel and only the responder reject a pending transfer", async () => {
    const cancelHarness = transferHarness({ transfer: pendingTransfer("owner-1") });
    await expect(cancelHarness.service.execute({ accountId: "owner-1" }, {
      operationId: "op-cancel", type: "transfer.cancel", activeRole: "owner", entityId: "transfer-1",
      expectedRevision: 1, createdAt: timestamp, payload: {},
    })).resolves.toMatchObject({ status: "applied", value: { status: "cancelled" } });

    const rejectHarness = transferHarness({ transfer: pendingTransfer("owner-1") });
    await expect(rejectHarness.service.execute({ accountId: "owner-2" }, {
      operationId: "op-reject", type: "transfer.reject", activeRole: "owner", entityId: "transfer-1",
      expectedRevision: 1, createdAt: timestamp, payload: {},
    })).resolves.toMatchObject({ status: "applied", value: { status: "rejected" } });

    const forbidden = transferHarness({ transfer: pendingTransfer("owner-1") });
    await expect(forbidden.service.execute({ accountId: "owner-2" }, {
      operationId: "op-cancel-forbidden", type: "transfer.cancel", activeRole: "owner", entityId: "transfer-1",
      expectedRevision: 1, createdAt: timestamp, payload: {},
    })).resolves.toMatchObject({ status: "rejected", error: { code: "TRANSFER_INITIATOR_REQUIRED" } });
  });

  it("rejects unknown transfer command names without changing a pending request", async () => {
    const harness = transferHarness({ transfer: pendingTransfer("owner-1") });

    await expect(harness.service.execute({ accountId: "owner-2" }, {
      operationId: "op-unknown-transfer", type: "transfer.unknown" as never, activeRole: "owner", entityId: "transfer-1",
      expectedRevision: 1, createdAt: timestamp, payload: {},
    })).resolves.toMatchObject({ status: "rejected", error: { code: "COMMAND_UNSUPPORTED" } });
    expect(harness.transfer()).toMatchObject({ status: "pending", revision: 1 });
  });

  it("invalidates a pending transfer in the same transaction as a pet revision change", async () => {
    const before = {
      pet_id: "pet-1", owner_account_id: "owner-1", revision: 4, name: "Ёжик", species: "Кошка", breed: "Домашняя",
      sex: "Кастрированный самец", weight_kg: 5, created_at: timestamp, updated_at: timestamp, deleted_at: null,
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [], rowCount: 1 };
      if (sql.startsWith("SELECT actor_account_id")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("SELECT credential_status")) return { rows: [{ credential_status: "active" }], rowCount: 1 };
      if (sql.startsWith("SELECT 1 FROM roles")) return { rows: [{}], rowCount: 1 };
      if (sql.startsWith("SELECT * FROM pets")) return { rows: [before], rowCount: 1 };
      if (sql.startsWith("UPDATE pets SET revision")) return { rows: [{ ...before, revision: 5 }], rowCount: 1 };
      if (sql.startsWith("UPDATE pet_ownership_transfers SET status='invalidated'")) {
        return { rows: [{ transfer_request_id: "transfer-1" }], rowCount: 1 };
      }
      if (sql.startsWith("INSERT INTO operation_receipts")) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const client = { query };
    const database = { transaction: vi.fn(async (work: (value: typeof client) => Promise<unknown>) => work(client)) };
    const append = vi.fn(async () => ({ height: 1, blockHash: "a".repeat(64) }));
    const ledger = { isValid: vi.fn(() => true), append, noteCommitted: vi.fn() } as unknown as Ledger;
    const service = new CommandService(database as never, ledger);

    await expect(service.execute({ accountId: "owner-1" }, {
      operationId: "op-pet-revision", type: "pet.update", activeRole: "owner", entityId: "pet-1",
      expectedRevision: 4, createdAt: timestamp, payload: { input: {
        name: "Ёжик", species: "Кошка", breed: "Домашняя", sex: "Кастрированный самец", weightKg: 5,
      } },
    })).resolves.toMatchObject({ status: "applied", revision: 5 });
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith("UPDATE pet_ownership_transfers SET status='invalidated'"))).toBe(true);
    expect(append).toHaveBeenCalledWith(client, expect.objectContaining({
      metadata: expect.objectContaining({ invalidatedTransferRequestIds: ["transfer-1"] }),
    }));
  });

  it("accepts canonical taxonomy IDs, rejects removed IDs, and orders selections", () => {
    const result = validateMedicalEncounter({
      petId: "pet-1",
      encounterDate: "2026-08-10",
      sections: {
        "what-happened": {
          selectedIds: ["problem.eyes.10", "problem.eyes.1", "problem.eyes.12"],
          comment: "  Жалобы на глаза  ",
        },
        outcome: { selectedIds: ["outcome.observation"], comment: "" },
      },
    });

    expect(result.sections["what-happened"].selectedIds)
      .toEqual(["problem.eyes.1", "problem.eyes.12", "problem.eyes.10"]);
    expect(result.sections["what-happened"].comment).toBe("Жалобы на глаза");
    expect(() => validateMedicalEncounter({
      petId: "pet-1",
      encounterDate: "2026-08-10",
      sections: {
        "what-happened": { selectedIds: ["problem.eyes.11"], comment: "" },
        outcome: { selectedIds: ["outcome.observation"], comment: "" },
      },
    })).toThrow("The what-happened section is invalid.");
  });

  it("silently omits legacy free-text laboratory sections", () => {
    const result = validateMedicalEncounter({
      petId: "pet-1",
      encounterDate: "2026-08-10",
      sections: {
        "what-happened": { selectedIds: ["problem.digestive.1"], comment: "Не ест" },
        "laboratory-tests": { text: "Старый лабораторный текст" },
        outcome: { selectedIds: ["outcome.observation"], comment: "" },
      },
    });

    expect(result.sections["laboratory-tests"]).toBeUndefined();
  });

  it("preserves legacy instrumental text and normalizes structured instrumental studies", () => {
    const base = {
      petId: "pet-1",
      encounterDate: "2026-08-10",
      sections: {
        "what-happened": { selectedIds: ["problem.research.1"], comment: "Контроль УЗИ" },
        outcome: { selectedIds: ["outcome.observation"], comment: "" },
      },
    };
    expect(validateMedicalEncounter({
      ...base,
      sections: { ...base.sections, "instrumental-tests": { text: "Старое описание УЗИ" } },
    }).sections["instrumental-tests"]).toEqual({ text: "Старое описание УЗИ" });
    expect(() => validateMedicalEncounter({
      ...base,
      sections: {
        ...base.sections,
        "instrumental-tests": { text: "Старое описание УЗИ", studies: [] },
      },
    })).toThrow("cannot combine legacy text with structured studies");

    const structured = validateMedicalEncounter({
      ...base,
      sections: {
        ...base.sections,
        "instrumental-tests": { studies: [{
          id: "123e4567-e89b-12d3-a456-426614174000",
          date: "2026-08-10",
          typeId: "instrumental.study.ultrasound-abdomen",
          typeName: "forged",
          mode: "tree",
          findings: [{
            findingId: "instrumental.finding.ultrasound-abdomen.19",
            findingName: "forged",
            value: "  Без патологии  ",
            children: [],
          }],
        }] },
      },
    });
    expect(structured.sections["instrumental-tests"]).toMatchObject({ studies: [{
      typeName: "УЗИ органов брюшной полости",
      mode: "tree",
      findings: [{ findingName: "Заключение", value: "Без патологии" }],
    }] });
    expect(() => validateMedicalEncounter({
      ...base,
      sections: { ...base.sections, "instrumental-tests": { studies: [] } },
    })).toThrow("Добавьте хотя бы одно");
    expect(() => validateMedicalEncounter({
      ...base,
      sections: { ...base.sections, "instrumental-tests": { studies: [{
        id: "123e4567-e89b-12d3-a456-426614174000",
        date: "2026-08-10",
        typeId: "instrumental.study.ultrasound-abdomen",
        findings: [{
          findingId: "instrumental.finding.ultrasound-abdomen.1",
          children: [{
            findingId: "instrumental.finding.ultrasound-abdomen.1.3",
            children: [
              { findingId: "instrumental.finding.ultrasound-abdomen.1.3.1", children: [] },
              { findingId: "instrumental.finding.ultrasound-abdomen.1.3.2", children: [] },
            ],
          }],
        }],
      }] } },
    })).toThrow("не более одного");
    expect(() => validateMedicalEncounter({
      ...base,
      sections: { ...base.sections, "instrumental-tests": { studies: [{
        id: "123e4567-e89b-12d3-a456-426614174000",
        date: "2026-08-10",
        typeId: "instrumental.study.xray-thorax-abdomen",
        mode: "narrative",
        result: "Без патологии",
      }] } },
    })).toThrow("справочника");
    expect(() => validateMedicalEncounter({
      ...base,
      sections: { ...base.sections, "instrumental-tests": { studies: [{
        id: "123e4567-e89b-12d3-a456-426614174000",
        date: "2026-08-10",
        typeId: "instrumental.study.xray-thorax",
        mode: "tree",
        findings: [{
          findingId: "instrumental.finding.xray-thorax.12",
          children: [{
            findingId: "instrumental.finding.xray-thorax.12.2",
            children: [
              { findingId: "instrumental.finding.xray-thorax.12.2.1", children: [] },
              { findingId: "instrumental.finding.xray-thorax.12.2.2", children: [] },
            ],
          }],
        }],
      }] } },
    })).toThrow("Чёткость границ");
  });

  it("validates structured diagnosis catalog and free-form representations", () => {
    const input = {
      petId: "pet-1",
      encounterDate: "2026-08-10",
      sections: {
        "what-happened": { selectedIds: ["problem.digestive.1"], comment: "Не ест" },
        diagnosis: {
          preliminary: { selectedId: "diagnosis.digestive.001", customText: "" },
          differential: { selectedIds: ["diagnosis.digestive.002"], customTexts: ["  Реакция на корм  "] },
          confirmed: { customText: "  Подтверждено исследованием  " },
        },
        outcome: { selectedIds: ["outcome.observation"], comment: "" },
      },
    };
    expect(validateMedicalEncounter(input).sections.diagnosis).toEqual({
      preliminary: { selectedId: "diagnosis.digestive.001", customText: "" },
      differential: { selectedIds: ["diagnosis.digestive.002"], customTexts: ["Реакция на корм"] },
      confirmed: { customText: "Подтверждено исследованием" },
    });

    const diagnosis = input.sections.diagnosis;
    expect(validateMedicalEncounter({
      ...input,
      sections: { ...input.sections, diagnosis: { ...diagnosis, confirmed: { customText: "" } } },
    }).sections.diagnosis).toEqual({
      preliminary: { selectedId: "diagnosis.digestive.001", customText: "" },
      differential: { selectedIds: ["diagnosis.digestive.002"], customTexts: ["Реакция на корм"] },
      confirmed: { customText: "" },
    });
    expect(() => validateMedicalEncounter({
      ...input,
      sections: {
        ...input.sections,
        diagnosis: {
          preliminary: { customText: "" },
          differential: { selectedIds: [], customTexts: [] },
          confirmed: { customText: "" },
        },
      },
    })).toThrow("At least one diagnosis is required");
    expect(() => validateMedicalEncounter({
      ...input,
      sections: {
        ...input.sections,
        diagnosis: { ...diagnosis, confirmed: { selectedId: "diagnosis.digestive.001", customText: "Стоматит" } },
      },
    })).toThrow("either a catalog value or free text");
    expect(() => validateMedicalEncounter({
      ...input,
      sections: {
        ...input.sections,
        diagnosis: {
          ...diagnosis,
          differential: { selectedIds: ["diagnosis.digestive.002", "diagnosis.digestive.002"], customTexts: [] },
        },
      },
    })).toThrow("differential diagnoses are invalid");
    expect(() => validateMedicalEncounter({
      ...input,
      sections: {
        ...input.sections,
        diagnosis: { ...diagnosis, differential: { selectedIds: [], customTexts: [" ", "Повтор", "Повтор"] } },
      },
    })).toThrow("differential diagnoses are invalid");
    expect(() => validateMedicalEncounter({
      ...input,
      sections: {
        ...input.sections,
        diagnosis: { ...diagnosis, differential: { selectedIds: [], customTexts: [], customText: "" } },
      },
    })).toThrow("differential diagnoses are invalid");
    expect(validateMedicalEncounter({
      ...input,
      sections: {
        ...input.sections,
        diagnosis: { ...diagnosis, differential: { selectedIds: [], customText: "Старый свободный текст" } },
      },
    }).sections.diagnosis).toMatchObject({
      differential: { selectedIds: [], customTexts: ["Старый свободный текст"] },
    });
    expect(() => validateMedicalEncounter({
      ...input,
      sections: { ...input.sections, diagnosis: { text: "Старый свободный текст" } },
    })).toThrow();
  });

  it("rejects every mutation while startup ledger verification is invalid", async () => {
    const ledger = new Ledger();
    await ledger.verify({ query: vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ height: "1", block_hash: "bad" }], rowCount: 1 }) });
    const database = { transaction: vi.fn() };
    const service = new CommandService(database as never, ledger);

    await expect(service.execute({ accountId: "owner-1" }, {
      operationId: "op-1", type: "pet.create", activeRole: "owner", entityId: "pet-1",
      createdAt: "2026-08-10T00:00:00.000Z", payload: {},
    })).resolves.toMatchObject({ status: "rejected", error: { code: "LEDGER_INVALID" } });
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it("returns a stored result for an idempotent replay without appending another block", async () => {
    const client = { query: vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [], rowCount: 1 };
      if (sql.startsWith("SELECT actor_account_id")) return {
        rows: [{ actor_account_id: "owner-1", command_type: "pet.create", result: { operationId: "op-1", status: "applied", revision: 1 } }],
        rowCount: 1,
      };
      throw new Error(`Unexpected SQL: ${sql}`);
    }) };
    const database = { transaction: vi.fn(async (work: (value: typeof client) => Promise<unknown>) => work(client)) };
    const service = new CommandService(database as never, new Ledger());
    const command = { operationId: "op-1", type: "pet.create" as const, activeRole: "owner" as const, entityId: "pet-1", createdAt: "2026-08-10T00:00:00.000Z", payload: {} };

    await expect(service.execute({ accountId: "owner-1" }, command)).resolves.toMatchObject({ operationId: "op-1", status: "duplicate", revision: 1 });
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it("rejects reuse of an operation identifier by a different command", async () => {
    const client = { query: vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [], rowCount: 1 };
      return { rows: [{ actor_account_id: "owner-1", command_type: "pet.update", result: {} }], rowCount: 1 };
    }) };
    const database = { transaction: vi.fn(async (work: (value: typeof client) => Promise<unknown>) => work(client)) };
    const service = new CommandService(database as never, new Ledger());

    await expect(service.execute({ accountId: "owner-1" }, {
      operationId: "op-1", type: "pet.create", activeRole: "owner", entityId: "pet-1",
      createdAt: "2026-08-10T00:00:00.000Z", payload: {},
    })).resolves.toMatchObject({ status: "rejected", error: { code: "OPERATION_ID_REUSED" } });
  });

  it("does not regress vaccination projections when an older record is confirmed", async () => {
    const { result, updateParams, insertParams } = await confirmVaccinationAgainst({
      confirmed: { date: "2026-08-09", name: "Подтверждённая вакцина", recordId: "record-newer" },
      profile: { date: "2026-08-09", name: "Текущая вакцина" },
    }, "2026-07-01", "record-older");

    expect(result).toMatchObject({ status: "applied" });
    expect(updateParams.slice(3, 5)).toEqual(["null", "null"]);
    expect(insertParams[7]).toBe("null");
  });

  it("updates vaccination projections only when the confirmed record wins the monotonic ordering", async () => {
    const newer = await confirmVaccinationAgainst({
      confirmed: { date: "2026-06-01", name: "Старая вакцина", recordId: "record-old" },
      profile: { date: "2026-06-01", name: "Старая вакцина" },
    }, "2026-07-01", "record-new");
    const sameDay = await confirmVaccinationAgainst({
      confirmed: { date: "2026-07-01", name: "Первая вакцина", recordId: "record-a" },
      profile: { date: "2026-07-01", name: "Профильная вакцина" },
    }, "2026-07-01", "record-b");

    expect(JSON.parse(String(newer.updateParams[3]))).toMatchObject({ date: "2026-07-01", recordId: "record-new" });
    expect(JSON.parse(String(newer.updateParams[4]))).toEqual({ date: "2026-07-01", name: "Новая вакцина" });
    expect(JSON.parse(String(sameDay.updateParams[3]))).toMatchObject({ recordId: "record-b" });
    expect(sameDay.updateParams[4]).toBe("null");
  });

  it.each([
    ["active", true],
    ["deleted", true],
    ["locked", false],
    ["pending_verification", false],
  ] as const)("applies an access denial and notification policy for a %s Doctor account", async (recipientStatus, expectsEmail) => {
    const request = {
      request_id: "request-1", pet_id: "pet-1", owner_account_id: "owner-1", requester_account_id: "doctor-1",
      requester_display_name: "Иван Врач", status: "pending", revision: 1, requested_at: timestamp,
    };
    const query = vi.fn(async (sql: string, _params: unknown[] = []) => {
      void _params;
      if (sql.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [], rowCount: 1 };
      if (sql.startsWith("SELECT actor_account_id")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("SELECT credential_status")) return { rows: [{ credential_status: "active" }], rowCount: 1 };
      if (sql.startsWith("SELECT * FROM access_requests")) return { rows: [request], rowCount: 1 };
      if (sql.startsWith("SELECT 1 FROM roles")) return { rows: [{}], rowCount: 1 };
      if (sql.startsWith("UPDATE access_requests")) return { rows: [{ ...request, status: "rejected", revision: 2 }], rowCount: 1 };
      if (sql.startsWith("SELECT * FROM pets")) return { rows: [{ pet_id: "pet-1", owner_account_id: "owner-1", name: "Ёжик" }], rowCount: 1 };
      if (sql.startsWith("SELECT email FROM accounts")) return ["active", "deleted"].includes(recipientStatus)
        ? { rows: [{ email: "doctor@example.ru" }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
      if (sql.startsWith("INSERT INTO email_outbox") || sql.startsWith("INSERT INTO operation_receipts")) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const client = { query };
    const database = { transaction: vi.fn(async (work: (value: typeof client) => Promise<unknown>) => work(client)) };
    const ledger = {
      isValid: vi.fn(() => true), append: vi.fn(async () => ({ height: 1, blockHash: "a".repeat(64) })), noteCommitted: vi.fn(),
    } as unknown as Ledger;
    const service = new CommandService(database as never, ledger);

    await expect(service.execute({ accountId: "owner-1" }, {
      operationId: "reject-access-1", type: "access.reject", activeRole: "owner", entityId: "request-1",
      expectedRevision: 1, createdAt: timestamp, payload: {},
    })).resolves.toMatchObject({ status: "applied", revision: 2 });

    const email = query.mock.calls.find(([sql]) => String(sql).startsWith("INSERT INTO email_outbox"));
    const accountLookup = query.mock.calls.find(([sql]) => String(sql).startsWith("SELECT email FROM accounts"));
    expect(accountLookup?.[0]).toContain("credential_status IN ('active','deleted')");
    if (expectsEmail) {
      expect(email?.[1]?.slice(1)).toEqual([
        "doctor@example.ru", "Статус доступа к питомцу в системе \"Клинок\" изменён", "Доступ к питомцу «Ёжик» отклонён.",
      ]);
    } else {
      expect(email).toBeUndefined();
    }
  });
});
