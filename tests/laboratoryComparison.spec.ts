// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AppCatalogCombobox from "../src/components/AppCatalogCombobox.vue";
import AppPaginator from "../src/components/AppPaginator.vue";
import LaboratoryComparison from "../src/components/LaboratoryComparison.vue";
import type { MedicalRecordDraft } from "../src/repositories/types";

function record(laboratorySection: unknown, recordId = "record-1"): MedicalRecordDraft {
  return {
    recordId,
    petId: "pet-1",
    revision: 1,
    authorAccountId: "doctor-1",
    authorDisplayName: "Иван Врач",
    encounterDate: "2026-08-15",
    title: "Приём",
    text: "Осмотр",
    sections: { "laboratory-tests": laboratorySection } as MedicalRecordDraft["sections"],
    createdAt: "2026-08-15T10:00:00.000Z",
    updatedAt: "2026-08-15T10:00:00.000Z",
  };
}

describe("LaboratoryComparison", () => {
  it.each([
    ["legacy free text", { kind: "laboratory-tests", templateVersion: "free-text-v0", value: { text: "Старый текст" } }],
    ["malformed structured data", { kind: "laboratory-tests", templateVersion: "laboratory-tests-v1", value: {} }],
  ])("silently skips %s", (_description, section) => {
    const wrapper = mount(LaboratoryComparison, {
      props: { records: [record(section)], confirmedIds: new Set<string>() },
    });

    expect(wrapper.find(".laboratory-comparison").exists()).toBe(false);
  });

  it("keeps valid structured studies when unsupported records are also present", async () => {
    const structured = {
      kind: "laboratory-tests",
      templateVersion: "laboratory-tests-v1",
      value: {
        studies: [{
          id: "123e4567-e89b-12d3-a456-426614174000",
          date: "2026-08-15",
          typeId: "lab.study.cbc",
          typeName: "Общеклинический анализ крови",
          mode: "panel",
          laboratory: "Ветлаб",
          results: [{ indicatorId: "lab.indicator.cbc.001", indicatorName: "Гематокрит", unit: "%", result: "42" }],
        }],
      },
    };
    const secondStructured = {
      ...structured,
      value: { studies: [{
        ...structured.value.studies[0],
        id: "223e4567-e89b-12d3-a456-426614174000",
        date: "2026-08-14",
        results: [{
          indicatorId: "lab.indicator.cbc.002",
          indicatorName: "Гемоглобин",
          unit: "г/л",
          result: "145",
          reference: "120–180",
        }],
      }] },
    };
    const legacy = { kind: "laboratory-tests", templateVersion: "free-text-v0", value: { text: "Старый текст" } };
    const wrapper = mount(LaboratoryComparison, {
      props: {
        records: [record(legacy, "legacy"), record(structured), record(secondStructured, "record-2")],
        confirmedIds: new Set(["record-2"]),
      },
    });

    const history = wrapper.get(".laboratory-comparison");
    expect(history.classes()).toContain("panel");
    expect(history.get("h2").text()).toBe("История лабораторных показателей");
    wrapper.getComponent(AppCatalogCombobox).vm.$emit("update:selectedIds", [
      "lab.indicator.cbc.001",
      "lab.indicator.cbc.002",
    ]);
    await wrapper.vm.$nextTick();

    const comparison = wrapper.get(".laboratory-comparison");
    expect(comparison.findAll("tbody tr")).toHaveLength(2);
    expect(comparison.text()).toContain("14.08.2026");
    expect(comparison.text()).toContain("Ожидает подтверждения");
    expect(comparison.text()).toContain("Подтверждено");
    expect(comparison.text()).toContain("Реф.: 120–180");
    expect(comparison.findAll("tbody td span").map((cell) => cell.text())).toEqual(["—", "—"]);
    expect(comparison.find(".app-paginator").exists()).toBe(true);
    expect(wrapper.getComponent(AppPaginator).attributes("aria-label")).toBe("Навигация по истории лабораторных показателей");
    wrapper.getComponent(AppPaginator).vm.$emit("update:page", 1);
    wrapper.getComponent(AppPaginator).vm.$emit("update:pageSize", 20);
    await wrapper.vm.$nextTick();
  });
});
