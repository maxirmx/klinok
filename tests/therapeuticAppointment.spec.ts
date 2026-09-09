// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { THERAPEUTIC_V2_MULTIPLE_QUESTION_IDS, THERAPEUTIC_V2_QUESTION_IDS } from "@klinok/contracts";
import {
  DISEASE_ANAMNESIS_CATEGORIES,
  EXAMINATION_CATEGORIES,
  LIFE_ANAMNESIS_CATEGORIES,
  PROBLEM_FREQUENCY_OPTIONS,
  PROBLEM_DYNAMICS_OPTIONS,
  PROBLEM_MEDICATION_OPTIONS,
  PROBLEM_MEDICATION_USE_OPTIONS,
  PROBLEM_ONSET_OPTIONS,
  PROBLEM_THERAPY_OPTIONS,
  THERAPEUTIC_TABS,
  emptyTherapeuticAppointmentDraft,
  isTherapeuticAppointmentValue,
  parseTherapeuticAppointmentDraft,
  pruneTherapeuticSelections,
  therapeuticAppointmentSearchText,
  therapeuticCatalogDiagnostics,
  therapeuticOptionLabel,
  therapeuticSelectionDetails,
  therapeuticSelectionGroups,
  toggleTherapeuticMultipleSelection,
} from "../src/therapeuticAppointment";

describe("therapeutic appointment template", () => {
  it("defines five tabs and a catalog with unique, resolvable dependencies", () => {
    expect(THERAPEUTIC_TABS.map((tab) => tab.label)).toEqual([
      "Анамнез болезни",
      "Анамнез жизни",
      "Осмотр",
      "Рекомендации",
      "Назначения",
    ]);
    const diagnostics = therapeuticCatalogDiagnostics();
    expect(new Set(diagnostics.questionIds).size).toBe(diagnostics.questionIds.length);
    expect(new Set(diagnostics.optionIds).size).toBe(diagnostics.optionIds.length);
    expect(diagnostics.dependencyIds.every((id) => diagnostics.optionIds.includes(id))).toBe(true);
    expect(diagnostics.questionIds).toEqual(THERAPEUTIC_V2_QUESTION_IDS);
    expect([
      ...DISEASE_ANAMNESIS_CATEGORIES,
      ...LIFE_ANAMNESIS_CATEGORIES,
      ...EXAMINATION_CATEGORIES,
    ].flatMap((category) => category.questions.filter((question) => question.mode === "multiple")
      .map((question) => question.id))).toEqual(THERAPEUTIC_V2_MULTIPLE_QUESTION_IDS);
    expect(DISEASE_ANAMNESIS_CATEGORIES.map((category) => category.label)).toContain("Рвота");
    expect(LIFE_ANAMNESIS_CATEGORIES.map((category) => category.label)).toContain("Дегельминтизация");
    expect(LIFE_ANAMNESIS_CATEGORIES.map((category) => category.label)).toContain("Другие животные");
    expect(EXAMINATION_CATEGORIES.map((category) => category.label)).toContain("Грудная полость");
    expect(PROBLEM_ONSET_OPTIONS).toHaveLength(30);
    expect(PROBLEM_FREQUENCY_OPTIONS).toHaveLength(23);
    expect(PROBLEM_MEDICATION_OPTIONS).toHaveLength(9);
    expect(therapeuticOptionLabel("disease.urination.change.stranguria"))
      .toBe("Непродуктивное, по каплям (странгурия)");
    expect(therapeuticOptionLabel("exam.eyes.pupil.anisocoria"))
      .toBe("Разного размера (анизокория)");
  });

  it("matches the complete ordered v2 catalog snapshot", () => {
    const snapshot = JSON.stringify({
      tabs: THERAPEUTIC_TABS,
      problem: {
        onset: PROBLEM_ONSET_OPTIONS,
        frequency: PROBLEM_FREQUENCY_OPTIONS,
        therapy: PROBLEM_THERAPY_OPTIONS,
        medicationUse: PROBLEM_MEDICATION_USE_OPTIONS,
        medication: PROBLEM_MEDICATION_OPTIONS,
        dynamics: PROBLEM_DYNAMICS_OPTIONS,
      },
      disease: DISEASE_ANAMNESIS_CATEGORIES,
      life: LIFE_ANAMNESIS_CATEGORIES,
      examination: EXAMINATION_CATEGORIES,
    });
    expect(createHash("sha256").update(snapshot).digest("hex"))
      .toBe("516fef7a7b27eb126fc941df0611930d83fc325b4bcf797ae8747ee049392075");
  });

  it("matches every v2 catalog change called out by the domain template", () => {
    const categories = [...DISEASE_ANAMNESIS_CATEGORIES, ...LIFE_ANAMNESIS_CATEGORIES, ...EXAMINATION_CATEGORIES];
    const questions = new Map(categories.flatMap((category) => category.questions.map((item) => [item.id, item])));
    const textFields = new Map(categories.flatMap((category) => (category.textFields ?? []).map((item) => [item.id, item])));
    const options = new Set([...questions.values()].flatMap((question) => question.options.map((option) => option.id)));

    expect(questions.get("disease.urination.change")?.mode).toBe("multiple");
    expect(questions.get("disease.vomiting.rare-count")?.options.map((option) => option.label)).toEqual([
      "1–2 раза в сутки", "1 раз в 2–3 суток", "1 раз в неделю", "1–2 раза в месяц",
    ]);
    expect(questions.get("disease.vomiting.contents")?.options.slice(0, 2).map((option) => option.label))
      .toEqual(["Пенистые", "Не пенистые"]);
    expect(questions.has("disease.vomiting.foam")).toBe(false);
    expect(options).toContain("exam.oral.findings.petechiae");
    expect(options).toContain("exam.ear.skin.mass");
    expect(questions.get("exam.ear.filling")?.label).toBe("Чем/как заполнен канал");
    expect(options).toContain("exam.abdomen.findings.foreign");
    expect(options).not.toContain("exam.lymph.state.multifocal");
    expect(options).not.toContain("exam.locomotion.state.changed");
    expect(questions.get("exam.locomotion.findings")?.visibleWhenAny).toBeUndefined();
    expect(questions.get("exam.coat.hypotrichosis.distribution")?.visibleWhenAny)
      .toEqual(["exam.coat.changes.hypotrichosis"]);
    expect(questions.get("exam.coat.alopecia.distribution")?.visibleWhenAny)
      .toEqual(["exam.coat.changes.alopecia"]);
    expect([...textFields.keys()]).toEqual(expect.arrayContaining([
      "life.ectoparasites.name",
      "life.deworming.name",
      "life.diet.natural-products",
      "life.diet.commercial-name",
      "life.diseases.name",
      "exam.coat.comment",
      "exam.locomotion.comment",
    ]));
  });

  it("rejects an empty section but accepts and normalizes text-only content", () => {
    expect(parseTherapeuticAppointmentDraft(emptyTherapeuticAppointmentDraft()).errors.section)
      .toContain("хотя бы один");

    const draft = emptyTherapeuticAppointmentDraft();
    draft.recommendations = "  Контроль через неделю  ";
    const parsed = parseTherapeuticAppointmentDraft(draft);
    expect(parsed.errors).toEqual({});
    expect(parsed.value?.recommendations).toBe("Контроль через неделю");
    expect(isTherapeuticAppointmentValue(parsed.value)).toBe(true);
  });

  it("keeps problem fields optional while validating medication dependencies", () => {
    const optionalMedicationDetails = emptyTherapeuticAppointmentDraft();
    optionalMedicationDetails.diseaseAnamnesis.problems.push({
      id: "problem-1",
      title: "Рвота",
      description: "",
      priorTherapyId: "problem.therapy.performed",
      medicationUseId: "problem.medication.used",
      medicationIds: ["problem.medication.type.analgesic"],
    });
    expect(parseTherapeuticAppointmentDraft(optionalMedicationDetails).errors).toEqual({});

    const valid = emptyTherapeuticAppointmentDraft();
    valid.diseaseAnamnesis.problems.push({
      id: "problem-1",
      sourceWhatHappenedId: "problem.digestive.7",
      title: " Рвота ",
      description: " После еды ",
      onsetId: "problem.onset.today",
      priorTherapyId: "problem.therapy.performed",
      medicationUseId: "problem.medication.used",
      medicationIds: ["problem.medication.type.analgesic"],
      medicationName: "  Мелоксикам  ",
      medicationDynamicsId: "problem.dynamics.positive",
    });
    const parsed = parseTherapeuticAppointmentDraft(valid);
    expect(parsed.errors).toEqual({});
    expect(parsed.value?.diseaseAnamnesis.problems[0]?.title).toBe("Рвота");
    expect(parsed.value?.diseaseAnamnesis.problems[0]?.description).toBe("После еды");
    expect(parsed.value?.diseaseAnamnesis.problems[0]?.medicationName).toBe("Мелоксикам");
    expect(therapeuticAppointmentSearchText(parsed.value!)).toContain("Положительная");
    expect(therapeuticAppointmentSearchText(parsed.value!)).toContain("Мелоксикам");

    const missingParent = emptyTherapeuticAppointmentDraft();
    missingParent.diseaseAnamnesis.problems.push({
      id: "problem-2",
      title: "Кашель",
      description: "",
      medicationUseId: "problem.medication.none",
      medicationIds: [],
    });
    expect(parseTherapeuticAppointmentDraft(missingParent).errors.problems?.["problem-2"])
      .toContain("терапия до осмотра проводилась");

    const medicationNameWithoutMedication = emptyTherapeuticAppointmentDraft();
    medicationNameWithoutMedication.diseaseAnamnesis.problems.push({
      id: "problem-3",
      title: "Хромота",
      description: "",
      priorTherapyId: "problem.therapy.performed",
      medicationUseId: "problem.medication.none",
      medicationIds: [],
      medicationName: "Мелоксикам",
    });
    expect(parseTherapeuticAppointmentDraft(medicationNameWithoutMedication).errors.problems?.["problem-3"])
      .toContain("название препарата");
  });

  it("accepts structured-only and mixed content and canonicalizes all selection arrays", () => {
    const structured = emptyTherapeuticAppointmentDraft();
    structured.examination.selectedIds = [
      "exam.general.state.good",
    ];
    expect(parseTherapeuticAppointmentDraft(structured).value?.examination.selectedIds)
      .toEqual(["exam.general.state.good"]);

    const mixed = emptyTherapeuticAppointmentDraft();
    mixed.diseaseAnamnesis.text = "  Со слов владельца  ";
    mixed.diseaseAnamnesis.selectedIds = [
      "disease.appetite.change.absent",
      "disease.appetite.state.changed",
    ];
    mixed.diseaseAnamnesis.problems.push(
      { id: "problem-b", title: "Вторая", description: "", medicationIds: [] },
      { id: "problem-a", title: "Первая", description: "", medicationIds: [] },
      { id: "untouched", title: "", description: "", medicationIds: [] },
    );
    mixed.recommendations = " Наблюдение ";
    const parsed = parseTherapeuticAppointmentDraft(mixed);
    expect(parsed.errors).toEqual({});
    expect(parsed.value?.diseaseAnamnesis.text).toBe("Со слов владельца");
    expect(parsed.value?.diseaseAnamnesis.selectedIds).toEqual([
      "disease.appetite.state.changed",
      "disease.appetite.change.absent",
    ]);
    expect(parsed.value?.diseaseAnamnesis.problems.map((problem) => problem.id))
      .toEqual(["problem-b", "problem-a"]);
    expect(parsed.value?.recommendations).toBe("Наблюдение");
  });

  it("indexes every new free-text field and v2 option for history search", () => {
    const draft = emptyTherapeuticAppointmentDraft();
    draft.diseaseAnamnesis.problems.push({
      id: "problem-search",
      title: "",
      description: "После вечернего кормления",
      medicationIds: [],
    });
    draft.lifeAnamnesis.ectoparasiteName = "Селамектин";
    draft.lifeAnamnesis.dewormingName = "Мильбемицин";
    draft.lifeAnamnesis.naturalDietProducts = "Индейка и кабачок";
    draft.lifeAnamnesis.commercialFoodName = "Гастро-корм";
    draft.lifeAnamnesis.diseaseName = "Панкреатит";
    draft.lifeAnamnesis.selectedIds = [
      "life.ectoparasites.state.yes",
      "life.deworming.state.yes",
      "life.diet.type.mixed",
    ];
    draft.examination.coatComment = "Очаг на холке";
    draft.examination.locomotionComment = "Хромота справа";
    draft.examination.selectedIds = ["exam.oral.state.changed", "exam.oral.findings.petechiae"];

    const parsed = parseTherapeuticAppointmentDraft(draft);
    expect(parsed.errors).toEqual({});
    const searchText = therapeuticAppointmentSearchText(parsed.value!);
    for (const expected of [
      "После вечернего кормления", "Селамектин", "Мильбемицин", "Индейка и кабачок", "Гастро-корм",
      "Панкреатит", "Очаг на холке", "Хромота справа", "Петехии/кровоизлияния",
    ]) expect(searchText).toContain(expected);
  });

  it("rejects unknown, duplicate, hidden, and incompatible selected IDs", () => {
    const unknown = emptyTherapeuticAppointmentDraft();
    unknown.diseaseAnamnesis.selectedIds = ["disease.unknown.option"];
    expect(parseTherapeuticAppointmentDraft(unknown).errors.section).toContain("неизвестный");

    const duplicate = emptyTherapeuticAppointmentDraft();
    duplicate.examination.selectedIds = ["exam.general.state.good", "exam.general.state.good"];
    expect(parseTherapeuticAppointmentDraft(duplicate).errors.section).toContain("повторяющиеся");

    const hidden = emptyTherapeuticAppointmentDraft();
    hidden.lifeAnamnesis.selectedIds = ["life.housing.apartment-walk.free"];
    const hiddenResult = parseTherapeuticAppointmentDraft(hidden);
    expect(hiddenResult.errors.section).toContain("родительского");
    expect(hiddenResult.errors.tab).toBe("life");

    const incompatible = emptyTherapeuticAppointmentDraft();
    incompatible.examination.selectedIds = [
      "exam.ear.changes.none",
      "exam.ear.changes.left",
    ];
    expect(parseTherapeuticAppointmentDraft(incompatible).errors.section).toContain("несовместимые");
  });

  it("keeps the earliest invalid tab and rejects duplicate problem IDs", () => {
    const draft = emptyTherapeuticAppointmentDraft();
    draft.diseaseAnamnesis.problems.push(
      { id: "same", title: "Первая", description: "", medicationIds: [] },
      { id: "same", title: "Вторая", description: "", medicationIds: [] },
    );
    draft.lifeAnamnesis.selectedIds = ["life.unknown.option"];
    const parsed = parseTherapeuticAppointmentDraft(draft);
    expect(parsed.errors.problems?.same).toContain("уникальный");
    expect(parsed.errors.tab).toBe("disease");
  });

  it("clears dependent selections and formats selected values for history", () => {
    expect(pruneTherapeuticSelections([
      "disease.activity.state.changed",
      "disease.activity.change.lethargic",
      "disease.activity.baseline.active",
    ])).toEqual([
      "disease.activity.state.changed",
      "disease.activity.change.lethargic",
    ]);
    const details = therapeuticSelectionDetails(
      ["disease.activity.state.changed", "disease.activity.change.lethargic"],
      DISEASE_ANAMNESIS_CATEGORIES,
    );
    expect(details.map((detail) => detail.value)).toEqual(["Изменилась", "Стало более вялым"]);
    expect(therapeuticSelectionGroups([
      "exam.mucosa.color.pale-pink",
      "exam.mucosa.moisture.moist",
    ], EXAMINATION_CATEGORIES)).toEqual([{
      key: "exam.mucosa",
      label: "Видимые слизистые оболочки (ВСО)",
      details: [
        { key: "exam.mucosa.color", label: "Цвет", value: "Бледно-розовые", children: [] },
        { key: "exam.mucosa.moisture", label: "Влажность", value: "Влажные", children: [] },
      ],
    }]);

    const coat = therapeuticSelectionGroups([
      "exam.coat.changes.hypotrichosis",
      "exam.coat.hypotrichosis.distribution.local",
      "exam.coat.hypotrichosis.number.single",
    ], EXAMINATION_CATEGORIES).find((group) => group.key === "exam.coat")!;
    expect(coat.details).toEqual([{
      key: "exam.coat.changes",
      label: "",
      value: "Гипотрихоз",
      children: [{
        key: "exam.coat.hypotrichosis.distribution",
        label: "",
        value: "Локально",
        children: [{
          key: "exam.coat.hypotrichosis.number",
          label: "",
          value: "Единично",
          children: [],
        }],
      }],
    }]);
  });

  it("keeps locomotion findings independent while normal remains exclusive", () => {
    const findings = EXAMINATION_CATEGORIES.find((category) => category.id === "exam.locomotion")!
      .questions.find((question) => question.id === "exam.locomotion.findings")!;
    expect(toggleTherapeuticMultipleSelection(findings, [
      "exam.locomotion.state.lameness",
      "exam.locomotion.lameness.2",
    ], "exam.locomotion.findings.ataxia")).toEqual([
      "exam.locomotion.state.lameness",
      "exam.locomotion.lameness.2",
      "exam.locomotion.findings.ataxia",
    ]);
    expect(toggleTherapeuticMultipleSelection(findings, [
      "exam.locomotion.state.normal",
    ], "exam.locomotion.findings.ataxia")).toEqual([
      "exam.locomotion.findings.ataxia",
    ]);
  });

  it("keeps urination absence durations exclusive while retaining other urinary signs", () => {
    const changes = DISEASE_ANAMNESIS_CATEGORIES.find((category) => category.id === "disease.urination")!
      .questions.find((question) => question.id === "disease.urination.change")!;
    const absenceIds = [
      "disease.urination.change.absent",
      "disease.urination.change.absent-day",
      "disease.urination.change.absent-days-2",
    ];
    const compatibleSigns = [
      "disease.urination.change.dysuria",
      "disease.urination.change.pollakiuria",
      "disease.urination.change.periuria",
      "disease.urination.change.stranguria",
    ];

    for (const current of absenceIds) {
      for (const selected of absenceIds.filter((id) => id !== current)) {
        expect(toggleTherapeuticMultipleSelection(changes, [
          "disease.urination.state.changed",
          current,
          ...compatibleSigns,
        ], selected)).toEqual([
          "disease.urination.state.changed",
          selected,
          ...compatibleSigns,
        ]);
      }
    }
  });
});
