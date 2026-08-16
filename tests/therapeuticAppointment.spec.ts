// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it } from "vitest";
import {
  DISEASE_ANAMNESIS_CATEGORIES,
  EXAMINATION_CATEGORIES,
  LIFE_ANAMNESIS_CATEGORIES,
  PROBLEM_FREQUENCY_OPTIONS,
  PROBLEM_MEDICATION_OPTIONS,
  PROBLEM_ONSET_OPTIONS,
  THERAPEUTIC_TABS,
  emptyTherapeuticAppointmentDraft,
  isTherapeuticAppointmentValue,
  parseTherapeuticAppointmentDraft,
  pruneTherapeuticSelections,
  therapeuticAppointmentSearchText,
  therapeuticCatalogDiagnostics,
  therapeuticOptionLabel,
  therapeuticSelectionDetails,
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

  it("validates repeatable problems and medication dependencies", () => {
    const incomplete = emptyTherapeuticAppointmentDraft();
    incomplete.diseaseAnamnesis.problems.push({
      id: "problem-1",
      title: "Рвота",
      priorTherapyId: "problem.therapy.performed",
      medicationUseId: "problem.medication.used",
      medicationIds: ["problem.medication.type.antiemetic"],
    });
    expect(parseTherapeuticAppointmentDraft(incomplete).errors.problems?.["problem-1"])
      .toContain("препараты и динамику");

    const valid = emptyTherapeuticAppointmentDraft();
    valid.diseaseAnamnesis.problems.push({
      id: "problem-1",
      sourceWhatHappenedId: "problem.digestive.7",
      title: " Рвота ",
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
    expect(parsed.value?.diseaseAnamnesis.problems[0]?.medicationName).toBe("Мелоксикам");
    expect(therapeuticAppointmentSearchText(parsed.value!)).toContain("Положительная");
    expect(therapeuticAppointmentSearchText(parsed.value!)).toContain("Мелоксикам");

    const missingParent = emptyTherapeuticAppointmentDraft();
    missingParent.diseaseAnamnesis.problems.push({
      id: "problem-2",
      title: "Кашель",
      medicationUseId: "problem.medication.none",
      medicationIds: [],
    });
    expect(parseTherapeuticAppointmentDraft(missingParent).errors.problems?.["problem-2"])
      .toContain("терапия до осмотра проводилась");

    const medicationNameWithoutMedication = emptyTherapeuticAppointmentDraft();
    medicationNameWithoutMedication.diseaseAnamnesis.problems.push({
      id: "problem-3",
      title: "Хромота",
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
      { id: "problem-b", title: "Вторая", medicationIds: [] },
      { id: "problem-a", title: "Первая", medicationIds: [] },
      { id: "untouched", title: "", medicationIds: [] },
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
      { id: "same", title: "Первая", medicationIds: [] },
      { id: "same", title: "Вторая", medicationIds: [] },
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
  });
});
