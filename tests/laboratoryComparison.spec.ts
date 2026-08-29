// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppCatalogCombobox from "../src/components/AppCatalogCombobox.vue";
import AppPaginator from "../src/components/AppPaginator.vue";
import LaboratoryComparison from "../src/components/LaboratoryComparison.vue";
import {
  laboratoryComparisonPreferenceKey,
  type LaboratoryComparisonScope,
} from "../src/laboratoryComparisonPreferences";
import type { MedicalRecordDraft } from "../src/repositories/types";

const comparisonScope: LaboratoryComparisonScope = { accountId: "account-1", role: "owner", petId: "pet-1" };

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
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it.each([
    ["legacy free text", { kind: "laboratory-tests", templateVersion: "free-text-v0", value: { text: "Старый текст" } }],
    ["malformed structured data", { kind: "laboratory-tests", templateVersion: "laboratory-tests-v1", value: {} }],
  ])("silently skips %s", (_description, section) => {
    const wrapper = mount(LaboratoryComparison, {
      props: { records: [record(section)], confirmedIds: new Set<string>(), ...comparisonScope },
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
        ...comparisonScope,
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
      record(panelSection("study-new", "2026-08-16", "   ", [{ ...hematocrit, result: "43" }]), "record-new"),
      record(panelSection("study-old", "2026-08-14", "Ветлаб", [{ ...hematocrit, result: "42", reference: "35–55" }]), "record-old"),
      record(panelSection("study-other", "2026-08-15", "Другая лаборатория", [{ ...hemoglobin, result: "145" }]), "record-other"),
    ];
    const wrapper = mount(LaboratoryComparison, {
      props: { records, confirmedIds: new Set(["record-old"]), ...comparisonScope },
    });

    wrapper.getComponent(AppCatalogCombobox).vm.$emit("update:selectedIds", [hematocrit.indicatorId, hemoglobin.indicatorId]);
    await wrapper.vm.$nextTick();

    const desktopMissingLaboratoryRow = wrapper.findAll(".laboratory-results tbody tr")
      .find((row) => row.findAll("td")[0]?.text() === "16.08.2026");
    expect(desktopMissingLaboratoryRow?.findAll("td")[2]?.text()).toBe("Не указана");

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
      props: { records, confirmedIds: new Set<string>(), ...comparisonScope },
    });
    const combobox = wrapper.getComponent(AppCatalogCombobox);
    combobox.vm.$emit("update:selectedIds", [hematocrit.indicatorId, hemoglobin.indicatorId]);
    await wrapper.vm.$nextTick();

    let histories = wrapper.findAll(".laboratory-mobile-indicator");
    let paginators = histories.map((history) => history.getComponent(AppPaginator));
    const desktopPaginator = wrapper.findComponent(AppPaginator);
    expect(paginators.map((paginator) => paginator.props("page"))).toEqual([1, 1]);
    expect(paginators.map((paginator) => paginator.props("pageSize"))).toEqual([10, 10]);
    desktopPaginator.vm.$emit("update:page", 2);
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
    expect(desktopPaginator.props("page")).toBe(1);
    expect(wrapper.get(".laboratory-mobile-indicator").getComponent(AppPaginator).props("page")).toBe(2);

    combobox.vm.$emit("update:selectedIds", [hematocrit.indicatorId, hemoglobin.indicatorId]);
    await wrapper.vm.$nextTick();
    histories = wrapper.findAll(".laboratory-mobile-indicator");
    paginators = histories.map((history) => history.getComponent(AppPaginator));
    expect(paginators.map((paginator) => paginator.props("page"))).toEqual([2, 1]);
    expect(paginators.map((paginator) => paginator.props("pageSize"))).toEqual([10, 10]);

    combobox.vm.$emit("update:selectedIds", [hematocrit.indicatorId]);
    await wrapper.vm.$nextTick();

    wrapper.get(".laboratory-mobile-indicator").getComponent(AppPaginator).vm.$emit("update:page", 2);
    await wrapper.vm.$nextTick();
    await wrapper.setProps({ records: records.slice(0, 5) });
    await wrapper.vm.$nextTick();
    const clamped = wrapper.get(".laboratory-mobile-indicator");
    expect(clamped.getComponent(AppPaginator).props("page")).toBe(1);
    expect(clamped.findAll(".laboratory-mobile-entry")).toHaveLength(5);
  });

  it("restores selections and persists explicit removal of one or every indicator", async () => {
    const hematocrit = { indicatorId: "lab.indicator.cbc.001", indicatorName: "Гематокрит", unit: "%", result: "42" };
    const hemoglobin = { indicatorId: "lab.indicator.cbc.002", indicatorName: "Гемоглобин", unit: "г/л", result: "145" };
    const records = [record(panelSection("study-1", "2026-08-15", "Ветлаб", [hematocrit, hemoglobin]))];
    const props = { records, confirmedIds: new Set<string>(), ...comparisonScope };
    const key = laboratoryComparisonPreferenceKey(comparisonScope);
    const first = mount(LaboratoryComparison, { props });

    first.getComponent(AppCatalogCombobox).vm.$emit("update:selectedIds", [hematocrit.indicatorId, hemoglobin.indicatorId]);
    await first.vm.$nextTick();
    expect(first.findAll(".laboratory-comparison-selection")).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem(key) ?? "null")).toEqual({
      version: 1,
      indicatorIds: [hematocrit.indicatorId, hemoglobin.indicatorId],
    });
    first.unmount();

    const restored = mount(LaboratoryComparison, { props });
    await restored.vm.$nextTick();
    expect(restored.findAll(".laboratory-comparison-selection").map((item) => item.text()))
      .toEqual(["Гематокрит, %", "Гемоглобин, г/л"]);
    const removeHematocrit = restored.get('button[aria-label="Удалить показатель «Гематокрит, %»"]');
    expect(removeHematocrit.attributes("title")).toBe("Удалить показатель «Гематокрит, %»");
    await removeHematocrit.trigger("click");

    expect(restored.findAll(".laboratory-comparison-selection")).toHaveLength(1);
    expect(restored.findAll(".laboratory-results th").map((header) => header.text())).not.toContain("Гематокрит, %");
    expect(restored.findAll(".laboratory-mobile-indicator").map((history) => history.get("h3").text()))
      .toEqual(["Гемоглобин, г/л"]);
    expect(JSON.parse(localStorage.getItem(key) ?? "null").indicatorIds).toEqual([hemoglobin.indicatorId]);

    await restored.get('button[aria-label="Удалить показатель «Гемоглобин, г/л»"]').trigger("click");
    expect(restored.find(".laboratory-comparison-desktop").exists()).toBe(false);
    expect(restored.find(".laboratory-comparison-mobile").exists()).toBe(false);
    expect(restored.findComponent(AppCatalogCombobox).exists()).toBe(true);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("isolates scopes and prunes unavailable stored IDs after records arrive", async () => {
    const hematocrit = { indicatorId: "lab.indicator.cbc.001", indicatorName: "Гематокрит", unit: "%", result: "42" };
    const hemoglobin = { indicatorId: "lab.indicator.cbc.002", indicatorName: "Гемоглобин", unit: "г/л", result: "145" };
    const records = [record(panelSection("study-1", "2026-08-15", "Ветлаб", [hematocrit, hemoglobin]))];
    const petTwoScope = { ...comparisonScope, petId: "pet-2" };
    const doctorScope = { ...comparisonScope, role: "doctor" as const };
    localStorage.setItem(laboratoryComparisonPreferenceKey(comparisonScope), JSON.stringify({
      version: 1,
      indicatorIds: [hematocrit.indicatorId, "removed-indicator"],
    }));
    localStorage.setItem(laboratoryComparisonPreferenceKey(petTwoScope), JSON.stringify({
      version: 1,
      indicatorIds: [hemoglobin.indicatorId],
    }));
    localStorage.setItem(laboratoryComparisonPreferenceKey(doctorScope), JSON.stringify({
      version: 1,
      indicatorIds: [hemoglobin.indicatorId],
    }));
    const wrapper = mount(LaboratoryComparison, {
      props: { records: [], confirmedIds: new Set<string>(), ...comparisonScope },
    });

    expect(wrapper.find(".laboratory-comparison").exists()).toBe(false);
    await wrapper.setProps({ records });
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".laboratory-comparison-selection").map((item) => item.text())).toEqual(["Гематокрит, %"]);
    expect(JSON.parse(localStorage.getItem(laboratoryComparisonPreferenceKey(comparisonScope)) ?? "null").indicatorIds)
      .toEqual([hematocrit.indicatorId]);

    await wrapper.setProps({ petId: "pet-2" });
    expect(wrapper.findAll(".laboratory-comparison-selection").map((item) => item.text())).toEqual(["Гемоглобин, г/л"]);
    await wrapper.setProps({ petId: "pet-1", role: "doctor" });
    expect(wrapper.findAll(".laboratory-comparison-selection").map((item) => item.text())).toEqual(["Гемоглобин, г/л"]);
    await wrapper.setProps({ accountId: "account-2", role: "owner" });
    expect(wrapper.findAll(".laboratory-comparison-selection")).toHaveLength(0);
    await wrapper.setProps({ accountId: "account-1" });
    expect(wrapper.findAll(".laboratory-comparison-selection").map((item) => item.text())).toEqual(["Гематокрит, %"]);
  });

  it("keeps scope selections in component memory when browser storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    const hematocrit = { indicatorId: "lab.indicator.cbc.001", indicatorName: "Гематокрит", unit: "%", result: "42" };
    const records = [record(panelSection("study-1", "2026-08-15", "Ветлаб", [hematocrit]))];
    const wrapper = mount(LaboratoryComparison, {
      props: { records, confirmedIds: new Set<string>(), ...comparisonScope },
    });

    wrapper.getComponent(AppCatalogCombobox).vm.$emit("update:selectedIds", [hematocrit.indicatorId]);
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".laboratory-comparison-selection")).toHaveLength(1);

    await wrapper.setProps({ petId: "pet-2" });
    expect(wrapper.findAll(".laboratory-comparison-selection")).toHaveLength(0);
    await wrapper.setProps({ petId: "pet-1" });
    expect(wrapper.findAll(".laboratory-comparison-selection")).toHaveLength(1);
  });
});
