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

  it("renders structured ultrasound and thoracic X-ray studies recursively", () => {
    const wrapper = mount(MedicalRecordEntry, {
      props: {
        record: {
          ...record,
          sections: {
            ...record.sections,
            "instrumental-tests": {
              kind: "instrumental-tests",
              templateVersion: "instrumental-tests-v1",
              value: { studies: [{
                id: "123e4567-e89b-12d3-a456-426614174000",
                date: "2026-07-20",
                typeId: "instrumental.study.ultrasound-abdomen",
                typeName: "УЗИ органов брюшной полости",
                mode: "tree",
                comment: "Контроль",
                findings: [{
                  findingId: "instrumental.finding.ultrasound-abdomen.9",
                  findingName: "Мочевой пузырь",
                  children: [{
                    findingId: "instrumental.finding.ultrasound-abdomen.9.3",
                    findingName: "Содержимое",
                    children: [{
                      findingId: "instrumental.finding.ultrasound-abdomen.9.3.5",
                      findingName: "Визуализируется",
                      children: [{
                        findingId: "instrumental.finding.ultrasound-abdomen.9.3.5.1",
                        findingName: "Взвесь/осадок",
                        value: "Незначительно",
                        children: [],
                      }],
                    }],
                  }],
                }, {
                  findingId: "instrumental.finding.ultrasound-abdomen.10.0",
                  findingName: "Размер",
                  value: "12",
                  unit: "мм",
                  children: [],
                }, {
                  findingId: "instrumental.finding.ultrasound-abdomen.4.5",
                  findingName: "Размер образований",
                  value: "7",
                  unit: "мм",
                  children: [],
                }],
              }, {
                id: "223e4567-e89b-12d3-a456-426614174000",
                date: "2026-07-21",
                typeId: "instrumental.study.xray-thorax",
                typeName: "Рентгенография грудной полости",
                mode: "tree",
                findings: [{
                  findingId: "instrumental.finding.xray-thorax.10",
                  findingName: "Купол диафрагмы",
                  children: [{
                    findingId: "instrumental.finding.xray-thorax.10.0",
                    findingName: "Характеристики купола",
                    children: [{
                      findingId: "instrumental.finding.xray-thorax.10.0.3",
                      findingName: "Чёткий",
                      children: [],
                    }, {
                      findingId: "instrumental.finding.xray-thorax.10.0.5",
                      findingName: "На LL-проекции в области межреберья",
                      children: [{
                        findingId: "instrumental.finding.xray-thorax.10.0.5.intercostal",
                        findingName: "Межреберье на LL-проекции",
                        value: "7",
                        children: [],
                      }],
                    }],
                  }],
                }, {
                  findingId: "instrumental.finding.xray-thorax.20",
                  findingName: "Заключение",
                  value: "Очаговых и диффузных изменений в лёгочных полях не выявлено",
                  children: [],
                }],
              }] },
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
    const history = wrapper.get(".instrumental-history");
    expect(history.findAll(".instrumental-history-study")).toHaveLength(2);
    expect(history.findAll(".instrumental-history-findings .instrumental-history-findings")).toHaveLength(6);
    expect(history.text()).toContain("20.07.2026 · УЗИ органов брюшной полости");
    expect(history.text()).toContain("Взвесь/осадок: Незначительно");
    expect(history.text()).toContain("Размер: 12 мм");
    expect(history.text()).toContain("Размер образований: 7 мм");
    expect(history.text()).toContain("21.07.2026 · Рентгенография грудной полости");
    expect(history.text()).toContain("Чёткий");
    expect(history.text()).toContain("Межреберье на LL-проекции: 7");
    expect(history.text()).toContain("Заключение: Очаговых и диффузных изменений в лёгочных полях не выявлено");
    expect(history.text()).toContain("Контроль");
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
    expect(summary.text()).toContain("Итог: Выздоровление; Улучшение; Назначено лечение");
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
      .toEqual(["Что случилось", "Общие данные/Габитус", "Диагноз", "Итог"]);
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
    expect(wrapper.get(".medical-record-collapsed-outcome").text()).toBe("· Итог: Выздоровление; Улучшение; Назначено лечение");
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

    expect(wrapper.get(".owner-encounter-summary").text()).toContain("Итог: Не заполнено");
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

  it("renders every populated therapeutic history section as structured text", () => {
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
                  text: "Снижение аппетита\nсо вчерашнего дня",
                  problems: [{
                    id: "problem-1",
                    title: "Не ест",
                    onsetId: "problem.onset.yesterday",
                    priorTherapyId: "problem.therapy.performed",
                    medicationUseId: "problem.medication.used",
                    medicationIds: ["problem.medication.type.nsaid"],
                    medicationName: "Мелоксикам",
                    medicationDynamicsId: "problem.dynamics.positive",
                  }, {
                    id: "problem-2",
                    title: "Вялость",
                    onsetId: "problem.onset.today",
                    medicationIds: [],
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
                  selectedIds: [
                    "exam.general.state.good",
                    "exam.mucosa.color.pale-pink",
                    "exam.mucosa.moisture.moist",
                  ],
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
    const therapeuticView = section.get(".therapeutic-appointment-view");
    expect(therapeuticView.find('[role="tablist"]').exists()).toBe(false);
    expect(therapeuticView.find('[role="tab"]').exists()).toBe(false);
    expect(therapeuticView.find('[role="tabpanel"]').exists()).toBe(false);
    expect(section.findAll(".therapeutic-history-block > h4").map((heading) => heading.text())).toEqual([
      "Анамнез болезни", "Анамнез жизни", "Осмотр", "Рекомендации", "Назначения",
    ]);
    expect(section.text()).toContain("Проблема 1: Не ест");
    expect(section.text()).toContain("Проблема 2: Вялость");
    expect(section.text()).toContain("Мелоксикам");
    expect(section.text()).toContain("Содержится в квартире");
    expect(section.text()).toContain("Контроль через неделю");
    expect(section.text()).toContain("Диетический корм");
    const examination = section.findAll(".therapeutic-history-block")
      .find((block) => block.get("h4").text() === "Осмотр")!;
    expect(examination.findAll(".therapeutic-history-finding-group > span").map((item) => item.text())).toEqual([
      "Общее состояние",
      "Видимые слизистые оболочки (ВСО)",
    ]);
    const mucosa = examination.findAll(".therapeutic-history-finding-group")
      .find((group) => group.get(":scope > span").text() === "Видимые слизистые оболочки (ВСО)")!;
    expect(mucosa.findAll(".therapeutic-history-finding-detail > span").map((item) => item.text())).toEqual([
      "Цвет: Бледно-розовые",
      "Влажность: Влажные",
    ]);
    expect(section.get(".therapeutic-history-text").text()).toBe("Снижение аппетита\nсо вчерашнего дня");
  });

  it("omits empty therapeutic history blocks", () => {
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
                diseaseAnamnesis: { text: "", problems: [], selectedIds: [] },
                lifeAnamnesis: { text: "", selectedIds: [], currentMedications: "", allergies: "" },
                examination: { text: "", selectedIds: [] },
                recommendations: "Только рекомендации",
                prescriptions: "",
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
    expect(section.findAll(".therapeutic-history-block > h4").map((heading) => heading.text())).toEqual(["Рекомендации"]);
    expect(section.text()).toContain("Только рекомендации");
  });
});
