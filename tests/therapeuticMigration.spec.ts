// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import {
  isKnownTherapeuticV2OptionId,
  isTherapeuticAppointmentV2Value as isContractTherapeuticV2Value,
  migrateTherapeuticAppointmentValue as migrateContractTherapeuticValue,
  type TherapeuticAppointmentSectionValue,
} from "../packages/contracts/src/therapeutic";
import TherapeuticAppointmentView from "../src/components/TherapeuticAppointmentView.vue";
import {
  DISEASE_ANAMNESIS_CATEGORIES,
  EXAMINATION_CATEGORIES,
  LIFE_ANAMNESIS_CATEGORIES,
  migrateTherapeuticAppointmentValue,
  therapeuticSelectionGroups,
} from "../src/therapeuticAppointment";

function contractValue(): TherapeuticAppointmentSectionValue {
  return {
    schemaVersion: 2,
    diseaseAnamnesis: { text: "", problems: [], selectedIds: [] },
    lifeAnamnesis: {
      text: "",
      selectedIds: [],
      ectoparasiteName: "",
      dewormingName: "",
      naturalDietProducts: "",
      commercialFoodName: "",
      diseaseName: "",
      currentMedications: "",
      allergies: "",
    },
    examination: { text: "", selectedIds: [], coatComment: "", locomotionComment: "" },
    recommendations: "Контроль",
    prescriptions: "",
    migrationNotes: [],
  };
}

describe("therapeutic appointment shared v2 contract", () => {
  it("migrates every supported legacy field through the shared contract", () => {
    const knownOptionIds = new Set([
      "problem.onset.today",
      "problem.frequency.once",
      "problem.therapy.yes",
      "problem.medication.used",
      "problem.medication.type.analgesic",
      "problem.dynamics.improved",
      "disease.vomiting.state.present",
      "disease.vomiting.contents.foamy",
      "life.housing.place.apartment",
      "exam.coat.changes.hypotrichosis",
      "exam.coat.hypotrichosis.distribution.local",
      "exam.coat.hypotrichosis.number.single",
    ]);
    const migrated = migrateContractTherapeuticValue({
      diseaseAnamnesis: {
        text: "Со слов владельца",
        problems: [{
          id: "problem-1",
          sourceWhatHappenedId: "problem.digestive.7",
          title: "Рвота",
          description: "После еды",
          onsetId: "problem.onset.today",
          frequencyId: "problem.frequency.once",
          priorTherapyId: "problem.therapy.yes",
          medicationUseId: "problem.medication.used",
          medicationIds: ["problem.medication.type.analgesic", "problem.medication.type.removed"],
          medicationName: "Препарат",
          medicationDynamicsId: "problem.dynamics.improved",
        }],
        selectedIds: ["disease.vomiting.state.present", "disease.vomiting.foam.foamy", "disease.removed.option"],
      },
      lifeAnamnesis: {
        text: "Домашнее содержание",
        selectedIds: ["life.housing.place.apartment", "life.removed.option"],
        ectoparasiteName: "Капли",
        dewormingName: "Таблетки",
        naturalDietProducts: "Мясо",
        commercialFoodName: "Корм",
        diseaseName: "Нет",
        currentMedications: "Нет",
        allergies: "Нет",
      },
      examination: {
        text: "Осмотр",
        selectedIds: [
          "exam.coat.changes.hypotrichosis",
          "exam.coat.distribution.local",
          "exam.coat.number.single",
          "exam.locomotion.state.changed",
          "exam.lymph.state.multifocal",
        ],
        coatComment: "Очаг на боку",
        locomotionComment: "Без особенностей",
      },
      recommendations: "Контроль",
      prescriptions: "Лечение",
      migrationNotes: ["Предыдущая заметка", "Предыдущая заметка"],
    }, {
      knownOptionIds,
      optionLabel: (id) => `Метка ${id}`,
    });

    expect(migrated).toMatchObject({
      schemaVersion: 2,
      diseaseAnamnesis: {
        text: "Со слов владельца",
        problems: [{
          id: "problem-1",
          sourceWhatHappenedId: "problem.digestive.7",
          title: "Рвота",
          description: "После еды",
          onsetId: "problem.onset.today",
          frequencyId: "problem.frequency.once",
          priorTherapyId: "problem.therapy.yes",
          medicationUseId: "problem.medication.used",
          medicationIds: ["problem.medication.type.analgesic"],
          medicationName: "Препарат",
          medicationDynamicsId: "problem.dynamics.improved",
        }],
        selectedIds: ["disease.vomiting.state.present", "disease.vomiting.contents.foamy"],
      },
      lifeAnamnesis: {
        selectedIds: ["life.housing.place.apartment"],
        ectoparasiteName: "Капли",
        dewormingName: "Таблетки",
        naturalDietProducts: "Мясо",
        commercialFoodName: "Корм",
        diseaseName: "Нет",
      },
      examination: {
        selectedIds: [
          "exam.coat.changes.hypotrichosis",
          "exam.coat.hypotrichosis.distribution.local",
          "exam.coat.hypotrichosis.number.single",
        ],
        coatComment: "Очаг на боку",
        locomotionComment: "Без особенностей",
      },
    });
    expect(migrated.migrationNotes).toEqual(expect.arrayContaining([
      "Предыдущая заметка",
      "Проблема 1: Метка problem.medication.type.removed",
      "Анамнез болезни: Метка disease.removed.option",
      "Анамнез жизни: Метка life.removed.option",
      "ПЛУ: Увеличены мультифокально",
    ]));
  });

  it("handles free text, ambiguous coat details, and unreadable legacy payloads", () => {
    expect(migrateContractTherapeuticValue({ text: "Старый текст" }).diseaseAnamnesis.text).toBe("Старый текст");
    expect(migrateContractTherapeuticValue({
      examination: {
        selectedIds: [
          "exam.coat.changes.hypotrichosis",
          "exam.coat.changes.alopecia",
          "exam.coat.distribution.diffuse",
        ],
      },
    }).migrationNotes).toContain("Шерсть (ветвь не определена): exam.coat.distribution.diffuse");

    const unrecognized = { legacyNarrative: "Неизвестные данные", toJSON: () => { throw new Error("unreadable"); } };
    expect(migrateContractTherapeuticValue(unrecognized).migrationNotes).toEqual([
      "Ошибка миграции: исходные данные не распознаны",
    ]);
    expect(migrateContractTherapeuticValue({ legacy: 1 }).migrationNotes[0]).toContain('{"legacy":1}');
  });

  it("recognizes v2 question namespaces and validates a complete problem hierarchy", () => {
    expect(isKnownTherapeuticV2OptionId("disease.activity.state.changed")).toBe(true);
    expect(isKnownTherapeuticV2OptionId("problem.onset.today")).toBe(true);
    expect(isKnownTherapeuticV2OptionId("legacy.activity.state.changed")).toBe(false);

    const value = contractValue();
    value.diseaseAnamnesis.problems = [{
      id: "problem-1",
      sourceWhatHappenedId: "problem.digestive.7",
      title: "",
      description: "Рвота после еды",
      onsetId: "problem.onset.today",
      frequencyId: "problem.frequency.once",
      priorTherapyId: "problem.therapy.yes",
      medicationUseId: "problem.medication.used",
      medicationIds: ["problem.medication.type.analgesic"],
      medicationName: "Препарат",
      medicationDynamicsId: "problem.dynamics.improved",
    }];
    expect(isContractTherapeuticV2Value(value)).toBe(true);
  });

  it("rejects malformed selections and incompatible combinations", () => {
    const base = contractValue();
    const cases: unknown[] = [
      null,
      { ...base, schemaVersion: 1 },
      { ...base, diseaseAnamnesis: { ...base.diseaseAnamnesis, selectedIds: "bad" } },
      { ...base, diseaseAnamnesis: { ...base.diseaseAnamnesis, selectedIds: [1] } },
      { ...base, diseaseAnamnesis: { ...base.diseaseAnamnesis, selectedIds: ["disease.activity.state.changed", "disease.activity.state.changed"] } },
      { ...base, diseaseAnamnesis: { ...base.diseaseAnamnesis, selectedIds: ["life.housing.place.house"] } },
      { ...base, diseaseAnamnesis: { ...base.diseaseAnamnesis, selectedIds: ["disease.removed.option"] } },
      { ...base, diseaseAnamnesis: { ...base.diseaseAnamnesis, selectedIds: ["disease.activity.state.changed", "disease.activity.state.unchanged"] } },
      { ...base, diseaseAnamnesis: { ...base.diseaseAnamnesis, selectedIds: ["disease.activity.change.lethargic"] } },
      { ...base, diseaseAnamnesis: { ...base.diseaseAnamnesis, selectedIds: ["disease.vomiting.state.present", "disease.vomiting.contents.foamy", "disease.vomiting.contents.not-foamy"] } },
      { ...base, lifeAnamnesis: { ...base.lifeAnamnesis, selectedIds: ["life.travel.places.nowhere", "life.travel.places.dacha"] } },
      { ...base, examination: { ...base.examination, selectedIds: ["exam.locomotion.state.normal", "exam.locomotion.findings.pain"] } },
    ];
    for (const value of cases) expect(isContractTherapeuticV2Value(value)).toBe(false);

    const validMultiple = contractValue();
    validMultiple.diseaseAnamnesis.selectedIds = [
      "disease.urination.state.changed",
      "disease.urination.change.dysuria",
      "disease.urination.change.pollakiuria",
    ];
    expect(isContractTherapeuticV2Value(validMultiple)).toBe(true);
  });

  it("rejects malformed problem branches, identifiers, and late section fields", () => {
    const invalidProblems: unknown[] = [
      { id: "", title: "", description: "Данные", medicationIds: [] },
      { id: "problem-1", title: "", description: "Данные", medicationIds: ["problem.onset.today"] },
      { id: "problem-1", title: "", description: "Данные", medicationIds: [], sourceWhatHappenedId: 1 },
      { id: "problem-1", title: "", description: "Данные", medicationIds: [], onsetId: "problem.frequency.once" },
      { id: "problem-1", title: "", description: "Данные", medicationIds: ["problem.medication.type.other"], priorTherapyId: "problem.therapy.none", medicationUseId: "problem.medication.used" },
      { id: "problem-1", title: "", description: "Данные", medicationIds: [], medicationUseId: "problem.medication.used" },
      { id: "problem-1", title: "", description: "Данные", medicationIds: ["problem.medication.type.other"], priorTherapyId: "problem.therapy.yes", medicationUseId: "problem.medication.none" },
      { id: "problem-1", title: "", description: "Данные", medicationIds: ["problem.medication.type.other"], priorTherapyId: "problem.therapy.yes" },
    ];
    for (const problem of invalidProblems) {
      const value = contractValue();
      value.diseaseAnamnesis.problems = [problem as never];
      expect(isContractTherapeuticV2Value(value)).toBe(false);
    }

    const duplicateIds = contractValue();
    duplicateIds.diseaseAnamnesis.problems = [
      { id: "same", title: "Первая", description: "", medicationIds: [] },
      { id: "same", title: "Вторая", description: "", medicationIds: [] },
    ];
    expect(isContractTherapeuticV2Value(duplicateIds)).toBe(false);

    for (const value of [
      { ...contractValue(), lifeAnamnesis: { ...contractValue().lifeAnamnesis, allergies: 1 } },
      { ...contractValue(), examination: { ...contractValue().examination, coatComment: 1 } },
      { ...contractValue(), recommendations: 1 },
      { ...contractValue(), prescriptions: 1 },
      { ...contractValue(), migrationNotes: [1] },
    ]) expect(isContractTherapeuticV2Value(value)).toBe(false);

    const empty = contractValue();
    empty.recommendations = "";
    expect(isContractTherapeuticV2Value(empty)).toBe(false);
  });
});

describe("therapeutic appointment v2 migration", () => {
  it("migrates free text without keeping a legacy rendering path", () => {
    const migrated = migrateTherapeuticAppointmentValue({ text: "Старое описание приёма" });

    expect(migrated).toMatchObject({
      schemaVersion: 2,
      diseaseAnamnesis: { text: "Старое описание приёма", problems: [], selectedIds: [] },
      migrationNotes: [],
    });
    expect(migrateTherapeuticAppointmentValue(migrated)).toEqual(migrated);
  });

  it("deterministically migrates changed v1 options and preserves uncertain data as notes", () => {
    const migrated = migrateTherapeuticAppointmentValue({
      diseaseAnamnesis: {
        text: "Со слов владельца",
        problems: [{
          id: "problem-1",
          sourceWhatHappenedId: "problem.digestive.7",
          title: "Рвота",
          onsetId: "problem.onset.today",
          frequencyId: "problem.frequency.unknown",
          medicationIds: ["problem.medication.type.analgesic", "problem.medication.type.unknown"],
        }],
        selectedIds: [
          "disease.urination.state.changed",
          "disease.urination.change.dysuria",
          "disease.vomiting.state.present",
          "disease.vomiting.foam.foamy",
          "disease.unknown.option",
        ],
      },
      lifeAnamnesis: {
        text: "",
        selectedIds: ["life.housing.place.apartment"],
        currentMedications: "Нет",
        allergies: "Не выявлены",
      },
      examination: {
        text: "",
        selectedIds: [
          "exam.lymph.state.multifocal",
          "exam.coat.changes.hypotrichosis",
          "exam.coat.changes.alopecia",
          "exam.coat.distribution.local",
          "exam.coat.number.multiple",
          "exam.locomotion.state.changed",
          "exam.locomotion.findings.ataxia",
        ],
      },
      recommendations: "Контроль",
      prescriptions: "",
    });

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.diseaseAnamnesis.problems[0]).toMatchObject({
      id: "problem-1",
      sourceWhatHappenedId: "problem.digestive.7",
      title: "Рвота",
      description: "",
      onsetId: "problem.onset.today",
      medicationIds: ["problem.medication.type.analgesic"],
    });
    expect(migrated.diseaseAnamnesis.problems[0]?.frequencyId).toBeUndefined();
    expect(migrated.diseaseAnamnesis.selectedIds).toEqual([
      "disease.urination.state.changed",
      "disease.urination.change.dysuria",
      "disease.vomiting.state.present",
      "disease.vomiting.contents.foamy",
    ]);
    expect(migrated.examination.selectedIds).toEqual([
      "exam.coat.changes.hypotrichosis",
      "exam.coat.changes.alopecia",
      "exam.locomotion.findings.ataxia",
    ]);
    expect(migrated.migrationNotes).toEqual(expect.arrayContaining([
      "Проблема 1: problem.frequency.unknown",
      "Проблема 1: problem.medication.type.unknown",
      "Анамнез болезни: disease.unknown.option",
      "ПЛУ: Увеличены мультифокально",
    ]));
    expect(migrated.migrationNotes.some((note) => note.startsWith("Шерсть (ветвь не определена):"))).toBe(true);
    expect(migrateTherapeuticAppointmentValue(migrated)).toEqual(migrated);
  });

  it("assigns shared v1 coat details only when their branch is unambiguous", () => {
    const migrated = migrateTherapeuticAppointmentValue({
      examination: {
        selectedIds: [
          "exam.coat.changes.hypotrichosis",
          "exam.coat.distribution.local",
          "exam.coat.number.single",
        ],
      },
    });

    expect(migrated.examination.selectedIds).toEqual([
      "exam.coat.changes.hypotrichosis",
      "exam.coat.hypotrichosis.distribution.local",
      "exam.coat.hypotrichosis.number.single",
    ]);
    expect(migrated.migrationNotes).toEqual([]);

    const alopecia = migrateTherapeuticAppointmentValue({
      examination: {
        selectedIds: [
          "exam.coat.changes.alopecia",
          "exam.coat.distribution.diffuse",
        ],
      },
    });
    expect(alopecia.examination.selectedIds).toEqual([
      "exam.coat.changes.alopecia",
      "exam.coat.alopecia.distribution.diffuse",
    ]);
  });

  it("turns an unrecognized populated payload into an explicit migration error", () => {
    const migrated = migrateTherapeuticAppointmentValue({ legacyNarrative: "Данные пациента" });

    expect(migrated.migrationNotes).toHaveLength(1);
    expect(migrated.migrationNotes[0]).toContain("Ошибка миграции");
    expect(migrated.migrationNotes[0]).toContain("Данные пациента");
  });
});

describe("therapeutic appointment v2 read-only labels", () => {
  it("uses the approved auscultation wording in the catalog and rendered history", () => {
    const chest = EXAMINATION_CATEGORIES.find((category) => category.id === "exam.chest")!;
    const auscultation = chest.questions.find((question) => question.id === "exam.chest.lung-breathing")!;
    expect(auscultation.label).toBe("При аускультации");
    expect(auscultation.readOnlyLabel).toBe("При аускультации");
    expect(JSON.stringify(EXAMINATION_CATEGORIES)).not.toMatch(/Дыхание в л[её]гких/i);

    const migrated = migrateTherapeuticAppointmentValue({
      examination: { selectedIds: ["exam.chest.lung-breathing.vesicular-soft-all"] },
    });
    const wrapper = mount(TherapeuticAppointmentView, { props: { value: migrated } });
    expect(wrapper.text()).toContain("При аускультации: Везикулярное мягкое по всем полям");
    expect(wrapper.text()).not.toMatch(/Дыхание в л[её]гких/i);
  });

  it("shows green labels and suppresses gray service labels", () => {
    const diseaseGroups = therapeuticSelectionGroups([
      "disease.activity.state.changed",
      "disease.activity.change.lethargic",
      "disease.urine.state.changed",
      "disease.urine.volume.increased",
    ], DISEASE_ANAMNESIS_CATEGORIES);
    const activity = diseaseGroups.find((group) => group.key === "disease.activity")!;
    const urine = diseaseGroups.find((group) => group.key === "disease.urine")!;

    expect(activity.details.map((detail) => detail.label)).toEqual(["", ""]);
    expect(urine.details.map((detail) => detail.label)).toEqual(["", "Общесуточный объём"]);
  });

  it("honors the green-or-gray read-only marker for every catalog question", () => {
    for (const categories of [DISEASE_ANAMNESIS_CATEGORIES, LIFE_ANAMNESIS_CATEGORIES, EXAMINATION_CATEGORIES]) {
      const selectedIds = categories.flatMap((category) => category.questions.flatMap((question) => (
        question.options[0] ? [question.options[0].id] : []
      )));
      const details = new Map(therapeuticSelectionGroups(selectedIds, categories)
        .flatMap((group) => group.details.map((detail) => [detail.key, detail.label] as const)));
      for (const question of categories.flatMap((category) => category.questions)) {
        expect(details.get(question.id), question.id).toBe(question.readOnlyLabel ?? "");
      }
    }
  });
});
