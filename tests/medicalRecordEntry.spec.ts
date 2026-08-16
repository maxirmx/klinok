// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AppIcon from "../src/components/AppIcon.vue";
import MedicalRecordEntry from "../src/components/MedicalRecordEntry.vue";
import type { MedicalRecordDraft } from "../src/repositories/types";

const record: MedicalRecordDraft = {
  recordId: "record-1",
  petId: "pet-1",
  revision: 2,
  authorAccountId: "doctor-1",
  authorDisplayName: "Вера Врач",
  encounterDate: "2026-07-21",
  title: "Осмотр",
  text: "Не ест со вчерашнего дня",
  sections: {
    "what-happened": {
      kind: "what-happened",
      templateVersion: "what-happened-v1",
      value: { selectedIds: ["problem.digestive.1"], comment: "Не ест со вчерашнего дня" },
      authorAccountId: "doctor-1",
      authorDisplayName: "Вера Врач",
      updatedAt: "2026-07-21T10:00:00.000Z",
    },
    diagnosis: {
      kind: "diagnosis",
      templateVersion: "diagnosis-v1",
      value: {
        preliminary: { customText: "Подозрение на гастрит" },
        differential: { selectedIds: ["diagnosis.digestive.001"], customText: "" },
        confirmed: { selectedId: "diagnosis.digestive.002", customText: "" },
      },
      authorAccountId: "doctor-2",
      authorDisplayName: "Анна Врач",
      updatedAt: "2026-07-21T11:00:00.000Z",
    },
    "general-data": {
      kind: "general-data",
      templateVersion: "general-data-v1",
      value: {
        weightKg: 13.75,
        temperatureC: 38.6,
        heartRateBpm: 112,
        respiratoryRatePerMinute: 24,
        bloodPressure: { systolicMmHg: 120, diastolicMmHg: 80, meanMmHg: 93 },
      },
      authorAccountId: "doctor-1",
      authorDisplayName: "Вера Врач",
      updatedAt: "2026-07-21T10:30:00.000Z",
    },
    outcome: {
      kind: "outcome",
      templateVersion: "outcome-v1",
      value: {
        selectedIds: ["outcome.recovery", "outcome.improvement"],
        comment: "Назначено лечение",
      },
      authorAccountId: "doctor-1",
      authorDisplayName: "Вера Врач",
      updatedAt: "2026-07-21T12:00:00.000Z",
    },
  },
  createdAt: "2026-07-21T10:00:00.000Z",
  updatedAt: "2026-07-21T12:00:00.000Z",
};

describe("MedicalRecordEntry", () => {
  it("renders panel, narrative, and infection laboratory studies", () => {
    const wrapper = mount(MedicalRecordEntry, {
      props: {
        record: {
          ...record,
          sections: {
            ...record.sections,
            "laboratory-tests": {
              kind: "laboratory-tests",
              templateVersion: "laboratory-tests-v1",
              value: {
                studies: [
                  {
                    id: "123e4567-e89b-12d3-a456-426614174000",
                    date: "2026-07-20",
                    typeId: "lab.study.cbc",
                    typeName: "Общеклинический анализ крови",
                    mode: "panel",
                    laboratory: "Ветлаб",
                    technician: "Иванов",
                    equipment: "Анализатор",
                    comment: "Натощак",
                    results: [{ indicatorId: "lab.indicator.cbc.001", indicatorName: "Гематокрит", unit: "%", result: "42", reference: "35–55" }],
                  },
                  {
                    id: "223e4567-e89b-12d3-a456-426614174000",
                    date: "2026-07-21",
                    typeId: "lab.study.narrative.001",
                    typeName: "Микроскопия",
                    mode: "narrative",
                    laboratory: "Ветлаб",
                    result: "Патологий не обнаружено",
                  },
                  {
                    id: "323e4567-e89b-12d3-a456-426614174000",
                    date: "2026-07-21",
                    typeId: "lab.study.infection",
                    typeName: "Исследование на инфекцию",
                    mode: "infection",
                    laboratory: "Ветлаб",
                    infection: "Чума плотоядных",
                    method: "ПЦР",
                    result: "positive",
                  },
                ],
              },
              authorAccountId: "doctor-1",
              authorDisplayName: "Вера Врач",
              updatedAt: "2026-07-21T12:00:00.000Z",
            },
          },
        },
        mode: "details",
        confirmed: false,
        open: true,
      },
    });

    const history = wrapper.get(".laboratory-history");
    expect(history.findAll(".laboratory-history-study")).toHaveLength(3);
    const panel = history.get(".laboratory-history-results");
    expect(panel.find("table").exists()).toBe(false);
    expect(panel.findAll(".laboratory-result-headings")).toHaveLength(1);
    expect(panel.findAll(".laboratory-result-headings-primary > span").map((header) => header.text())).toEqual([
      "Показатель",
      "Результат",
      "Референсные значения",
    ]);
    const panelRow = panel.get(".laboratory-result-row");
    expect(panelRow.findAll(".laboratory-result-label").map((label) => label.text())).toEqual(["Референсные значения"]);
    expect(panelRow.get(".laboratory-result-mobile-name").text()).toBe("Гематокрит · %");
    expect(panelRow.get(".laboratory-result-unit").text()).toBe("%");
    expect(history.text()).toContain("20.07.2026 · Общеклинический анализ крови");
    expect(history.text()).toContain("Иванов");
    expect(history.text()).toContain("Анализатор");
    expect(history.text()).toContain("35–55");
    expect(history.text()).toContain("Патологий не обнаружено");
    expect(history.text()).toContain("Чума плотоядных");
    expect(history.text()).toContain("Положительно");
    expect(history.text()).toContain("Натощак");
  });

  it.each([
    ["well.1", "Всё хорошо", "well"],
    ["problem.digestive.1", "Не всё хорошо", "problem"],
    ["critical.1", "Всё плохо", "critical"],
  ])("shows the general condition for %s in the record header", (selectedId, label, tone) => {
    const whatHappened = record.sections["what-happened"]!;
    const wrapper = mount(MedicalRecordEntry, {
      props: {
        record: {
          ...record,
          sections: {
            ...record.sections,
            "what-happened": {
              ...whatHappened,
              value: { selectedIds: [selectedId], comment: "Подробный комментарий" },
            },
          },
        },
        mode: "details",
        confirmed: false,
      },
    });

    const summary = wrapper.get(".owner-encounter-summary");
    expect(summary.text()).toContain(label);
    expect(summary.text()).not.toContain("Подробный комментарий");
    expect(summary.text()).toContain("Исход: Выздоровление; Улучшение; Назначено лечение");
    expect(summary.get(`.medical-record-condition-${tone}`).text()).toBe(label);
  });

  it("renders and activates the compact epicrisis mode", async () => {
    const wrapper = mount(MedicalRecordEntry, {
      props: { record, mode: "epicrisis", confirmed: false },
    });

    expect(wrapper.element.tagName).toBe("BUTTON");
    expect(wrapper.text()).toContain("21.07.2026");
    expect(wrapper.text()).toContain("Не ест");
    expect(wrapper.text()).toContain("Гингивит острый");
    expect(wrapper.text()).toContain("Выздоровление; Улучшение");
    expect(wrapper.text()).toContain("Назначено лечение");
    expect(wrapper.text()).toContain("Ожидает подтверждения");
    await wrapper.trigger("click");
    expect(wrapper.emitted("activate")?.[0]).toEqual([record]);

    const withoutOutcome = mount(MedicalRecordEntry, {
      props: {
        record: { ...record, sections: { "what-happened": record.sections["what-happened"] } },
        mode: "epicrisis",
        confirmed: false,
      },
    });
    expect(withoutOutcome.text()).toContain("Не заполнено");

    const legacyOutcome = mount(MedicalRecordEntry, {
      props: {
        record: {
          ...record,
          sections: {
            ...record.sections,
            outcome: {
              ...record.sections.outcome!,
              templateVersion: "free-text-v0",
              value: { text: "Старый текст исхода" },
            },
          },
        },
        mode: "epicrisis",
        confirmed: false,
      },
    });
    expect(legacyOutcome.text()).toContain("Старый текст исхода");
  });

  it("renders populated sections in canonical order and hides editing for confirmed records", async () => {
    const wrapper = mount(MedicalRecordEntry, {
      props: {
        record,
        mode: "details",
        confirmed: true,
        action: "edit",
        open: true,
        showAuthorAccountId: true,
      },
    });

    expect(wrapper.element.tagName).toBe("DETAILS");
    expect(wrapper.attributes()).toHaveProperty("open");
    expect(wrapper.find(".medical-record-chevron-collapsed").exists()).toBe(true);
    expect(wrapper.find(".medical-record-chevron-expanded").exists()).toBe(true);
    expect(wrapper.findAll(".encounter-history-section h3").map((node) => node.text()))
      .toEqual(["Что случилось", "Общие данные/Габитус", "Диагноз", "Исход"]);
    expect(wrapper.get(".owner-encounter-sections").findAll(":scope > .encounter-history-section")).toHaveLength(4);
    expect(wrapper.get(".owner-encounter-sections").classes()).not.toContain("owner-encounter-sections-editing");
    const summary = wrapper.get(".owner-encounter-summary");
    expect(summary.text()).toContain("21.07.2026 · Не всё хорошо");
    expect(summary.text()).not.toContain("Пищеварением");
    expect(summary.get(".medical-record-condition-problem").text()).toBe("Не всё хорошо");
    expect(wrapper.get(".encounter-history-comment").text()).toBe("Не ест со вчерашнего дня");
    expect(wrapper.text()).not.toContain("Рекомендации");
    const authorIdentity = wrapper.findAll(".person-identity")
      .find((identity) => identity.text().includes("Анна Врач"))!;
    expect(authorIdentity.get(".person-identity-name").text()).toBe("Анна Врач");
    expect(authorIdentity.get(".person-identity-id").text()).toBe("doctor-2");
    expect(authorIdentity.text()).not.toContain("·");
    expect(wrapper.text()).toContain("13.75 кг");
    expect(wrapper.text()).toContain("120/80 сред. 93 мм рт. ст.");
    const diagnosis = wrapper.findAll(".encounter-history-section")
      .find((section) => section.get("h3").text() === "Диагноз")!;
    expect(diagnosis.findAll("dt").map((label) => label.text())).toEqual([
      "Предварительный диагноз",
      "Дифференциальные диагнозы",
      "Подтверждённый диагноз",
    ]);
    expect(diagnosis.text()).toContain("Подозрение на гастрит");
    expect(diagnosis.text()).toContain("Стоматит");
    expect(diagnosis.text()).toContain("Гингивит острый");
    expect(wrapper.text()).not.toContain("2026-07-21T11:00:00.000Z");
    expect(wrapper.text()).toContain("Подтверждена");
    expect(wrapper.find(".medical-record-edit").exists()).toBe(false);

    await wrapper.setProps({ confirmed: false });
    const edit = wrapper.get(".medical-record-edit");
    expect(wrapper.get(".owner-encounter-summary").find(".medical-record-actions").exists()).toBe(false);
    expect(wrapper.get(".medical-record-collapsed-outcome").text()).toBe("· Исход: Выздоровление; Улучшение; Назначено лечение");
    expect(wrapper.get(".medical-record-collapsed-diagnosis").text()).toBe("· Диагноз: Гингивит острый");
    expect(wrapper.findAll(".encounter-history-section")[0]!.get(".encounter-history-heading").find(".medical-record-actions").exists()).toBe(true);
    expect(edit.text()).toBe("");
    expect(edit.attributes("title")).toBe("Редактировать запись");
    expect(edit.attributes("aria-label")).toBe("Редактировать запись");
    expect(edit.getComponent(AppIcon).props("name")).toBe("edit");
    await edit.trigger("click");
    expect(wrapper.emitted("edit")?.[0]).toEqual([record]);
    const remove = wrapper.get(".medical-record-delete");
    expect(remove.attributes("title")).toBe("Удалить запись");
    expect(remove.attributes("aria-label")).toBe("Удалить запись");
    expect(remove.getComponent(AppIcon).props("name")).toBe("trash");
    await remove.trigger("click");
    expect(wrapper.emitted("delete")?.[0]).toEqual([record]);
  });

  it("renders diagnosis v2 without an absent confirmed diagnosis", () => {
    const diagnosis = record.sections.diagnosis!;
    const wrapper = mount(MedicalRecordEntry, {
      props: {
        record: {
          ...record,
          sections: {
            ...record.sections,
            diagnosis: {
              ...diagnosis,
              templateVersion: "diagnosis-v2",
              value: {
                preliminary: { customText: "" },
                differential: {
                  selectedIds: ["diagnosis.digestive.001"],
                  customTexts: ["Реакция на корм", "Непереносимость препарата"],
                },
                confirmed: { customText: "" },
              },
            },
          },
        },
        mode: "details",
        confirmed: false,
        open: true,
      },
    });

    const diagnosisHistory = wrapper.get(".diagnosis-history-values");
    expect(diagnosisHistory.findAll("li").map((item) => item.text())).toEqual([
      "Стоматит",
      "Реакция на корм",
      "Непереносимость препарата",
    ]);
    expect(diagnosisHistory.findAll("dt").map((item) => item.text())).toEqual([
      "Предварительный диагноз",
      "Дифференциальные диагнозы",
    ]);
    expect(wrapper.get("summary").text()).not.toContain("Диагноз:");
  });

  it("offers confirmation only for a pending detailed record", async () => {
    const wrapper = mount(MedicalRecordEntry, {
      props: { record, mode: "details", confirmed: false, action: "confirm" },
    });
    const confirm = wrapper.get(".owner-encounter-confirm");
    expect(confirm.text()).toBe("");
    expect(confirm.attributes("title")).toBe("Подтвердить запись");
    expect(confirm.attributes("aria-label")).toBe("Подтвердить запись");
    expect(confirm.getComponent(AppIcon).props("name")).toBe("check");
    expect(confirm.element.closest(".encounter-history-heading")).not.toBeNull();
    expect(confirm.element.closest(".medical-record-actions")).not.toBeNull();
    await confirm.trigger("click");
    expect(wrapper.emitted("confirm")?.[0]).toEqual([record]);

    await wrapper.setProps({ confirmed: true });
    expect(wrapper.find(".owner-encounter-confirm").exists()).toBe(false);
  });

  it("shows an explicit missing outcome after what happened in the collapsed summary", () => {
    const wrapper = mount(MedicalRecordEntry, {
      props: {
        record: { ...record, sections: { "what-happened": record.sections["what-happened"] } },
        mode: "details",
        confirmed: false,
      },
    });

    expect(wrapper.get(".owner-encounter-summary").text()).toContain("Исход: Не заполнено");
  });

  it("renders structured vaccination and chipping details", () => {
    const wrapper = mount(MedicalRecordEntry, {
      props: {
        record: {
          ...record,
          sections: {
            ...record.sections,
            vaccination: {
              kind: "vaccination",
              templateVersion: "vaccination-v1",
              value: {
                previousVaccinationDate: "2025-08-04",
                previousVaccineName: "Рабикан",
                previousVaccinationComplications: false,
                currentVaccineName: "Мультикан-8",
                currentVaccineBatch: "AB-123",
                currentVaccineExpiresOn: "2027-12-31",
                chipNumber: "643094100000002",
                administrationSite: "Холка",
                nextRevaccinationDate: "2028-08-04",
              },
              authorAccountId: "doctor-1",
              authorDisplayName: "Вера Врач",
              updatedAt: "2026-07-21T12:00:00.000Z",
            },
          },
        },
        mode: "details",
        confirmed: false,
        open: true,
      },
    });

    const section = wrapper.findAll(".encounter-history-section")
      .find((candidate) => candidate.get("h3").text() === "Вакцинация/чипирование")!;
    expect(section.get(".vaccination-values").text()).toContain("04.08.2025");
    expect(section.text()).toContain("Не было");
    expect(section.text()).toContain("Мультикан-8");
    expect(section.text()).toContain("AB-123");
    expect(section.text()).toContain("31.12.2027");
    expect(section.text()).toContain("643094100000002");
    expect(section.text()).toContain("Холка");
    expect(section.text()).toContain("04.08.2028");
  });

  it("renders therapeutic history in the same accessible tabs as the editor", async () => {
    const wrapper = mount(MedicalRecordEntry, {
      props: {
        record: {
          ...record,
          sections: {
            ...record.sections,
            "therapeutic-appointment": {
              kind: "therapeutic-appointment",
              templateVersion: "therapeutic-appointment-v1",
              value: {
                diseaseAnamnesis: {
                  text: "Снижение аппетита со вчерашнего дня",
                  problems: [{
                    id: "problem-1",
                    title: "Не ест",
                    onsetId: "problem.onset.yesterday",
                    priorTherapyId: "problem.therapy.performed",
                    medicationUseId: "problem.medication.used",
                    medicationIds: ["problem.medication.type.nsaid"],
                    medicationName: "Мелоксикам",
                    medicationDynamicsId: "problem.dynamics.positive",
                  }],
                  selectedIds: ["disease.appetite.state.changed", "disease.appetite.change.absent"],
                },
                lifeAnamnesis: {
                  text: "Содержится в квартире",
                  selectedIds: ["life.housing.place.apartment"],
                  currentMedications: "Не получает",
                  allergies: "Не выявлены",
                },
                examination: {
                  text: "Контактен",
                  selectedIds: ["exam.general.state.good"],
                },
                recommendations: "Контроль через неделю",
                prescriptions: "Диетический корм",
              },
              authorAccountId: "doctor-1",
              authorDisplayName: "Вера Врач",
              updatedAt: "2026-07-21T12:00:00.000Z",
            },
          },
        },
        mode: "details",
        confirmed: false,
        open: true,
      },
    });

    const section = wrapper.findAll(".encounter-history-section")
      .find((candidate) => candidate.get("h3").text() === "Терапевтический приём")!;
    const tabs = section.findAll<HTMLButtonElement>('[role="tab"]');
    const panels = section.findAll('[role="tabpanel"]');
    expect(tabs.map((tab) => tab.text())).toEqual([
      "Анамнез болезни",
      "Анамнез жизни",
      "Осмотр",
      "Рекомендации",
      "Назначения",
    ]);
    expect(section.findAll('[role="tablist"]')).toHaveLength(1);
    expect(panels).toHaveLength(5);
    expect(tabs[0]!.attributes("aria-selected")).toBe("true");
    expect(panels[0]!.attributes("hidden")).toBeUndefined();
    expect(panels.slice(1).every((panel) => panel.attributes("hidden") !== undefined)).toBe(true);
    expect(panels[0]!.text()).toContain("Проблема 1: Не ест");
    expect(panels[0]!.text()).toContain("Вчера");
    expect(panels[0]!.text()).toContain("Название препарата");
    expect(panels[0]!.text()).toContain("Мелоксикам");

    await tabs[0]!.trigger("keydown", { key: "ArrowRight" });
    expect(tabs[1]!.attributes("aria-selected")).toBe("true");
    expect(panels[0]!.attributes("hidden")).toBeDefined();
    expect(panels[1]!.attributes("hidden")).toBeUndefined();
    expect(panels[1]!.text()).toContain("Содержится в квартире");

    await tabs[1]!.trigger("keydown", { key: "End" });
    expect(tabs[4]!.attributes("aria-selected")).toBe("true");
    expect(panels[4]!.text()).toContain("Диетический корм");
    await tabs[3]!.trigger("click");
    expect(tabs[3]!.attributes("aria-selected")).toBe("true");
    expect(panels[3]!.text()).toContain("Контроль через неделю");
  });

  it.each([
    { field: "recommendations", text: "Только рекомендации", selectedTab: "Рекомендации" },
    { field: "prescriptions", text: "Только назначения", selectedTab: "Назначения" },
  ] as const)("opens the first populated therapeutic tab for a sparse $field record", ({ field, text, selectedTab }) => {
    const value = {
      diseaseAnamnesis: { text: "", problems: [], selectedIds: [] },
      lifeAnamnesis: { text: "", selectedIds: [], currentMedications: "", allergies: "" },
      examination: { text: "", selectedIds: [] },
      recommendations: "",
      prescriptions: "",
      [field]: text,
    };
    const wrapper = mount(MedicalRecordEntry, {
      props: {
        record: {
          ...record,
          sections: {
            ...record.sections,
            "therapeutic-appointment": {
              kind: "therapeutic-appointment",
              templateVersion: "therapeutic-appointment-v1",
              value,
              authorAccountId: "doctor-1",
              authorDisplayName: "Вера Врач",
              updatedAt: "2026-07-21T12:00:00.000Z",
            },
          },
        },
        mode: "details",
        confirmed: false,
        open: true,
      },
    });

    const section = wrapper.findAll(".encounter-history-section")
      .find((candidate) => candidate.get("h3").text() === "Терапевтический приём")!;
    const selected = section.get<HTMLButtonElement>('[role="tab"][aria-selected="true"]');
    expect(selected.text()).toBe(selectedTab);
    expect(section.get('[role="tabpanel"]:not([hidden])').text()).toContain(text);
  });
});
