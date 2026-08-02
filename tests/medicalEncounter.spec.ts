// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it } from "vitest";
import {
  WHAT_HAPPENED_TREE,
  OUTCOME_OPTIONS,
  encounterSummary,
  generalDataMeasurements,
  isGeneralDataValue,
  parseGeneralDataDraft,
  outcomeValidationError,
  replaceConflictingOutcome,
  sectionSearchText,
  whatHappenedPath,
} from "../src/medicalEncounter";

describe("medical encounter templates", () => {
  it("contains stable, arbitrary-depth taxonomy identifiers including laboratory groups", () => {
    expect(WHAT_HAPPENED_TREE.label).toBe("Что случилось");
    const laboratory = WHAT_HAPPENED_TREE.children?.find((node) => node.id === "problem")?.children
      ?.find((node) => node.id === "problem.laboratory");
    expect(laboratory?.children?.map((node) => node.id)).toEqual([
      "problem.laboratory.cbc",
      "problem.laboratory.biochemistry",
      "problem.laboratory.urine",
    ]);
    expect(whatHappenedPath("problem.laboratory.urine.10")).toContain("Есть кристаллы");
  });

  it("derives a readable summary while persisting stable IDs", () => {
    const summary = encounterSummary({
      text: "",
      sections: {
        "what-happened": {
          kind: "what-happened",
          templateVersion: "what-happened-v1",
          value: { selectedIds: ["problem.respiratory.2"], comment: "Три дня" },
          authorAccountId: "doctor-1",
          authorDisplayName: "Доктор",
          updatedAt: "2026-07-21T10:00:00.000Z",
        },
      },
    });
    expect(summary).toContain("Кашляет");
    expect(summary).toContain("Три дня");
  });

  it("defines, validates, and indexes the structured outcome template", () => {
    expect(OUTCOME_OPTIONS.map((option) => option.label)).toEqual([
      "Без наблюдения",
      "В стадии наблюдения",
      "В стадии обследования",
      "Выздоровление",
      "Улучшение",
      "Ухудшение",
      "Смерть",
    ]);
    const recoveryAndImprovement = {
      selectedIds: ["outcome.recovery", "outcome.improvement"],
      comment: "Контроль через неделю",
    };
    expect(outcomeValidationError(recoveryAndImprovement)).toBe("");
    expect(sectionSearchText(recoveryAndImprovement))
      .toBe("Выздоровление; Улучшение; Контроль через неделю");
    expect(outcomeValidationError({ selectedIds: [], comment: "" })).toContain("хотя бы один");
    expect(outcomeValidationError({ selectedIds: ["outcome.unknown"], comment: "" })).toContain("неизвестный");
    expect(outcomeValidationError({ selectedIds: ["outcome.recovery", "outcome.recovery"], comment: "" }))
      .toContain("повторяющийся");
    expect(outcomeValidationError({ selectedIds: ["outcome.death", "outcome.observation"], comment: "" }))
      .toContain("несовместимые");
  });

  it("replaces only outcome selections that conflict with the newly selected option", () => {
    expect(replaceConflictingOutcome(
      ["outcome.recovery", "outcome.improvement", "outcome.observation"],
      "outcome.deterioration",
    )).toEqual(["outcome.observation", "outcome.deterioration"]);
    expect(replaceConflictingOutcome(["outcome.observation", "outcome.examination"], "outcome.no-observation"))
      .toEqual(["outcome.no-observation"]);
    expect(replaceConflictingOutcome(["outcome.recovery", "outcome.improvement"], "outcome.death"))
      .toEqual(["outcome.death"]);
    expect(replaceConflictingOutcome(["outcome.death"], "outcome.recovery"))
      .toEqual(["outcome.recovery"]);
  });

  it("parses, validates, formats, and indexes structured general data", () => {
    const parsed = parseGeneralDataDraft({
      weightKg: "13.75",
      temperatureC: "38.6",
      heartRateBpm: "112",
      respiratoryRatePerMinute: "24",
      systolicMmHg: "120",
      diastolicMmHg: "80",
      meanMmHg: "93",
    });
    expect(parsed.errors).toEqual({});
    expect(parsed.value).toEqual({
      weightKg: 13.75,
      temperatureC: 38.6,
      heartRateBpm: 112,
      respiratoryRatePerMinute: 24,
      bloodPressure: { systolicMmHg: 120, diastolicMmHg: 80, meanMmHg: 93 },
    });
    expect(isGeneralDataValue(parsed.value)).toBe(true);
    expect(generalDataMeasurements(parsed.value!).map((item) => item.value)).toEqual([
      "13.75 кг",
      "38.6 °C",
      "112 уд/мин",
      "24 движ/мин",
      "120/80 сред. 93 мм рт. ст.",
    ]);
    expect(sectionSearchText(parsed.value)).toContain("АД 120/80 сред. 93");

    expect(parseGeneralDataDraft({
      weightKg: "",
      temperatureC: "",
      heartRateBpm: "",
      respiratoryRatePerMinute: "",
      systolicMmHg: "120",
      diastolicMmHg: "",
      meanMmHg: "",
    }).errors.bloodPressure).toContain("все три");
    expect(parseGeneralDataDraft({
      weightKg: "",
      temperatureC: "",
      heartRateBpm: "",
      respiratoryRatePerMinute: "",
      systolicMmHg: "100",
      diastolicMmHg: "80",
      meanMmHg: "110",
    }).errors.bloodPressure).toContain("диастолическое");
  });
});
