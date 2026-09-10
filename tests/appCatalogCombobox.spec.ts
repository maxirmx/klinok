// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AppCatalogCombobox from "../src/components/AppCatalogCombobox.vue";

const longLabel = "Анэхогенное содержимое с множественными эхогенными включениями";
const options = [
  { id: "short", label: "Короткое значение" },
  { id: "long", label: longLabel },
];

describe("AppCatalogCombobox responsive selected value", () => {
  it("shows the complete closed single selection and reveals the editor on explicit interaction", async () => {
    const wrapper = mount(AppCatalogCombobox, {
      props: { label: "Содержимое", options, selectedIds: ["long"], customText: "" },
    });
    const input = wrapper.get<HTMLInputElement>('input[role="combobox"]');

    expect(input.element.value).toBe(longLabel);
    expect(wrapper.get(".app-catalog-selected-value").text()).toBe(longLabel);
    expect(wrapper.get(".app-catalog-selected-value").attributes("aria-hidden")).toBe("true");

    await input.trigger("pointerdown");
    expect(wrapper.find(".app-catalog-selected-value").exists()).toBe(false);

    await input.trigger("keydown", { key: "Escape" });
    expect(wrapper.get(".app-catalog-selected-value").text()).toBe(longLabel);
  });

  it("restores wrapped presentation after selecting and supports closed free-form values", async () => {
    const wrapper = mount(AppCatalogCombobox, {
      props: { label: "Содержимое", options, selectedIds: [], customText: "Свободное длинное значение" },
    });

    expect(wrapper.get(".app-catalog-selected-value").text()).toBe("Свободное длинное значение");
    await wrapper.get<HTMLInputElement>('input[role="combobox"]').setValue("");
    expect(wrapper.find(".app-catalog-selected-value").exists()).toBe(false);
    await wrapper.get('[role="option"]').trigger("click");
    expect(wrapper.get(".app-catalog-selected-value").text()).toBe("Короткое значение");
  });

  it("keeps multiple selectors as search inputs", () => {
    const wrapper = mount(AppCatalogCombobox, {
      props: { label: "Показатели", options, selectedIds: ["long"], customText: "", multiple: true },
    });

    expect(wrapper.find(".app-catalog-selected-value").exists()).toBe(false);
    expect(wrapper.get<HTMLInputElement>('input[role="combobox"]').element.value).toBe("");
  });
  it("keeps an open list stable across hover and non-empty option refreshes", async () => {
    const wrapper = mount(AppCatalogCombobox, {
      attachTo: document.body,
      props: { label: "Показатели", options, selectedIds: ["long"], customText: "", multiple: true },
    });
    const input = wrapper.get<HTMLInputElement>('input[role="combobox"]');
    const toggle = wrapper.get(".app-catalog-toggle");
    await toggle.trigger("click");
    await input.setValue("о");
    await input.trigger("keydown", { key: "ArrowDown" });
    input.element.focus();
    const listbox = wrapper.get<HTMLElement>('[role="listbox"]');
    listbox.element.scrollTop = 24;

    await toggle.trigger("pointerover");
    await wrapper.setProps({ options: options.map((option) => ({ ...option })) });

    expect(input.attributes("aria-expanded")).toBe("true");
    expect(input.element.value).toBe("о");
    expect(wrapper.get(".app-catalog-option.active").text()).toBe(longLabel);
    expect(listbox.element.scrollTop).toBe(24);
    expect(document.activeElement).toBe(input.element);

    await wrapper.setProps({ options: [{ id: "new", label: "Новое значение" }, ...options] });

    expect(input.attributes("aria-expanded")).toBe("true");
    expect(input.element.value).toBe("о");
    expect(wrapper.get(".app-catalog-option.active").text()).toBe(longLabel);
    expect(listbox.element.scrollTop).toBe(24);
    expect(document.activeElement).toBe(input.element);

    await wrapper.setProps({ options: [] });

    expect(input.attributes("aria-expanded")).toBe("false");
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    expect(toggle.attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });

  it("returns to the category root when an open two-level category disappears", async () => {
    const wrapper = mount(AppCatalogCombobox, {
      attachTo: document.body,
      props: {
        label: "Диагноз",
        groups: [{ id: "first", label: "Первая категория", options: [{ id: "one", label: "Первый" }] }],
        selectedIds: [],
        customText: "",
        twoLevel: true,
      },
    });
    const input = wrapper.get<HTMLInputElement>('input[role="combobox"]');
    await wrapper.get(".app-catalog-toggle").trigger("click");
    await wrapper.get(".app-catalog-category").trigger("click");
    expect(wrapper.get(".app-catalog-level-heading").text()).toContain("Первая категория");

    await wrapper.setProps({
      groups: [{ id: "second", label: "Вторая категория", options: [{ id: "two", label: "Второй" }] }],
    });

    expect(input.attributes("aria-expanded")).toBe("true");
    expect(wrapper.get(".app-catalog-level-prompt").text()).toBe("Выберите категорию");
    expect(wrapper.get(".app-catalog-category.active").text()).toContain("Вторая категория");
    wrapper.unmount();
  });
});
