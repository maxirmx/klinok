// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppIcon from "../src/components/AppIcon.vue";
import OwnerScreen from "../src/screens/OwnerScreen.vue";
import type { MedicalRecordDraft, MedicalSnapshot, PetProfile } from "../src/repositories/types";

const repositoryMocks = vi.hoisted(() => ({
  createPet: vi.fn().mockResolvedValue("pet-new"),
  updatePet: vi.fn().mockResolvedValue(undefined),
  deletePet: vi.fn().mockResolvedValue(undefined),
  grantDoctor: vi.fn().mockResolvedValue("grant-new"),
  revokeGrant: vi.fn().mockResolvedValue(undefined),
  disableGrantDelegation: vi.fn().mockResolvedValue(undefined),
  enableGrantDelegation: vi.fn().mockResolvedValue(undefined),
  approveAccessRequest: vi.fn().mockResolvedValue("grant-approved"),
  rejectAccessRequest: vi.fn().mockResolvedValue(undefined),
  confirmRecord: vi.fn().mockResolvedValue(undefined),
}));
const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
const searchDoctorDirectory = vi.hoisted(() => vi.fn());

vi.mock("../src/appStore", async () => {
  const { reactive, readonly } = await import("vue");
  const emptyMedical: MedicalSnapshot = {
    pets: [],
    grants: [],
    accessRequests: [],
    records: [],
    confirmations: [],
    confirmedRecordIds: [],
  };
  const state = reactive({
    feedback: null as { kind: "success" | "error"; text: string } | null,
    control: {
      profile: { firstName: "Ольга", patronymic: "", lastName: "Владелец" },
      profiles: [],
      roles: [],
      allRoles: [],
      devices: [],
      pendingQueue: [],
      notifications: [],
      roleAudit: [],
      ledger: { valid: true, height: 0, headHash: "0".repeat(64), verifiedAt: "2026-07-17T00:00:00.000Z" },
    },
    medical: emptyMedical,
  });
  return {
    appState: readonly(state),
    logout: vi.fn().mockResolvedValue(undefined),
    requireRepository: () => ({ medical: repositoryMocks }),
    searchDoctorDirectory,
    setOwnerMedicalState: (medical: MedicalSnapshot) => { state.medical = medical; },
  };
});

const pet: PetProfile = {
  petId: "pet-1",
  ownerAccountId: "owner-1",
  name: "Шарик",
  species: "Собака",
  breed: "Бигль",
  sex: "Интактный самец",
  birthDate: "2022-06-17",
  color: "трёхцветный",
  latestVaccination: { date: "2026-04-15", name: "Рабикан" },
  latestConfirmedVaccination: { date: "2026-04-15", name: "Рабикан", recordId: "record-vaccination" },
  weightKg: 12.4,
  notes: "Любит длительные прогулки",
  revision: 1,
  tombstoned: false,
  updatedAt: "2026-07-17T10:00:00.000Z",
};

const medicalRecord: MedicalRecordDraft = {
  recordId: "record-1",
  petId: pet.petId,
  revision: 1,
  authorAccountId: "doctor-1",
  authorDisplayName: "Анна Врач",
  encounterDate: "2026-07-17",
  title: "Осмотр",
  text: "Контрольный осмотр",
  sections: {
    "what-happened": {
      kind: "what-happened",
      templateVersion: "what-happened-v1",
      value: { selectedIds: ["well.1"], comment: "Без жалоб" },
      authorAccountId: "doctor-1",
      authorDisplayName: "Анна Врач",
      updatedAt: "2026-07-17T10:00:00.000Z",
    },
  },
  createdAt: "2026-07-17T10:00:00.000Z",
  updatedAt: "2026-07-17T10:00:00.000Z",
};

function withLaboratoryPanel(record: MedicalRecordDraft): MedicalRecordDraft {
  return { ...record, sections: { ...record.sections, "laboratory-tests": {
    kind: "laboratory-tests",
    templateVersion: "laboratory-tests-v1",
    value: { studies: [{
      id: "123e4567-e89b-12d3-a456-426614174000",
      date: record.encounterDate,
      typeId: "lab.study.cbc",
      typeName: "Общеклинический анализ крови",
      mode: "panel",
      laboratory: "Ветлаб",
      results: [{ indicatorId: "lab.indicator.cbc.001", indicatorName: "Гематокрит", unit: "%", result: "42" }],
    }] },
    authorAccountId: record.authorAccountId,
    authorDisplayName: record.authorDisplayName,
    updatedAt: record.updatedAt,
  } } };
}

function snapshot(overrides: Partial<MedicalSnapshot> = {}): MedicalSnapshot {
  return {
    pets: [],
    grants: [],
    accessRequests: [],
    records: [],
    confirmations: [],
    confirmedRecordIds: [],
    ...overrides,
  };
}

async function setMedical(medical: MedicalSnapshot) {
  const store = await import("../src/appStore") as typeof import("../src/appStore") & {
    setOwnerMedicalState: (value: MedicalSnapshot) => void;
  };
  store.setOwnerMedicalState(medical);
}

async function mountAt(path: string, scenarioId: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/owner/home", component: { template: "<div />" } },
      { path: "/owner/pets/new", component: { template: "<div />" } },
      { path: "/owner/pets/:petId", component: { template: "<div />" } },
      { path: "/owner/pets/:petId/edit", component: { template: "<div />" } },
      { path: "/owner/pets/:petId/access", component: { template: "<div />" } },
      { path: "/profile", component: { template: "<div />" } },
      { path: "/auth/login", component: { template: "<div />" } },
    ],
  });
  await router.push(path);
  await router.isReady();
  return mount(OwnerScreen, {
    props: { role: "owner", scenarioId },
    global: { plugins: [createPinia(), router] },
  });
}

function labelled(wrapper: VueWrapper, text: string) {
  const label = wrapper.findAll("label").find((candidate) => {
    const caption = candidate.find("span");
    return caption.exists() && caption.text() === text;
  });
  if (!label) throw new Error(`Label ${text} not found`);
  return label;
}

beforeEach(async () => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: clipboardWriteText },
  });
  repositoryMocks.createPet.mockResolvedValue("pet-new");
  repositoryMocks.grantDoctor.mockResolvedValue("grant-new");
  repositoryMocks.approveAccessRequest.mockResolvedValue("grant-approved");
  searchDoctorDirectory.mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0, pageCount: 1 });
  await setMedical(snapshot());
});

describe("Owner pages", () => {
  it("shows access and medical approvals by pet and hides them after resolution", async () => {
    const pendingAccess = {
      requestId: "request-1",
      petId: pet.petId,
      ownerAccountId: pet.ownerAccountId,
      requesterAccountId: "doctor-1",
      requesterDisplayName: "Анна Врач",
      status: "pending" as const,
      requestedAt: "2026-07-17T10:00:00.000Z",
    };
    await setMedical(snapshot({ pets: [pet], accessRequests: [pendingAccess], records: [medicalRecord] }));
    const wrapper = await mountAt("/owner/home", "owner-home");

    const rootNavigation = wrapper.get('.workspace-nav-tree > li > .workspace-nav-item, .workspace-nav-tree > li > a');
    expect(rootNavigation.get(".pending-count-badge").text()).toBe("2");
    expect(rootNavigation.attributes("aria-label")).toBe("Питомцы. Ожидают решения: 2");
    const petNavigation = wrapper.get('.workspace-nav-tree a[href="/owner/pets/pet-1"]');
    expect(petNavigation.get(".pending-count-badge").text()).toBe("2");
    expect(wrapper.get('.workspace-bottom-nav button[title="Питомцы. Ожидают решения: 2"] .pending-count-badge').text()).toBe("2");

    expect(wrapper.find(".owner-pending-approvals").exists()).toBe(false);
    expect(wrapper.get(".owner-pet-card-approvals").findAll(".owner-pet-card-approval").map((badge) => badge.text()))
      .toEqual(["Доступ: 1", "Медкарта: 1"]);

    wrapper.unmount();
    const detail = await mountAt("/owner/pets/pet-1", "owner-pet-detail");
    expect(detail.get('a[href="/owner/pets/pet-1/access"]').attributes("title"))
      .toBe("Доступ врачей. Ожидают решения: 1");
    expect(detail.get(".owner-medical-heading .pending-count-badge").text()).toBe("1");

    await setMedical(snapshot({
      pets: [pet],
      accessRequests: [{ ...pendingAccess, status: "approved" }],
      records: [medicalRecord],
      confirmedRecordIds: [medicalRecord.recordId],
    }));
    await flushPromises();
    expect(detail.find(".pending-count-badge").exists()).toBe(false);
  });

  it("renders the pet ribbon and nested route navigation", async () => {
    await setMedical(snapshot({ pets: [pet] }));
    const wrapper = await mountAt("/owner/home", "owner-home");

    expect(wrapper.get(".workspace-topbar h1").text()).toBe("Кабинет владельца");
    expect(wrapper.get(".owner-section-heading h2").text()).toBe("Мои питомцы");
    const addPetLink = wrapper.get('.owner-page-heading a[title="Добавить питомца"]');
    expect(addPetLink.attributes("aria-label")).toBe("Добавить питомца");
    expect(addPetLink.text()).toBe("");
    expect(addPetLink.getComponent(AppIcon).props("name")).toBe("plus");
    expect(wrapper.findAll(".workspace-nav-tree .workspace-nav-item span").map((node) => node.text())).toEqual([
      "Питомцы",
      "Добавить питомца",
      "Шарик",
    ]);
    expect(wrapper.findAll(".workspace-nav-tree .workspace-nav-item")[0]!.getComponent(AppIcon).props("name")).toBe("pets");
    const bottomNavigationItems = wrapper.findAll(".workspace-bottom-nav :is(a, button)");
    expect(bottomNavigationItems.map((item) => item.get("span").text())).toEqual([
      "Питомцы",
      "Настройки",
      "Выйти",
    ]);
    expect(bottomNavigationItems.map((item) => item.attributes("title"))).toEqual([
      "Питомцы",
      "Настройки",
      "Выйти",
    ]);
    expect(bottomNavigationItems.map((item) => item.attributes("aria-label"))).toEqual([
      "Питомцы",
      "Настройки",
      "Выйти",
    ]);
    expect(bottomNavigationItems.every((item) => item.element.tagName === "BUTTON")).toBe(true);
    expect(bottomNavigationItems.every((item) => item.attributes("href") === undefined)).toBe(true);
    expect(bottomNavigationItems[1]!.getComponent(AppIcon).props("name")).toBe("settings");
    expect(wrapper.get(".workspace-bottom-nav").classes()).toContain("role-owner");
    expect(wrapper.get(".owner-pet-card").text()).toContain("Шарик");
    expect(wrapper.get(".owner-pet-card").text()).toContain("Бигль");
    expect(wrapper.get(".owner-pet-card").text()).toMatch(/\d+ полн(?:ый|ых) (?:год|года|лет)/);
    expect(wrapper.text()).not.toContain("Любит длительные прогулки");
  });

  it("shows one medical card and refreshes confirmation status from the current snapshot", async () => {
    await setMedical(snapshot({ pets: [pet], records: [medicalRecord] }));
    const wrapper = await mountAt("/owner/pets/pet-1", "owner-pet-detail");

    expect(wrapper.get(".owner-medical-record h2").text()).toBe("Медицинская карта");
    expect(wrapper.text()).not.toContain("Эпикриз");
    expect(wrapper.text()).not.toContain("Предыдущие приёмы");
    expect(wrapper.find(".medical-record-entry-epicrisis").exists()).toBe(false);
    expect(wrapper.findAll(".medical-record-entry-details")).toHaveLength(1);
    expect(wrapper.get(".medical-record-entry-details").text()).toContain("Ожидает подтверждения");
    const confirm = wrapper.get(".owner-encounter-confirm");
    expect(confirm.text()).toBe("");
    expect(confirm.attributes("title")).toBe("Подтвердить запись");
    expect(confirm.attributes("aria-label")).toBe("Подтвердить запись");
    expect(confirm.getComponent(AppIcon).props("name")).toBe("check");
    expect(confirm.element.closest(".encounter-history-heading")).not.toBeNull();
    await confirm.trigger("click");
    await flushPromises();
    expect(repositoryMocks.confirmRecord).toHaveBeenCalledWith("pet-1", "record-1", 1);

    await setMedical(snapshot({
      pets: [pet],
      records: [medicalRecord],
      confirmedRecordIds: [medicalRecord.recordId],
    }));
    await flushPromises();
    expect(wrapper.get(".medical-record-entry-details").text()).toContain("Подтверждена");
    expect(wrapper.find(".owner-encounter-confirm").exists()).toBe(false);
  });

  it("renders laboratory history as a bordered panel outside the medical card", async () => {
    await setMedical(snapshot({ pets: [pet], records: [withLaboratoryPanel(medicalRecord)] }));
    const wrapper = await mountAt("/owner/pets/pet-1", "owner-pet-detail");

    const history = wrapper.get(".owner-pet-detail > .laboratory-comparison");
    expect(history.get("h2").text()).toBe("История лабораторных показателей");
    expect(history.classes()).toContain("panel");
    expect(wrapper.get(".owner-medical-record").find(".laboratory-comparison").exists()).toBe(false);
  });

  it("offers fixed species and sex values and creates a complete profile with notes", async () => {
    const wrapper = await mountAt("/owner/pets/new", "owner-pet-create");
    expect(wrapper.get(".workspace-topbar h1").text()).toBe("Кабинет владельца");
    expect(wrapper.get(".owner-section-heading h2").text()).toBe("Добавить питомца");
    const speciesField = labelled(wrapper, "Вид");
    expect(speciesField.find("input").exists()).toBe(false);
    expect(speciesField.get<HTMLSelectElement>("select").element.value).toBe("Собака");
    expect(speciesField.findAll("option").map((option) => option.text())).toEqual([
      "Собака",
      "Кошка",
      "Другое",
    ]);
    expect(labelled(wrapper, "Пол").findAll("option").slice(1).map((option) => option.text())).toEqual([
      "Интактный самец",
      "Интактная самка",
      "Кастрированный самец",
      "Кастрированная самка",
    ]);

    await labelled(wrapper, "Кличка").get("input").setValue("Боня");
    await speciesField.get("select").setValue("Кошка");
    await labelled(wrapper, "Порода").get("input").setValue("Сибирская");
    await labelled(wrapper, "Пол").get("select").setValue("Кастрированная самка");
    await wrapper.get('input[aria-label="Точная дата рождения"]').setValue("2021-05-10");
    expect(labelled(wrapper, "Окрас").attributes("for")).toBe(wrapper.get(".owner-color-field input").attributes("id"));
    expect(wrapper.get(".owner-color-field input").attributes("required")).toBeUndefined();
    await wrapper.get(".app-catalog-toggle").trigger("click");
    const calicoOption = wrapper.findAll(".app-catalog-option").find((option) => option.text() === "Ситцевый");
    expect(calicoOption).toBeTruthy();
    await calicoOption!.trigger("click");
    await labelled(wrapper, "Вес, кг").get("input").setValue("4.8");
    await labelled(wrapper, "Заметки").get("textarea").setValue("Не любит переноску");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(repositoryMocks.createPet).toHaveBeenCalledWith(expect.objectContaining({
      name: "Боня",
      species: "Кошка",
      sex: "Кастрированная самка",
      birthDate: "2021-05-10",
      color: "Ситцевый",
      weightKg: 4.8,
      notes: "Не любит переноску",
    }));
    expect(repositoryMocks.createPet).toHaveBeenCalledOnce();
    expect(wrapper.vm.$route.path).toBe("/owner/pets/pet-new");
  });

  it("creates only one pet when the form is submitted repeatedly while saving", async () => {
    let resolveCreatePet!: (petId: string) => void;
    repositoryMocks.createPet.mockImplementationOnce(() => new Promise<string>((resolve) => {
      resolveCreatePet = resolve;
    }));
    const wrapper = await mountAt("/owner/pets/new", "owner-pet-create");

    await labelled(wrapper, "Кличка").get("input").setValue("Боня");
    await labelled(wrapper, "Порода").get("input").setValue("Сибирская");
    await labelled(wrapper, "Пол").get("select").setValue("Кастрированная самка");
    await wrapper.get('input[aria-label="Точная дата рождения"]').setValue("2021-05-10");
    await labelled(wrapper, "Вес, кг").get("input").setValue("4.8");

    const firstSubmit = wrapper.get("form").trigger("submit");
    const secondSubmit = wrapper.get("form").trigger("submit");
    await Promise.all([firstSubmit, secondSubmit]);

    expect(repositoryMocks.createPet).toHaveBeenCalledOnce();
    expect(wrapper.get<HTMLButtonElement>('button[type="submit"]').element.disabled).toBe(true);
    expect(wrapper.get('button[type="submit"]').attributes("aria-label")).toBe("Сохранение питомца…");

    resolveCreatePet("pet-new");
    await flushPromises();

    expect(wrapper.vm.$route.path).toBe("/owner/pets/pet-new");
  });

  it("shows supported-field validation and photo errors in the form", async () => {
    const wrapper = await mountAt("/owner/pets/new", "owner-pet-create");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.get('[role="alert"]').text()).toContain("Заполните кличку, вид и породу.");
    expect(repositoryMocks.createPet).not.toHaveBeenCalled();

    const photo = wrapper.get<HTMLInputElement>('input[type="file"]');
    Object.defineProperty(photo.element, "files", {
      configurable: true,
      value: [new File(["gif"], "pet.gif", { type: "image/gif" })],
    });
    await photo.trigger("change");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("JPEG, PNG или WebP");
  });

  it("treats a legacy sex as empty and drops unsupported fields on edit", async () => {
    const legacyPet = {
      ...pet,
      species: "Хомяк",
      sex: "Кобель",
      color: undefined,
      weightKg: undefined,
      photoDataUrl: "data:image/png;base64,AA==",
      legacyOptionalField: "drop-me",
    } as unknown as PetProfile;
    await setMedical(snapshot({ pets: [legacyPet] }));
    const wrapper = await mountAt("/owner/pets/pet-1/edit", "owner-pet-edit");

    expect(wrapper.get(".workspace-topbar h1").text()).toBe("Кабинет владельца");
    expect(wrapper.get(".owner-section-heading h2").text()).toBe("Редактировать: Шарик");
    expect(labelled(wrapper, "Вид").get<HTMLSelectElement>("select").element.value).toBe("Другое");
    expect(labelled(wrapper, "Пол").get<HTMLSelectElement>("select").element.value).toBe("");
    const birthModeRadios = wrapper.findAll<HTMLInputElement>('.owner-birth-selector input[type="radio"]');
    expect(birthModeRadios).toHaveLength(2);
    expect(birthModeRadios[0]!.element.checked).toBe(true);
    expect(wrapper.get(".owner-birth-row").find('input[type="date"]').exists()).toBe(true);
    expect(wrapper.find(".owner-birth-row button").exists()).toBe(false);
    expect(wrapper.get(".owner-photo-actions").findAll("[title]").map((node) => node.attributes("title")))
      .toEqual(["Выбрать фотографию", "Удалить фотографию"]);
    expect(wrapper.get('.owner-photo-actions [title="Выбрать фотографию"]').getComponent(AppIcon).props("name")).toBe("edit");
    expect(wrapper.get('.owner-photo-actions [title="Удалить фотографию"]').getComponent(AppIcon).props("name")).toBe("trash");
    const formActions = wrapper.get(".owner-pet-form-actions");
    expect(formActions.get('button[title="Сохранить изменения"]').getComponent(AppIcon).props("name")).toBe("check");
    expect(formActions.get('a[title="Отмена"]').getComponent(AppIcon).props("name")).toBe("close");
    expect(formActions.get('a[title="Отмена"]').attributes("href")).toBe("/owner/pets/pet-1");
    await labelled(wrapper, "Пол").get("select").setValue("Интактный самец");
    await wrapper.get(".owner-color-field input").setValue("трёхцветный");
    await labelled(wrapper, "Вес, кг").get("input").setValue("12.4");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    const saved = repositoryMocks.updatePet.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(saved.species).toBe("Другое");
    expect(saved.sex).toBe("Интактный самец");
    expect(saved.color).toBe("трёхцветный");
    expect(saved.latestConfirmedVaccination).toEqual(pet.latestConfirmedVaccination);
    expect(saved).not.toHaveProperty("legacyOptionalField");
  });

  it("moves all current access states into one doctor table", async () => {
    await setMedical(snapshot({
      pets: [pet],
      accessRequests: [{
        requestId: "request-1",
        petId: pet.petId,
        ownerAccountId: pet.ownerAccountId,
        requesterAccountId: "doctor-1",
        requesterDisplayName: "Анна Врач",
        status: "pending",
        requestedAt: "2026-07-17T10:00:00.000Z",
      }],
      grants: [
        {
          grantId: "grant-1",
          requestId: "request-approved",
          petId: pet.petId,
          grantorAccountId: pet.ownerAccountId,
          granteeAccountId: "doctor-2",
          granteeDisplayName: "Борис Врач",
          actions: ["read", "write_unconfirmed", "delegate"],
          revision: 1,
          status: "active",
          createdAt: "2026-07-17T10:00:00.000Z",
        },
        {
          grantId: "grant-2",
          petId: pet.petId,
          grantorAccountId: pet.ownerAccountId,
          granteeAccountId: "doctor-3",
          granteeDisplayName: "Виктор Врач",
          actions: ["read"],
          revision: 1,
          status: "revoked",
          createdAt: "2026-07-16T10:00:00.000Z",
          revokedAt: "2026-07-17T10:00:00.000Z",
        },
        {
          grantId: "grant-old-doctor-2",
          petId: pet.petId,
          grantorAccountId: pet.ownerAccountId,
          granteeAccountId: "doctor-2",
          granteeDisplayName: "Борис Врач",
          actions: ["read"],
          revision: 1,
          status: "revoked",
          createdAt: "2026-07-15T10:00:00.000Z",
          revokedAt: "2026-07-16T10:00:00.000Z",
        },
        {
          grantId: "grant-3",
          petId: pet.petId,
          grantorAccountId: pet.ownerAccountId,
          granteeAccountId: "doctor-4",
          granteeDisplayName: "Галина Врач",
          actions: ["read", "write_unconfirmed"],
          revision: 1,
          status: "active",
          createdAt: "2026-07-17T11:00:00.000Z",
        },
      ],
      records: Array.from({ length: 11 }, (_, index) => {
        const recordNumber = index + 1;
        const day = String(recordNumber).padStart(2, "0");
        const timestamp = `2026-07-${day}T10:00:00.000Z`;
        return {
          recordId: `record-${recordNumber}`,
          petId: pet.petId,
          revision: 1,
          authorAccountId: "doctor-2",
          authorDisplayName: "Семён Врач",
          encounterDate: `2026-07-${day}`,
          title: "Осмотр",
          text: "Состояние стабильное",
          sections: {
            outcome: {
              kind: "outcome" as const,
              templateVersion: "free-text-v0" as const,
              value: { text: "Состояние стабильное" },
              authorAccountId: "doctor-2",
              authorDisplayName: "Семён Врач",
              updatedAt: timestamp,
            },
          },
          createdAt: timestamp,
          updatedAt: timestamp,
        };
      }),
    }));
    const detail = await mountAt("/owner/pets/pet-1", "owner-pet-detail");

    expect(detail.get(".workspace-topbar h1").text()).toBe("Кабинет владельца");
    expect(detail.find(".owner-page-heading").exists()).toBe(false);
    expect(detail.text()).toContain("Любит длительные прогулки");
    expect(detail.text()).toContain("Состояние стабильное");
    expect(detail.text()).not.toContain("Анна Врач");
    expect(detail.find(".owner-access-panel").exists()).toBe(false);
    expect(detail.get(".owner-pet-profile-details").text()).toContain("Шарик");
    expect(detail.get(".owner-pet-profile-details").text()).toContain("Собака · Бигль");
    expect(detail.get(".owner-medical-record h2").text()).toBe("Медицинская карта");
    expect(detail.find(".medical-record-entry-epicrisis").exists()).toBe(false);
    expect(detail.findAll("details.owner-encounter-record")).toHaveLength(10);
    const encounterRecord = detail.get("details.owner-encounter-record");
    expect(encounterRecord.get("summary").text()).toContain("Семён Врач");
    expect(encounterRecord.text()).not.toContain("doctor-2");
    expect(encounterRecord.get(".encounter-history-section").text()).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    const medicalPagination = detail.get(".owner-medical-pagination");
    expect(medicalPagination.text()).toContain("Показаны 1–10 из 11");
    await medicalPagination.get('button[title="Следующая страница"]').trigger("click");
    expect(detail.findAll("details.owner-encounter-record")).toHaveLength(1);
    expect(medicalPagination.text()).toContain("Показаны 11–11 из 11");

    const filters = detail.get(".medical-record-filters");
    await filters.get('input[type="search"]').setValue("Семен");
    expect(detail.findAll("details.owner-encounter-record")).toHaveLength(10);
    await filters.get('input[type="search"]').setValue("");
    await filters.get('select[aria-label="Порядок"]').setValue("asc");
    expect(detail.get("details.owner-encounter-record summary").text()).toContain("01.07.2026");
    await filters.get('.medical-record-date-filter input[type="date"]').setValue("2026-07-10");
    expect(detail.findAll("details.owner-encounter-record")).toHaveLength(2);
    expect(medicalPagination.text()).toContain("Показаны 1–2 из 2");
    await filters.get('select[aria-label="Статус"]').setValue("confirmed");
    expect(detail.find("details.owner-encounter-record").exists()).toBe(false);
    expect(detail.text()).toContain("Записи по выбранным условиям не найдены.");

    const wrapper = await mountAt("/owner/pets/pet-1/access", "owner-pet-access");
    expect(wrapper.get(".workspace-topbar h1").text()).toBe("Кабинет владельца");
    expect(wrapper.get(".owner-page-heading h2").text()).toBe("Доступ врачей");
    expect(wrapper.get(".owner-pet-profile-details").text()).toContain("Шарик");
    expect(wrapper.get(".owner-pet-id").text()).toBe("pet-1");
    expect(wrapper.get('.owner-page-heading a[title="Назад к информации о питомце"]').attributes("href"))
      .toBe("/owner/pets/pet-1");
    expect(wrapper.findAll(".owner-access-table th").map((header) => header.text())).toEqual([
      "ФИО врача", "Доступ", "Делегирование",
    ]);
    expect(wrapper.get('.owner-page-heading button[title="Предоставить доступ"]')
      .getComponent(AppIcon).props("name")).toBe("plus");
    expect(wrapper.findAll(".owner-page-heading-actions > *").map((action) => action.attributes("title")))
      .toEqual(["Предоставить доступ", "Назад к информации о питомце"]);
    expect(wrapper.find('.owner-access-table thead button[title="Предоставить доступ"]').exists()).toBe(false);
    expect(wrapper.get(".owner-access-panel .app-paginator").text()).toContain("Показаны 1–4 из 4");
    const rows = wrapper.findAll(".owner-access-table tbody tr");
    expect(rows).toHaveLength(4);
    const requestedRow = rows.find((row) => row.text().includes("Анна Врач"))!;
    const grantedRow = rows.find((row) => row.text().includes("Борис Врач"))!;
    const grantedWithoutDelegationRow = rows.find((row) => row.text().includes("Галина Врач"))!;
    const revokedRow = rows.find((row) => row.text().includes("Виктор Врач"))!;
    expect(requestedRow.text()).toContain("doctor-1");
    expect(requestedRow.get(".person-identity-name").text()).toBe("Анна Врач");
    expect(requestedRow.get(".person-identity-id").text()).toBe("doctor-1");
    expect(requestedRow.text()).toContain("Запрошен");
    expect(requestedRow.find('td[data-label="Действия"]').exists()).toBe(false);
    expect(requestedRow.get('td[data-label="Доступ"]').findAll("button")).toHaveLength(2);
    expect(requestedRow.get('td[data-label="Делегирование"]').text()).toBe("");
    expect(grantedRow.text()).toContain("Предоставлен");
    expect(grantedRow.get('td[data-label="Делегирование"]').text()).toBe("Да");
    expect(grantedRow.get(".delegation-badge").classes()).toContain("enabled");
    expect(grantedRow.get('td[data-label="Доступ"] button').attributes("title")).toBe("Отозвать доступ");
    expect(grantedRow.get('td[data-label="Делегирование"] button').attributes("title")).toBe("Отключить делегирование");
    expect(grantedRow.get('button[title="Отключить делегирование"]').classes()).toContain("danger-outline");
    expect(grantedRow.get('button[title="Отключить делегирование"]').getComponent(AppIcon).props("name")).toBe("share");
    expect(grantedWithoutDelegationRow.text()).toContain("Предоставлен");
    expect(grantedWithoutDelegationRow.get('td[data-label="Делегирование"]').text()).toBe("Нет");
    expect(grantedWithoutDelegationRow.get(".delegation-badge").classes()).toContain("disabled");
    expect(grantedWithoutDelegationRow.get('button[title="Разрешить делегирование"]')
      .getComponent(AppIcon).props("name")).toBe("share");
    expect(grantedWithoutDelegationRow.findAll("button").map((button) => button.attributes("title")))
      .toEqual(["Отозвать доступ", "Разрешить делегирование"]);
    expect(revokedRow.text()).toContain("Отозван");
    expect(revokedRow.get('td[data-label="Делегирование"]').text()).toBe("");

    await requestedRow.get('button[title="Предоставить доступ"]').trigger("click");
    await flushPromises();
    expect(repositoryMocks.approveAccessRequest).toHaveBeenCalledWith("request-1");

    await grantedRow.get('button[title="Отключить делегирование"]').trigger("click");
    await flushPromises();
    expect(repositoryMocks.disableGrantDelegation).toHaveBeenCalledWith("grant-1");

    await grantedWithoutDelegationRow.get('button[title="Разрешить делегирование"]').trigger("click");
    await flushPromises();
    expect(repositoryMocks.enableGrantDelegation).toHaveBeenCalledWith("grant-3");

    searchDoctorDirectory.mockResolvedValueOnce({
      items: [{
        accountId: "doctor-3",
        firstName: "Виктор",
        lastName: "Врач",
        displayName: "Виктор Врач",
        updatedAt: "2026-07-17T10:00:00.000Z",
      }],
      page: 1, pageSize: 50, total: 1, pageCount: 1,
    });
    await revokedRow.get('button[title="Предоставить доступ повторно"]').trigger("click");
    await flushPromises();
    expect(repositoryMocks.grantDoctor).toHaveBeenCalledWith(
      "pet-1",
      "doctor-3",
      ["read", "write_unconfirmed"],
      { granteeDisplayName: "Виктор Врач" },
    );
  });

  it("paginates doctor access rows with the shared paginator", async () => {
    await setMedical(snapshot({
      pets: [pet],
      grants: Array.from({ length: 11 }, (_, index) => ({
        grantId: `grant-${index}`,
        petId: pet.petId,
        grantorAccountId: pet.ownerAccountId,
        granteeAccountId: `doctor-${index}`,
        granteeDisplayName: `Врач ${String(index).padStart(2, "0")}`,
        actions: ["read" as const],
        revision: 1,
        status: "active" as const,
        createdAt: "2026-07-17T10:00:00.000Z",
      })),
    }));
    const wrapper = await mountAt("/owner/pets/pet-1/access", "owner-pet-access");

    expect(wrapper.findAll(".owner-access-table tbody tr")).toHaveLength(10);
    const paginator = wrapper.get(".owner-access-panel .app-paginator");
    expect(paginator.text()).toContain("Показаны 1–10 из 11");
    await paginator.get('button[title="Следующая страница"]').trigger("click");
    expect(wrapper.findAll(".owner-access-table tbody tr")).toHaveLength(1);
    expect(paginator.text()).toContain("Показаны 11–11 из 11");
  });

  it("finds a doctor by partial ФИО and grants access from an accessible modal", async () => {
    await setMedical(snapshot({ pets: [pet] }));
    searchDoctorDirectory.mockResolvedValue({
      items: [{
        accountId: "doctor-4",
        firstName: "Мария",
        lastName: "Ветеринар",
        displayName: "Мария Ветеринар",
        updatedAt: "2026-07-21T10:00:00.000Z",
      }],
      page: 1, pageSize: 50, total: 1, pageCount: 1,
    });
    const wrapper = await mountAt("/owner/pets/pet-1/access", "owner-pet-access");

    const opener = wrapper.get('.owner-page-heading button[title="Предоставить доступ"]');
    await opener.trigger("click");
    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.attributes("aria-modal")).toBe("true");
    const searchButton = dialog.get('button[title="Найти врача"]');
    expect(searchButton.attributes("aria-label")).toBe("Найти врача");
    expect(searchButton.getComponent(AppIcon).props("name")).toBe("search");

    await labelled(wrapper, "ФИО врача, его часть или полный идентификатор").get("input").setValue("Ветер");
    await dialog.get("form").trigger("submit");
    await flushPromises();
    expect(searchDoctorDirectory).toHaveBeenCalledWith("Ветер", 1, 50);
    const doctorIdentity = dialog.get(".list-row .person-identity");
    expect(doctorIdentity.get(".person-identity-name").text()).toBe("Мария Ветеринар");
    expect(doctorIdentity.get(".person-identity-id").text()).toBe("doctor-4");
    const selectButton = dialog.get('.list-row button[title="Выбрать врача"]');
    expect(selectButton.getComponent(AppIcon).props("name")).toBe("check");
    await selectButton.trigger("click");
    expect(dialog.get('button[title="Отмена"]').getComponent(AppIcon).props("name")).toBe("close");
    expect(dialog.get('button[title="Предоставить доступ"]').getComponent(AppIcon).props("name")).toBe("check");
    await labelled(wrapper, "Разрешить врачу делегирование").get("input").setValue(true);
    await dialog.findAll("form")[1]!.trigger("submit");
    await flushPromises();

    expect(repositoryMocks.grantDoctor).toHaveBeenCalledWith(
      "pet-1",
      "doctor-4",
      ["read", "write_unconfirmed", "delegate"],
      { granteeDisplayName: "Мария Ветеринар" },
    );
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(wrapper.get('[role="status"]').text()).toContain("Доступ предоставлен.");
  });

  it("revalidates a selected doctor before granting access", async () => {
    await setMedical(snapshot({ pets: [pet] }));
    const doctor = {
      accountId: "doctor-unavailable",
      firstName: "Мария",
      lastName: "Ветеринар",
      displayName: "Мария Ветеринар",
      updatedAt: "2026-07-21T10:00:00.000Z",
    };
    searchDoctorDirectory
      .mockResolvedValueOnce({ items: [doctor], page: 1, pageSize: 50, total: 1, pageCount: 1 })
      .mockResolvedValueOnce({ items: [], page: 1, pageSize: 50, total: 0, pageCount: 1 });
    const wrapper = await mountAt("/owner/pets/pet-1/access", "owner-pet-access");
    await wrapper.get('.owner-page-heading button[title="Предоставить доступ"]').trigger("click");
    const dialog = wrapper.get('[role="dialog"]');
    await labelled(wrapper, "ФИО врача, его часть или полный идентификатор").get("input").setValue("Мария");
    await dialog.get("form").trigger("submit");
    await flushPromises();
    await dialog.get('.list-row button[title="Выбрать врача"]').trigger("click");
    await dialog.findAll("form")[1]!.trigger("submit");
    await flushPromises();

    expect(searchDoctorDirectory).toHaveBeenLastCalledWith("doctor-unavailable", 1, 50, "id");
    expect(repositoryMocks.grantDoctor).not.toHaveBeenCalled();
    expect(dialog.get('[role="alert"]').text()).toContain("больше недоступен");
  });

  it("renders a missing-pet state and confirms deletion before returning home", async () => {
    const missing = await mountAt("/owner/pets/missing", "owner-pet-detail");
    expect(missing.text()).toContain("Питомец не найден");
    expect(missing.get('.owner-empty-state a[href="/owner/home"]').text()).toBe("На главную страницу");

    await setMedical(snapshot({ pets: [pet] }));
    const detail = await mountAt("/owner/pets/pet-1", "owner-pet-detail");
    expect(detail.get(".owner-pet-profile-details").text())
      .toMatch(/\d+ полн(?:ый|ых) (?:год|года|лет) · дата рождения 17\.06\.2022/);
    expect(detail.findAll(".owner-profile-fields dt").map((node) => node.text())).toEqual([
      "Пол", "Окрас", "Номер чипа", "Клеймо", "Последняя вакцинация", "Вес",
    ]);

    const actions = detail.get(".owner-profile-actions");
    const editLink = actions.get('[title="Редактировать"]');
    const accessLink = actions.get('[title="Доступ врачей"]');
    const copyIdButton = actions.get('button[title="Копировать идентификатор питомца"]');
    const deleteButton = actions.get('button[title="Удалить"]');
    expect(editLink.text()).toBe("");
    expect(accessLink.text()).toBe("");
    expect(copyIdButton.text()).toBe("");
    expect(deleteButton.text()).toBe("");
    expect(editLink.getComponent(AppIcon).props("name")).toBe("edit");
    expect(accessLink.getComponent(AppIcon).props("name")).toBe("user");
    expect(accessLink.attributes("href")).toBe("/owner/pets/pet-1/access");
    expect(copyIdButton.getComponent(AppIcon).props("name")).toBe("copy");
    expect(deleteButton.getComponent(AppIcon).props("name")).toBe("trash");

    await copyIdButton.trigger("click");
    await flushPromises();
    expect(clipboardWriteText).toHaveBeenCalledWith("pet-1");
    expect(detail.get('[role="status"]').text()).toBe("Идентификатор питомца скопирован.");

    clipboardWriteText.mockRejectedValueOnce(new Error("clipboard denied"));
    await copyIdButton.trigger("click");
    await flushPromises();
    expect(detail.get('[role="alert"]').text()).toBe("Не удалось скопировать идентификатор питомца.");

    await deleteButton.trigger("click");
    expect(detail.get('[role="alertdialog"]').text()).toContain("Удалить профиль Шарик?");
    repositoryMocks.deletePet.mockImplementationOnce(async () => {
      await setMedical(snapshot());
    });
    await detail.get('[role="alertdialog"]').findAll("button")
      .find((button) => button.text() === "Удалить питомца")!
      .trigger("click");
    await flushPromises();

    expect(repositoryMocks.deletePet).toHaveBeenCalledWith("pet-1");
    expect(detail.vm.$route.path).toBe("/owner/home");
  });

  it("shows an age interval and birth year in one age field when no exact birth date is stored", async () => {
    await setMedical(snapshot({ pets: [{ ...pet, birthDate: undefined, birthYear: 2022 }] }));
    const detail = await mountAt("/owner/pets/pet-1", "owner-pet-detail");
    const labels = detail.findAll(".owner-profile-fields dt").map((node) => node.text());

    expect(labels).toEqual(["Пол", "Окрас", "Номер чипа", "Клеймо", "Последняя вакцинация", "Вес"]);
    expect(detail.get(".owner-pet-profile-details").text())
      .toMatch(/\d+-\d+ полн(?:ый|ых) (?:год|года|лет) · год рождения 2022/);
  });
});
