// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it } from "vitest";
import { laboratoryStudyTypeById, type LaboratoryStudyValue, type LaboratoryTestsSectionValue } from "@klinok/contracts";
import { parseLaboratoryTestsDraft } from "../src/laboratoryTests";

const base = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  date: "2026-08-15",
  laboratory: "Ветлаб",
};

describe("laboratory draft validation", () => {
  it("places missing-section and panel errors on their fields", () => {
    expect(parseLaboratoryTestsDraft({ studies: [] }).errors.section).toContain("Добавьте");
    const type = laboratoryStudyTypeById("lab.study.cbc")!;
    const draft: LaboratoryTestsSectionValue = { studies: [{
      ...base,
      date: "2026-08-16",
      laboratory: " ",
      typeId: type.id,
      typeName: type.name,
      mode: "panel",
      results: [{ indicatorId: type.indicators[0]!.id, indicatorName: type.indicators[0]!.name, unit: type.indicators[0]!.unit, result: "" }],
    }] };

    const parsed = parseLaboratoryTestsDraft(draft, "2026-08-15");
    expect(parsed.value).toBeUndefined();
    expect(parsed.errors.studies[0]).toMatchObject({
      date: "Укажите корректную дату исследования.",
      laboratory: "Укажите лабораторию.",
      indicators: { [type.indicators[0]!.id]: "Укажите результат." },
    });
  });

  it("validates narrative and infection fields independently", () => {
    const narrative = laboratoryStudyTypeById("lab.study.narrative.001")!;
    const infection = laboratoryStudyTypeById("lab.study.infection")!;
    const studies: LaboratoryStudyValue[] = [{
      ...base,
      typeId: narrative.id,
      typeName: narrative.name,
      mode: "narrative",
      result: " ",
    }, {
      ...base,
      id: "223e4567-e89b-12d3-a456-426614174000",
      typeId: infection.id,
      typeName: infection.name,
      mode: "infection",
      infection: " ",
      method: "invalid",
      result: "invalid",
    } as unknown as LaboratoryStudyValue];

    const parsed = parseLaboratoryTestsDraft({ studies });
    expect(parsed.errors.studies[0]?.result).toBe("Укажите результат исследования.");
    expect(parsed.errors.studies[1]).toMatchObject({
      infection: "Укажите инфекцию.",
      method: "Выберите метод исследования.",
      infectionResult: "Выберите результат исследования.",
    });
  });

  it("reports missing indicators and unknown types at study level", () => {
    const type = laboratoryStudyTypeById("lab.study.cbc")!;
    const parsed = parseLaboratoryTestsDraft({ studies: [{
      ...base,
      typeId: type.id,
      typeName: type.name,
      mode: "panel",
      results: [],
    }, {
      ...base,
      id: "223e4567-e89b-12d3-a456-426614174000",
      typeId: "unknown",
      typeName: "Unknown",
      mode: "panel",
      results: [],
    }] });

    expect(parsed.errors.studies[0]?.section).toBe("Добавьте показатели исследования.");
    expect(parsed.errors.studies[1]?.section).toBe("Выберите исследование из справочника.");
  });

  it("returns normalized values and preserves unexpected normalizer errors", () => {
    const type = laboratoryStudyTypeById("lab.study.cbc")!;
    const study = {
      ...base,
      typeId: type.id,
      typeName: type.name,
      mode: "panel" as const,
      results: [{ indicatorId: type.indicators[0]!.id, indicatorName: type.indicators[0]!.name, unit: type.indicators[0]!.unit, result: " 42 " }],
    };
    expect(parseLaboratoryTestsDraft({ studies: [study] }).value?.studies[0]).toMatchObject({
      laboratory: "Ветлаб",
      results: [{ result: "42" }],
    });
    expect(parseLaboratoryTestsDraft({ studies: [{ ...study, id: "invalid" }] }).errors.section)
      .toBe("Некорректный идентификатор исследования.");
  });
});
