// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it } from "vitest";
import {
  WHAT_HAPPENED_TREE,
  OUTCOME_OPTIONS,
  calculateNextRevaccinationDate,
  diagnosisConfirmedSummary,
  diagnosisDraft,
  diagnosisLabel,
  diagnosisValidationError,
  emptyDiagnosisDraft,
  encounterSummary,
  generalDataMeasurements,
  isGeneralDataValue,
  isDiagnosisValue,
  isVaccinationValue,
  normalizeDiagnosisValue,
  parseGeneralDataDraft,
  parseDiagnosisDraft,
  parseVaccinationDraft,
  outcomeValidationError,
  replaceConflictingOutcome,
  sectionSearchText,
  vaccinationDetails,
  whatHappenedPath,
} from "../src/medicalEncounter";
import { DIAGNOSIS_CATALOG, DIAGNOSIS_CATALOG_OPTIONS } from "../src/repositories/types";

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

  it("indexes hierarchical and narrative instrumental results", () => {
    const tree = {
      studies: [{
        id: "123e4567-e89b-12d3-a456-426614174000",
        date: "2026-07-21",
        typeId: "instrumental.study.ultrasound-abdomen",
        typeName: "УЗИ органов брюшной полости",
        mode: "tree" as const,
        comment: "Контроль",
        findings: [{
          findingId: "instrumental.finding.ultrasound-abdomen.19",
          findingName: "Заключение",
          value: "Без патологии",
          children: [],
        }],
      }],
    };
    expect(sectionSearchText(tree)).toContain("УЗИ органов брюшной полости Контроль Заключение Без патологии");
    expect(sectionSearchText({ studies: [{
      ...tree.studies[0],
      typeId: "instrumental.study.xray-thorax-abdomen",
      typeName: "Рентген грудной и брюшной полости",
      mode: "narrative",
      result: "Очаговых изменений нет",
    }] })).toContain("Очаговых изменений нет");
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

  it("preserves the issue diagnosis categorization and stable option membership", () => {
    expect(DIAGNOSIS_CATALOG.map((group) => group.label)).toEqual([
      "Патологии общего состояния",
      "Желудочно-кишечный тракт",
      "Сердечно-сосудистая система",
      "Дыхательная система",
      "Патологии головы (ротовая полость, глаза, уши)",
      "Патологии кожи",
      "Мочеполовая система",
      "Опорно-двигательный аппарат",
      "Нервная система",
      "Инфекционные заболевания",
      "Гормональные заболевания",
    ]);
    expect(DIAGNOSIS_CATALOG.find((group) => group.id === "head")?.groups?.map((group) => group.label))
      .toEqual(["Ротовая полость", "Глаза", "Ушные проходы", "Нос"]);
    expect(DIAGNOSIS_CATALOG.find((group) => group.id === "infectious")?.groups?.map((group) => group.label))
      .toEqual(["Вирусные", "Бактериальные", "Паразитарные"]);
    expect(DIAGNOSIS_CATALOG_OPTIONS).toHaveLength(392);
    expect(new Set(DIAGNOSIS_CATALOG_OPTIONS.map((option) => option.id)).size).toBe(392);
    expect(DIAGNOSIS_CATALOG_OPTIONS).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "diagnosis.general.001", label: "Шок гиповолемический" }),
      expect.objectContaining({ label: "Вестибулярный синдром периферический" }),
      expect.objectContaining({ label: "Вестибулярный синдром центральный" }),
      expect.objectContaining({ id: "diagnosis.infectious.viral.009", label: "Коронавирусный энтерит" }),
    ]));
  });

  it("parses and validates catalog and free-form diagnosis values", () => {
    const draft = emptyDiagnosisDraft();
    draft.preliminaryMode = "custom";
    draft.preliminaryCustomText = "  Подозрение на гастрит  ";
    draft.differentialSelectedIds = ["diagnosis.digestive.001", "diagnosis.digestive.002"];
    draft.differentialCustomTexts = ["  Реакция на корм  ", "Непереносимость препарата"];
    draft.confirmedMode = "custom";
    draft.confirmedCustomText = "  Подтверждено исследованием  ";
    const parsed = parseDiagnosisDraft(draft);
    expect(parsed.errors).toEqual({});
    expect(parsed.value).toEqual({
      preliminary: { customText: "Подозрение на гастрит" },
      differential: {
        selectedIds: ["diagnosis.digestive.001", "diagnosis.digestive.002"],
        customTexts: ["Реакция на корм", "Непереносимость препарата"],
      },
      confirmed: { customText: "Подтверждено исследованием" },
    });
    expect(diagnosisValidationError(parsed.value)).toBe("");
    expect(diagnosisConfirmedSummary(parsed.value)).toBe("Подтверждено исследованием");
    expect(sectionSearchText(parsed.value)).toContain("Стоматит");
    expect(sectionSearchText(parsed.value)).toContain("Реакция на корм");

    expect(parseDiagnosisDraft(emptyDiagnosisDraft()).errors.section).toContain("хотя бы один");
    const preliminaryOnly = emptyDiagnosisDraft();
    preliminaryOnly.preliminaryMode = "custom";
    preliminaryOnly.preliminaryCustomText = "Предварительный";
    expect(parseDiagnosisDraft(preliminaryOnly)).toMatchObject({
      errors: {},
      value: { preliminary: { customText: "Предварительный" }, confirmed: { customText: "" } },
    });
    const differentialOnly = emptyDiagnosisDraft();
    differentialOnly.differentialSelectedIds = ["diagnosis.digestive.001"];
    expect(parseDiagnosisDraft(differentialOnly)).toMatchObject({
      errors: {},
      value: { differential: { selectedIds: ["diagnosis.digestive.001"] }, confirmed: { customText: "" } },
    });
    const confirmedOnly = emptyDiagnosisDraft();
    confirmedOnly.confirmedMode = "custom";
    confirmedOnly.confirmedCustomText = "Подтверждённый";
    expect(parseDiagnosisDraft(confirmedOnly)).toMatchObject({
      errors: {},
      value: { preliminary: { customText: "" }, confirmed: { customText: "Подтверждённый" } },
    });
    expect(diagnosisValidationError(parseDiagnosisDraft(preliminaryOnly).value)).toBe("");
    expect(diagnosisValidationError({
      preliminary: { customText: "" },
      differential: { selectedIds: [], customTexts: [] },
      confirmed: { customText: "" },
    })).toContain("хотя бы один");
    expect(diagnosisValidationError({
      ...parsed.value,
      confirmed: { selectedId: "diagnosis.digestive.001", customText: "Стоматит" },
    })).toContain("справочника");
    expect(diagnosisValidationError({
      ...parsed.value,
      differential: { selectedIds: ["diagnosis.unknown.001"], customTexts: [] },
    })).toContain("неизвестный");
  });

  it("rejects malformed diagnosis variants and normalizes valid values", () => {
    const valid = {
      preliminary: { customText: "" },
      differential: { selectedIds: [], customText: "" },
      confirmed: { customText: "Подтверждено" },
    };
    const tooLong = "д".repeat(10_001);

    expect(diagnosisValidationError(null)).toContain("Заполните раздел");
    expect(diagnosisValidationError({ ...valid, preliminary: { selectedId: 42, customText: "" } }))
      .toContain("некорректный");
    expect(diagnosisValidationError({ ...valid, preliminary: {} })).toContain("Укажите диагноз");
    expect(diagnosisValidationError({ ...valid, preliminary: { selectedId: "diagnosis.unknown", customText: "" } }))
      .toContain("неизвестный");
    expect(diagnosisValidationError({ ...valid, preliminary: { customText: tooLong } })).toContain("10 000");
    expect(diagnosisValidationError({ ...valid, differential: null })).toContain("дифференциальные");
    expect(diagnosisValidationError({ ...valid, differential: { selectedIds: [], customText: 42 } }))
      .toContain("дифференциальные");
    expect(diagnosisValidationError({ ...valid, differential: { selectedIds: [], customText: "", customTexts: [] } }))
      .toContain("дифференциальные");
    expect(diagnosisValidationError({
      ...valid,
      differential: { selectedIds: ["diagnosis.digestive.001", "diagnosis.digestive.001"], customText: "" },
    })).toContain("повторяться");
    expect(diagnosisValidationError({
      ...valid,
      differential: { selectedIds: ["diagnosis.digestive.001"], customText: "Свободный текст" },
    })).toContain("справочника");
    expect(diagnosisValidationError({ ...valid, differential: { selectedIds: [], customText: tooLong } }))
      .toContain("10 000");
    expect(diagnosisValidationError({
      ...valid,
      differential: { selectedIds: ["diagnosis.digestive.001"], customTexts: ["Свободный текст"] },
    })).toBe("");
    expect(diagnosisValidationError({ ...valid, differential: { selectedIds: [], customTexts: ["", "Диагноз"] } }))
      .toContain("пустыми");
    expect(diagnosisValidationError({ ...valid, differential: { selectedIds: [], customTexts: ["Диагноз", "Диагноз"] } }))
      .toContain("повторяться");
    expect(diagnosisValidationError({ ...valid, differential: { selectedIds: [], customTexts: [tooLong] } }))
      .toContain("10 000");
    expect(isDiagnosisValue(valid)).toBe(true);
    expect(diagnosisLabel("diagnosis.unknown")).toBe("diagnosis.unknown");

    const normalized = normalizeDiagnosisValue({
      preliminary: { customText: "  Предварительный  " },
      differential: { selectedIds: [], customText: "  Дифференциальный  " },
      confirmed: { customText: "  Подтверждённый  " },
    });
    expect(normalized).toEqual({
      preliminary: { customText: "Предварительный" },
      differential: { selectedIds: [], customTexts: ["Дифференциальный"] },
      confirmed: { customText: "Подтверждённый" },
    });
    expect(diagnosisDraft(normalized)).toMatchObject({
      preliminaryMode: "custom",
      differentialCustomTexts: ["Дифференциальный"],
      confirmedMode: "custom",
    });

    const catalogDraft = emptyDiagnosisDraft();
    catalogDraft.preliminarySelectedId = "diagnosis.digestive.001";
    catalogDraft.differentialSelectedIds = ["diagnosis.digestive.002"];
    catalogDraft.confirmedSelectedId = "diagnosis.digestive.003";
    expect(diagnosisDraft(parseDiagnosisDraft(catalogDraft).value!)).toMatchObject({
      preliminaryMode: "catalog",
      differentialCustomTexts: [],
      confirmedMode: "catalog",
    });
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

  it("parses, validates, formats, and indexes vaccination and chipping", () => {
    const parsed = parseVaccinationDraft({
      previousVaccinationDate: "2025-08-04",
      previousVaccineName: " Рабикан ",
      previousVaccinationComplications: "no",
      currentVaccineName: " Мультикан-8 ",
      currentVaccineBatch: " AB-123 ",
      currentVaccineExpiresOn: "2027-12-31",
      chipNumber: " 643094100000001 ",
      administrationSite: " Холка ",
      nextRevaccinationDate: "2028-08-04",
    });

    expect(parsed.errors).toEqual({});
    expect(parsed.value).toEqual({
      previousVaccinationDate: "2025-08-04",
      previousVaccineName: "Рабикан",
      previousVaccinationComplications: false,
      currentVaccineName: "Мультикан-8",
      currentVaccineBatch: "AB-123",
      currentVaccineExpiresOn: "2027-12-31",
      chipNumber: "643094100000001",
      administrationSite: "Холка",
      nextRevaccinationDate: "2028-08-04",
    });
    expect(isVaccinationValue(parsed.value)).toBe(true);
    expect(vaccinationDetails(parsed.value!).map((item) => item.value)).toEqual([
      "04.08.2025",
      "Рабикан",
      "Не было",
      "Мультикан-8",
      "AB-123",
      "31.12.2027",
      "643094100000001",
      "Холка",
      "04.08.2028",
    ]);
    expect(sectionSearchText(parsed.value)).toContain("Номер чипа 643094100000001");

    expect(parseVaccinationDraft({
      previousVaccinationDate: "",
      previousVaccineName: "",
      previousVaccinationComplications: "",
      currentVaccineName: "",
      currentVaccineBatch: "",
      currentVaccineExpiresOn: "",
      chipNumber: "643094100000002",
      administrationSite: "",
      nextRevaccinationDate: "",
    }).value).toEqual({ chipNumber: "643094100000002" });
    expect(parseVaccinationDraft({
      previousVaccinationDate: "",
      previousVaccineName: "",
      previousVaccinationComplications: "",
      currentVaccineName: "Мультикан-8",
      currentVaccineBatch: "",
      currentVaccineExpiresOn: "",
      chipNumber: "643094100000002",
      administrationSite: "",
      nextRevaccinationDate: "",
    }).errors).toMatchObject({ currentVaccineBatch: expect.any(String), currentVaccineExpiresOn: expect.any(String) });
    expect(parseVaccinationDraft({
      previousVaccinationDate: "2026-02-30",
      previousVaccineName: "",
      previousVaccinationComplications: "",
      currentVaccineName: "",
      currentVaccineBatch: "",
      currentVaccineExpiresOn: "",
      chipNumber: "",
      administrationSite: "",
      nextRevaccinationDate: "",
    }).errors).toMatchObject({ previousVaccinationDate: expect.any(String), section: expect.any(String) });
  });

  it("calculates the next revaccination date from the encounter date", () => {
    expect(calculateNextRevaccinationDate("2026-01-31", "days-14")).toBe("2026-02-14");
    expect(calculateNextRevaccinationDate("2026-01-31", "month-1")).toBe("2026-02-28");
    expect(calculateNextRevaccinationDate("2026-01-31", "months-4")).toBe("2026-05-31");
    expect(calculateNextRevaccinationDate("2026-01-31", "months-6")).toBe("2026-07-31");
    expect(calculateNextRevaccinationDate("2026-01-31", "months-12")).toBe("2027-01-31");
    expect(calculateNextRevaccinationDate("2026-05-01", "next-birthday", "2022-06-17")).toBe("2026-06-17");
    expect(calculateNextRevaccinationDate("2026-07-21", "next-birthday", "2022-06-17")).toBe("2027-06-17");
    expect(calculateNextRevaccinationDate("2026-07-21", "next-birthday")).toBe("");
    expect(calculateNextRevaccinationDate("invalid", "days-14")).toBe("");
  });
});
