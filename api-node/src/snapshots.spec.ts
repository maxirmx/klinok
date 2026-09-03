// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it, vi } from "vitest";
import { SnapshotService } from "./snapshots.js";

const timestamp = new Date("2026-09-02T10:00:00.000Z");

describe("owner transfer snapshots", () => {
  it("projects the request to both parties and moves the same pet history after completion", async () => {
    let currentOwner = "owner-1";
    let transferStatus = "pending";
    const profiles: Record<string, Record<string, unknown>> = {
      "owner-1": { account_id: "owner-1", revision: 2, first_name: "Алёна", last_name: "Ёлкина", patronymic: null, updated_at: timestamp },
      "owner-2": { account_id: "owner-2", revision: 3, first_name: "Иван", last_name: "Петров", patronymic: null, updated_at: timestamp },
    };
    const pet = {
      pet_id: "pet-1", owner_account_id: currentOwner, revision: 4, name: "Ёжик", species: "Кошка", breed: "Домашняя",
      weight_kg: 5, created_at: timestamp, updated_at: timestamp, deleted_at: null,
    };
    const role = (accountId: string) => ({
      request_id: `role-${accountId}`, account_id: accountId, role: "owner", status: "approved", revision: 1,
      profile_revision: profiles[accountId]!.revision, requested_at: timestamp,
    });
    const transfer = () => ({
      transfer_request_id: "transfer-1", pet_id: "pet-1", pet_revision: 4,
      from_owner_account_id: "owner-1", from_owner_profile_revision: 2,
      to_owner_account_id: "owner-2", to_owner_profile_revision: 3,
      initiated_by_account_id: "owner-1", retain_doctor_access: false,
      status: transferStatus, revision: transferStatus === "pending" ? 1 : 2,
      created_at: timestamp, ...(transferStatus === "completed" ? { decided_at: timestamp, decided_by: "owner-2" } : {}),
      pet_name: "Ёжик", pet_species: "Кошка", from_owner_display_name: "Алёна Ёлкина", to_owner_display_name: "Иван Петров",
    });
    const record = {
      record_id: "record-1", pet_id: "pet-1", revision: 1, author_account_id: "doctor-1", author_display_name: "Анна Врач",
      encounter_date: "2026-09-02", title: "Осмотр", text: "История", sections: {}, created_at: timestamp, updated_at: timestamp,
    };
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.startsWith("SET TRANSACTION")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("SELECT 1 FROM roles")) return { rows: [{}], rowCount: 1 };
      if (sql.startsWith("SELECT * FROM profiles WHERE account_id=$1")) {
        return { rows: [profiles[String(params[0])]], rowCount: 1 };
      }
      if (sql.startsWith("SELECT * FROM roles WHERE account_id=$1")) return { rows: [role(String(params[0]))], rowCount: 1 };
      if (sql.startsWith("SELECT * FROM pets WHERE owner_account_id")) {
        pet.owner_account_id = currentOwner;
        const rows = currentOwner === params[0] ? [pet] : [];
        return { rows, rowCount: rows.length };
      }
      if (sql.startsWith("SELECT * FROM access_grants")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("SELECT * FROM access_requests")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM pet_ownership_transfers t")) return { rows: [transfer()], rowCount: 1 };
      if (sql.startsWith("SELECT * FROM medical_records")) return { rows: [record], rowCount: 1 };
      if (sql.startsWith("SELECT * FROM medical_record_confirmations")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("SELECT * FROM profiles WHERE account_id = ANY")) {
        const ids = params[0] as string[];
        const rows = ids.map((id) => profiles[id]).filter(Boolean);
        return { rows, rowCount: rows.length };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const database = { transaction: vi.fn(async (work: (client: { query: typeof query }) => Promise<unknown>) => work({ query })) };
    const ledger = { currentStatus: vi.fn(() => ({
      valid: true, height: 12, headHash: "a".repeat(64), verifiedAt: timestamp.toISOString(),
    })) };
    const service = new SnapshotService(database as never, ledger as never);

    const beforeA = await service.load("owner-1", "owner");
    const beforeB = await service.load("owner-2", "owner");
    expect(beforeA.medical.pets.map((item) => item.petId)).toEqual(["pet-1"]);
    expect(beforeB.medical.pets).toEqual([]);
    expect(beforeA.medical.transferRequests[0]).toMatchObject({ status: "pending", fromOwnerDisplayName: "Алёна Ёлкина" });
    expect(beforeB.medical.transferRequests[0]).toMatchObject({ status: "pending", toOwnerDisplayName: "Иван Петров" });

    currentOwner = "owner-2";
    transferStatus = "completed";
    const afterA = await service.load("owner-1", "owner");
    const afterB = await service.load("owner-2", "owner");
    expect(afterA.medical.pets).toEqual([]);
    expect(afterB.medical.pets[0]).toMatchObject({ petId: "pet-1", ownerAccountId: "owner-2" });
    expect(afterB.medical.records[0]).toMatchObject({ recordId: "record-1", petId: "pet-1", text: "История" });
    expect(afterA.medical.transferRequests[0]).toMatchObject({ status: "completed", revision: 2 });
    expect(afterB.medical.transferRequests[0]).toMatchObject({ status: "completed", revision: 2 });
  });
});
