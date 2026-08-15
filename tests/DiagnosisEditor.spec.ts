// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AppIcon from "../src/components/AppIcon.vue";
import DiagnosisCombobox from "../src/components/DiagnosisCombobox.vue";
import DiagnosisEditor from "../src/components/DiagnosisEditor.vue";
import { emptyDiagnosisDraft } from "../src/medicalEncounter";

describe("DiagnosisEditor", () => {
  it("copies a free-form preliminary diagnosis into confirmed and retains its source", async () => {
    const diagnosis = {
      ...emptyDiagnosisDraft(),
      preliminaryMode: "custom" as const,
      preliminaryCustomText: "Подозрение на гастрит",
    };
    const wrapper = mount(DiagnosisEditor, {
      props: { modelValue: diagnosis, errors: {} },
    });

    const promote = wrapper.get('button[aria-label="Назначить предварительный диагноз подтверждённым"]');
    expect(promote.attributes()).not.toHaveProperty("disabled");
    expect(promote.getComponent(AppIcon).props("name")).toBe("input");
    await promote.trigger("click");

    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toMatchObject({
      preliminaryMode: "custom",
      preliminaryCustomText: "Подозрение на гастрит",
      confirmedMode: "custom",
      confirmedCustomText: "Подозрение на гастрит",
    });
  });

  it("asks before replacing confirmed and keeps the differential source", async () => {
    const diagnosis = {
      ...emptyDiagnosisDraft(),
      differentialSelectedIds: ["diagnosis.digestive.001"],
      confirmedMode: "custom" as const,
      confirmedCustomText: "Старое значение",
    };
    const wrapper = mount(DiagnosisEditor, {
      props: { modelValue: diagnosis, errors: {} },
    });

    const promote = wrapper.get('button[aria-label="Назначить «Стоматит» подтверждённым диагнозом"]');
    expect(promote.getComponent(AppIcon).props("name")).toBe("input");
    await promote.trigger("click");
    const dialog = wrapper.get('[role="alertdialog"]');
    expect(dialog.text()).toContain("Заменить подтверждённый диагноз?");
    await dialog.get(".danger, .primary-action").trigger("click");

    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toMatchObject({
      differentialSelectedIds: ["diagnosis.digestive.001"],
      confirmedMode: "catalog",
      confirmedSelectedId: "diagnosis.digestive.001",
      confirmedCustomText: "",
    });
  });

  it("promotes a free-form differential while retaining all differential collections", async () => {
    const diagnosis = {
      ...emptyDiagnosisDraft(),
      differentialSelectedIds: ["diagnosis.digestive.001"],
      differentialCustomTexts: ["Реакция на корм", "Непереносимость препарата"],
    };
    const wrapper = mount(DiagnosisEditor, {
      props: { modelValue: diagnosis, errors: {} },
    });

    const promote = wrapper.get('button[aria-label="Назначить «Реакция на корм» подтверждённым диагнозом"]');
    expect(promote.getComponent(AppIcon).props("name")).toBe("input");
    await promote.trigger("click");
    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toMatchObject({
      differentialSelectedIds: ["diagnosis.digestive.001"],
      differentialCustomTexts: ["Реакция на корм", "Непереносимость препарата"],
      confirmedMode: "custom",
      confirmedSelectedId: "",
      confirmedCustomText: "Реакция на корм",
    });
  });

  it("renders each diagnosis as one editable catalog combobox in a bordered semantic fieldset", () => {
    const wrapper = mount(DiagnosisEditor, {
      props: { modelValue: emptyDiagnosisDraft(), errors: { confirmed: "Укажите диагноз" } },
    });
    expect(wrapper.findAll("fieldset.medical-card-option-panel")).toHaveLength(3);
    expect(wrapper.findAll("legend").map((legend) => legend.text())).toEqual([
      "Предварительный диагноз",
      "Дифференциальные диагнозы",
      "Подтверждённый диагноз",
    ]);
    expect(wrapper.findAllComponents(DiagnosisCombobox)).toHaveLength(3);
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(0);
    expect(wrapper.text()).not.toContain("Из справочника");
    expect(wrapper.text()).not.toContain("Свободная форма");
    expect(wrapper.text()).toContain("Укажите диагноз");
  });

  it("infers single-value modes and retains mixed differential diagnoses", async () => {
    const diagnosis = {
      ...emptyDiagnosisDraft(),
      preliminarySelectedId: "diagnosis.digestive.001",
      differentialSelectedIds: ["diagnosis.digestive.002"],
      confirmedSelectedId: "diagnosis.digestive.003",
    };
    const wrapper = mount(DiagnosisEditor, {
      props: {
        modelValue: diagnosis,
        errors: { preliminary: "Ошибка 1", differential: "Ошибка 2", confirmed: "Ошибка 3" },
      },
    });

    const fields = wrapper.findAll("fieldset.diagnosis-field");
    const preliminaryInput = fields[0]!.get<HTMLInputElement>('input[role="combobox"]');
    await preliminaryInput.setValue("Свободный предварительный диагноз");
    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toMatchObject({
      preliminaryMode: "custom",
      preliminarySelectedId: "",
      preliminaryCustomText: "Свободный предварительный диагноз",
    });
    await preliminaryInput.setValue("шок гиповолемический");
    await fields[0]!.get('[role="option"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toMatchObject({
      preliminaryMode: "catalog",
      preliminarySelectedId: "diagnosis.general.001",
      preliminaryCustomText: "",
    });

    await fields[1]!.get<HTMLInputElement>('input[role="combobox"]').setValue("Свободный дифференциальный диагноз");
    await fields[1]!.get('[aria-label="Добавить диагноз в свободной форме"]').trigger("click");
    const mixedDiagnosis = wrapper.emitted("update:modelValue")?.at(-1)?.[0];
    expect(mixedDiagnosis).toMatchObject({
      differentialSelectedIds: ["diagnosis.digestive.002"],
      differentialCustomTexts: ["Свободный дифференциальный диагноз"],
    });
    await wrapper.setProps({ modelValue: mixedDiagnosis });
    await wrapper.get('button[aria-label="Удалить «Свободный дифференциальный диагноз» из дифференциальных диагнозов"]').trigger("click");
    const withoutCustom = wrapper.emitted("update:modelValue")?.at(-1)?.[0];
    expect(withoutCustom).toMatchObject({
      differentialSelectedIds: ["diagnosis.digestive.002"],
      differentialCustomTexts: [],
    });
    await wrapper.setProps({ modelValue: withoutCustom });
    await wrapper.get('button[aria-label="Удалить «Гингивит острый» из дифференциальных диагнозов"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toMatchObject({
      differentialSelectedIds: [],
      differentialCustomTexts: [],
    });
    await fields[2]!.get<HTMLInputElement>('input[role="combobox"]').setValue("Свободный подтверждённый диагноз");
    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toMatchObject({
      confirmedMode: "custom",
      confirmedSelectedId: "",
      confirmedCustomText: "Свободный подтверждённый диагноз",
    });
    expect(wrapper.text()).toContain("Ошибка 1");
    expect(wrapper.text()).toContain("Ошибка 2");
    expect(wrapper.text()).toContain("Ошибка 3");
  });
});
