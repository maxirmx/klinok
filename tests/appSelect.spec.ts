// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AppSelect from "../src/components/AppSelect.vue";

const options = [
  { value: "", label: "Не указано" },
  { value: "short", label: "Короткое значение" },
  { value: "long", label: "Очень длинное значение, которое должно полностью переноситься на узком экране" },
  { value: "disabled", label: "Недоступно", disabled: true },
] as const;

describe("AppSelect", () => {
  it("renders the complete selected label while retaining a native accessible select", () => {
    const wrapper = mount(AppSelect, {
      props: { modelValue: "long", options, required: true, invalid: true },
      attrs: { "aria-label": "Значение показателя", name: "finding" },
    });

    expect(wrapper.get(".app-select-value").text()).toBe(options[2].label);
    expect(wrapper.get(".app-select-value").attributes("aria-hidden")).toBe("true");
    const select = wrapper.get<HTMLSelectElement>("select");
    expect(select.element.value).toBe("long");
    expect(select.attributes()).toMatchObject({
      "aria-label": "Значение показателя",
      "aria-invalid": "true",
      name: "finding",
      required: "",
    });
    expect(select.find('option[value="disabled"]').attributes("disabled")).toBeDefined();
  });

  it("emits requested values and restores the controlled value when the parent rejects a change", async () => {
    const wrapper = mount(AppSelect, { props: { modelValue: "short", options } });
    const select = wrapper.get<HTMLSelectElement>("select");

    await select.setValue("long");

    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["long"]);
    expect(select.element.value).toBe("short");
    expect(wrapper.get(".app-select-value").text()).toBe("Короткое значение");
  });

  it("updates the native and visible values when the controlled model changes", async () => {
    const wrapper = mount(AppSelect, { props: { modelValue: "", options } });

    await wrapper.setProps({ modelValue: "long" });

    expect(wrapper.get<HTMLSelectElement>("select").element.value).toBe("long");
    expect(wrapper.get(".app-select-value").text()).toBe(options[2].label);
  });
});
