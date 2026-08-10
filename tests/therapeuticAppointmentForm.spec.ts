// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { reactive } from "vue";
import TherapeuticAppointmentForm from "../src/components/TherapeuticAppointmentForm.vue";
import { emptyTherapeuticAppointmentDraft } from "../src/therapeuticAppointment";

function mountForm(options: { ids?: string[]; comment?: string; attachToDocument?: boolean } = {}) {
  const draft = reactive(emptyTherapeuticAppointmentDraft());
  const wrapper = mount(TherapeuticAppointmentForm, {
    props: {
      modelValue: draft,
      "onUpdate:modelValue": (value) => Object.assign(draft, value),
      whatHappenedIds: options.ids ?? [],
      whatHappenedComment: options.comment ?? "",
      errors: {},
    },
    ...(options.attachToDocument ? { attachTo: document.body } : {}),
  });
  return { wrapper, draft };
}

describe("TherapeuticAppointmentForm", () => {
  it("renders five accessible tabs and keyboard navigation", async () => {
    const { wrapper } = mountForm();
    const tabs = wrapper.findAll<HTMLButtonElement>('[role="tab"]');
    expect(tabs.map((tab) => tab.text())).toEqual([
      "Анамнез болезни",
      "Анамнез жизни",
      "Осмотр",
      "Рекомендации",
      "Назначения",
    ]);
    expect(wrapper.findAll('[role="tablist"]')).toHaveLength(1);
    expect(tabs[0]!.attributes("aria-selected")).toBe("true");
    await tabs[0]!.trigger("keydown", { key: "ArrowRight" });
    expect(tabs[1]!.attributes("aria-selected")).toBe("true");
    expect(wrapper.get<HTMLTextAreaElement>(
      '#' + tabs[1]!.attributes("aria-controls") + ' textarea[aria-label="Комментарий"]',
    ).attributes("rows")).toBe("2");

    await tabs[1]!.trigger("keydown", { key: "ArrowDown" });
    expect(tabs[2]!.attributes("aria-selected")).toBe("true");
    await tabs[2]!.trigger("keydown", { key: "ArrowLeft" });
    expect(tabs[1]!.attributes("aria-selected")).toBe("true");
    await tabs[1]!.trigger("keydown", { key: "ArrowUp" });
    expect(tabs[0]!.attributes("aria-selected")).toBe("true");
    await tabs[0]!.trigger("keydown", { key: "End" });
    expect(tabs[4]!.attributes("aria-selected")).toBe("true");
    await tabs[4]!.trigger("keydown", { key: "Home" });
    expect(tabs[0]!.attributes("aria-selected")).toBe("true");
    await tabs[0]!.trigger("keydown", { key: "Enter" });
    expect(tabs[0]!.attributes("aria-selected")).toBe("true");

    await wrapper.setProps({ errors: { section: "Заполните назначения", tab: "prescriptions" } });
    expect(tabs[4]!.attributes("aria-selected")).toBe("true");
  });

  it("imports each what-happened choice once and does not overwrite narrative text", async () => {
    const { wrapper, draft } = mountForm({
      ids: ["problem.digestive.1", "problem.digestive.7"],
      comment: "Со слов владельца",
    });
    const importButton = wrapper.get('button[aria-label="Импортировать из «Что случилось»"]');
    await importButton.trigger("click");
    expect(draft.diseaseAnamnesis.problems.map((problem) => problem.title)).toEqual(["Не ест", "Рвота"]);
    expect(draft.diseaseAnamnesis.text).toBe("Со слов владельца");
    expect(importButton.attributes("disabled")).toBeDefined();

    draft.diseaseAnamnesis.text = "Отредактированный анамнез";
    await wrapper.setProps({ whatHappenedIds: [...wrapper.props("whatHappenedIds"), "problem.digestive.8"] });
    await importButton.trigger("click");
    expect(draft.diseaseAnamnesis.text).toBe("Отредактированный анамнез");
    expect(draft.diseaseAnamnesis.problems.at(-1)?.title).toBe("Рвота розовым");

    draft.diseaseAnamnesis.problems[0]!.title = "Отредактированная проблема";
    await wrapper.setProps({ whatHappenedIds: ["problem.digestive.7", "problem.digestive.8"] });
    await wrapper.setProps({ whatHappenedIds: ["problem.digestive.1", "problem.digestive.7", "problem.digestive.8"] });
    expect(draft.diseaseAnamnesis.problems[0]!.title).toBe("Отредактированная проблема");
  });

  it("keeps category controls visible and uses conditional follow-ups and shared checkbox grids", async () => {
    const { wrapper } = mountForm();
    const activity = wrapper.findAll(".therapeutic-category").find((category) => category.text().includes("Активность"))!;
    expect(activity.element.tagName).toBe("SECTION");
    expect(activity.get("h5").text()).toBe("Активность");
    expect(activity.findAll("select")).toHaveLength(1);
    await activity.get("select").setValue("disease.activity.state.changed");
    expect(activity.findAll("select")).toHaveLength(2);
    expect(activity.text()).toContain("Как изменилась");

    const stool = wrapper.findAll(".therapeutic-category").find((category) => category.text().includes("Кал"))!;
    const findings = stool.get(".therapeutic-multiple-field");
    expect(findings.get("legend.visually-hidden").text()).toBe("Примеси");
    expect(findings.get(".therapeutic-group-label").text()).toBe("Примеси");
    expect(findings.get(".medical-card-options").exists()).toBe(true);
    expect(wrapper.find("summary").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Выбрано:");

    const completeness = wrapper.findAll(".therapeutic-category")
      .find((category) => category.text().includes("Полнота осмотра"))!;
    await completeness.get("select").setValue("exam.completeness.state.partial");
    const completenessFields = completeness.findAll(".therapeutic-select-field");
    const reason = completenessFields
      .find((field) => field.text().includes("Причина частичного осмотра"))!;
    expect(completenessFields.every((field) => field.classes().includes("therapeutic-select-field-wide"))).toBe(true);
    expect(reason.classes()).toContain("therapeutic-select-field-wide");

    const origin = wrapper.findAll(".therapeutic-category")
      .find((category) => category.text().includes("Где приобрели/откуда взяли"))!;
    expect(origin.get(".therapeutic-select-field").classes()).toContain("therapeutic-select-field-wide");

    const urination = wrapper.findAll(".therapeutic-category")
      .find((category) => category.text().includes("Мочеиспускание"))!;
    expect(urination.findAll(".therapeutic-select-field")).toHaveLength(1);
    expect(urination.get(".therapeutic-select-field").classes()).toContain("therapeutic-select-field-wide");
    await urination.get("select").setValue("disease.urination.state.changed");
    expect(urination.findAll(".therapeutic-select-field")).toHaveLength(2);
    expect(urination.findAll(".therapeutic-select-field")
      .every((field) => !field.classes().includes("therapeutic-select-field-wide"))).toBe(true);
  });

  it("places headed comment sections last in every structured tab", () => {
    const { wrapper } = mountForm();
    const panels = wrapper.findAll("[role='tabpanel']").slice(0, 3);
    panels.forEach((panel) => {
      const commentSection = panel.get(".medical-card-comment-section");
      const comment = commentSection.get<HTMLTextAreaElement>('textarea[aria-label="Комментарий"]');
      expect(panel.element.lastElementChild).toBe(commentSection.element);
      expect(commentSection.get("h5").text()).toBe("Комментарий");
      expect(comment.attributes("rows")).toBe("2");
      expect(comment.classes()).toContain("medical-card-comment");
    });
  });

  it("uses the shared text-panel style for recommendations and prescriptions", () => {
    const { wrapper } = mountForm();
    const panels = wrapper.findAll("[role='tabpanel']").slice(3);
    const expected = [
      { heading: "Рекомендации", label: "Текст рекомендаций" },
      { heading: "Назначения", label: "Текст назначений" },
    ];
    panels.forEach((panel, index) => {
      const textSection = panel.get(".medical-card-comment-section");
      const textarea = textSection.get<HTMLTextAreaElement>(`textarea[aria-label="${expected[index]!.label}"]`);
      expect(textSection.get("h4").text()).toBe(expected[index]!.heading);
      expect(textarea.attributes("rows")).toBe("6");
    });
  });

  it("renders current medications and allergies as separate category rows", () => {
    const { wrapper } = mountForm();
    const lifePanel = wrapper.findAll("[role='tabpanel']")[1]!;
    const rows = lifePanel.findAll(".therapeutic-short-text");
    expect(rows.map((row) => row.get("h5").text())).toEqual([
      "Получаемые в данный момент препараты",
      "Аллергии",
    ]);
    expect(rows.map((row) => row.get("textarea").attributes("rows"))).toEqual(["2", "2"]);
  });

  it("updates every nested narrative and life selection through the draft model", async () => {
    const { wrapper, draft } = mountForm();
    const panels = wrapper.findAll("[role='tabpanel']");
    const diseasePanel = panels[0]!;
    const lifePanel = panels[1]!;
    const examinationPanel = panels[2]!;
    const origin = lifePanel.findAll(".therapeutic-category")
      .find((category) => category.text().includes("Где приобрели/откуда взяли"))!;

    await diseasePanel.get<HTMLTextAreaElement>('textarea[aria-label="Комментарий"]').setValue("Анамнез болезни");
    await origin.get("select").setValue("life.origin.source.shelter");
    await lifePanel.get<HTMLTextAreaElement>('textarea[aria-label="Получаемые в данный момент препараты"]')
      .setValue("Препарат");
    await lifePanel.get<HTMLTextAreaElement>('textarea[aria-label="Аллергии"]').setValue("Не выявлены");
    await lifePanel.get<HTMLTextAreaElement>('textarea[aria-label="Комментарий"]').setValue("Анамнез жизни");
    await examinationPanel.get<HTMLTextAreaElement>('textarea[aria-label="Комментарий"]').setValue("Осмотр");
    await panels[3]!.get<HTMLTextAreaElement>('textarea[aria-label="Текст рекомендаций"]')
      .setValue("Рекомендация");
    await panels[4]!.get<HTMLTextAreaElement>('textarea[aria-label="Текст назначений"]')
      .setValue("Назначение");

    expect(draft).toMatchObject({
      diseaseAnamnesis: { text: "Анамнез болезни" },
      lifeAnamnesis: {
        selectedIds: ["life.origin.source.shelter"],
        currentMedications: "Препарат",
        allergies: "Не выявлены",
        text: "Анамнез жизни",
      },
      examination: { text: "Осмотр" },
      recommendations: "Рекомендация",
      prescriptions: "Назначение",
    });
  });

  it("adds problem cards and reveals medication controls progressively", async () => {
    const { wrapper, draft } = mountForm();
    await wrapper.get('button[aria-label="Добавить проблему"]').trigger("click");
    const problem = wrapper.get(".therapeutic-problem-card");
    expect(draft.diseaseAnamnesis.problems).toHaveLength(1);
    const selects = problem.findAll("select");
    await selects[2]!.setValue("problem.therapy.performed");
    expect(problem.findAll("select")).toHaveLength(4);
    await problem.findAll("select")[3]!.setValue("problem.medication.used");
    expect(problem.get(".therapeutic-problem-medications .medical-card-options").exists()).toBe(true);
    expect(problem.get(".therapeutic-problem-medications").classes()).toContain("medical-card-option-panel");
    expect(problem.findAll("select")).toHaveLength(5);
  });

  it("emits a new draft instead of mutating the incoming problem model", async () => {
    const original = emptyTherapeuticAppointmentDraft();
    original.diseaseAnamnesis.problems.push({
      id: "problem-1",
      title: "Снижение аппетита",
      medicationIds: [],
    });
    const wrapper = mount(TherapeuticAppointmentForm, {
      props: {
        modelValue: original,
        whatHappenedIds: [],
        whatHappenedComment: "",
        errors: {},
      },
    });

    await wrapper.get(".therapeutic-problem-card select").setValue("problem.onset.today");

    expect(original.diseaseAnamnesis.problems[0]?.onsetId).toBeUndefined();
    const updates = wrapper.emitted<TherapeuticAppointmentDraft[]>("update:modelValue");
    expect(updates).toHaveLength(1);
    expect(updates?.[0]?.[0].diseaseAnamnesis.problems[0]?.onsetId).toBe("problem.onset.today");
  });

  it("clears medication fields when medication use or prior therapy is reset", async () => {
    const { wrapper, draft } = mountForm();
    await wrapper.get('button[aria-label="Добавить проблему"]').trigger("click");
    const problem = wrapper.get(".therapeutic-problem-card");
    await problem.findAll("select")[2]!.setValue("problem.therapy.performed");
    await problem.findAll("select")[3]!.setValue("problem.medication.used");
    const medication = problem.get<HTMLInputElement>('.therapeutic-problem-medications input[type="checkbox"]');
    await medication.setValue(true);
    await problem.findAll("select")[4]!.setValue("problem.dynamics.positive");

    expect(draft.diseaseAnamnesis.problems[0]).toMatchObject({
      medicationUseId: "problem.medication.used",
      medicationIds: ["problem.medication.type.analgesic"],
      medicationDynamicsId: "problem.dynamics.positive",
    });

    await medication.setValue(false);
    expect(draft.diseaseAnamnesis.problems[0]?.medicationIds).toEqual([]);
    await medication.setValue(true);
    await problem.findAll("select")[3]!.setValue("problem.medication.none");

    expect(draft.diseaseAnamnesis.problems[0]).toMatchObject({
      priorTherapyId: "problem.therapy.performed",
      medicationUseId: "problem.medication.none",
      medicationIds: [],
      medicationDynamicsId: undefined,
    });
    expect(problem.findAll("select")).toHaveLength(4);

    await problem.findAll("select")[2]!.setValue("");

    expect(draft.diseaseAnamnesis.problems[0]).toMatchObject({
      medicationUseId: undefined,
      medicationIds: [],
      medicationDynamicsId: undefined,
    });
    expect(problem.findAll("select")).toHaveLength(3);
    expect(problem.find(".therapeutic-problem-medications").exists()).toBe(false);
  });

  it("focuses newly added problems and deletes only the selected card", async () => {
    const { wrapper, draft } = mountForm({ attachToDocument: true });
    try {
      await wrapper.get('button[aria-label="Добавить проблему"]').trigger("click");
      const firstInput = wrapper.get<HTMLInputElement>('.therapeutic-problem-title input');
      expect(document.activeElement).toBe(firstInput.element);
      await firstInput.setValue("Первая проблема");
      await wrapper.get('button[aria-label="Добавить проблему"]').trigger("click");
      const inputs = wrapper.findAll<HTMLInputElement>('.therapeutic-problem-title input');
      expect(document.activeElement).toBe(inputs[1]!.element);
      await inputs[1]!.setValue("Вторая проблема");
      await wrapper.get('button[aria-label="Удалить проблему 1"]').trigger("click");
      expect(draft.diseaseAnamnesis.problems.map((problem) => problem.title)).toEqual(["Вторая проблема"]);
    } finally {
      wrapper.unmount();
    }
  });
});
