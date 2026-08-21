// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it, vi } from "vitest";
import { CommandService, validateMedicalEncounter } from "./commands.js";
import { Ledger } from "./ledger.js";

const timestamp = "2026-08-10T00:00:00.000Z";

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
    if (sql.startsWith("UPDATE pets") || sql.startsWith("INSERT INTO email_outbox") || sql.startsWith("INSERT INTO operation_receipts")) {
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
          mode: "narrative",
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
