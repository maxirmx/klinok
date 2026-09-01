// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AppTableSort from "../src/components/AppTableSort.vue";

describe("AppTableSort", () => {
  it("renders one selector for a single field and emits its selected direction", async () => {
    const wrapper = mount(AppTableSort, {
      props: {
        field: "date",
        direction: "desc",
        fields: [{ value: "date", label: "Дата" }],
        ascendingLabel: "Сначала старые",
        descendingLabel: "Сначала новые",
        descendingFirst: true,
        ariaLabel: "Сортировка истории",
      },
    });

    expect(wrapper.attributes("data-sort-field")).toBe("date");
    expect(wrapper.attributes("data-sort-direction")).toBe("desc");
    const selector = wrapper.get<HTMLSelectElement>('select[aria-label="Сортировка истории"]');
    expect(selector.element.value).toBe("date:desc");
    expect(selector.findAll("option").map((option) => option.text())).toEqual(["Сначала новые", "Сначала старые"]);

    await selector.setValue("date:asc");

    expect(wrapper.emitted("update:direction")).toEqual([["asc"]]);
  });

  it("combines fields and directions in the same selector", async () => {
    const wrapper = mount(AppTableSort, {
      props: {
        field: "owner",
        direction: "asc",
        fields: [
          { value: "pet", label: "Питомец" },
          { value: "owner", label: "Владелец" },
        ],
      },
    });

    const selector = wrapper.get<HTMLSelectElement>("select");
    expect(selector.findAll("option").map((option) => option.text())).toEqual([
      "Питомец · По возрастанию",
      "Питомец · По убыванию",
      "Владелец · По возрастанию",
      "Владелец · По убыванию",
    ]);
    await selector.setValue("pet:desc");

    expect(wrapper.emitted("update:field")).toEqual([["pet"]]);
    expect(wrapper.emitted("update:direction")).toEqual([["desc"]]);
  });
});
