// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type {
  InstrumentalFindingCatalogItem,
  InstrumentalFindingValue,
  InstrumentalTestsSectionValue,
} from "@klinok/contracts";
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
  const selector = wrapper.findAll("select").find((candidate) => candidate.find(`option[value="${id}"]`).exists());
  if (!selector) throw new Error(`Missing value selector for ${id}`);
  await selector.setValue(id);
  await flushPromises();
}

describe("InstrumentalTestsEditor", () => {
  it("renders the persisted measurement unit instead of the current catalog unit", () => {
    const catalog: readonly InstrumentalFindingCatalogItem[] = [{
      id: "size",
      name: "Размер",
      kind: "integer",
      unit: "мм",
      children: [],
    }];
    const finding: InstrumentalFindingValue = {
      findingId: "size",
      findingName: "Размер",
      value: "12",
      unit: "см",
      children: [],
    };
    const wrapper = mount(InstrumentalFindingEditor, {
      props: { catalog, modelValue: [finding] },
    });

    expect(wrapper.get('input[type="number"]').attributes("aria-label")).toBe("Размер, см");
    expect(wrapper.get(".instrumental-integer-unit").text()).toBe("см");
  });

  it("renders a level-zero choice in its section heading row", async () => {
    const { wrapper, current } = mountEditor();
    await chooseType(wrapper, "instrumental.study.ultrasound-abdomen");
    await addFinding(wrapper, "instrumental.finding.ultrasound-abdomen.3");

    const row = wrapper.get(".instrumental-root-choice-row");
    expect(row.get(".instrumental-finding-name").text()).toBe("Поджелудочная железа");
    expect(row.find(".instrumental-result-desktop-name").exists()).toBe(false);
    expect(row.find(".instrumental-result-mobile-name").exists()).toBe(false);
    const selector = row.get<HTMLSelectElement>('select[aria-label="Значение показателя «Поджелудочная железа»"]');
    await selector.setValue("instrumental.finding.ultrasound-abdomen.3.0.1");
    expect(current().studies[0]?.mode === "tree" ? current().studies[0].findings[0]?.children[0]?.findingName : undefined)
      .toBe("Визуализируется");
    expect(row.get('button[aria-label="Удалить раздел «Поджелудочная железа»"]').exists()).toBe(true);
  });

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
    const rootFindingEditor = wrapper.findComponent(InstrumentalFindingEditor);
    expect(rootFindingEditor.findComponent(AppCatalogCombobox).props("placeholder")).toBe("Выберите раздел");
    expect(rootFindingEditor.get(".instrumental-finding-add").attributes("aria-label")).toBe("Добавить раздел");
    expect(wrapper.find(".instrumental-study-comment").exists()).toBe(false);

    await addFinding(wrapper, "instrumental.finding.ultrasound-abdomen.9");
    await addFinding(wrapper, "instrumental.finding.ultrasound-abdomen.1");
    expect(current().studies[0]?.mode === "tree" ? current().studies[0].findings.map((item) => item.findingName) : []).toEqual(["Печень", "Мочевой пузырь"]);
    await addFinding(wrapper, "instrumental.finding.ultrasound-abdomen.1.10");
    await selectChoice(wrapper, "instrumental.finding.ultrasound-abdomen.1.10.2");
    const focalContinuation = levelFor(wrapper, "instrumental.finding.ultrasound-abdomen.1.10.2.1");
    expect(focalContinuation.props("choiceContinuation")).toBe(true);
    expect(focalContinuation.find(".instrumental-result-headings").exists()).toBe(false);
    const focalContinuationRow = focalContinuation.get(".instrumental-choice-continuation-row");
    expect(focalContinuationRow.find(".instrumental-result-desktop-name").exists()).toBe(false);
    expect(focalContinuationRow.find(".instrumental-result-mobile-name").exists()).toBe(false);
    expect(focalContinuationRow.get("select").attributes("aria-label")).toBe("Значение показателя «Визуализируются»");
    await selectChoice(wrapper, "instrumental.finding.ultrasound-abdomen.1.10.2.2");
    const focalCount = wrapper.findAll("select").find((selector) =>
      selector.attributes("aria-label")?.includes("Визуализируются"))!;
    expect((focalCount.element as HTMLSelectElement).value).toBe("instrumental.finding.ultrasound-abdomen.1.10.2.2");
    await selectChoice(wrapper, "instrumental.finding.ultrasound-abdomen.1.10.1");
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(wrapper.find(".instrumental-choice-continuation-row").exists()).toBe(false);
    const liver = current().studies[0]?.mode === "tree" ? current().studies[0].findings.find((item) => item.findingName === "Печень") : undefined;
    expect(liver?.children[0]?.children).toEqual([expect.objectContaining({ findingName: "Не визуализируются", children: [] })]);

    await addFinding(wrapper, "instrumental.finding.ultrasound-abdomen.9.3");
    const bladderFindingLevel = levelFor(wrapper, "instrumental.finding.ultrasound-abdomen.9.3");
    expect(bladderFindingLevel.findComponent(AppCatalogCombobox).props("placeholder")).toBe("Выберите показатель");
    expect(bladderFindingLevel.get(".instrumental-finding-create-label").text()).toBe("Показатель");
    await selectChoice(wrapper, "instrumental.finding.ultrasound-abdomen.9.3.5");
    await addFinding(wrapper, "instrumental.finding.ultrasound-abdomen.9.3.5.2");
    await selectChoice(wrapper, "instrumental.finding.ultrasound-abdomen.9.3.5.2.1");
    await selectChoice(wrapper, "instrumental.finding.ultrasound-abdomen.9.3.5.2.2");
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    await addFinding(wrapper, "instrumental.finding.ultrasound-abdomen.9.3.5.2.3");

    const valueField = wrapper.findAll(".instrumental-result-control").find((field) =>
      field.get("select").attributes("aria-label")?.includes("Конкременты"))!;
    expect(valueField.get(".instrumental-result-mobile-name").text()).toBe("Конкременты");
    expect(valueField.get("select").attributes("multiple")).toBeUndefined();
    expect((valueField.get("select").element as HTMLSelectElement).value).toBe("instrumental.finding.ultrasound-abdomen.9.3.5.2.2");
    expect(wrapper.findAll(".instrumental-result-headings")[0]!.text()).toBe("ПоказательРезультат");
    const bladder = current().studies[0]?.mode === "tree" ? current().studies[0].findings.find((item) => item.findingName === "Мочевой пузырь") : undefined;
    expect(bladder?.children[0]?.children[0]?.children[0]?.children.map((item) => item.findingName)).toEqual(["Множественные", "Размер"]);

    const sizeLabel = wrapper.findAll(".instrumental-finding-content label").find((label) =>
      label.find('input[aria-label="Размер, мм"]').exists())!;
    const sizeInput = sizeLabel.get("input");
    expect(sizeInput.attributes()).toMatchObject({ type: "number", min: "0", step: "1", inputmode: "numeric" });
    expect(sizeLabel.get(".instrumental-integer-unit").text()).toBe("мм");
    await sizeInput.setValue("4");
    const deepContent = sizeLabel.element.closest<HTMLElement>(".instrumental-finding-content")!;
    expect(deepContent.style.getPropertyValue("--instrumental-depth")).toBe("3");
    expect(bladder?.children[0]?.children[0]?.children[0]?.children.find((item) => item.findingName === "Размер"))
      .toMatchObject({ value: "4", unit: "мм" });
    expect(wrapper.findAll(".instrumental-finding-add").every((button) => button.classes().includes("medical-card-action"))).toBe(true);
    expect(wrapper.findAll('button[title="Удалить раздел"]').map((button) => button.attributes("aria-label"))).toEqual([
      "Удалить раздел «Печень»",
      "Удалить раздел «Мочевой пузырь»",
    ]);
    expect(wrapper.findAll('button[title="Удалить показатель"]').length).toBeGreaterThan(0);

    await valueField.get("select").setValue("");
    await flushPromises();
    expect(wrapper.get('[role="alertdialog"]').text()).toContain("Удалить выбранное значение");
    await wrapper.get('[role="alertdialog"] .danger').trigger("click");
    await flushPromises();
    expect((wrapper.findAll("select").find((selector) => selector.attributes("aria-label")?.includes("Конкременты"))!
      .element as HTMLSelectElement).value).toBe("");
    expect(bladder?.children[0]?.children[0]?.children[0]?.children.map((item) => item.findingName)).toEqual(["Размер"]);

    await wrapper.get('button[aria-label="Удалить показатель «Размер»"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Удалить показатель «Размер»"]').exists()).toBe(false);

    await wrapper.get('button[aria-label="Удалить раздел «Печень»"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alertdialog"]').text()).toContain("Удалить заполненный раздел?");
    expect(wrapper.get('[role="alertdialog"]').text()).toContain("Раздел «Печень» и все вложенные данные будут удалены.");
    await wrapper.get('[role="alertdialog"] .danger').trigger("click");
    await flushPromises();
    expect(current().studies[0]?.mode === "tree" ? current().studies[0].findings.map((item) => item.findingName) : []).toEqual(["Мочевой пузырь"]);

    await wrapper.get('button[aria-label="Удалить раздел «Мочевой пузырь»"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alertdialog"]').text()).toContain("Мочевой пузырь");
    await wrapper.get('[role="alertdialog"] .outline-action').trigger("click");
    expect(current().studies[0]?.mode === "tree" ? current().studies[0].findings : []).toHaveLength(1);
  });

  it("formats root free-text findings like narrative laboratory results", async () => {
    const { wrapper } = mountEditor();
    await chooseType(wrapper, "instrumental.study.ultrasound-abdomen");
    await addFinding(wrapper, "instrumental.finding.ultrasound-abdomen.15");
    await addFinding(wrapper, "instrumental.finding.ultrasound-abdomen.3");
    await addFinding(wrapper, "instrumental.finding.ultrasound-abdomen.3.4");

    const rootContent = wrapper.findAll(".instrumental-finding-content")
      .find((content) => content.find("strong").exists() && content.find("strong").text() === "Левый надпочечник")!;
    const nestedContent = wrapper.findAll(".instrumental-finding-content")
      .find((content) => content.find(".instrumental-result-mobile-name").exists()
        && content.find(".instrumental-result-mobile-name").text() === "Комментарии")!;

    expect(rootContent.classes()).toContain("instrumental-root-free-text");
    expect(rootContent.element.parentElement?.classList).not.toContain("instrumental-result-row");
    expect(rootContent.find("label > span").exists()).toBe(false);
    expect(rootContent.get("textarea").attributes("aria-label")).toBe("Левый надпочечник");
    expect(rootContent.get("textarea").attributes("rows")).toBe("4");
    expect(rootContent.get("textarea").classes()).not.toContain("medical-card-comment");
    expect(nestedContent.classes()).not.toContain("instrumental-root-free-text");
    expect(nestedContent.get("textarea").attributes("rows")).toBe("2");
    expect(nestedContent.get("textarea").classes()).toContain("medical-card-comment");
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
    expect(wrapper.get('[role="alertdialog"]').text()).toContain("Удалить заполненное исследование?");
    expect(wrapper.get('[role="alertdialog"]').text()).toContain("Исследование «Рентген грудной и брюшной полости»");
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
