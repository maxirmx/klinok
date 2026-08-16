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
  it("removes a study with whitespace-only text without confirmation", async () => {
    const type = laboratoryStudyTypeById("lab.study.cbc")!;
    let current: LaboratoryTestsSectionValue = { studies: [{
      id: "123e4567-e89b-12d3-a456-426614174000",
      date: "2026-08-15",
      typeId: type.id,
      typeName: type.name,
      mode: "panel",
      laboratory: " ",
      technician: "\t",
      equipment: "\n",
      comment: "  ",
      results: [{
        indicatorId: type.indicators[0]!.id,
        indicatorName: type.indicators[0]!.name,
        unit: type.indicators[0]!.unit,
        result: " ",
        reference: "\t",
      }],
    }] };
    const wrapper = mount(LaboratoryTestsEditor, {
      props: {
        modelValue: current,
        encounterDate: "2026-08-15",
        "onUpdate:modelValue": (value: LaboratoryTestsSectionValue) => {
          current = value;
          void wrapper.setProps({ modelValue: value });
        },
      },
    });

    await wrapper.get('button[title="Удалить исследование"]').trigger("click");
    await flushPromises();

    expect(current.studies).toHaveLength(0);
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
  });

  it("requires a fixed type before adding and removes every study mode", async () => {
    let current: LaboratoryTestsSectionValue = { studies: [] };
    let updateModel: (value: LaboratoryTestsSectionValue) => void = () => undefined;
    const wrapper = mount(LaboratoryTestsEditor, {
      props: {
        modelValue: current,
        encounterDate: "2026-08-15",
        errors: { section: "Добавьте хотя бы одно лабораторное исследование.", studies: [] },
        "onUpdate:modelValue": (value: LaboratoryTestsSectionValue) => updateModel(value),
      },
    });
    updateModel = (value: LaboratoryTestsSectionValue) => {
      current = value;
      void wrapper.setProps({ modelValue: value });
    };

    expect(wrapper.get('[role="alert"]').text()).toContain("Добавьте хотя бы одно");
    expect(wrapper.get('input[aria-label="Тип исследования"]').attributes("aria-invalid")).toBe("true");
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

    const cbc = laboratoryStudyTypeById("lab.study.cbc")!;
    await selectType(cbc.id);
    expect(addButton().attributes("disabled")).toBeUndefined();
    await addButton().trigger("click");
    await flushPromises();
    expect(current.studies).toHaveLength(1);
    expect(current.studies[0]).toMatchObject({
      date: "2026-08-15",
      typeId: "lab.study.cbc",
      typeName: "Общеклинический анализ крови",
      mode: "panel",
    });
    expect(current.studies[0]?.mode === "panel" ? current.studies[0].results : []).toEqual([]);
    expect(addButton().attributes("disabled")).toBeDefined();
    const studyHeading = wrapper.get(".laboratory-study-card > .laboratory-study-heading");
    expect(studyHeading.get("h4").text()).toBe("Общеклинический анализ крови");
    expect(studyHeading.get("h4").attributes("title")).toBe("Общеклинический анализ крови");
    const removeStudy = studyHeading.get('button[title="Удалить исследование"]');
    expect(removeStudy.classes()).toContain("laboratory-study-delete");
    expect(removeStudy.text()).toBe("");
    expect(removeStudy.attributes("aria-label")).toBe("Удалить исследование");
    expect(wrapper.find('input[aria-label="Название исследования"]').exists()).toBe(false);

    expect(wrapper.findAllComponents(AppCatalogCombobox)).toHaveLength(2);
    expect(wrapper.find(".laboratory-study-indicators").exists()).toBe(false);
    expect(wrapper.find(".laboratory-editor-results table").exists()).toBe(false);
    expect(wrapper.findAll(".laboratory-result-row")).toHaveLength(0);
    const indicatorCombobox = () => wrapper.findAllComponents(AppCatalogCombobox)[1]!;
    const addIndicator = () => wrapper.get('button[title="Добавить показатель"]');
    expect(indicatorCombobox().props("label")).toBe("Добавить показатель");
    expect(indicatorCombobox().props("allowCustom")).toBe(false);
    expect(indicatorCombobox().props("options")).toHaveLength(cbc.indicators.length);
    expect(indicatorCombobox().props("options")[0]).toEqual({
      id: cbc.indicators[0]!.id,
      label: `${cbc.indicators[0]!.name} · ${cbc.indicators[0]!.unit}`,
    });
    expect(addIndicator().attributes("disabled")).toBeDefined();

    indicatorCombobox().vm.$emit("update:selectedIds", [cbc.indicators[0]!.id]);
    await flushPromises();
    expect(addIndicator().attributes("disabled")).toBeUndefined();
    await addIndicator().trigger("click");
    await flushPromises();
    expect(current.studies[0]?.mode === "panel" ? current.studies[0].results : []).toEqual([{
      indicatorId: cbc.indicators[0]!.id,
      indicatorName: cbc.indicators[0]!.name,
      unit: cbc.indicators[0]!.unit,
      result: "",
    }]);
    expect(indicatorCombobox().props("selectedIds")).toEqual([]);
    expect(indicatorCombobox().props("options")).not.toContainEqual(expect.objectContaining({ id: cbc.indicators[0]!.id }));
    indicatorCombobox().vm.$emit("update:selectedIds", [cbc.indicators[0]!.id]);
    await flushPromises();
    expect(addIndicator().attributes("disabled")).toBeDefined();
    await addIndicator().trigger("click");
    expect(current.studies[0]?.mode === "panel" ? current.studies[0].results : []).toHaveLength(1);

    indicatorCombobox().vm.$emit("update:selectedIds", [cbc.indicators[1]!.id]);
    await flushPromises();
    await addIndicator().trigger("click");
    await flushPromises();
    expect(current.studies[0]?.mode === "panel" ? current.studies[0].results.map((result) => result.indicatorId) : [])
      .toEqual([cbc.indicators[0]!.id, cbc.indicators[1]!.id]);
    expect(wrapper.findAll(".laboratory-result-row")).toHaveLength(2);
    expect(wrapper.findAll(".laboratory-result-headings")).toHaveLength(2);
    expect(wrapper.findAll(".laboratory-result-headings-primary > span").map((header) => header.text())).toEqual([
      "Показатель",
      "Результат",
      "Референсные значения",
    ]);
    expect(wrapper.findAll(".laboratory-result-headings-secondary > span").map((header) => header.text())).toEqual([
      "Показатель",
      "Результат",
      "Референсные значения",
    ]);
    const firstResultRow = wrapper.get(".laboratory-result-row");
    expect(firstResultRow.findAll(".laboratory-result-label").map((label) => label.text())).toEqual(["Референсные значения"]);
    expect(firstResultRow.get(".laboratory-result-mobile-name").text()).toBe(`${cbc.indicators[0]!.name} · ${cbc.indicators[0]!.unit}`);
    expect(firstResultRow.findAll("input")[0]!.attributes("aria-label")).toBe(`${cbc.indicators[0]!.name}, результат`);
    expect(firstResultRow.get(".laboratory-result-indicator").text()).toContain(cbc.indicators[0]!.name);
    expect(firstResultRow.get(".laboratory-result-unit").text()).toBe(cbc.indicators[0]!.unit);
    const indicatorDeleteButtons = wrapper.findAll('button[title="Удалить показатель"]');
    expect(indicatorDeleteButtons).toHaveLength(2);
    expect(indicatorDeleteButtons[0]!.attributes("aria-label")).toBe(`Удалить показатель «${cbc.indicators[0]!.name}»`);
    await indicatorDeleteButtons[1]!.trigger("click");
    await flushPromises();
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(current.studies[0]?.mode === "panel" ? current.studies[0].results.map((result) => result.indicatorId) : [])
      .toEqual([cbc.indicators[0]!.id]);
    expect(indicatorCombobox().props("options")).toContainEqual(expect.objectContaining({ id: cbc.indicators[1]!.id }));
    await wrapper.setProps({ errors: {
      studies: [{
        date: "Укажите корректную дату исследования.",
        laboratory: "Укажите лабораторию.",
        indicators: { [cbc.indicators[0]!.id]: "Укажите результат." },
      }],
    } });
    const invalidFields = wrapper.findAll('[aria-invalid="true"]');
    expect(invalidFields).toHaveLength(3);
    expect(invalidFields.map((field) => field.element.tagName)).toEqual(["INPUT", "INPUT", "INPUT"]);
    expect(wrapper.findAll(".laboratory-study-card .field-error").map((error) => error.text())).toEqual([
      "Укажите корректную дату исследования.",
      "Укажите лабораторию.",
      "Укажите результат.",
    ]);
    await wrapper.setProps({ errors: { studies: [] } });

    const laboratory = wrapper.findAll("label")
      .find((label) => label.find("span").exists() && label.get("span").text() === "Лаборатория")!;
    const metadataField = (label: string) => wrapper.findAll(".laboratory-metadata label")
      .find((candidate) => candidate.find("span").exists() && candidate.get("span").text() === label)!;
    await metadataField("Дата исследования").get("input").setValue("2026-08-14");
    await laboratory.get("input").setValue("Ветлаб");
    await metadataField("ФИО лаборанта").get("input").setValue("Иванов");
    await metadataField("Оборудование").get("input").setValue("Анализатор");
    const commentSection = wrapper.get(".laboratory-study-comment.medical-card-comment-section");
    expect(commentSection.get("h4").text()).toBe("Комментарий");
    expect(commentSection.get("textarea").attributes("rows")).toBe("2");
    expect(commentSection.get("textarea").attributes("aria-label")).toBe("Комментарий");
    await commentSection.get("textarea").setValue("Натощак");
    const resultInputs = wrapper.get(".laboratory-result-row").findAll("input");
    await resultInputs[0]!.setValue("42");
    await resultInputs[1]!.setValue("35–55");

    await wrapper.get('button[title="Удалить показатель"]').trigger("click");
    await flushPromises();
    let dialog = wrapper.get('[role="alertdialog"]');
    expect(dialog.text()).toContain("Удалить заполненный показатель?");
    expect(dialog.text()).toContain(cbc.indicators[0]!.name);
    await dialog.get(".outline-action").trigger("click");
    await flushPromises();
    expect(current.studies[0]?.mode === "panel" ? current.studies[0].results : []).toHaveLength(1);
    await wrapper.get('button[title="Удалить показатель"]').trigger("click");
    await flushPromises();
    dialog = wrapper.get('[role="alertdialog"]');
    await dialog.get(".danger").trigger("click");
    await flushPromises();
    expect(current.studies[0]?.mode === "panel" ? current.studies[0].results : []).toHaveLength(0);

    await wrapper.get('button[title="Удалить исследование"]').trigger("click");
    await flushPromises();
    dialog = wrapper.get('[role="alertdialog"]');
    expect(dialog.text()).toContain("После подтверждения будут удалены данные выбранного исследования.");
    await dialog.get(".outline-action").trigger("click");
    await flushPromises();
    expect(current.studies).toHaveLength(1);
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    await wrapper.get('button[title="Удалить исследование"]').trigger("click");
    await flushPromises();
    dialog = wrapper.get('[role="alertdialog"]');
    await dialog.get(".danger").trigger("click");
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
