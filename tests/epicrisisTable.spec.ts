// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AppPaginator from "../src/components/AppPaginator.vue";
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
  it("renders the last valid page when the current page becomes out of range", async () => {
    const records = Array.from({ length: 11 }, (_, index) => medicalRecord(index + 1));
    const wrapper = mount(EpicrisisTable, {
      props: { records, page: 2, pageSize: 10 },
    });

    expect(wrapper.findAll(".epicrisis-row")).toHaveLength(1);
    expect(wrapper.get(".epicrisis-row").text()).toContain("Запись 11");

    await wrapper.setProps({ records: records.slice(0, 1) });

    expect(wrapper.findAll(".epicrisis-row")).toHaveLength(1);
    expect(wrapper.get(".epicrisis-row").text()).toContain("Запись 1");
    expect(wrapper.getComponent(AppPaginator).props("page")).toBe(1);
    expect(wrapper.getComponent(AppPaginator).text()).toContain("Показаны 1–1 из 1");
  });
});
