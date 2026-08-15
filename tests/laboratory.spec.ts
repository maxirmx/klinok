// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it } from "vitest";
import { LABORATORY_STUDY_CATALOG, laboratoryStudyTypeById, normalizeLaboratoryTestsValue } from "@klinok/contracts";

const id = "123e4567-e89b-12d3-a456-426614174000";
const base = { id, date: "2026-08-15", laboratory: " Ветлаб ", technician: " Иванов ", equipment: " ", comment: " ok " };

describe("structured laboratory studies", () => {
  it("keeps catalog identifiers unique, including duplicate names with different units", () => {
    const studies = new Set(LABORATORY_STUDY_CATALOG.map((study) => study.id));
    const indicators = LABORATORY_STUDY_CATALOG.flatMap((study) => study.indicators);
    expect(studies.size).toBe(LABORATORY_STUDY_CATALOG.length);
    expect(new Set(indicators.map((item) => item.id)).size).toBe(indicators.length);
    expect(indicators.filter((item) => item.name === "Ретикулоциты").map((item) => item.unit)).toEqual(["%", "×10⁹/л"]);
    expect(LABORATORY_STUDY_CATALOG.some((study) => study.mode === "narrative")).toBe(true);
    expect(LABORATORY_STUDY_CATALOG.some((study) => study.mode === "infection")).toBe(true);
  });

  it("trims and canonicalizes panel snapshots from stable catalog ids", () => {
    const type = laboratoryStudyTypeById("lab.study.cbc")!;
    const indicator = type.indicators[0]!;
    const value = normalizeLaboratoryTestsValue({ studies: [{ ...base, typeId: type.id, typeName: "forged", mode: "panel", results: [{ indicatorId: indicator.id, indicatorName: "forged", unit: "forged", result: " 42 ", reference: " 10–50 " }] }] }, "2026-08-15");
    expect(value.studies[0]).toMatchObject({ laboratory: "Ветлаб", technician: "Иванов", typeName: type.name, mode: "panel", results: [{ indicatorName: indicator.name, unit: indicator.unit, result: "42", reference: "10–50" }] });
  });

  it("normalizes narrative and infection modes", () => {
    const narrative = LABORATORY_STUDY_CATALOG.find((study) => study.mode === "narrative")!;
    const infection = laboratoryStudyTypeById("lab.study.infection")!;
    expect(normalizeLaboratoryTestsValue({ studies: [{ ...base, typeId: narrative.id, mode: "narrative", result: " описание " }] }).studies[0]).toMatchObject({ mode: "narrative", result: "описание" });
    expect(normalizeLaboratoryTestsValue({ studies: [{ ...base, id: "223e4567-e89b-12d3-a456-426614174000", typeId: infection.id, mode: "infection", infection: " чума ", method: "ПЦР", result: "negative" }] }).studies[0]).toMatchObject({ mode: "infection", infection: "чума", result: "negative" });
  });

  it.each([
    [{ studies: [] }, "Добавьте"],
    [{ studies: [{ ...base, date: "2099-01-01", typeId: "lab.study.cbc", mode: "panel", results: [] }] }, "дату"],
    [{ studies: [{ ...base, typeId: "unknown", mode: "panel", results: [] }] }, "справочника"],
    [{ studies: [{ ...base, laboratory: "", typeId: "lab.study.cbc", mode: "panel", results: [] }] }, "лабораторию"],
  ])("rejects malformed values", (value, message) => {
    expect(() => normalizeLaboratoryTestsValue(value)).toThrow(message);
  });
});
