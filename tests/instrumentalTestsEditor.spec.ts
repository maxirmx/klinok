// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { InstrumentalTestsSectionValue } from "@klinok/contracts";
import AppCatalogCombobox from "../src/components/AppCatalogCombobox.vue";
import InstrumentalFindingEditor from "../src/components/InstrumentalFindingEditor.vue";
import InstrumentalTestsEditor from "../src/components/InstrumentalTestsEditor.vue";

function mountEditor(initial: InstrumentalTestsSectionValue = { studies: [] }, errors?: object) {
  let current = initial;
  const wrapper = mount(InstrumentalTestsEditor, {
    props: {
      modelValue: current,
      encounterDate: "2026-08-15",
      ...(errors ? { errors } : {}),
      "onUpdate:modelValue": (value: InstrumentalTestsSectionValue) => {
        current = value;
        void wrapper.setProps({ modelValue: value });
      },
    },
  });
  return { wrapper, current: () => current };
}

async function chooseType(wrapper: VueWrapper, id: string) {
  wrapper.findComponent(AppCatalogCombobox).vm.$emit("update:selectedIds", [id]);
  await flushPromises();
  await wrapper.get(".instrumental-study-add").trigger("click");
  await flushPromises();
}

function levelFor(wrapper: VueWrapper, findingId: string) {
  const level = wrapper.findAllComponents(InstrumentalFindingEditor).find((candidate) =>
    candidate.props("catalog").some((item: { id: string }) => item.id === findingId));
  if (!level) throw new Error(`Missing level for ${findingId}`);
  return level;
}

async function addFinding(wrapper: VueWrapper, id: string) {
  const level = levelFor(wrapper, id);
  const selector = level.findAllComponents(AppCatalogCombobox).find((candidate) =>
    candidate.props("options").some((item: { id: string }) => item.id === id));
  if (!selector) throw new Error(`Missing indicator selector for ${id}`);
  selector.vm.$emit("update:selectedIds", [id]);
  await flushPromises();
  await level.get(".instrumental-finding-add").trigger("click");
  await flushPromises();
}

async function selectChoice(wrapper: VueWrapper, id: string) {
  const level = levelFor(wrapper, id);
  const selector = level.findAllComponents(AppCatalogCombobox).find((candidate) =>
    candidate.props("options").some((item: { id: string }) => item.id === id));
  if (!selector) throw new Error(`Missing value selector for ${id}`);
  selector.vm.$emit("update:selectedIds", [...selector.props("selectedIds"), id]);
  await flushPromises();
}

describe("InstrumentalTestsEditor", () => {
  it("builds multiple ultrasound branches through arbitrary recursive levels", async () => {
    const { wrapper, current } = mountEditor();
    expect(wrapper.get(".instrumental-study-add").attributes("disabled")).toBeDefined();
    await chooseType(wrapper, "instrumental.study.ultrasound-abdomen");
    expect(current().studies[0]).toMatchObject({
      date: "2026-08-15",
      typeName: "УЗИ органов брюшной полости",
      mode: "tree",
      findings: [],
    });
    expect(wrapper.get(".instrumental-study-delete").attributes("aria-label")).toBe("Удалить исследование");

    await addFinding(wrapper, "instrumental.finding.ultrasound-abdomen.9");
    await addFinding(wrapper, "instrumental.finding.ultrasound-abdomen.1");
    expect(current().studies[0]?.mode === "tree" ? current().studies[0].findings.map((item) => item.findingName) : []).toEqual(["Печень", "Мочевой пузырь"]);

    await addFinding(wrapper, "instrumental.finding.ultrasound-abdomen.9.3");
    await selectChoice(wrapper, "instrumental.finding.ultrasound-abdomen.9.3.5");
    await addFinding(wrapper, "instrumental.finding.ultrasound-abdomen.9.3.5.2");
    await selectChoice(wrapper, "instrumental.finding.ultrasound-abdomen.9.3.5.2.1");
    await selectChoice(wrapper, "instrumental.finding.ultrasound-abdomen.9.3.5.2.2");
    await addFinding(wrapper, "instrumental.finding.ultrasound-abdomen.9.3.5.2.3");

    expect(wrapper.findAll(".instrumental-selected-values span").map((item) => item.text())).toEqual(expect.arrayContaining([
      "Визуализируется", "Единичные", "Множественные",
    ]));
    const valueSelector = levelFor(wrapper, "instrumental.finding.ultrasound-abdomen.9.3.5.2.1")
      .findAllComponents(AppCatalogCombobox).find((candidate) => candidate.props("multiple"));
    expect(valueSelector?.props("label")).toContain("Конкременты");
    valueSelector?.vm.$emit("update:selectedIds", ["instrumental.finding.ultrasound-abdomen.9.3.5.2.2"]);
    await flushPromises();
    expect(wrapper.get('[role="alertdialog"]').text()).toContain("Удалить выбранное значение");
    await wrapper.get('[role="alertdialog"] .outline-action').trigger("click");
    await flushPromises();

    const sizeLabel = wrapper.findAll(".instrumental-finding-content label").find((label) => label.get("span").text() === "Размер, мм")!;
    await sizeLabel.get("input").setValue("4,2");
    const deepContent = sizeLabel.element.closest<HTMLElement>(".instrumental-finding-content")!;
    expect(deepContent.style.getPropertyValue("--instrumental-depth")).toBe("4");
    expect(wrapper.findAll(".instrumental-finding-add").every((button) => button.classes().includes("medical-card-action"))).toBe(true);
    expect(wrapper.findAll(".instrumental-finding-delete").every((button) => button.attributes("title") === "Удалить показатель")).toBe(true);

    await wrapper.get('button[aria-label="Удалить показатель «Размер, мм»"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alertdialog"]').text()).toContain("Размер, мм");
    await wrapper.get('[role="alertdialog"] .danger').trigger("click");
    await flushPromises();
    expect(wrapper.find('button[aria-label="Удалить показатель «Размер, мм»"]').exists()).toBe(false);

    await wrapper.get('button[aria-label="Удалить показатель «Печень»"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(current().studies[0]?.mode === "tree" ? current().studies[0].findings.map((item) => item.findingName) : []).toEqual(["Мочевой пузырь"]);

    await wrapper.get('button[aria-label="Удалить показатель «Мочевой пузырь»"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alertdialog"]').text()).toContain("Мочевой пузырь");
    await wrapper.get('[role="alertdialog"] .outline-action').trigger("click");
    expect(current().studies[0]?.mode === "tree" ? current().studies[0].findings : []).toHaveLength(1);
  });

  it("supports narrative X-ray, inline errors, comments, and safe study deletion", async () => {
    const { wrapper, current } = mountEditor({ studies: [] }, {
      section: "Добавьте хотя бы одно инструментальное исследование.", studies: [],
    });
    expect(wrapper.get('[role="alert"]').text()).toContain("Добавьте хотя бы одно");
    expect(wrapper.get('input[aria-label="Тип исследования"]').attributes("aria-invalid")).toBe("true");
    await chooseType(wrapper, "instrumental.study.xray-thorax-abdomen");
    expect(current().studies[0]).toMatchObject({ mode: "narrative", result: "" });
    await wrapper.setProps({ errors: { studies: [{ date: "Укажите корректную дату исследования.", result: "Укажите результат исследования." }] } });
    expect(wrapper.findAll('[aria-invalid="true"]')).toHaveLength(2);
    expect(wrapper.findAll(".instrumental-study-card .field-error").map((error) => error.text())).toEqual([
      "Укажите корректную дату исследования.", "Укажите результат исследования.",
    ]);
    await wrapper.get(".instrumental-study-card > label textarea").setValue("Очаговых изменений нет");
    const comment = wrapper.get(".instrumental-study-comment");
    expect(comment.get("textarea").attributes("rows")).toBe("2");
    await comment.get("textarea").setValue("Контроль через месяц");

    await wrapper.get(".instrumental-study-delete").trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alertdialog"]').text()).toContain("данные выбранного исследования");
    await wrapper.get('[role="alertdialog"] .danger').trigger("click");
    await flushPromises();
    expect(current().studies).toHaveLength(0);

    await chooseType(wrapper, "instrumental.study.ultrasound-abdomen");
    await wrapper.get(".instrumental-study-delete").trigger("click");
    await flushPromises();
    expect(current().studies).toHaveLength(0);
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
  });
});
