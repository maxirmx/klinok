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

function panelSection(studyId: string, date: string, laboratory: string, results: Array<{
  indicatorId: string;
  indicatorName: string;
  unit: string;
  result: string;
  reference?: string;
}>) {
  return {
    kind: "laboratory-tests",
    templateVersion: "laboratory-tests-v1",
    value: {
      studies: [{
        id: studyId,
        date,
        typeId: "lab.study.cbc",
        typeName: "Общеклинический анализ крови",
        mode: "panel",
        laboratory,
        results,
      }],
    },
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

  it("renders compact mobile histories by indicator with accessible metadata", async () => {
    const hematocrit = { indicatorId: "lab.indicator.cbc.001", indicatorName: "Гематокрит", unit: "%" };
    const hemoglobin = { indicatorId: "lab.indicator.cbc.002", indicatorName: "Гемоглобин", unit: "г/л" };
    const records = [
      record(panelSection("study-new", "2026-08-16", "", [{ ...hematocrit, result: "43" }]), "record-new"),
      record(panelSection("study-old", "2026-08-14", "Ветлаб", [{ ...hematocrit, result: "42", reference: "35–55" }]), "record-old"),
      record(panelSection("study-other", "2026-08-15", "Другая лаборатория", [{ ...hemoglobin, result: "145" }]), "record-other"),
    ];
    const wrapper = mount(LaboratoryComparison, {
      props: { records, confirmedIds: new Set(["record-old"]) },
    });

    wrapper.getComponent(AppCatalogCombobox).vm.$emit("update:selectedIds", [hematocrit.indicatorId, hemoglobin.indicatorId]);
    await wrapper.vm.$nextTick();

    const histories = wrapper.findAll(".laboratory-mobile-indicator");
    expect(histories).toHaveLength(2);
    expect(histories.map((history) => history.get("h3").text())).toEqual(["Гематокрит, %", "Гемоглобин, г/л"]);
    const hematocritEntries = histories[0]!.findAll(".laboratory-mobile-entry");
    expect(hematocritEntries).toHaveLength(2);
    expect(hematocritEntries.map((entry) => entry.get("time").text())).toEqual(["16.08.2026", "14.08.2026"]);
    expect(hematocritEntries.map((entry) => entry.get(".laboratory-mobile-value").text())).toEqual(["43", "42"]);
    expect(hematocritEntries[1]!.get(".laboratory-mobile-reference").text()).toBe("Реф.: 35–55");
    expect(histories[0]!.text()).not.toContain("15.08.2026");

    expect(hematocritEntries[0]!.find(".laboratory-mobile-status").exists()).toBe(false);
    expect(hematocritEntries[0]!.get("header .laboratory-mobile-study").text()).toBe("Общеклинический анализ крови");
    expect(hematocritEntries[0]!.get(".laboratory-mobile-measurement").find(".laboratory-mobile-value").exists()).toBe(true);
    const metadata = hematocritEntries[0]!.get(".laboratory-mobile-metadata");
    expect(hematocritEntries[0]!.get(".laboratory-mobile-measurement").find(".laboratory-mobile-metadata").exists()).toBe(true);
    expect(metadata.get("summary").attributes("aria-label")).toBe("Подробнее о результате за 16.08.2026");
    expect(metadata.findAll("dt").map((label) => label.text())).toEqual(["Лаборатория", "Статус"]);
    expect(metadata.findAll("dd").map((value) => value.text())).toEqual(["Не указана", "Ожидает подтверждения"]);
  });

  it("keeps mobile indicator pagination independent and clamps it after updates", async () => {
    const hematocrit = { indicatorId: "lab.indicator.cbc.001", indicatorName: "Гематокрит", unit: "%" };
    const hemoglobin = { indicatorId: "lab.indicator.cbc.002", indicatorName: "Гемоглобин", unit: "г/л" };
    const records = Array.from({ length: 12 }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return record(panelSection(`study-${day}`, `2026-08-${day}`, "Ветлаб", [
        { ...hematocrit, result: `${40 + index}` },
        { ...hemoglobin, result: `${140 + index}` },
      ]), `record-${day}`);
    });
    const wrapper = mount(LaboratoryComparison, {
      props: { records, confirmedIds: new Set<string>() },
    });
    const combobox = wrapper.getComponent(AppCatalogCombobox);
    combobox.vm.$emit("update:selectedIds", [hematocrit.indicatorId, hemoglobin.indicatorId]);
    await wrapper.vm.$nextTick();

    let histories = wrapper.findAll(".laboratory-mobile-indicator");
    let paginators = histories.map((history) => history.getComponent(AppPaginator));
    expect(paginators.map((paginator) => paginator.props("page"))).toEqual([1, 1]);
    expect(paginators.map((paginator) => paginator.props("pageSize"))).toEqual([10, 10]);
    paginators[0]!.vm.$emit("update:page", 2);
    paginators[1]!.vm.$emit("update:pageSize", 20);
    await wrapper.vm.$nextTick();

    histories = wrapper.findAll(".laboratory-mobile-indicator");
    paginators = histories.map((history) => history.getComponent(AppPaginator));
    expect(paginators.map((paginator) => paginator.props("page"))).toEqual([2, 1]);
    expect(paginators.map((paginator) => paginator.props("pageSize"))).toEqual([10, 20]);
    expect(histories.map((history) => history.findAll(".laboratory-mobile-entry").length)).toEqual([2, 12]);

    combobox.vm.$emit("update:selectedIds", [hematocrit.indicatorId]);
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".laboratory-mobile-indicator").getComponent(AppPaginator).props("page")).toBe(1);

    wrapper.get(".laboratory-mobile-indicator").getComponent(AppPaginator).vm.$emit("update:page", 2);
    await wrapper.vm.$nextTick();
    await wrapper.setProps({ records: records.slice(0, 5) });
    await wrapper.vm.$nextTick();
    const clamped = wrapper.get(".laboratory-mobile-indicator");
    expect(clamped.getComponent(AppPaginator).props("page")).toBe(1);
    expect(clamped.findAll(".laboratory-mobile-entry")).toHaveLength(5);
  });
});
