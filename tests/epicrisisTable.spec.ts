// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AppPaginator from "../src/components/AppPaginator.vue";
import AppTableSort from "../src/components/AppTableSort.vue";
import EpicrisisTable from "../src/components/EpicrisisTable.vue";
import type { MedicalRecordDraft } from "../src/repositories/types";

function medicalRecord(index: number): MedicalRecordDraft {
  const day = String(index).padStart(2, "0");
  return {
    recordId: `record-${index}`,
    petId: "pet-1",
    revision: 1,
    authorAccountId: "doctor-1",
    authorDisplayName: "Анна Врач",
    encounterDate: `2026-07-${day}`,
    title: `Осмотр ${index}`,
    text: `Запись ${index}`,
    sections: {},
    createdAt: `2026-07-${day}T10:00:00.000Z`,
    updatedAt: `2026-07-${day}T10:00:00.000Z`,
  };
}

describe("EpicrisisTable", () => {
  it("sorts records by date before pagination and resets the page when direction changes", async () => {
    const wrapper = mount(EpicrisisTable, {
      props: { records: [medicalRecord(3), medicalRecord(1), medicalRecord(2)], page: 1, pageSize: 10 },
    });
    const dateHeader = wrapper.get('[role="columnheader"]');

    expect(dateHeader.attributes("aria-sort")).toBe("descending");
    expect(wrapper.findAll(".epicrisis-row").map((row) => row.text().match(/Запись \d/)?.[0]))
      .toEqual(["Запись 3", "Запись 2", "Запись 1"]);
    expect(wrapper.get<HTMLSelectElement>('select[aria-label="Сортировка эпикриза"]').element.value).toBe("date:desc");

    await dateHeader.get("button").trigger("click");

    expect(dateHeader.attributes("aria-sort")).toBe("ascending");
    expect(wrapper.findAll(".epicrisis-row").map((row) => row.text().match(/Запись \d/)?.[0]))
      .toEqual(["Запись 1", "Запись 2", "Запись 3"]);
    expect(wrapper.emitted("update:page")).toEqual([[1]]);
  });

  it("keeps equal encounter dates deterministic and shares direction with the mobile control", async () => {
    const older = { ...medicalRecord(1), recordId: "record-older", encounterDate: "2026-07-10", createdAt: "2026-07-10T09:00:00.000Z" };
    const newer = { ...medicalRecord(2), recordId: "record-newer", encounterDate: "2026-07-10", createdAt: "2026-07-10T11:00:00.000Z" };
    const wrapper = mount(EpicrisisTable, {
      props: { records: [older, newer], page: 2, pageSize: 1 },
    });

    expect(wrapper.get(".epicrisis-row").text()).toContain("Запись 1");
    wrapper.getComponent(AppTableSort).vm.$emit("update:direction", "asc");
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[role="columnheader"]').attributes("aria-sort")).toBe("ascending");
    expect(wrapper.emitted("update:page")).toEqual([[1]]);
  });

  it("renders the last valid page when the current page becomes out of range", async () => {
    const records = Array.from({ length: 11 }, (_, index) => medicalRecord(index + 1));
    const wrapper = mount(EpicrisisTable, {
      props: { records, page: 2, pageSize: 10 },
    });

    expect(wrapper.findAll(".epicrisis-row")).toHaveLength(1);
    expect(wrapper.get(".epicrisis-row").text()).toContain("Запись 1");

    await wrapper.setProps({ records: records.slice(0, 1) });

    expect(wrapper.findAll(".epicrisis-row")).toHaveLength(1);
    expect(wrapper.get(".epicrisis-row").text()).toContain("Запись 1");
    expect(wrapper.getComponent(AppPaginator).props("page")).toBe(1);
    expect(wrapper.getComponent(AppPaginator).text()).toContain("Показаны 1–1 из 1");
  });
});
