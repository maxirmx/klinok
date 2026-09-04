// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { flushPromises, mount, type DOMWrapper, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type {
  InstrumentalFindingCatalogItem,
  InstrumentalFindingValue,
  InstrumentalTestsSectionValue,
} from "@klinok/contracts";
import AppCatalogCombobox from "../src/components/AppCatalogCombobox.vue";
import InstrumentalFindingEditor from "../src/components/InstrumentalFindingEditor.vue";
import InstrumentalFindingsView from "../src/components/InstrumentalFindingsView.vue";
import InstrumentalTestsEditor from "../src/components/InstrumentalTestsEditor.vue";

const prefix = "instrumental.finding.ultrasound-abdomen";
const id = (code: string) => `${prefix}.${code}`;
const xrayPrefix = "instrumental.finding.xray-thorax";
const xrayId = (code: string) => `${xrayPrefix}.${code}`;
const abdomenXrayPrefix = "instrumental.finding.xray-abdomen";
const abdomenXrayId = (code: string) => `${abdomenXrayPrefix}.${code}`;

function mountEditor(initial: InstrumentalTestsSectionValue = { studies: [] }, errors?: object) {
  let current = initial;
  let wrapper: VueWrapper;
  wrapper = mount(InstrumentalTestsEditor, {
    props: {
      modelValue: current,
      encounterDate: "2026-08-15",
      ...(errors ? { errors } : {}),
      "onUpdate:modelValue": (value: InstrumentalTestsSectionValue) => {
        current = value;
        if (wrapper) void wrapper.setProps({ modelValue: value });
      },
    },
  });
  if (current !== initial) void wrapper.setProps({ modelValue: current });
  return {
    wrapper,
    current: () => current,
    replace: async (value: InstrumentalTestsSectionValue) => {
      current = value;
      await wrapper.setProps({ modelValue: value });
    },
  };
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
  const createElement = selector.element.closest(".instrumental-finding-create");
  const createRow = level.findAll(".instrumental-finding-create")
    .find((candidate) => candidate.element === createElement);
  if (!createRow) throw new Error(`Missing create row for ${id}`);
  await createRow.get(".instrumental-finding-add").trigger("click");
  await flushPromises();
}

async function selectChoice(wrapper: VueWrapper, id: string) {
  const selector = wrapper.findAll("select").find((candidate) => candidate.find(`option[value="${id}"]`).exists());
  if (!selector) throw new Error(`Missing value selector for ${id}`);
  await selector.setValue(id);
  await flushPromises();
}

describe("InstrumentalTestsEditor", () => {
  it("places the study type selector below existing studies", async () => {
    const { wrapper } = mountEditor();
    await chooseType(wrapper, "instrumental.study.ultrasound-abdomen");

    expect(wrapper.get(".instrumental-study-card").exists()).toBe(true);
    const children = Array.from(wrapper.get(".instrumental-study-list").element.parentElement!.children);
    expect(children.indexOf(wrapper.get(".instrumental-study-list").element))
      .toBeLessThan(children.indexOf(wrapper.get(".instrumental-study-create").element));
  });

  it("describes errors for every finding render mode", () => {
    const catalog: readonly InstrumentalFindingCatalogItem[] = [
      { id: "group", name: "Раздел", kind: "group", children: [] },
      { id: "integer", name: "Количество", kind: "integer", unit: "мм", children: [] },
      { id: "short", name: "Краткое значение", kind: "short-text", children: [] },
      { id: "long", name: "Подробное значение", kind: "long-text", children: [] },
      {
        id: "choice-group",
        name: "Выбор",
        kind: "group",
        children: [{ id: "choice", name: "Вариант", kind: "choice", children: [] }],
      },
    ];
    const values: readonly InstrumentalFindingValue[] = catalog.map((item) => ({
      findingId: item.id,
      findingName: item.name,
      ...(["integer", "short-text", "long-text"].includes(item.kind) ? { value: "" } : {}),
      ...(item.unit ? { unit: item.unit } : {}),
      children: [],
    }));
    const errors = Object.fromEntries(catalog.map((item) => [item.id, `Ошибка: ${item.name}`]));
    const wrapper = mount(InstrumentalFindingEditor, {
      props: { catalog, modelValue: values, errors },
    });
    const fields = [
      wrapper.get('[data-finding-id="group"]'),
      wrapper.get('input[aria-label="Количество, мм"]'),
      wrapper.get('input[aria-label="Краткое значение"]'),
      wrapper.get('textarea[aria-label="Подробное значение"]'),
      wrapper.get('select[aria-label="Значение показателя «Выбор»"]'),
    ];

    for (const field of fields) {
      const errorId = field.attributes("aria-describedby");
      expect(field.attributes("aria-invalid")).toBe("true");
      expect(errorId).toBeTruthy();
      expect(wrapper.findAll(".field-error").some((error) => error.attributes("id") === errorId)).toBe(true);
    }
  });

  it("places level creation after values, preserves data, and focuses an added finding", async () => {
    const catalog: readonly InstrumentalFindingCatalogItem[] = [
      { id: "first", name: "Первый", kind: "short-text", children: [] },
      { id: "second", name: "Второй", kind: "short-text", children: [] },
    ];
    let current: readonly InstrumentalFindingValue[] = [{
      findingId: "first",
      findingName: "Первый",
      value: "Сохранено",
      children: [],
    }];
    const wrapper = mount(InstrumentalFindingEditor, {
      attachTo: document.body,
      props: {
        catalog,
        modelValue: current,
        depth: 1,
        parentName: "Раздел",
        "onUpdate:modelValue": (value: readonly InstrumentalFindingValue[]) => {
          current = value;
          void wrapper.setProps({ modelValue: value });
        },
      },
    });
    const levelChildren = Array.from(wrapper.element.children);
    expect(levelChildren.indexOf(wrapper.get('[data-finding-id="first"]').element))
      .toBeLessThan(levelChildren.indexOf(wrapper.get(".instrumental-finding-create").element));

    wrapper.findComponent(AppCatalogCombobox).vm.$emit("update:selectedIds", ["second"]);
    await flushPromises();
    await wrapper.get(".instrumental-finding-add").trigger("click");
    await flushPromises();

    expect(current).toEqual([
      expect.objectContaining({ findingId: "first", value: "Сохранено" }),
      expect.objectContaining({ findingId: "second", value: "" }),
    ]);
    expect(document.activeElement).toBe(wrapper.get('input[aria-label="Второй"]').element);
    expect(wrapper.find(".instrumental-finding-create").exists()).toBe(false);

    await wrapper.get('button[aria-label="Удалить показатель «Второй»"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(wrapper.get(".instrumental-finding-create-after-values").exists()).toBe(true);
    wrapper.unmount();
  });

  it("hides an indicator selector when every indicator at its level is already added", async () => {
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
      unit: "мм",
      children: [],
    };
    const wrapper = mount(InstrumentalFindingEditor, {
      props: {
        catalog,
        modelValue: [finding],
        depth: 1,
        parentName: "Печень",
      },
    });

    expect(wrapper.find(".instrumental-finding-create").exists()).toBe(false);
    expect(wrapper.find('input[aria-label="Добавить показатель для «Печень»"]').exists()).toBe(false);

    await wrapper.get('button[aria-label="Удалить показатель «Размер»"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(wrapper.get(".instrumental-finding-create-label").text()).toBe("Показатель");
    expect(wrapper.get('input[aria-label="Добавить показатель для «Печень»"]').exists()).toBe(true);
  });

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

  it("marks a nested non-result group at its logical hierarchy depth", async () => {
    const { wrapper } = mountEditor();
    await chooseType(wrapper, "instrumental.study.ultrasound-abdomen");
    await addFinding(wrapper, id("9"));
    await addFinding(wrapper, id("9.2"));

    const wallRow = wrapper.get('button[aria-label="Удалить показатель «Стенка»"]')
      .element.closest<HTMLElement>(".instrumental-finding-row")!;
    const wallContent = wallRow.querySelector<HTMLElement>(":scope > .instrumental-finding-content")!;
    expect(wallContent.dataset.hierarchyDepth).toBe("1");
    expect(wallContent.classList).not.toContain("instrumental-result-content");
    expect(wallContent.querySelector(".instrumental-finding-name")?.textContent).toBe("Стенка");
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
    expect(rootFindingEditor.get(".instrumental-finding-create").attributes("data-hierarchy-depth")).toBe("0");
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
    expect(focalContinuationRow.get(".instrumental-result-content").attributes("data-hierarchy-depth")).toBe("1");
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
    expect(valueField.element.closest<HTMLElement>(".instrumental-result-content")!.dataset.hierarchyDepth).toBe("2");
    expect(valueField.get("select").attributes("multiple")).toBeUndefined();
    expect((valueField.get("select").element as HTMLSelectElement).value).toBe("instrumental.finding.ultrasound-abdomen.9.3.5.2.2");
    expect(wrapper.find(".instrumental-result-headings").exists()).toBe(false);
    const bladder = current().studies[0]?.mode === "tree" ? current().studies[0].findings.find((item) => item.findingName === "Мочевой пузырь") : undefined;
    expect(bladder?.children[0]?.children[0]?.children[0]?.children.map((item) => item.findingName)).toEqual(["Множественные", "Размер"]);

    const sizeLabel = wrapper.findAll(".instrumental-finding-content label").find((label) =>
      label.find('input[aria-label="Размер, мм"]').exists())!;
    const sizeInput = sizeLabel.get("input");
    expect(sizeInput.attributes()).toMatchObject({ type: "number", min: "0", step: "1", inputmode: "numeric" });
    expect(sizeLabel.get(".instrumental-integer-unit").text()).toBe("мм");
    await sizeInput.setValue("4");
    const deepContent = sizeLabel.element.closest<HTMLElement>(".instrumental-finding-content")!;
    expect(deepContent.dataset.hierarchyDepth).toBe("3");
    expect(wrapper.get(`select[aria-label="Значение показателя «Содержимое»"]`)
      .element.closest<HTMLElement>(".instrumental-result-content")!.dataset.hierarchyDepth).toBe("1");
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
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
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

  it("shows, aligns, persists, and clears conditional liver and spleen measurements", async () => {
    const { wrapper, current } = mountEditor();
    await chooseType(wrapper, "instrumental.study.ultrasound-abdomen");
    await addFinding(wrapper, id("1"));
    await addFinding(wrapper, id("1.10"));
    expect(wrapper.find(`option[value="${id("1.11")}"]`).exists()).toBe(false);
    expect(wrapper.find('input[aria-label="Размер, мм"]').exists()).toBe(false);

    await selectChoice(wrapper, id("1.10.2"));
    const continuation = levelFor(wrapper, id("1.10.2.1"));
    expect(continuation.props("choiceContinuation")).toBe(true);
    expect(continuation.get(".instrumental-finding-create").attributes("data-hierarchy-depth")).toBe("2");
    await addFinding(wrapper, id("1.11"));
    await addFinding(wrapper, id("1.12"));
    await selectChoice(wrapper, id("1.11.3"));
    await wrapper.get('input[aria-label="Размер, мм"]').setValue("9");
    const focalSelectorContent = wrapper.get(`select[aria-label="Значение показателя «Очаговые образования»"]`)
      .element.closest<HTMLElement>(".instrumental-finding-content")!;
    const echogenicityContent = wrapper.get(`select[aria-label="Значение показателя «Эхогенность»"]`)
      .element.closest<HTMLElement>(".instrumental-finding-content")!;
    const sizeContent = wrapper.get('input[aria-label="Размер, мм"]').element
      .closest<HTMLElement>(".instrumental-finding-content")!;
    expect(focalSelectorContent.dataset.hierarchyDepth).toBe("1");
    expect(echogenicityContent.dataset.hierarchyDepth).toBe("2");
    expect(sizeContent.dataset.hierarchyDepth).toBe("2");
    await selectChoice(wrapper, id("1.10.1"));
    expect(wrapper.find(`select[aria-label="Значение показателя «Эхогенность»"]`).exists()).toBe(false);
    expect(wrapper.find('input[aria-label="Размер, мм"]').exists()).toBe(false);
    const liver = current().studies[0]?.mode === "tree" ? current().studies[0].findings[0] : undefined;
    expect(liver?.children[0]?.children).toEqual([expect.objectContaining({ findingId: id("1.10.1"), children: [] })]);

    await addFinding(wrapper, id("4"));
    await addFinding(wrapper, id("4.4"));
    await addFinding(wrapper, id("4.6"));
    await wrapper.get('textarea[aria-label="Комментарии"]').setValue("Сохраняется");
    await selectChoice(wrapper, id("4.4.2"));
    await addFinding(wrapper, id("4.5"));
    const spleenSize = wrapper.get('input[aria-label="Размер образований, мм"]');
    await spleenSize.setValue("12");
    expect(wrapper.get(`select[aria-label="Значение показателя «Объёмные образования»"]`)
      .element.closest<HTMLElement>(".instrumental-finding-content")!.dataset.hierarchyDepth).toBe("1");
    expect(spleenSize.element.closest<HTMLElement>(".instrumental-finding-content")!.dataset.hierarchyDepth).toBe("2");
    await selectChoice(wrapper, id("4.4.1"));
    expect(wrapper.find('input[aria-label="Размер образований, мм"]').exists()).toBe(false);
    expect(wrapper.get<HTMLTextAreaElement>('textarea[aria-label="Комментарии"]').element.value).toBe("Сохраняется");
  });

  it("renders sediment character as an optional checkbox group and keeps 0..N selections canonical", async () => {
    const { wrapper, current } = mountEditor();
    await chooseType(wrapper, "instrumental.study.ultrasound-abdomen");
    await addFinding(wrapper, id("2"));
    await addFinding(wrapper, id("2.5"));
    expect(wrapper.find("fieldset.instrumental-multiple-choice-panel").exists()).toBe(false);
    await selectChoice(wrapper, id("2.5.2"));

    const panel = wrapper.get("fieldset.instrumental-multiple-choice-panel");
    expect(panel.element.closest<HTMLElement>(".instrumental-result-content")!.dataset.hierarchyDepth).toBe("2");
    expect(panel.get("legend.visually-hidden").text()).toBe("Характер осадка");
    expect(panel.get(".medical-card-options").exists()).toBe(true);
    expect(panel.findAll('input[type="checkbox"]')).toHaveLength(7);
    expect(panel.find("select").exists()).toBe(false);
    const checkbox = (name: string) => panel.findAll("label.check-row")
      .find((label) => label.text() === name)!.get<HTMLInputElement>('input[type="checkbox"]');
    const activeChildren = () => current().studies[0]?.mode === "tree"
      ? current().studies[0].findings[0]?.children[0]?.children[0]?.children ?? []
      : [];
    expect(activeChildren()).toEqual([]);
    await checkbox("Подвижный").setValue(true);
    await checkbox("Смешанный").setValue(true);
    expect(activeChildren()[0]).toMatchObject({
      findingId: id("2.6"),
      children: [{ findingId: id("2.6.1") }, { findingId: id("2.6.7") }],
    });
    await checkbox("Подвижный").setValue(false);
    await checkbox("Смешанный").setValue(false);
    expect(activeChildren()).toEqual([]);
    await checkbox("Конкременты").setValue(true);
    await selectChoice(wrapper, id("2.5.1"));
    expect(wrapper.find("fieldset.instrumental-multiple-choice-panel").exists()).toBe(false);
    expect(current().studies[0]?.mode === "tree" ? current().studies[0].findings[0]?.children[0]?.children : [])
      .toEqual([expect.objectContaining({ findingId: id("2.5.1"), children: [] })]);
  });

  it("edits prostate contour selection sets independently and in catalog order", async () => {
    const { wrapper, current } = mountEditor();
    await chooseType(wrapper, "instrumental.study.ultrasound-abdomen");
    await addFinding(wrapper, id("10"));
    await addFinding(wrapper, id("10.1"));

    const regularity = wrapper.get<HTMLSelectElement>('select[aria-label="Ровность контуров"]');
    const definition = wrapper.get<HTMLSelectElement>('select[aria-label="Чёткость контуров"]');
    expect(regularity.findAll("option").map((option) => option.text())).toEqual(["Не указано", "Ровные", "Неровные"]);
    expect(definition.findAll("option").map((option) => option.text())).toEqual(["Не указано", "Чёткие", "Нечёткие"]);
    expect(wrapper.get(".instrumental-selection-set-grid").findAll(".instrumental-selection-set-field")).toHaveLength(2);
    expect(wrapper.get(".instrumental-selection-set-grid").element
      .closest<HTMLElement>(".instrumental-result-content")!.dataset.hierarchyDepth).toBe("1");
    expect(wrapper.find(".instrumental-selection-set-field-wide").exists()).toBe(false);
    await wrapper.setProps({ errors: { studies: [{ findings: {
      [`${id("10.1")}:regularity`]: "Заполните характеристику «Ровность контуров».",
      [`${id("10.1")}:definition`]: "Заполните характеристику «Чёткость контуров».",
    } }] } });
    const selectionErrors = wrapper.findAll(".instrumental-selection-set-field .field-error");
    expect(selectionErrors.map((error) => error.text())).toEqual([
      "Заполните характеристику «Ровность контуров».",
      "Заполните характеристику «Чёткость контуров».",
    ]);
    expect(regularity.attributes("aria-invalid")).toBe("true");
    expect(definition.attributes("aria-invalid")).toBe("true");
    expect([regularity, definition].map((field) => field.attributes("aria-describedby")))
      .toEqual(selectionErrors.map((error) => error.attributes("id")));
    await definition.setValue(id("10.1.4"));
    await regularity.setValue(id("10.1.1"));
    expect(definition.element.value).toBe(id("10.1.4"));
    const contours = current().studies[0]?.mode === "tree"
      ? current().studies[0].findings[0]?.children[0]
      : undefined;
    expect(contours?.children.map((child) => child.findingId)).toEqual([id("10.1.1"), id("10.1.4")]);
    await regularity.setValue(id("10.1.2"));
    expect(definition.element.value).toBe(id("10.1.4"));
    expect(contours?.children.map((child) => child.findingId)).toEqual([id("10.1.2"), id("10.1.4")]);
    await regularity.setValue("");
    await definition.setValue("");
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(contours?.children).toEqual([]);
    await regularity.setValue(id("10.1.1"));
    await regularity.setValue("");
    await definition.setValue(id("10.1.3"));
    await definition.setValue("");
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(contours?.children).toEqual([]);
    await wrapper.get('button[aria-label="Удалить показатель «Контуры»"]').trigger("click");
    expect(wrapper.find('select[aria-label="Ровность контуров"]').exists()).toBe(false);
  });

  it("canonicalizes legacy conditional siblings before editing", async () => {
    const initial: InstrumentalTestsSectionValue = { studies: [{
      id: "123e4567-e89b-12d3-a456-426614174000",
      date: "2026-08-15",
      typeId: "instrumental.study.ultrasound-abdomen",
      typeName: "УЗИ органов брюшной полости",
      mode: "tree",
      findings: [{
        findingId: id("1"), findingName: "Печень", children: [{
          findingId: id("1.10"), findingName: "Очаговые образования", children: [{
            findingId: id("1.10.2"), findingName: "Визуализируются", children: [],
          }],
        }, {
          findingId: id("1.12"), findingName: "Размер", value: "7", unit: "мм", children: [],
        }],
      }],
    }] };
    const { wrapper, current } = mountEditor(initial);
    await flushPromises();
    expect(current().studies[0]?.mode === "tree"
      ? current().studies[0].findings[0]?.children[0]?.children[0]?.children[0]
      : undefined).toMatchObject({ findingId: id("1.12"), value: "7" });
    expect(wrapper.get<HTMLInputElement>('input[aria-label="Размер, мм"]').element.value).toBe("7");
  });

  it("renders selected findings and pulmonary locations recursively in history without empty groups", () => {
    const wrapper = mount(InstrumentalFindingsView, { props: { findings: [{
      findingId: id("10.1"), findingName: "Контуры", children: [
        { findingId: id("10.1.1"), findingName: "Ровные", children: [] },
        { findingId: id("10.1.4"), findingName: "Нечёткие", children: [] },
      ],
    }, {
      findingId: id("2.6"), findingName: "Характер осадка", children: [
        { findingId: id("2.6.1"), findingName: "Смешанный", children: [] },
        { findingId: id("2.6.7"), findingName: "Подвижный", children: [] },
      ],
    }, {
      findingId: xrayId("17.3"), findingName: "Лёгочный рисунок", children: [
        { findingId: xrayId("17.3.8"), findingName: "Имеет усиление альвеолярного рисунка", children: [] },
        { findingId: xrayId("17.3.10"), findingName: "Имеет картину альвеолярных поражений", children: [] },
        { findingId: xrayId("17.3.13"), findingName: "Изменения отмечаются в", children: [
          { findingId: xrayId("17.3.13.1"), findingName: "Краниальных долях лёгкого", children: [] },
          { findingId: xrayId("17.3.13.2"), findingName: "Каудальных долях лёгкого", children: [] },
        ] },
      ],
    }, {
      findingId: xrayId("17.3.13"), findingName: "Пустая локализация", children: [],
    }] } });
    expect(wrapper.text()).toContain("Контуры");
    expect(wrapper.text()).toContain("Ровные");
    expect(wrapper.text()).toContain("Нечёткие");
    expect(wrapper.text()).toContain("Смешанный");
    expect(wrapper.text()).toContain("Подвижный");
    expect(wrapper.text()).toContain("Лёгочный рисунок");
    expect(wrapper.text()).toContain("Имеет усиление альвеолярного рисунка");
    expect(wrapper.text()).toContain("Имеет картину альвеолярных поражений");
    expect(wrapper.text()).toContain("Изменения отмечаются в");
    expect(wrapper.text()).toContain("Краниальных долях лёгкого");
    expect(wrapper.text()).toContain("Каудальных долях лёгкого");
    expect(wrapper.text()).not.toContain("Пустая локализация");
  });

  it("restores a missing required selector continuation on opening and model replacement", async () => {
    const initial: InstrumentalTestsSectionValue = { studies: [{
      id: "123e4567-e89b-12d3-a456-426614174000",
      date: "2026-08-15",
      typeId: "instrumental.study.xray-thorax",
      typeName: "Рентгенография грудной полости",
      mode: "tree",
      findings: [{
        findingId: xrayId("10"), findingName: "Купол диафрагмы", children: [{
          findingId: xrayId("10.0"), findingName: "Характеристики купола", children: [{
            findingId: xrayId("10.0.5"), findingName: "На LL-проекции в области межреберья", children: [],
          }],
        }],
      }],
    }] };
    const { wrapper, current, replace } = mountEditor(initial);
    await flushPromises();
    expect(current().studies[0]?.mode === "tree"
      ? current().studies[0].findings[0]?.children[0]?.children[0]?.children
      : []).toEqual([expect.objectContaining({ findingId: xrayId("10.0.5.intercostal"), value: "" })]);
    const field = wrapper.get<HTMLInputElement>('input[aria-label="Межреберье на LL-проекции"]');
    expect(field.element.value).toBe("");
    expect(wrapper.find(`button[aria-label="Удалить показатель «Межреберье на LL-проекции»"]`).exists()).toBe(false);

    await replace({
      studies: [{
        ...initial.studies[0]!,
        id: "223e4567-e89b-12d3-a456-426614174000",
      }],
    });
    await flushPromises();
    expect(current().studies[0]?.id).toBe("223e4567-e89b-12d3-a456-426614174000");
    expect(current().studies[0]?.mode === "tree"
      ? current().studies[0].findings[0]?.children[0]?.children[0]?.children
      : []).toEqual([expect.objectContaining({ findingId: xrayId("10.0.5.intercostal"), value: "" })]);
  });

  it("hides and clears caudal vena cava details when it is not visualized", async () => {
    const { wrapper, current } = mountEditor();
    await chooseType(wrapper, "instrumental.study.xray-thorax");
    await addFinding(wrapper, xrayId("14"));
    await addFinding(wrapper, xrayId("14.1"));
    await selectChoice(wrapper, xrayId("14.1.1"));
    await addFinding(wrapper, xrayId("14.2"));
    await selectChoice(wrapper, xrayId("14.2.1"));
    await addFinding(wrapper, xrayId("14.4"));
    await wrapper.get('textarea[aria-label="Выявлено"]').setValue("Смещена");

    await selectChoice(wrapper, xrayId("14.1.3"));
    expect(wrapper.find(`select[aria-label="Значение показателя «Положение»"]`).exists()).toBe(false);
    expect(wrapper.find('textarea[aria-label="Выявлено"]').exists()).toBe(false);
    const venaCavaLevel = levelFor(wrapper, xrayId("14.1"));
    expect(venaCavaLevel.findComponent(AppCatalogCombobox).exists()).toBe(false);
    const venaCava = current().studies[0]?.mode === "tree" ? current().studies[0].findings[0] : undefined;
    expect(venaCava?.children).toEqual([expect.objectContaining({
      findingId: xrayId("14.1"),
      children: [expect.objectContaining({ findingId: xrayId("14.1.3") })],
    })]);

    await selectChoice(wrapper, xrayId("14.1.2"));
    expect(venaCavaLevel.getComponent(AppCatalogCombobox).props("options")).toContainEqual({
      id: xrayId("14.2"),
      label: "Положение",
    });
    expect(wrapper.find(`select[aria-label="Значение показателя «Положение»"]`).exists()).toBe(false);
  });

  it("keeps large-bronchi lumen and position available for every overall state", async () => {
    const { wrapper, current } = mountEditor();
    await chooseType(wrapper, "instrumental.study.xray-thorax");
    await addFinding(wrapper, xrayId("17"));
    await addFinding(wrapper, xrayId("17.5"));
    const largeBronchiLevel = levelFor(wrapper, xrayId("17.5.1"));
    const availableIds = () => largeBronchiLevel.getComponent(AppCatalogCombobox)
      .props("options").map((option: { id: string }) => option.id);
    expect(availableIds()).toEqual([xrayId("17.5.1"), xrayId("17.5.2")]);

    await selectChoice(wrapper, xrayId("17.5.0.1"));
    expect(availableIds()).toEqual([xrayId("17.5.1"), xrayId("17.5.2")]);
    await addFinding(wrapper, xrayId("17.5.1"));
    await selectChoice(wrapper, xrayId("17.5.1.2"));
    await addFinding(wrapper, xrayId("17.5.2"));
    await selectChoice(wrapper, xrayId("17.5.2.1"));

    await selectChoice(wrapper, xrayId("17.5.0.2"));
    expect(wrapper.get<HTMLSelectElement>('select[aria-label="Значение показателя «Просвет»"]').element.value)
      .toBe(xrayId("17.5.1.2"));
    expect(wrapper.get<HTMLSelectElement>('select[aria-label="Значение показателя «Положение»"]').element.value)
      .toBe(xrayId("17.5.2.1"));
    const lungs = current().studies[0]?.mode === "tree" ? current().studies[0].findings[0] : undefined;
    expect(lungs?.children[0]?.children.map((item) => item.findingId)).toEqual([
      xrayId("17.5.0.2"), xrayId("17.5.1"), xrayId("17.5.2"),
    ]);
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
    expect(rootContent.attributes("data-hierarchy-depth")).toBe("0");
    expect(rootContent.element.parentElement?.classList).not.toContain("instrumental-result-row");
    expect(rootContent.find("label > span").exists()).toBe(false);
    expect(rootContent.get("textarea").attributes("aria-label")).toBe("Левый надпочечник");
    expect(rootContent.get("textarea").attributes("rows")).toBe("4");
    expect(rootContent.get("textarea").classes()).not.toContain("medical-card-comment");
    expect(nestedContent.classes()).not.toContain("instrumental-root-free-text");
    expect(nestedContent.attributes("data-hierarchy-depth")).toBe("1");
    expect(nestedContent.get("textarea").attributes("rows")).toBe("2");
    expect(nestedContent.get("textarea").classes()).toContain("medical-card-comment");
  });

  it("edits structured X-ray choices, shows required text, and deletes safely", async () => {
    const { wrapper, current } = mountEditor({ studies: [] }, {
      section: "Добавьте хотя бы одно инструментальное исследование.", studies: [],
    });
    const sectionError = wrapper.get('[role="alert"]');
    const typeInput = wrapper.get('input[aria-label="Тип исследования"]');
    expect(sectionError.text()).toContain("Добавьте хотя бы одно");
    expect(typeInput.attributes("aria-invalid")).toBe("true");
    expect(typeInput.attributes("aria-describedby")).toBe(sectionError.attributes("id"));
    await chooseType(wrapper, "instrumental.study.xray-thorax");
    expect(current().studies[0]).toMatchObject({ mode: "tree", findings: [] });
    await wrapper.setProps({ errors: { studies: [{ section: "Добавьте результат исследования." }] } });
    const studySectionError = wrapper.get('.instrumental-study-card [data-encounter-error-anchor="true"]');
    expect(studySectionError.attributes("tabindex")).toBe("-1");

    await addFinding(wrapper, xrayId("1"));
    const projections = wrapper.findAll("fieldset").find((panel) => panel.get("legend").text() === "Проекции")!;
    expect(projections.get("legend").text()).toBe("Проекции");
    expect(projections.findAll('input[type="checkbox"]')).toHaveLength(4);
    const checkbox = (panel: DOMWrapper<Element>, name: string) => panel.findAll("label.check-row")
      .find((label) => label.text() === name)!.get<HTMLInputElement>('input[type="checkbox"]');
    await checkbox(projections, "Левая латеролатеральная").setValue(true);
    await checkbox(projections, "Правая латеролатеральная").setValue(true);
    expect(current().studies[0]?.mode === "tree"
      ? current().studies[0].findings[0]?.children[0]?.children.map((item) => item.findingId)
      : []).toEqual([xrayId("1.0.1"), xrayId("1.0.2")]);

    await addFinding(wrapper, xrayId("10"));
    const diaphragm = wrapper.get(`[data-finding-id="${xrayId("10.0")}"]`);
    const regularity = diaphragm.get<HTMLSelectElement>('select[aria-label="Ровность купола"]');
    const definition = diaphragm.get<HTMLSelectElement>('select[aria-label="Чёткость купола"]');
    const projection = diaphragm.get<HTMLSelectElement>('select[aria-label="Проекция"]');
    const fields = diaphragm.findAll(".instrumental-selection-set-field");
    expect(fields).toHaveLength(3);
    expect(fields.slice(0, 2).every((field) => !field.classes().includes("instrumental-selection-set-field-wide"))).toBe(true);
    expect(fields[2]!.classes()).toContain("instrumental-selection-set-field-wide");
    expect(regularity.findAll("option").map((option) => option.text())).toEqual(["Не указано", "Ровный", "Неровный"]);
    expect(definition.findAll("option").map((option) => option.text())).toEqual(["Не указано", "Чёткий", "Нечёткий"]);
    expect(projection.findAll("option").map((option) => option.text())).toEqual([
      "Не указано", "На LL-проекции в области межреберья", "На VD-проекции в области межреберья",
    ]);
    await projection.setValue(xrayId("10.0.5"));
    const intercostal = diaphragm.get<HTMLInputElement>('input[aria-label="Межреберье на LL-проекции"]');
    await intercostal.setValue("7");
    await regularity.setValue(xrayId("10.0.1"));
    await definition.setValue(xrayId("10.0.3"));
    await regularity.setValue(xrayId("10.0.2"));
    expect(regularity.element.value).toBe(xrayId("10.0.2"));
    expect(definition.element.value).toBe(xrayId("10.0.3"));
    expect(projection.element.value).toBe(xrayId("10.0.5"));
    expect(intercostal.element.value).toBe("7");

    await addFinding(wrapper, xrayId("12"));
    const heartBorders = wrapper.get(`[data-finding-id="${xrayId("12.2")}"]`);
    const borderDefinition = heartBorders.get<HTMLSelectElement>('select[aria-label="Чёткость границ"]');
    const borderRegularity = heartBorders.get<HTMLSelectElement>('select[aria-label="Ровность границ"]');
    expect(heartBorders.find('input[type="checkbox"]').exists()).toBe(false);
    expect(heartBorders.findAll("select")).toHaveLength(2);
    expect(heartBorders.findAll(".instrumental-selection-set-field").map((field) => field.get(":scope > span").text()))
      .toEqual(["Ровность границ", "Чёткость границ"]);
    expect(borderDefinition.findAll("option").map((option) => option.text()))
      .toEqual(["Не указано", "Чёткие", "Нечёткие"]);
    expect(borderRegularity.findAll("option").map((option) => option.text()))
      .toEqual(["Не указано", "Ровные", "Неровные"]);
    await borderRegularity.setValue(xrayId("12.2.4"));
    await borderDefinition.setValue(xrayId("12.2.1"));
    await borderDefinition.setValue(xrayId("12.2.2"));
    expect(borderRegularity.element.value).toBe(xrayId("12.2.4"));
    const heart = current().studies[0]?.mode === "tree"
      ? current().studies[0].findings.find((finding) => finding.findingId === xrayId("12"))
      : undefined;
    expect(heart?.children[0]?.children.map((child) => child.findingId))
      .toEqual([xrayId("12.2.2"), xrayId("12.2.4")]);
    await borderDefinition.setValue("");
    expect(borderRegularity.element.value).toBe(xrayId("12.2.4"));
    await borderRegularity.setValue("");
    expect(heart?.children).toEqual([]);

    await addFinding(wrapper, xrayId("17"));
    const lungPattern = wrapper.get(`[data-finding-id="${xrayId("17.3")}"]`);
    const panel = (name: string) => lungPattern.findAll("fieldset")
      .find((candidate) => candidate.get("legend").text() === name)!;
    const absentChanges = panel("Отсутствие признаков");
    const detectedChanges = panel("Выявленные изменения");
    const locations = panel("Изменения отмечаются в");
    const lungCheckbox = (container: DOMWrapper<Element>, name: string) => container.findAll("label.check-row")
      .find((label) => label.text() === name)!.get<HTMLInputElement>('input[type="checkbox"]');
    expect(lungPattern.findAll("select")).toHaveLength(0);
    expect(absentChanges.findAll('input[type="checkbox"]')).toHaveLength(4);
    expect(detectedChanges.findAll('input[type="checkbox"]')).toHaveLength(8);
    expect(locations.findAll('input[type="checkbox"]')).toHaveLength(2);
    expect(absentChanges.get("legend").classes()).toContain("visually-hidden");
    expect(detectedChanges.get("legend").classes()).not.toContain("visually-hidden");
    expect(locations.get("legend").classes()).not.toContain("visually-hidden");
    const locationRow = lungPattern.get(`[data-finding-id="${xrayId("17.3.13")}"]`);
    expect(locationRow.find(".instrumental-result-desktop-name").exists()).toBe(false);
    expect(locationRow.get("fieldset").classes()).toContain("instrumental-panel-label");
    expect([absentChanges, detectedChanges].every((group) =>
      group.classes().includes("instrumental-selection-set-field-wide"))).toBe(true);
    expect(lungPattern.text()).not.toContain("Состояние лёгочного рисунка");
    expect(lungPattern.text()).not.toContain("Очаговые множественные поражения");
    expect(detectedChanges.text()).toContain("Имеет усиление альвеолярного рисунка");
    expect(detectedChanges.text()).toContain("Имеет картину альвеолярных поражений");
    expect(detectedChanges.text()).toContain("Имеет картину заворота");

    await lungCheckbox(panel("Изменения отмечаются в"), "Краниальных долях лёгкого").setValue(true);
    await lungCheckbox(panel("Изменения отмечаются в"), "Каудальных долях лёгкого").setValue(true);
    let lungFieldsValue = current().studies[0]?.mode === "tree"
      ? current().studies[0].findings.find((finding) => finding.findingId === xrayId("17"))
      : undefined;
    expect(lungFieldsValue?.children[0]?.children[0]?.children.map((finding) => finding.findingId))
      .toEqual([xrayId("17.3.13.1"), xrayId("17.3.13.2")]);
    await lungCheckbox(panel("Изменения отмечаются в"), "Краниальных долях лёгкого").setValue(false);
    await lungCheckbox(panel("Изменения отмечаются в"), "Каудальных долях лёгкого").setValue(false);
    lungFieldsValue = current().studies[0]?.mode === "tree"
      ? current().studies[0].findings.find((finding) => finding.findingId === xrayId("17"))
      : undefined;
    expect(lungFieldsValue?.children).toEqual([]);

    const noEnhancement = lungCheckbox(absentChanges, "Без признаков усиления");
    const bronchial = lungCheckbox(detectedChanges, "Имеет усиление бронхиального рисунка");
    await noEnhancement.setValue(true);
    await bronchial.setValue(true);
    expect(noEnhancement.element.checked).toBe(false);
    expect(bronchial.element.checked).toBe(true);
    await noEnhancement.setValue(true);
    expect(noEnhancement.element.checked).toBe(true);
    expect(bronchial.element.checked).toBe(false);

    const noFocal = lungCheckbox(absentChanges, "Без признаков очаговых изменений");
    const focal = lungCheckbox(detectedChanges, "Имеет картину очаговых единичных поражений");
    await noFocal.setValue(true);
    await focal.setValue(true);
    expect(noFocal.element.checked).toBe(false);
    expect(focal.element.checked).toBe(true);
    await noFocal.setValue(true);
    expect(noFocal.element.checked).toBe(true);
    expect(focal.element.checked).toBe(false);

    const noDeformation = lungCheckbox(absentChanges, "Без признаков деформации");
    const noDiffuse = lungCheckbox(absentChanges, "Без признаков диффузных изменений");
    const alveolarLesions = lungCheckbox(detectedChanges, "Имеет картину альвеолярных поражений");
    const torsion = lungCheckbox(detectedChanges, "Имеет картину заворота");
    const atelectasis = lungCheckbox(detectedChanges, "Имеет картину ателектаза");
    await noDeformation.setValue(true);
    await alveolarLesions.setValue(true);
    await torsion.setValue(true);
    await atelectasis.setValue(true);
    expect([noDeformation, alveolarLesions, torsion, atelectasis]
      .every((input) => input.element.checked)).toBe(true);

    await lungCheckbox(panel("Изменения отмечаются в"), "Краниальных долях лёгкого").setValue(true);
    await lungCheckbox(panel("Изменения отмечаются в"), "Каудальных долях лёгкого").setValue(true);
    const selectedLungFields = current().studies[0]?.mode === "tree"
      ? current().studies[0].findings.find((finding) => finding.findingId === xrayId("17"))
      : undefined;
    expect(selectedLungFields?.children.find((finding) => finding.findingId === xrayId("17.3"))
      ?.children.find((finding) => finding.findingId === xrayId("17.3.13"))
      ?.children.map((finding) => finding.findingId))
      .toEqual([xrayId("17.3.13.1"), xrayId("17.3.13.2")]);
    await noDiffuse.setValue(true);
    expect(noDiffuse.element.checked).toBe(true);
    expect(panel("Изменения отмечаются в")).toBeUndefined();
    const lungFields = current().studies[0]?.mode === "tree"
      ? current().studies[0].findings.find((finding) => finding.findingId === xrayId("17"))
      : undefined;
    const patternValue = lungFields?.children.find((finding) => finding.findingId === xrayId("17.3"));
    expect(patternValue?.children.some((finding) => finding.findingId === xrayId("17.3.13"))).toBe(false);
    expect([alveolarLesions, torsion, atelectasis].every((input) => input.element.checked)).toBe(true);

    await noDiffuse.setValue(false);
    const restoredLocations = panel("Изменения отмечаются в");
    expect(restoredLocations).toBeDefined();
    expect(restoredLocations.findAll<HTMLInputElement>('input[type="checkbox"]')
      .every((input) => !input.element.checked)).toBe(true);
    expect(restoredLocations.get(".medical-card-options").attributes("class")).toContain("medical-card-options");
    expect(lungPattern.find('[data-hierarchy-depth="2"]').exists()).toBe(true);

    await wrapper.setProps({ errors: { studies: [{ findings: {
      [`${xrayId("10.0")}:regularity`]: "Для характеристики «Ровность купола» можно выбрать не более одного значения.",
    } }] } });
    const conflictError = regularity.element.closest("label")!.querySelector<HTMLElement>(".field-error")!;
    expect(regularity.attributes("aria-invalid")).toBe("true");
    expect(regularity.attributes("aria-describedby")).toBe(conflictError.id);

    await wrapper.get(".instrumental-study-delete").trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alertdialog"]').text()).toContain("Удалить заполненное исследование?");
    expect(wrapper.get('[role="alertdialog"]').text()).toContain("Исследование «Рентгенография грудной полости»");
    await wrapper.get('[role="alertdialog"] .danger').trigger("click");
    await flushPromises();
    expect(current().studies).toHaveLength(0);

    await chooseType(wrapper, "instrumental.study.ultrasound-abdomen");
    await wrapper.get(".instrumental-study-delete").trigger("click");
    await flushPromises();
    expect(current().studies).toHaveLength(0);
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
  });

  it("edits abdominal X-ray multi-selects, composite sets, and conditional branches", async () => {
    const { wrapper, current } = mountEditor();
    const checkbox = (panel: DOMWrapper<Element>, name: string) => panel.findAll("label.check-row")
      .find((label) => label.text() === name)!.get<HTMLInputElement>('input[type="checkbox"]');
    const panel = (name: string) => wrapper.findAll("fieldset")
      .find((candidate) => candidate.get("legend").text() === name)!;

    await chooseType(wrapper, "instrumental.study.xray-abdomen");
    expect(current().studies[0]).toMatchObject({
      typeId: "instrumental.study.xray-abdomen",
      typeName: "Рентгенография брюшной полости",
      mode: "tree",
    });

    await addFinding(wrapper, abdomenXrayId("1"));
    await checkbox(panel("Проекции"), "Левая латеролатеральная").setValue(true);
    await checkbox(panel("Проекции"), "Правая латеролатеральная").setValue(true);
    await checkbox(panel("Проекции"), "Вентродорсальная").setValue(true);
    expect(current().studies[0]?.mode === "tree"
      ? current().studies[0].findings[0]?.children[0]?.children.map((item) => item.findingId)
      : []).toEqual([abdomenXrayId("1.0.1"), abdomenXrayId("1.0.2"), abdomenXrayId("1.0.3")]);

    await addFinding(wrapper, abdomenXrayId("8"));
    await selectChoice(wrapper, abdomenXrayId("8.0.3"));
    const pathologyPanel = panel("Признаки патологий");
    await checkbox(pathologyPanel, "Остеофиты").setValue(true);
    await checkbox(pathologyPanel, "Перелом").setValue(true);
    const fracture = wrapper.get<HTMLTextAreaElement>('textarea[aria-label="Описание перелома"]');
    expect(fracture.attributes("rows")).toBe("2");
    expect(fracture.classes()).toContain("medical-card-comment");
    await fracture.setValue("Перелом таза");

    await addFinding(wrapper, abdomenXrayId("9"));
    await addFinding(wrapper, abdomenXrayId("9.0"));
    const diaphragm = wrapper.get(`[data-finding-id="${abdomenXrayId("9.0")}"]`);
    const regularity = diaphragm.get<HTMLSelectElement>('select[aria-label="Ровность купола"]');
    const definition = diaphragm.get<HTMLSelectElement>('select[aria-label="Чёткость купола"]');
    const projection = diaphragm.get<HTMLSelectElement>('select[aria-label="Проекция измерения"]');
    await regularity.setValue(abdomenXrayId("9.0.1"));
    await definition.setValue(abdomenXrayId("9.0.3"));
    await projection.setValue(abdomenXrayId("9.0.5"));
    await diaphragm.get('input[aria-label="Межреберье на LL-проекции"]').setValue("7");
    await regularity.setValue(abdomenXrayId("9.0.2"));
    expect(definition.element.value).toBe(abdomenXrayId("9.0.3"));
    expect(projection.element.value).toBe(abdomenXrayId("9.0.5"));
    await projection.setValue(abdomenXrayId("9.0.6"));
    expect(diaphragm.find('input[aria-label="Межреберье на LL-проекции"]').exists()).toBe(false);
    expect(diaphragm.get<HTMLInputElement>('input[aria-label="Межреберье на VD-проекции"]').element.value).toBe("");

    await addFinding(wrapper, abdomenXrayId("21"));
    await addFinding(wrapper, abdomenXrayId("21.3"));
    await selectChoice(wrapper, abdomenXrayId("21.3.2"));
    const smallIntestine = panel("Содержимое тонкого кишечника");
    await checkbox(smallIntestine, "Жидкость").setValue(true);
    await checkbox(smallIntestine, "Газ").setValue(true);
    await checkbox(smallIntestine, "Другое").setValue(true);
    await wrapper.get('textarea[aria-label="Описание содержимого"]').setValue("Непереваренные массы");
    expect(checkbox(smallIntestine, "Жидкость").element.checked).toBe(true);
    expect(checkbox(smallIntestine, "Газ").element.checked).toBe(true);

    await addFinding(wrapper, abdomenXrayId("23"));
    await addFinding(wrapper, abdomenXrayId("23.1"));
    await selectChoice(wrapper, abdomenXrayId("23.1.0.1"));
    await addFinding(wrapper, abdomenXrayId("23.1.1"));
    await selectChoice(wrapper, abdomenXrayId("23.1.1.1"));
    await selectChoice(wrapper, abdomenXrayId("23.1.0.2"));
    const reproductive = current().studies[0]?.mode === "tree"
      ? current().studies[0].findings.find((finding) => finding.findingId === abdomenXrayId("23"))
      : undefined;
    expect(reproductive?.children.find((finding) => finding.findingId === abdomenXrayId("23.1"))?.children)
      .toEqual([expect.objectContaining({ findingId: abdomenXrayId("23.1.0.2"), children: [] })]);

    await addFinding(wrapper, abdomenXrayId("23.3"));
    await addFinding(wrapper, abdomenXrayId("23.3.1"));
    await selectChoice(wrapper, abdomenXrayId("23.3.1.2"));
    const osPenis = wrapper.get(`[data-finding-id="${abdomenXrayId("23.3.1.2.characteristics")}"]`);
    const clarity = osPenis.get<HTMLSelectElement>('select[aria-label="Чёткость"]');
    const fractureCheckbox = checkbox(panel("Перелом"), "Имеет перелом");
    await clarity.setValue(abdomenXrayId("23.3.1.3"));
    await fractureCheckbox.setValue(true);
    expect(clarity.element.value).toBe(abdomenXrayId("23.3.1.3"));
    expect(fractureCheckbox.element.checked).toBe(true);
    expect(osPenis.get(".instrumental-finding-content").attributes("data-hierarchy-depth")).toBe("3");

    await selectChoice(wrapper, abdomenXrayId("23.3.1.1"));
    expect(wrapper.find(`[data-finding-id="${abdomenXrayId("23.3.1.2.characteristics")}"]`).exists()).toBe(false);
    const osPenisValue = reproductive?.children.find((finding) => finding.findingId === abdomenXrayId("23.3"))
      ?.children.find((finding) => finding.findingId === abdomenXrayId("23.3.1"));
    expect(osPenisValue?.children).toEqual([
      expect.objectContaining({ findingId: abdomenXrayId("23.3.1.1"), children: [] }),
    ]);

    const reopened = mountEditor(current());
    expect(reopened.wrapper.get('select[aria-label="Значение показателя «Os penis»"]').element)
      .toHaveProperty("value", abdomenXrayId("23.3.1.1"));
    expect(reopened.wrapper.get('textarea[aria-label="Описание перелома"]').element)
      .toHaveProperty("value", "Перелом таза");
  });
});
