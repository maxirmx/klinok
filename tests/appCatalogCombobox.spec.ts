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
});
