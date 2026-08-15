// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import {
  LABORATORY_STUDY_CATALOG,
  laboratoryStudyTypeById,
  type LaboratoryTestsSectionValue,
} from "@klinok/contracts";
import AppCatalogCombobox from "../src/components/AppCatalogCombobox.vue";
import LaboratoryTestsEditor from "../src/components/LaboratoryTestsEditor.vue";

describe("LaboratoryTestsEditor", () => {
  it("requires a fixed type before adding and removes every study mode", async () => {
    let current: LaboratoryTestsSectionValue = { studies: [] };
    let updateModel: (value: LaboratoryTestsSectionValue) => void = () => undefined;
    const wrapper = mount(LaboratoryTestsEditor, {
      props: {
        modelValue: current,
        encounterDate: "2026-08-15",
        errors: "Добавьте хотя бы одно лабораторное исследование.",
        "onUpdate:modelValue": (value: LaboratoryTestsSectionValue) => updateModel(value),
      },
    });
    updateModel = (value: LaboratoryTestsSectionValue) => {
      current = value;
      void wrapper.setProps({ modelValue: value });
    };

    expect(wrapper.get('[role="alert"]').text()).toContain("Добавьте хотя бы одно");
    expect(wrapper.get(".laboratory-study-create + .laboratory-study-list").exists()).toBe(true);
    expect(wrapper.get('input[aria-label="Тип исследования"]').exists()).toBe(true);
    const addButton = () => wrapper.get('button[title="Добавить исследование"]');
    const selectType = async (id: string) => {
      wrapper.findAllComponents(AppCatalogCombobox)[0]!.vm.$emit("update:selectedIds", [id]);
      await flushPromises();
    };
    expect(addButton().attributes("disabled")).toBeDefined();
    expect(addButton().classes()).toContain("laboratory-study-add");
    expect(addButton().text()).toBe("");
    expect(addButton().attributes("aria-label")).toBe("Добавить исследование");
    await selectType("unknown");
    expect(addButton().attributes("disabled")).toBeDefined();
    expect(current.studies).toHaveLength(0);

    await selectType("lab.study.cbc");
    expect(addButton().attributes("disabled")).toBeUndefined();
    await addButton().trigger("click");
    await flushPromises();
    expect(current.studies).toHaveLength(1);
    expect(current.studies[0]).toMatchObject({
      date: "2026-08-15",
      typeId: "lab.study.cbc",
      typeName: "Общеклинический анализ крови",
      mode: "panel",
      results: [],
    });
    expect(addButton().attributes("disabled")).toBeDefined();
    const studyHeading = wrapper.get(".laboratory-study-card > .laboratory-study-heading");
    expect(studyHeading.get("h4").text()).toBe("Общеклинический анализ крови");
    expect(studyHeading.get("h4").attributes("title")).toBe("Общеклинический анализ крови");
    const removeStudy = studyHeading.get('button[title="Удалить исследование"]');
    expect(removeStudy.classes()).toContain("laboratory-study-delete");
    expect(removeStudy.text()).toBe("");
    expect(removeStudy.attributes("aria-label")).toBe("Удалить исследование");
    expect(wrapper.find('input[aria-label="Название исследования"]').exists()).toBe(false);

    const cbc = laboratoryStudyTypeById("lab.study.cbc")!;
    const [hematocrit, hemoglobin] = cbc.indicators;
    const indicatorPicker = wrapper.findAllComponents(AppCatalogCombobox)[1]!;
    expect(indicatorPicker.get(".app-catalog-control").classes()).not.toContain("has-custom-add");
    indicatorPicker.vm.$emit("update:selectedIds", [hematocrit!.id]);
    await flushPromises();
    expect(current.studies[0]).toMatchObject({
      results: [{ indicatorId: hematocrit!.id, indicatorName: hematocrit!.name, unit: hematocrit!.unit, result: "" }],
    });

    const laboratory = wrapper.findAll("label")
      .find((label) => label.find("span").exists() && label.get("span").text() === "Лаборатория")!;
    const metadataField = (label: string) => wrapper.findAll(".laboratory-metadata label")
      .find((candidate) => candidate.find("span").exists() && candidate.get("span").text() === label)!;
    await metadataField("Дата исследования").get("input").setValue("2026-08-14");
    await laboratory.get("input").setValue("Ветлаб");
    await metadataField("ФИО лаборанта").get("input").setValue("Иванов");
    await metadataField("Оборудование").get("input").setValue("Анализатор");
    await wrapper.get("textarea.medical-card-comment").setValue("Натощак");
    const resultInputs = wrapper.get(".laboratory-results tbody tr").findAll("input");
    await resultInputs[0]!.setValue("42");
    await resultInputs[1]!.setValue("35–55");

    indicatorPicker.vm.$emit("update:selectedIds", [hemoglobin!.id]);
    await flushPromises();
    let dialog = wrapper.get('[role="alertdialog"]');
    expect(dialog.text()).toContain("Удалить заполненные данные?");
    await dialog.get(".outline-action").trigger("click");
    expect(current.studies[0]).toMatchObject({ results: [{ indicatorId: hematocrit!.id }] });

    wrapper.findAllComponents(AppCatalogCombobox)[1]!.vm.$emit("update:selectedIds", [hemoglobin!.id]);
    await flushPromises();
    dialog = wrapper.get('[role="alertdialog"]');
    await dialog.get(".danger").trigger("click");
    expect(current.studies[0]).toMatchObject({ results: [{ indicatorId: hemoglobin!.id, result: "" }] });

    await wrapper.get('button[title="Удалить исследование"]').trigger("click");
    await flushPromises();
    await wrapper.get('[role="alertdialog"] .danger').trigger("click");
    await flushPromises();
    expect(current.studies).toHaveLength(0);

    const narrative = LABORATORY_STUDY_CATALOG.find((study) => study.mode === "narrative")!;
    await selectType(narrative.id);
    await addButton().trigger("click");
    await flushPromises();
    expect(current.studies[0]).toMatchObject({ typeId: narrative.id, mode: "narrative", result: "" });
    expect(wrapper.get(".laboratory-study-heading h4").text()).toBe(narrative.name);
    await wrapper.get(".laboratory-study-card > label textarea").setValue("Описание результата");
    await wrapper.get('button[title="Удалить исследование"]').trigger("click");
    await flushPromises();
    await wrapper.get('[role="alertdialog"] .danger').trigger("click");
    await flushPromises();

    await selectType("lab.study.infection");
    await addButton().trigger("click");
    await flushPromises();
    expect(current.studies[0]).toMatchObject({
      typeId: "lab.study.infection",
      mode: "infection",
      infection: "",
      method: "ПЦР",
      result: "negative",
    });
    expect(wrapper.get(".laboratory-infection select").findAll("option")).toHaveLength(5);
    await wrapper.get(".laboratory-infection input[required]").setValue("Чума плотоядных");

    await wrapper.get('button[title="Удалить исследование"]').trigger("click");
    await flushPromises();
    await wrapper.get('[role="alertdialog"] .danger').trigger("click");
    await flushPromises();
    expect(current.studies).toHaveLength(0);

    await selectType("lab.study.cbc");
    await addButton().trigger("click");
    await flushPromises();
    await wrapper.get('button[title="Удалить исследование"]').trigger("click");
    await flushPromises();
    expect(current.studies).toHaveLength(0);
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
  });
});
