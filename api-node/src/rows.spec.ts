// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it } from "vitest";
import { dateOnly, recordFromRow } from "./rows.js";

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
});
