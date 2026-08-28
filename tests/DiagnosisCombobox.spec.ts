// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import DiagnosisCombobox from "../src/components/DiagnosisCombobox.vue";

describe("DiagnosisCombobox", () => {
  it("filters across categories with е/ё equivalence and selects with the keyboard", async () => {
    const wrapper = mount(DiagnosisCombobox, {
      props: { label: "Диагноз", selectedIds: [], customText: "" },
    });
    const input = wrapper.get<HTMLInputElement>('input[role="combobox"]');
    await input.setValue("отек квинке");

    expect(wrapper.emitted("update:customText")?.at(-1)).toEqual(["отек квинке"]);
    expect(wrapper.get('[role="group"][aria-label="Патологии общего состояния"]').text()).toContain("Отёк Квинке");
    expect(wrapper.findAll('[role="option"]')).toHaveLength(1);
    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("update:selectedIds")?.at(-1)).toEqual([["diagnosis.general.012"]]);
  });

  it("offers the clinically healthy diagnosis as a standalone top-level option", async () => {
    const wrapper = mount(DiagnosisCombobox, {
      props: { label: "Диагноз", selectedIds: [], customText: "" },
    });
    await wrapper.get(".app-catalog-toggle").trigger("click");
    const topLevelOption = wrapper.get('[role="listbox"] > [role="option"]');
    expect(topLevelOption.text()).toBe("Клинически здорово");
    expect(topLevelOption.classes()).toEqual(expect.arrayContaining([
      "app-catalog-category",
      "app-catalog-root-option",
    ]));
    expect(wrapper.get(".app-catalog-level-prompt").text()).toBe("Выберите диагноз или категорию");
    expect(wrapper.findAll(".app-catalog-category:not(.app-catalog-root-option)")[0]!.text())
      .toBe("Патологии общего состояния");
    await wrapper.get<HTMLInputElement>('input[role="combobox"]').trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("update:selectedIds")?.at(-1)).toEqual([["diagnosis.general.019"]]);

    await wrapper.setProps({ selectedIds: [] });
    const input = wrapper.get<HTMLInputElement>('input[role="combobox"]');
    await input.setValue("клинически здорово");

    expect(wrapper.find('[role="group"][aria-label="Патологии общего состояния"]').exists()).toBe(false);
    expect(wrapper.get('[role="option"]').text()).toBe("Клинически здорово");
    await wrapper.get('[role="option"]').trigger("click");

    expect(wrapper.emitted("update:selectedIds")?.at(-1)).toEqual([["diagnosis.general.019"]]);
  });

  it("preserves nested category labels and toggles multiple selections", async () => {
    const wrapper = mount(DiagnosisCombobox, {
      props: { label: "Дифференциальные диагнозы", selectedIds: [], customTexts: [], multiple: true },
    });
    await wrapper.get<HTMLInputElement>('input[role="combobox"]').setValue("конъюнктивит острый");
    expect(wrapper.get('[role="group"][aria-label="Патологии головы (ротовая полость, глаза, уши)"]').exists()).toBe(true);
    expect(wrapper.get('[role="group"][aria-label="Глаза"]').exists()).toBe(true);
    expect(wrapper.get('[role="listbox"]').attributes("aria-multiselectable")).toBe("true");

    await wrapper.get('[role="option"]').trigger("click");
    expect(wrapper.emitted("update:selectedIds")?.at(-1)).toEqual([["diagnosis.head.eyes.001"]]);
  });

  it("adds multiple free-form values alongside catalog selections", async () => {
    const wrapper = mount(DiagnosisCombobox, {
      props: {
        label: "Дифференциальные диагнозы",
        selectedIds: ["diagnosis.digestive.001"],
        customTexts: ["Реакция на корм"],
        multiple: true,
      },
    });
    const input = wrapper.get<HTMLInputElement>('input[role="combobox"]');
    const add = wrapper.get<HTMLButtonElement>('[aria-label="Добавить диагноз в свободной форме"]');
    expect(add.attributes()).toHaveProperty("disabled");

    await input.setValue("  Непереносимость препарата  ");
    expect(add.attributes()).not.toHaveProperty("disabled");
    await add.trigger("click");
    expect(wrapper.emitted("update:customTexts")?.at(-1)).toEqual([
      ["Реакция на корм", "Непереносимость препарата"],
    ]);
    expect(wrapper.emitted("update:selectedIds")).toBeUndefined();
    expect(input.element.value).toBe("");

    await wrapper.setProps({ customTexts: ["Реакция на корм", "Непереносимость препарата"] });
    await input.setValue("непереносимость препарата");
    expect(add.attributes()).toHaveProperty("disabled");
  });

  it("browses a nested selection through two levels, clears it, and closes on outside interaction", async () => {
    const wrapper = mount(DiagnosisCombobox, {
      attachTo: document.body,
      props: { label: "Диагноз", selectedIds: ["diagnosis.head.eyes.001"], customText: "" },
    });
    const input = wrapper.get<HTMLInputElement>('input[role="combobox"]');
    expect(input.element.value).toBe("Конъюнктивит острый");

    await wrapper.get(".app-catalog-toggle").trigger("click");
    expect(wrapper.get(".app-catalog-level-prompt").text()).toBe("Выберите диагноз или категорию");
    expect(wrapper.findAll(".app-catalog-category:not(.app-catalog-root-option)")).toHaveLength(16);
    expect(wrapper.text()).not.toContain("Конъюнктивит острый");
    expect(wrapper.find('[role="option"][aria-selected="true"]').exists()).toBe(false);
    const topLevelOptionId = wrapper.get(".app-catalog-root-option").attributes("id");
    const firstCategoryId = wrapper.findAll(".app-catalog-category:not(.app-catalog-root-option)")[0]!.attributes("id");
    await input.trigger("keydown", { key: "ArrowDown" });
    expect(input.attributes("aria-activedescendant")).toBe(firstCategoryId);
    await input.trigger("keydown", { key: "ArrowUp" });
    expect(input.attributes("aria-activedescendant")).toBe(topLevelOptionId);
    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.get(".app-catalog-level-heading > strong").text()).toBe("Патологии общего состояния");
    await wrapper.get(".app-catalog-back").trigger("click");
    const eyes = wrapper.findAll(".app-catalog-category:not(.app-catalog-root-option)")
      .find((category) => category.get("strong").text() === "Глаза")!;
    expect(eyes.get("small").text()).toBe("Патологии головы (ротовая полость, глаза, уши)");
    await eyes.trigger("click");
    expect(wrapper.get(".app-catalog-level-heading > strong").text()).toBe("Глаза");
    await input.trigger("keydown", { key: "Escape" });
    expect(wrapper.get(".app-catalog-level-prompt").exists()).toBe(true);
    await wrapper.findAll(".app-catalog-category:not(.app-catalog-root-option)")
      .find((category) => category.get("strong").text() === "Глаза")!.trigger("click");
    const selected = wrapper.get('[role="option"][aria-selected="true"]');
    expect(input.attributes("aria-activedescendant")).toBe(selected.attributes("id"));
    await selected.trigger("click");
    expect(wrapper.emitted("update:selectedIds")?.at(-1)).toEqual([["diagnosis.head.eyes.001"]]);
    await input.setValue("");
    expect(wrapper.emitted("update:selectedIds")?.at(-1)).toEqual([[]]);

    await wrapper.setProps({ selectedIds: [] });
    expect(input.element.value).toBe("");
    await input.trigger("keydown", { key: "Escape" });
    const toggle = wrapper.get<HTMLButtonElement>(".app-catalog-toggle");
    await toggle.trigger("click");
    expect(input.attributes("aria-expanded")).toBe("true");
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(input.attributes("aria-expanded")).toBe("false");
    wrapper.unmount();
  });

  it("handles empty results, closed keyboard opening, wrapping, and multiple deselection", async () => {
    const wrapper = mount(DiagnosisCombobox, {
      props: {
        label: "Дифференциальные диагнозы",
        selectedIds: ["diagnosis.digestive.001"],
        customTexts: [],
        multiple: true,
      },
    });
    const input = wrapper.get<HTMLInputElement>('input[role="combobox"]');
    await input.setValue("ничего подходящего");
    expect(wrapper.get('[role="status"]').text()).toBe("Нет подходящих диагнозов");
    await input.trigger("keydown", { key: "ArrowDown" });
    expect(input.attributes("aria-activedescendant")).toBeUndefined();

    await input.trigger("keydown", { key: "Escape" });
    await input.trigger("keydown", { key: "ArrowDown" });
    expect(input.attributes("aria-expanded")).toBe("true");
    await input.setValue("стоматит");
    await input.trigger("keydown", { key: "ArrowUp" });
    const options = wrapper.findAll('[role="option"]');
    expect(input.attributes("aria-activedescendant")).toBe(options.at(-1)!.attributes("id"));
    await wrapper.get('[role="option"][aria-selected="true"]').trigger("click");
    expect(wrapper.emitted("update:selectedIds")?.at(-1)).toEqual([[]]);
    await input.setValue("ничего подходящего");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("update:customTexts")?.at(-1)).toEqual([["ничего подходящего"]]);
    wrapper.unmount();
  });
});
