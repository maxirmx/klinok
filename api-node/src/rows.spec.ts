// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it } from "vitest";
import { dateOnly, recordFromRow, transferRequestFromRow } from "./rows.js";

describe("PostgreSQL row conversion", () => {
  it("preserves date-only values returned as strings or local Date objects", () => {
    expect(dateOnly("2022-06-17")).toBe("2022-06-17");
    expect(dateOnly(new Date(2022, 5, 17))).toBe("2022-06-17");
  });

  it("silently omits legacy free-text laboratory sections", () => {
    const record = recordFromRow({
      record_id: "record-1",
      pet_id: "pet-1",
      revision: 1,
      author_account_id: "doctor-1",
      author_display_name: "Иван Врач",
      encounter_date: "2026-08-15",
      title: "Приём",
      text: "Осмотр",
      sections: {
        "what-happened": { templateVersion: "what-happened-v1", value: { selectedIds: [], comment: "Осмотр" } },
        "laboratory-tests": { templateVersion: "free-text-v0", value: { text: "Старый лабораторный текст" } },
      },
      created_at: "2026-08-15T10:00:00.000Z",
      updated_at: "2026-08-15T10:00:00.000Z",
    });

    expect(record.sections["laboratory-tests"]).toBeUndefined();
    expect(record.sections["what-happened"]).toBeDefined();
  });

  it("maps ownership transfer rows with current display data and immutable identifiers", () => {
    expect(transferRequestFromRow({
      transfer_request_id: "transfer-1",
      pet_id: "pet-1",
      pet_revision: 4,
      from_owner_account_id: "owner-1",
      from_owner_display_name: "Алёна Ёлкина",
      from_owner_profile_revision: 2,
      to_owner_account_id: "owner-2",
      to_owner_display_name: "Иван Петров",
      to_owner_profile_revision: 3,
      initiated_by_account_id: "owner-2",
      retain_doctor_access: true,
      pet_name: "Ёжик",
      pet_species: "Кошка",
      status: "completed",
      revision: 2,
      created_at: "2026-08-15T10:00:00.000Z",
      decided_at: "2026-08-16T10:00:00.000Z",
      decided_by: "owner-1",
    })).toEqual({
      transferRequestId: "transfer-1",
      petId: "pet-1",
      petRevision: 4,
      fromOwnerAccountId: "owner-1",
      fromOwnerDisplayName: "Алёна Ёлкина",
      fromOwnerProfileRevision: 2,
      toOwnerAccountId: "owner-2",
      toOwnerDisplayName: "Иван Петров",
      toOwnerProfileRevision: 3,
      initiatedByAccountId: "owner-2",
      retainDoctorAccess: true,
      petName: "Ёжик",
      petSpecies: "Кошка",
      status: "completed",
      revision: 2,
      createdAt: "2026-08-15T10:00:00.000Z",
      decidedAt: "2026-08-16T10:00:00.000Z",
      decidedBy: "owner-1",
    });
  });

  it("defaults legacy ownership transfer rows to revoking Doctor access", () => {
    expect(transferRequestFromRow({
      transfer_request_id: "legacy-transfer",
      pet_id: "pet-1",
      pet_revision: 1,
      from_owner_account_id: "owner-1",
      from_owner_profile_revision: 1,
      to_owner_account_id: "owner-2",
      to_owner_profile_revision: 1,
      initiated_by_account_id: "owner-1",
      status: "pending",
      revision: 1,
      created_at: "2026-08-15T10:00:00.000Z",
    }).retainDoctorAccess).toBe(false);
  });
});
