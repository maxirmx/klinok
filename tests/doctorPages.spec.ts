// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DoctorPetAccessDto, PetAccessRequest } from "@klinok/protocol";
import AppIcon from "../src/components/AppIcon.vue";
import DoctorScreen from "../src/screens/DoctorScreen.vue";
import type { MedicalRecordDraft, MedicalSnapshot, PetProfile } from "../src/repositories/types";

const repositoryMocks = vi.hoisted(() => ({
  requestAccess: vi.fn().mockResolvedValue("request-1"),
  cancelAccessRequest: vi.fn().mockResolvedValue(undefined),
  saveEncounter: vi.fn().mockResolvedValue("record-1"),
  deleteRecord: vi.fn().mockResolvedValue(undefined),
  delegateGrant: vi.fn().mockResolvedValue("grant-delegated"),
  relinquishAccess: vi.fn().mockResolvedValue(undefined),
  refreshProjection: vi.fn().mockResolvedValue(undefined),
}));
const directoryMocks = vi.hoisted(() => ({
  loadDoctorPetAccesses: vi.fn(),
  lookupPetDirectory: vi.fn(),
  searchDoctorDirectory: vi.fn(),
  searchPetDirectory: vi.fn(),
}));

vi.mock("../src/appStore", async () => {
  const { reactive, readonly } = await import("vue");
  const state = reactive({
    activeRole: "doctor" as const,
    feedback: null,
    session: { authenticated: true, accountId: "doctor-1" },
    control: {
      profile: { firstName: "Вера", lastName: "Врач" },
      profiles: [], roles: [], allRoles: [], devices: [], pendingQueue: [], notifications: [], events: [],
    },
    medical: { pets: [], grants: [], accessRequests: [], records: [], confirmations: [], confirmedRecordIds: [], events: [] } as MedicalSnapshot,
  });
  return {
    appState: readonly(state),
    loadDoctorPetAccesses: directoryMocks.loadDoctorPetAccesses,
    lookupPetDirectory: directoryMocks.lookupPetDirectory,
    logout: vi.fn().mockResolvedValue(undefined),
    requireRepository: () => ({ medical: repositoryMocks }),
    searchDoctorDirectory: directoryMocks.searchDoctorDirectory,
    searchPetDirectory: directoryMocks.searchPetDirectory,
    setDoctorMedicalState: (medical: MedicalSnapshot) => { state.medical = medical; },
  };
});

const pet: PetProfile = {
  petId: "pet-1",
  ownerAccountId: "owner-1",
  name: "Буся",
  species: "Собака",
  breed: "Бигль",
  sex: "Интактная самка",
  birthDate: "2022-06-17",
  color: "трёхцветный",
  chip: "643094100000001",
  brandMark: "ABC-123",
  latestVaccination: { date: "2026-04-15", name: "Рабикан" },
  latestConfirmedVaccination: { date: "2026-04-15", name: "Рабикан", recordId: "record-vaccination-previous" },
  weightKg: 11.8,
  notes: "Боится громких звуков",
  keyVersion: 1,
  tombstoned: false,
  updatedAt: "2026-07-21T10:00:00.000Z",
};

const medicalRecord: MedicalRecordDraft = {
  recordId: "record-1",
  petId: pet.petId,
  revision: 1,
  authorAccountId: "doctor-1",
  authorDisplayName: "Вера Врач",
  encounterDate: "2026-07-21",
  title: "Осмотр",
  text: "Не ест",
  sections: {
    "what-happened": {
      kind: "what-happened",
      templateVersion: "what-happened-v1",
      value: { selectedIds: ["problem.digestive.1"], comment: "Не ест" },
      authorAccountId: "doctor-1",
      authorDisplayName: "Вера Врач",
      updatedAt: "2026-07-21T10:00:00.000Z",
    },
    outcome: {
      kind: "outcome",
      templateVersion: "outcome-v1",
      value: { selectedIds: ["outcome.observation"], comment: "Назначено лечение" },
      authorAccountId: "doctor-1",
      authorDisplayName: "Вера Врач",
      updatedAt: "2026-07-21T10:00:00.000Z",
    },
  },
  createdAt: "2026-07-21T10:00:00.000Z",
  updatedAt: "2026-07-21T10:00:00.000Z",
};

function snapshot(
  actions: Array<"read" | "write_unconfirmed" | "delegate"> = ["read", "write_unconfirmed", "delegate"],
  overrides: Partial<MedicalSnapshot> = {},
): MedicalSnapshot {
  return {
    pets: [pet],
    grants: [{
      grantId: "grant-1",
      petId: pet.petId,
      grantorAccountId: pet.ownerAccountId,
      granteeAccountId: "doctor-1",
      actions,
      petKeyVersion: 1,
      status: "active",
      createdAt: "2026-07-21T10:00:00.000Z",
    }],
    accessRequests: [], records: [], confirmations: [], confirmedRecordIds: [], events: [],
    ...overrides,
  };
}

function accessRequest(overrides: Partial<PetAccessRequest> = {}): PetAccessRequest {
  return {
    requestId: "request-pending",
    petId: pet.petId,
    ownerAccountId: pet.ownerAccountId,
    requesterAccountId: "doctor-1",
    status: "pending",
    requestedAt: "2026-07-22T10:00:00.000Z",
    ...overrides,
  };
}

function doctorAccess(overrides: Partial<DoctorPetAccessDto> = {}): DoctorPetAccessDto {
  return {
    petId: pet.petId,
    ownerAccountId: pet.ownerAccountId,
    ownerDisplayName: "Ольга Владелец",
    species: pet.species,
    name: pet.name,
    status: "granted",
    permissions: ["read", "write_unconfirmed", "delegate"],
    grantId: "grant-1",
    ...overrides,
  };
}

function accessPage(items: DoctorPetAccessDto[], page = 1, pageSize = 10, total = items.length) {
  return { items, page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

async function setMedical(medical: MedicalSnapshot) {
  const store = await import("../src/appStore") as typeof import("../src/appStore") & {
    setDoctorMedicalState: (value: MedicalSnapshot) => void;
  };
  store.setDoctorMedicalState(medical);
}

async function mountAt(path: string, scenarioId: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/doctor/home", component: { template: "<div />" } },
      { path: "/doctor/pets/request-access", component: { template: "<div />" } },
      { path: "/doctor/pets/:petId", component: { template: "<div />" } },
      { path: "/doctor/pets/:petId/delegate", component: { template: "<div />" } },
      { path: "/profile", component: { template: "<div />" } },
      { path: "/auth/login", component: { template: "<div />" } },
    ],
  });
  await router.push(path);
  await router.isReady();
  return mount(DoctorScreen, { props: { role: "doctor", scenarioId }, global: { plugins: [createPinia(), router] } });
}

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  await setMedical(snapshot());
  directoryMocks.loadDoctorPetAccesses.mockResolvedValue(accessPage([doctorAccess()]));
  directoryMocks.lookupPetDirectory.mockImplementation(async (petId: string) => ({
    petId,
    ownerAccountId: petId === "pet-own" ? "doctor-1" : petId === pet.petId ? pet.ownerAccountId : "owner-2",
    ownerDisplayName: "Ольга Петровна Владелец",
    species: pet.species,
    name: pet.name,
    updatedAt: pet.updatedAt,
  }));
  directoryMocks.searchDoctorDirectory.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, pageCount: 1 });
  directoryMocks.searchPetDirectory.mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0, pageCount: 1 });
});

describe("Doctor pages", () => {
  it("renders the paged access directory and dedicated route navigation", async () => {
    const wrapper = await mountAt("/doctor/home", "doctor-home");
    await flushPromises();
    expect(wrapper.findAll(".workspace-sidebar-nav .workspace-nav-item span").map((node) => node.text()))
      .toEqual(["Мед. карты", "Запросить доступ"]);
    expect(wrapper.findAll(".workspace-sidebar-nav .workspace-nav-item")[0]!.getComponent(AppIcon).props("name"))
      .toBe("medical-tools");
    expect(wrapper.findAll(".workspace-bottom-nav :is(a, button)")[0]!.getComponent(AppIcon).props("name"))
      .toBe("medical-tools");
    expect(wrapper.find(".doctor-pending-requests").exists()).toBe(false);
    expect(wrapper.get(".doctor-access-heading h2").text()).toBe("Доступ к медицинским картам");
    const requestAccessButton = wrapper.get('.doctor-access-heading button[title="Запросить доступ"]');
    expect(requestAccessButton.getComponent(AppIcon).props("name")).toBe("plus");
    expect(wrapper.find('.doctor-access-table button[title="Запросить доступ"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Медицинские карты, к которым вам предоставлен доступ.");
    expect(wrapper.findAll(".doctor-access-global-filter option").map((option) => option.text())).toEqual([
      "Все", "Медицинские карты", "Ожидающие запросы", "Отозванные",
    ]);
    const table = wrapper.get(".doctor-access-table");
    expect(table.findAll("th").map((header) => header.text())).toEqual([
      "Питомец", "Владелец", "Доступ", "Делегирование",
    ]);
    expect(table.findAll("col").map((column) => column.classes()[0])).toEqual([
      "doctor-access-pet-column",
      "doctor-access-owner-column",
      "doctor-access-status-column",
      "doctor-access-delegation-column",
    ]);
    const cells = table.get("tbody tr").findAll("td");
    expect(cells[0]!.attributes("data-label")).toBe("Питомец");
    expect(cells[0]!.get("strong").text()).toBe("Собака Буся");
    expect(cells[0]!.get("small").text()).toBe("pet-1");
    expect(cells[0]!.get(".doctor-access-pet-link").attributes("href")).toBe("/doctor/pets/pet-1?grantId=grant-1");
    expect(cells[1]!.get(".person-identity-name").text()).toBe("Ольга Владелец");
    expect(cells[1]!.get(".person-identity-id").text()).toBe("owner-1");
    expect(cells[2]!.text()).toContain("Предоставлен");
    expect(cells[3]!.attributes("data-label")).toBe("Делегирование");
    expect(cells[3]!.text()).toBe("Да");
    expect(table.get("tbody tr").findAll("[title]").map((button) => button.attributes("title"))).toEqual([
      "Открыть медицинскую карту", "Отказаться от доступа", "Делегировать доступ",
    ]);
    expect(cells[0]!.get('[title="Открыть медицинскую карту"]').getComponent(AppIcon).props("name")).toBe("eye");
    expect(wrapper.get(".doctor-access-pagination").text()).toContain("Показаны 1–1 из 1");
    expect(directoryMocks.loadDoctorPetAccesses).toHaveBeenCalledWith("", "all", 1, 10, "owner", "asc");
    const petSortHeader = table.findAll("th")[0]!;
    const ownerSortHeader = table.findAll("th")[1]!;
    expect(petSortHeader.attributes("aria-sort")).toBe("none");
    expect(ownerSortHeader.attributes("aria-sort")).toBe("ascending");
    await ownerSortHeader.get("button").trigger("click");
    await flushPromises();
    expect(ownerSortHeader.attributes("aria-sort")).toBe("descending");
    expect(ownerSortHeader.getComponent(AppIcon).classes()).toContain("descending");
    expect(directoryMocks.loadDoctorPetAccesses).toHaveBeenLastCalledWith("", "all", 1, 10, "owner", "desc");
    await petSortHeader.get("button").trigger("click");
    await flushPromises();
    expect(petSortHeader.attributes("aria-sort")).toBe("ascending");
    expect(directoryMocks.loadDoctorPetAccesses).toHaveBeenLastCalledWith("", "all", 1, 10, "pet", "asc");
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    await requestAccessButton.trigger("click");
    expect(wrapper.get('[role="dialog"]').text()).toContain("Запросить доступ");
  });

  it("renders pending accesses with directory details returned by the unified endpoint", async () => {
    const pendingRows = [
      doctorAccess({
        requestId: "request-newest",
        grantId: undefined,
        petId: "pet-2",
        ownerAccountId: "owner-2",
        ownerDisplayName: "Мария Владелец",
        species: "Кошка",
        name: "Матильда",
        status: "requested",
        permissions: undefined,
      }),
      doctorAccess({ requestId: "request-older", grantId: undefined, status: "requested", permissions: undefined }),
    ];
    await setMedical(snapshot(undefined, {
      pets: [],
      grants: [],
      accessRequests: [
        accessRequest({ requestId: "request-newest", petId: "pet-2", ownerAccountId: "owner-2" }),
        accessRequest({ requestId: "request-older" }),
      ],
    }));
    directoryMocks.loadDoctorPetAccesses.mockImplementation(async (
      _query: string, status: string, page: number, pageSize: number,
    ) => accessPage(status === "all" || status === "requested" ? pendingRows : [], page, pageSize));

    const wrapper = await mountAt("/doctor/home", "doctor-home");
    await flushPromises();

    await wrapper.get<HTMLSelectElement>(".doctor-access-global-filter select").setValue("requested");
    await flushPromises();
    const rows = wrapper.findAll(".doctor-access-table tbody tr");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain("Кошка Матильда");
    expect(rows[0]!.text()).toContain("pet-2");
    expect(rows[0]!.get(".person-identity-name").text()).toBe("Мария Владелец");
    expect(rows[0]!.get(".person-identity-id").text()).toBe("owner-2");
    expect(rows[0]!.text()).toContain("Запрошен");
    expect(rows[0]!.find(".doctor-access-pet-link").exists()).toBe(false);
    const cancel = rows[0]!.get('button[title="Отозвать запрос на доступ"]');
    expect(cancel.attributes("aria-label")).toBe("Отозвать запрос на доступ");
    expect(cancel.getComponent(AppIcon).props("name")).toBe("close");
    expect(rows[1]!.text()).toContain("Собака Буся");
    expect(wrapper.get(".doctor-access-pagination").text()).toContain("Показаны 1–2 из 2");
    expect(directoryMocks.loadDoctorPetAccesses).toHaveBeenLastCalledWith("", "requested", 1, 10, "owner", "asc");
    expect(directoryMocks.lookupPetDirectory).not.toHaveBeenCalled();
  });

  it("shows revoked accesses in the unified table and global selector", async () => {
    const revoked = doctorAccess({
      petId: "pet-revoked",
      ownerAccountId: "owner-2",
      ownerDisplayName: "Мария Владелец",
      species: "Кошка",
      name: "Матильда",
      status: "revoked",
      permissions: undefined,
      grantId: "grant-revoked",
    });
    directoryMocks.loadDoctorPetAccesses.mockImplementation(async (
      _query: string, status: string, page: number, pageSize: number,
    ) => accessPage(status === "revoked" ? [revoked] : [doctorAccess(), revoked], page, pageSize));

    const wrapper = await mountAt("/doctor/home", "doctor-home");
    await flushPromises();

    expect(wrapper.findAll(".doctor-access-table tbody tr")).toHaveLength(2);
    await wrapper.get<HTMLSelectElement>(".doctor-access-global-filter select").setValue("revoked");
    await flushPromises();
    const row = wrapper.get(".doctor-access-table tbody tr");
    expect(row.text()).toContain("Кошка Матильда");
    expect(row.text()).toContain("Мария Владелец");
    expect(row.text()).toContain("Отозван");
    expect(row.find(".doctor-access-pet-link").exists()).toBe(false);
    expect(row.get('td[data-label="Делегирование"]').text()).toBe("");
    expect(wrapper.get(".doctor-access-pagination").text()).toContain("Показаны 1–1 из 1");
  });

  it("keeps a pending request actionable when optional catalog details are unavailable", async () => {
    const pending = doctorAccess({
      requestId: "request-pending",
      grantId: undefined,
      status: "requested",
      permissions: undefined,
      ownerDisplayName: undefined,
      species: undefined,
      name: undefined,
    });
    await setMedical(snapshot(undefined, { accessRequests: [accessRequest()] }));
    directoryMocks.loadDoctorPetAccesses.mockResolvedValue(accessPage([pending]));

    const wrapper = await mountAt("/doctor/home", "doctor-home");
    await flushPromises();

    await wrapper.get<HTMLSelectElement>(".doctor-access-global-filter select").setValue("requested");
    await flushPromises();
    const row = wrapper.get(".doctor-access-table tbody tr");
    expect(row.text()).toContain("Данные питомца недоступны");
    expect(row.text()).toContain("pet-1");
    expect(row.get(".person-identity-name").text()).toBe("ФИО не указано");
    expect(row.get(".person-identity-id").text()).toBe("owner-1");
    expect(row.get('button[title="Отозвать запрос на доступ"]').exists()).toBe(true);
    expect(directoryMocks.lookupPetDirectory).not.toHaveBeenCalled();
  });

  it("revokes a pending access request and reports cancellation failures", async () => {
    const pending = doctorAccess({ requestId: "request-pending", grantId: undefined, status: "requested", permissions: undefined });
    await setMedical(snapshot(undefined, { accessRequests: [accessRequest()] }));
    directoryMocks.loadDoctorPetAccesses
      .mockResolvedValueOnce(accessPage([pending]))
      .mockResolvedValueOnce(accessPage([pending]))
      .mockResolvedValueOnce(accessPage([]));
    const wrapper = await mountAt("/doctor/home", "doctor-home");
    await flushPromises();

    await wrapper.get('.doctor-access-table button[title="Отозвать запрос на доступ"]').trigger("click");
    await flushPromises();

    expect(repositoryMocks.cancelAccessRequest).toHaveBeenCalledWith("request-pending");
    expect(wrapper.get('[role="status"]').text()).toBe("Запрос на доступ отозван.");
    expect(wrapper.get(".doctor-access-table").text()).toContain("Доступы по выбранным условиям не найдены.");

    directoryMocks.loadDoctorPetAccesses.mockResolvedValue(accessPage([pending]));
    await wrapper.get<HTMLSelectElement>(".doctor-access-global-filter select").setValue("requested");
    await flushPromises();
    repositoryMocks.cancelAccessRequest.mockRejectedValueOnce(new Error("Не удалось отозвать запрос."));
    await wrapper.get('.doctor-access-table button[title="Отозвать запрос на доступ"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось отозвать запрос.");
    expect(wrapper.get(".doctor-access-table tbody tr").text()).toContain("pet-1");
  });

  it("shows a syncing state while a server request is absent from the local projection", async () => {
    const pending = doctorAccess({
      requestId: "server-ahead-request",
      grantId: undefined,
      status: "requested",
      permissions: undefined,
    });
    directoryMocks.loadDoctorPetAccesses.mockResolvedValue(accessPage([pending]));

    const wrapper = await mountAt("/doctor/home", "doctor-home");
    await flushPromises();

    const row = wrapper.get(".doctor-access-table tbody tr");
    expect(row.text()).toContain("Данные синхронизируются…");
    expect(row.find('button[title="Отозвать запрос на доступ"]').exists()).toBe(false);
  });

  it("loads one server page at a time for the globally filtered table", async () => {
    const requests = Array.from({ length: 11 }, (_, index) => doctorAccess({
      requestId: `request-${index + 1}`,
      grantId: undefined,
      petId: `pet-${index + 1}`,
      name: `Питомец ${index + 1}`,
      status: "requested",
      permissions: undefined,
    }));
    directoryMocks.loadDoctorPetAccesses.mockImplementation(async (
      _query: string, status: string, page: number, pageSize: number,
    ) => {
      const filtered = status === "all" || status === "requested" ? requests : [];
      return accessPage(filtered.slice((page - 1) * pageSize, page * pageSize), page, pageSize, filtered.length);
    });
    const wrapper = await mountAt("/doctor/home", "doctor-home");
    await flushPromises();

    await wrapper.get<HTMLSelectElement>(".doctor-access-global-filter select").setValue("requested");
    await flushPromises();
    expect(wrapper.findAll(".doctor-access-table tbody tr")).toHaveLength(10);
    expect(wrapper.get(".doctor-access-pagination").text()).toContain("Показаны 1–10 из 11");
    await wrapper.get('.doctor-access-pagination button[aria-label="Страница 2"]').trigger("click");
    await flushPromises();
    expect(wrapper.findAll(".doctor-access-table tbody tr")).toHaveLength(1);
    expect(wrapper.get(".doctor-access-table tbody tr").text()).toContain("pet-11");
    expect(directoryMocks.loadDoctorPetAccesses).toHaveBeenLastCalledWith("", "requested", 2, 10, "owner", "asc");

    await wrapper.get<HTMLSelectElement>(".doctor-access-pagination select").setValue("20");
    await flushPromises();
    expect(localStorage.getItem("klinok:doctor-pets-page-size")).toBe("20");
    expect(directoryMocks.loadDoctorPetAccesses).toHaveBeenLastCalledWith("", "requested", 1, 20, "owner", "asc");
    expect(directoryMocks.lookupPetDirectory).not.toHaveBeenCalled();
  });

  it("finds a pet by partial owner name and pet name before requesting access", async () => {
    directoryMocks.searchPetDirectory.mockResolvedValue({
      items: [{
        petId: "pet-2",
        ownerAccountId: "owner-2",
        ownerDisplayName: "Ольга Петровна Владелец",
        species: "Кошка",
        name: "Буся",
        updatedAt: "2026-07-21T10:00:00.000Z",
      }],
      page: 1, pageSize: 50, total: 1, pageCount: 1,
    });
    const wrapper = await mountAt("/doctor/pets/request-access", "doctor-pet-request-access");
    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.findAll("label span").map((label) => label.text())).toEqual(expect.arrayContaining([
      "ФИО владельца, его часть или полный идентификатор (необязательно при поиске по полному идентификатору питомца)",
      "Кличка, её часть или полный идентификатор питомца",
    ]));
    expect(dialog.get('.doctor-request-owner-field input[type="search"]').attributes("required")).toBeUndefined();
    expect(dialog.get('.doctor-request-pet-field input[type="search"]').attributes()).toHaveProperty("required");
    expect(dialog.get(".doctor-request-search-action").attributes("title")).toBe("Найти питомца");
    expect(wrapper.text()).not.toContain("Предыдущие запросы");
    const requestInputs = dialog.findAll<HTMLInputElement>('input[type="search"]');
    await requestInputs[0]!.setValue("Петровна");
    await requestInputs[1]!.setValue("Буся");
    await dialog.get(".doctor-request-search-form").trigger("submit");
    await flushPromises();

    expect(directoryMocks.searchPetDirectory).toHaveBeenCalledWith("Петровна", "Буся", 1, 50);
    const result = dialog.get(".doctor-request-result");
    expect(result.text()).toContain("Кошка Буся");
    expect(result.text()).toContain("pet-2");
    expect(result.get(".person-identity-name").text()).toBe("Ольга Петровна Владелец");
    expect(result.get(".person-identity-id").text()).toBe("owner-2");
    expect(result.get('button[title="Отправить запрос"]').getComponent(AppIcon).props("name")).toBe("check");
    await result.get('button[title="Отправить запрос"]').trigger("click");
    await flushPromises();
    expect(repositoryMocks.requestAccess).toHaveBeenCalledWith("pet-2", "owner-2");
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it("revalidates a selected pet before creating an access request", async () => {
    const selectedPet = {
      petId: "pet-removed",
      ownerAccountId: "owner-2",
      ownerDisplayName: "Ольга Владелец",
      species: "Кошка",
      name: "Буся",
      updatedAt: "2026-07-21T10:00:00.000Z",
    };
    directoryMocks.searchPetDirectory.mockResolvedValue({
      items: [selectedPet], page: 1, pageSize: 50, total: 1, pageCount: 1,
    });
    directoryMocks.lookupPetDirectory.mockRejectedValueOnce(new Error("Питомец не найден."));
    const wrapper = await mountAt("/doctor/pets/request-access", "doctor-pet-request-access");
    const dialog = wrapper.get('[role="dialog"]');
    const requestInputs = dialog.findAll<HTMLInputElement>('input[type="search"]');
    await requestInputs[0]!.setValue("Ольга");
    await requestInputs[1]!.setValue("Буся");
    await dialog.get(".doctor-request-search-form").trigger("submit");
    await flushPromises();
    await dialog.get('.doctor-request-result button[title="Отправить запрос"]').trigger("click");
    await flushPromises();

    expect(directoryMocks.lookupPetDirectory).toHaveBeenCalledWith("pet-removed");
    expect(repositoryMocks.requestAccess).not.toHaveBeenCalled();
    expect(wrapper.get('[role="dialog"] [role="alert"]').text()).toContain("Питомец не найден.");
  });

  it("shows a newly submitted request on the Doctor home view", async () => {
    const requestedPet = {
      petId: "pet-new-request",
      ownerAccountId: "owner-2",
      ownerDisplayName: "Мария Владелец",
      species: "Кошка",
      name: "Матильда",
      updatedAt: "2026-07-23T10:00:00.000Z",
    };
    directoryMocks.searchPetDirectory.mockResolvedValue({
      items: [requestedPet],
      page: 1, pageSize: 50, total: 1, pageCount: 1,
    });
    directoryMocks.loadDoctorPetAccesses
      .mockResolvedValueOnce(accessPage([doctorAccess()]))
      .mockResolvedValue(accessPage([doctorAccess({
        ...requestedPet,
        requestId: "request-new",
        grantId: undefined,
        status: "requested",
        permissions: undefined,
      })]));
    repositoryMocks.requestAccess.mockImplementationOnce(async () => {
      await setMedical(snapshot(undefined, {
        accessRequests: [accessRequest({
          requestId: "request-new",
          petId: requestedPet.petId,
          ownerAccountId: requestedPet.ownerAccountId,
        })],
      }));
      return "request-new";
    });
    const wrapper = await mountAt("/doctor/pets/request-access", "doctor-pet-request-access");
    const dialog = wrapper.get('[role="dialog"]');
    const requestInputs = dialog.findAll<HTMLInputElement>('input[type="search"]');
    await requestInputs[0]!.setValue("Мария");
    await requestInputs[1]!.setValue("Матильда");
    await dialog.get(".doctor-request-search-form").trigger("submit");
    await flushPromises();
    await dialog.get('.doctor-request-result button[title="Отправить запрос"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(wrapper.get(".doctor-access-table").text()).toContain("Кошка Матильда");
    expect(wrapper.get(".doctor-access-table").text()).toContain("Мария Владелец");
  });

  it("finds a pet by its full ID without owner information", async () => {
    directoryMocks.lookupPetDirectory.mockResolvedValue({
      petId: "pet-full-id",
      ownerAccountId: "owner-2",
      ownerDisplayName: "Ольга Владелец",
      species: "Кошка",
      name: "Матильда",
      updatedAt: "2026-07-22T10:00:00.000Z",
    });
    const wrapper = await mountAt("/doctor/pets/request-access", "doctor-pet-request-access");
    const dialog = wrapper.get('[role="dialog"]');
    const requestInputs = dialog.findAll<HTMLInputElement>('input[type="search"]');
    expect(requestInputs[0]!.element.value).toBe("");
    await requestInputs[1]!.setValue("pet-full-id");
    await dialog.get(".doctor-request-search-form").trigger("submit");
    await flushPromises();

    expect(directoryMocks.lookupPetDirectory).toHaveBeenCalledWith("pet-full-id");
    expect(directoryMocks.searchPetDirectory).not.toHaveBeenCalled();
    expect(dialog.get(".doctor-request-result").text()).toContain("Кошка Матильда");
  });

  it("updates the medical-card list immediately after self-approval", async () => {
    const ownPet: PetProfile = {
      ...pet,
      petId: "pet-own",
      ownerAccountId: "doctor-1",
      name: "Айва",
      updatedAt: "2026-07-22T10:00:00.000Z",
    };
    directoryMocks.searchPetDirectory.mockResolvedValue({
      items: [{
        petId: ownPet.petId,
        ownerAccountId: ownPet.ownerAccountId,
        ownerDisplayName: "Вера Врач",
        species: ownPet.species,
        name: ownPet.name,
        updatedAt: ownPet.updatedAt,
      }],
      page: 1, pageSize: 50, total: 1, pageCount: 1,
    });
    directoryMocks.loadDoctorPetAccesses
      .mockResolvedValueOnce(accessPage([doctorAccess()]))
      .mockResolvedValue(accessPage([doctorAccess({
        petId: ownPet.petId,
        ownerAccountId: ownPet.ownerAccountId,
        ownerDisplayName: "Вера Врач",
        species: ownPet.species,
        name: ownPet.name,
        permissions: ["read", "write_unconfirmed"],
        grantId: "grant-own",
      })]));
    repositoryMocks.requestAccess.mockImplementationOnce(async () => {
      await setMedical(snapshot(["read", "write_unconfirmed", "delegate"], {
        pets: [pet, ownPet],
        grants: [
          ...snapshot().grants,
          {
            grantId: "grant-own",
            requestId: "request-own",
            petId: ownPet.petId,
            grantorAccountId: "doctor-1",
            granteeAccountId: "doctor-1",
            actions: ["read", "write_unconfirmed"],
            petKeyVersion: 1,
            status: "active",
            createdAt: "2026-07-22T10:00:00.000Z",
          },
        ],
      }));
      return "request-own";
    });
    const wrapper = await mountAt("/doctor/pets/request-access", "doctor-pet-request-access");
    await flushPromises();
    const dialog = wrapper.get('[role="dialog"]');
    const requestInputs = dialog.findAll<HTMLInputElement>('input[type="search"]');
    await requestInputs[0]!.setValue("Вера Врач");
    await requestInputs[1]!.setValue("Айва");
    await dialog.get(".doctor-request-search-form").trigger("submit");
    await flushPromises();

    await dialog.get('.doctor-request-result button[title="Отправить запрос"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(wrapper.get('[role="status"]').text()).toBe("Доступ предоставлен автоматически.");
    expect(wrapper.get(".doctor-access-table").text()).toContain("Собака Айва");
    expect(wrapper.get(".doctor-access-table").text()).toContain("Вера Врач");
  });

  it("shows delegation as no and hides the delegate action when it is unavailable", async () => {
    directoryMocks.loadDoctorPetAccesses.mockResolvedValue({
      items: [{
        petId: pet.petId,
        ownerAccountId: pet.ownerAccountId,
        ownerDisplayName: "Ольга Владелец",
        species: pet.species,
        name: pet.name,
        status: "granted",
        permissions: ["read", "write_unconfirmed"],
        grantId: "grant-1",
        updatedAt: pet.updatedAt,
      }],
      page: 1, pageSize: 10, total: 1, pageCount: 1,
    });
    const wrapper = await mountAt("/doctor/home", "doctor-home");
    await flushPromises();

    const row = wrapper.get(".doctor-access-table tbody tr");
    expect(row.get('td[data-label="Делегирование"]').text()).toBe("Нет");
    expect(row.find('a[title="Делегировать доступ"]').exists()).toBe(false);
  });

  it("confirms access cancellation in a user-facing modal and refreshes the list", async () => {
    directoryMocks.loadDoctorPetAccesses
      .mockResolvedValueOnce(accessPage([doctorAccess()]))
      .mockResolvedValueOnce(accessPage([doctorAccess()]))
      .mockResolvedValueOnce(accessPage([doctorAccess()]))
      .mockResolvedValue(accessPage([]));
    const wrapper = await mountAt("/doctor/home", "doctor-home");
    await flushPromises();

    await wrapper.get('.doctor-access-table button[title="Отказаться от доступа"]').trigger("click");
    await flushPromises();
    const dialog = wrapper.get('[role="alertdialog"]');
    expect(dialog.text()).toContain("Вы и все врачи, которым вы делегировали доступ к Буся, потеряете доступ к медицинской карте");
    expect(dialog.text()).not.toMatch(/ключ|ротац|ветк/i);
    await dialog.get(".primary-action").trigger("click");
    await flushPromises();

    expect(repositoryMocks.relinquishAccess).toHaveBeenCalledWith("grant-1");
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(wrapper.get('[role="status"]').text()).toBe("Вы отказались от доступа к медицинской карте Буся.");
    expect(wrapper.get(".doctor-access-table").text()).not.toContain("Собака Буся");
    expect(wrapper.get(".doctor-access-table").text()).toContain("Доступы по выбранным условиям не найдены.");
  });

  it("uses the server-provided grant ID instead of a locally re-derived grant", async () => {
    const medical = snapshot();
    medical.grants.unshift({
      ...medical.grants[0]!,
      grantId: "stale-local-grant",
      createdAt: "2026-07-20T10:00:00.000Z",
    });
    medical.grants.push({
      ...medical.grants[0]!,
      grantId: "server-grant",
      createdAt: "2026-07-22T10:00:00.000Z",
    });
    await setMedical(medical);
    directoryMocks.loadDoctorPetAccesses.mockResolvedValue(accessPage([
      doctorAccess({ grantId: "server-grant" }),
    ]));
    const wrapper = await mountAt("/doctor/home", "doctor-home");
    await flushPromises();

    await wrapper.get('.doctor-access-table button[title="Отказаться от доступа"]').trigger("click");
    await flushPromises();
    await wrapper.get('[role="alertdialog"] .primary-action').trigger("click");
    await flushPromises();

    expect(repositoryMocks.relinquishAccess).toHaveBeenCalledWith("server-grant");
    expect(repositoryMocks.relinquishAccess).not.toHaveBeenCalledWith("stale-local-grant");
  });

  it("refuses relinquishment when the server access changes while its modal is open", async () => {
    const wrapper = await mountAt("/doctor/home", "doctor-home");
    await flushPromises();
    await wrapper.get('.doctor-access-table button[title="Отказаться от доступа"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true);

    directoryMocks.loadDoctorPetAccesses.mockResolvedValue(accessPage([]));
    await wrapper.get('[role="alertdialog"] .primary-action').trigger("click");
    await flushPromises();

    expect(repositoryMocks.relinquishAccess).not.toHaveBeenCalled();
    expect(wrapper.get(".workspace-alert").text()).toContain("Статус доступа изменился");
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true);
  });

  it("shows a syncing state while a server grant is absent from the local projection", async () => {
    directoryMocks.loadDoctorPetAccesses.mockResolvedValue(accessPage([
      doctorAccess({ grantId: "server-ahead-grant" }),
    ]));
    const wrapper = await mountAt("/doctor/home", "doctor-home");
    await flushPromises();

    const row = wrapper.get(".doctor-access-table tbody tr");
    expect(row.text()).toContain("Данные синхронизируются…");
    expect(row.find('a[title="Открыть медицинскую карту"]').exists()).toBe(false);
    expect(row.find('button[title="Отказаться от доступа"]').exists()).toBe(false);
    expect(row.find('a[title="Делегировать доступ"]').exists()).toBe(false);
  });

  it("shows a syncing state when a delegated grant has an inactive local parent", async () => {
    await setMedical(snapshot(undefined, {
      grants: [
        { ...snapshot().grants[0]!, status: "revoked" },
        {
          ...snapshot().grants[0]!,
          grantId: "grant-child",
          parentGrantId: "grant-1",
          status: "active",
        },
      ],
    }));
    directoryMocks.loadDoctorPetAccesses.mockResolvedValue(accessPage([
      doctorAccess({ grantId: "grant-child" }),
    ]));
    const wrapper = await mountAt("/doctor/home", "doctor-home");
    await flushPromises();

    const row = wrapper.get(".doctor-access-table tbody tr");
    expect(row.text()).toContain("Данные синхронизируются…");
    expect(row.find('button[title="Отказаться от доступа"]').exists()).toBe(false);
  });

  it("inherits read and write access while only asking about further delegation", async () => {
    const delegatedState = snapshot();
    delegatedState.grants.push({
      grantId: "grant-child",
      parentGrantId: "grant-1",
      petId: pet.petId,
      grantorAccountId: "doctor-1",
      granteeAccountId: "doctor-3",
      granteeDisplayName: "Анна Врач",
      actions: ["read", "write_unconfirmed"],
      petKeyVersion: 1,
      status: "active",
      createdAt: "2026-07-21T11:00:00.000Z",
    });
    await setMedical(delegatedState);
    directoryMocks.searchDoctorDirectory.mockResolvedValue({
      items: [{
        accountId: "doctor-2",
        firstName: "Пётр",
        lastName: "Врач",
        displayName: "Пётр Врач",
        updatedAt: "2026-07-21T10:00:00.000Z",
      }],
      page: 1, pageSize: 50, total: 1, pageCount: 1,
    });
    const wrapper = await mountAt("/doctor/pets/pet-1/delegate", "doctor-pet-delegate");
    await flushPromises();
    expect(wrapper.get(".owner-pet-id").text()).toBe("pet-1");
    expect(wrapper.get(".owner-pet-owner").text()).toContain("Ольга Петровна Владелец");
    expect(wrapper.get(".owner-pet-owner .person-identity-id").text()).toBe("owner-1");
    expect(wrapper.get(".owner-access-table tbody tr").text()).toContain("Анна Врач");
    expect(wrapper.get(".owner-access-table tbody tr").text()).toContain("Предоставлен");
    await wrapper.get('.owner-pet-profile button[title="Делегировать доступ"]').trigger("click");
    const dialog = wrapper.get('[role="dialog"]');
    await dialog.get('input[required]').setValue("Пётр");
    await dialog.get("form").trigger("submit");
    await flushPromises();
    expect(dialog.get(".list-row .person-identity-name").text()).toBe("Пётр Врач");
    expect(dialog.get(".list-row .person-identity-id").text()).toBe("doctor-2");
    await dialog.get('.list-row button[title="Выбрать врача"]').trigger("click");

    expect(wrapper.text()).not.toContain("Создание неподтверждённых приёмов");
    expect(dialog.findAll('.check-row input[type="checkbox"]')).toHaveLength(1);
    const delegationCheckbox = dialog.get<HTMLInputElement>('.check-row input[type="checkbox"]');
    expect(delegationCheckbox.element.closest("label")?.textContent).toContain("Разрешить дальнейшее делегирование");
    await delegationCheckbox.setValue(true);
    await dialog.findAll("form")[1]!.trigger("submit");
    await wrapper.get('[role="alertdialog"] .primary-action').trigger("click");
    await flushPromises();

    expect(repositoryMocks.delegateGrant).toHaveBeenCalledWith(
      "grant-1",
      "doctor-2",
      ["read", "write_unconfirmed", "delegate"],
      { granteeDisplayName: "Пётр Врач" },
    );
  });

  it("preserves the server-selected grant when delegating with legacy duplicate grants", async () => {
    const medical = snapshot();
    medical.grants.unshift({
      ...medical.grants[0]!,
      grantId: "legacy-duplicate",
      createdAt: "2026-07-20T10:00:00.000Z",
    });
    await setMedical(medical);
    directoryMocks.searchDoctorDirectory.mockResolvedValue({
      items: [{
        accountId: "doctor-2",
        firstName: "Пётр",
        lastName: "Врач",
        displayName: "Пётр Врач",
        updatedAt: "2026-07-21T10:00:00.000Z",
      }],
      page: 1, pageSize: 50, total: 1, pageCount: 1,
    });
    const wrapper = await mountAt("/doctor/pets/pet-1/delegate?grantId=grant-1", "doctor-pet-delegate");
    await flushPromises();

    await wrapper.get('.owner-pet-profile button[title="Делегировать доступ"]').trigger("click");
    const dialog = wrapper.get('[role="dialog"]');
    await dialog.get('input[required]').setValue("Пётр");
    await dialog.get("form").trigger("submit");
    await flushPromises();
    await dialog.get('.list-row button[title="Выбрать врача"]').trigger("click");
    await dialog.findAll("form")[1]!.trigger("submit");
    await wrapper.get('[role="alertdialog"] .primary-action').trigger("click");
    await flushPromises();

    expect(repositoryMocks.delegateGrant).toHaveBeenCalledWith(
      "grant-1",
      "doctor-2",
      ["read", "write_unconfirmed"],
      { granteeDisplayName: "Пётр Врач" },
    );
    expect(repositoryMocks.delegateGrant).not.toHaveBeenCalledWith(
      "legacy-duplicate",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("saves a structured encounter with the mandatory taxonomy section", async () => {
    const wrapper = await mountAt("/doctor/pets/pet-1", "doctor-pet-detail");
    await flushPromises();
    const backLink = wrapper.get('.owner-pet-profile a[title="Назад к медицинским картам"]');
    expect(backLink.attributes("href")).toBe("/doctor/home");
    expect(backLink.attributes("aria-label")).toBe("Назад к медицинским картам");
    expect(backLink.getComponent(AppIcon).props("name")).toBe("chevron-left");
    expect(wrapper.findAll(".owner-pet-profile .owner-profile-actions > *")[0]!.attributes("title"))
      .toBe("Назад к медицинским картам");
    const save = wrapper.get<HTMLButtonElement>('.encounter-editor-heading button[title="Сохранить запись"]');
    expect(save.element.disabled).toBe(true);
    const dateField = wrapper.get(".encounter-date-field");
    expect(dateField.get("span").text()).toBe("Дата");
    expect(dateField.get('input[type="date"]').exists()).toBe(true);
    const notEating = wrapper.findAll(".encounter-taxonomy label").find((label) => label.text() === "Не ест");
    expect(notEating).toBeDefined();
    await notEating!.get("input").trigger("change");
    expect(save.element.disabled).toBe(true);
    const outcomeOption = (label: string) => wrapper.findAll(".encounter-outcome .check-row")
      .find((option) => option.text() === label)!;
    await outcomeOption("Улучшение").get("input").trigger("change");
    expect(save.element.disabled).toBe(false);
    await outcomeOption("Выздоровление").get("input").trigger("change");
    expect(outcomeOption("Улучшение").get<HTMLInputElement>("input").element.checked).toBe(true);
    expect(outcomeOption("Выздоровление").get<HTMLInputElement>("input").element.checked).toBe(true);
    await wrapper.get(".encounter-what-happened textarea").setValue("Не ест со вчерашнего дня");
    await wrapper.get(".encounter-outcome textarea").setValue("Контроль через неделю");
    await save.trigger("click");
    await flushPromises();
    expect(repositoryMocks.saveEncounter).toHaveBeenCalledWith(expect.objectContaining({
      petId: "pet-1",
      sections: {
        "what-happened": {
          selectedIds: ["problem.digestive.1"],
          comment: "Не ест со вчерашнего дня",
        },
        outcome: {
          selectedIds: ["outcome.recovery", "outcome.improvement"],
          comment: "Контроль через неделю",
        },
      },
    }));
  });

  it("validates and saves the structured general-data template", async () => {
    const wrapper = await mountAt("/doctor/pets/pet-1", "doctor-pet-detail");
    await flushPromises();
    const notEating = wrapper.findAll(".encounter-taxonomy label").find((label) => label.text() === "Не ест")!;
    await notEating.get("input").trigger("change");
    await wrapper.findAll(".encounter-outcome .check-row")
      .find((option) => option.text() === "В стадии наблюдения")!
      .get("input").trigger("change");
    await wrapper.get<HTMLSelectElement>(".encounter-add-section select").setValue("general-data");

    expect(wrapper.findAll(".general-data-pressure-inputs label > span").map((label) => label.text()))
      .toEqual(["Сист.", "Диаст.", "Сред."]);
    const inputs = wrapper.findAll<HTMLInputElement>(".general-data-fields input");
    expect(inputs).toHaveLength(7);
    await inputs[0]!.setValue("13.75");
    await inputs[1]!.setValue("38.6");
    await inputs[2]!.setValue("112");
    await inputs[3]!.setValue("24");
    await inputs[4]!.setValue("120");
    await wrapper.get('button[title="Сохранить запись"]').trigger("click");
    expect(repositoryMocks.saveEncounter).not.toHaveBeenCalled();
    expect(wrapper.get(".general-data-pressure .field-error").text()).toContain("все три");

    await inputs[5]!.setValue("80");
    await inputs[6]!.setValue("93");
    await wrapper.get('button[title="Сохранить запись"]').trigger("click");
    await flushPromises();
    expect(repositoryMocks.saveEncounter).toHaveBeenCalledWith(expect.objectContaining({
      petId: "pet-1",
      sections: expect.objectContaining({
        "general-data": {
          weightKg: 13.75,
          temperatureC: 38.6,
          heartRateBpm: 112,
          respiratoryRatePerMinute: 24,
          bloodPressure: { systolicMmHg: 120, diastolicMmHg: 80, meanMmHg: 93 },
        },
      }),
    }));
  });

  it("validates and saves the five-tab therapeutic appointment template", async () => {
    const wrapper = await mountAt("/doctor/pets/pet-1", "doctor-pet-detail");
    await flushPromises();
    await wrapper.findAll(".encounter-taxonomy label").find((label) => label.text() === "Не ест")!
      .get("input").trigger("change");
    await wrapper.findAll(".encounter-outcome .check-row")
      .find((option) => option.text() === "В стадии наблюдения")!
      .get("input").trigger("change");
    await wrapper.get<HTMLSelectElement>(".encounter-add-section select").setValue("therapeutic-appointment");

    const card = wrapper.findAll(".encounter-section-card")
      .find((candidate) => candidate.get("h3").text() === "Терапевтический приём")!;
    const tabs = card.findAll('[role="tab"]');
    expect(tabs.map((tab) => tab.text())).toEqual([
      "Анамнез болезни",
      "Анамнез жизни",
      "Осмотр",
      "Рекомендации",
      "Назначения",
    ]);
    expect(wrapper.findAll(".encounter-add-section option").map((option) => option.text()))
      .toContain("Рекомендации");

    await wrapper.get('button[title="Сохранить запись"]').trigger("click");
    expect(repositoryMocks.saveEncounter).not.toHaveBeenCalled();
    expect(card.get(".field-error").text()).toContain("хотя бы один");

    await tabs[3]!.trigger("click");
    await card.get<HTMLTextAreaElement>('#' + tabs[3]!.attributes("aria-controls") + ' textarea')
      .setValue("Контроль через неделю");
    await wrapper.get('button[title="Сохранить запись"]').trigger("click");
    await flushPromises();
    expect(repositoryMocks.saveEncounter).toHaveBeenCalledWith(expect.objectContaining({
      petId: "pet-1",
      sections: expect.objectContaining({
        "therapeutic-appointment": expect.objectContaining({
          recommendations: "Контроль через неделю",
          prescriptions: "",
        }),
      }),
    }));
  });

  it("prefills, validates, and saves the structured vaccination and chipping template", async () => {
    const wrapper = await mountAt("/doctor/pets/pet-1", "doctor-pet-detail");
    await flushPromises();
    await wrapper.findAll(".encounter-taxonomy label").find((label) => label.text() === "Вакцинация")!
      .get("input").trigger("change");
    await wrapper.findAll(".encounter-outcome .check-row")
      .find((option) => option.text() === "Без наблюдения")!
      .get("input").trigger("change");
    await wrapper.get<HTMLSelectElement>(".encounter-add-section select").setValue("vaccination");

    const card = wrapper.findAll(".encounter-section-card")
      .find((candidate) => candidate.get("h3").text() === "Вакцинация/чипирование")!;
    const field = (label: string) => card.findAll("label")
      .find((candidate) => candidate.find("span").exists() && candidate.get("span").text() === label)!;
    expect(field("Дата предыдущей вакцинации").get<HTMLInputElement>("input").element.value).toBe("2026-04-15");
    expect(field("Название предыдущей вакцины").get<HTMLInputElement>("input").element.value).toBe("Рабикан");
    const complications = card.get<HTMLSelectElement>(".vaccination-complications select");
    expect(complications.element.value).toBe("");
    expect(complications.findAll("option").map((option) => option.text())).toEqual(["Не указано", "Были", "Не было"]);
    const revaccinationDate = field("Дата следующей ревакцинации").get<HTMLInputElement>("input");
    const revaccinationToggle = card.get(".vaccination-revaccination-toggle");
    expect(revaccinationToggle.attributes("title")).toBe("Рассчитать дату следующей ревакцинации");
    expect(revaccinationToggle.attributes("aria-label")).toBe("Рассчитать дату следующей ревакцинации");
    expect(revaccinationToggle.attributes("aria-expanded")).toBe("false");
    expect(revaccinationToggle.getComponent(AppIcon).props("name")).toBe("chevron-down");
    expect(card.find(".vaccination-revaccination-options").exists()).toBe(false);
    await revaccinationToggle.trigger("click");
    expect(revaccinationToggle.getComponent(AppIcon).props("name")).toBe("chevron-up");
    await revaccinationToggle.trigger("click");
    expect(card.find(".vaccination-revaccination-options").exists()).toBe(false);
    expect(revaccinationToggle.getComponent(AppIcon).props("name")).toBe("chevron-down");
    await revaccinationToggle.trigger("click");
    await card.get(".vaccination-revaccination-menu").trigger("keydown", { key: "Escape" });
    expect(card.find(".vaccination-revaccination-options").exists()).toBe(false);
    expect(revaccinationToggle.attributes("aria-expanded")).toBe("false");
    expect(revaccinationToggle.getComponent(AppIcon).props("name")).toBe("chevron-down");
    await revaccinationToggle.trigger("click");
    let revaccinationOptions = card.get(".vaccination-revaccination-options");
    expect(revaccinationOptions.findAll("button").map((option) => option.text())).toEqual([
      "Через 14 дней",
      "Через месяц",
      "Через 4 месяца",
      "Через полгода",
      "Через год",
      "В следующий день рождения",
    ]);
    const encounterDate = wrapper.get(".encounter-date-field input");
    await encounterDate.setValue("2026-07-21");
    await revaccinationOptions.findAll("button").find((option) => option.text() === "Через 14 дней")!.trigger("click");
    expect(revaccinationDate.element.value).toBe("2026-08-04");
    expect(card.find(".vaccination-revaccination-options").exists()).toBe(false);
    await revaccinationToggle.trigger("click");
    revaccinationOptions = card.get(".vaccination-revaccination-options");
    await revaccinationOptions.findAll("button").find((option) => option.text() === "Через месяц")!.trigger("click");
    expect(revaccinationDate.element.value).toBe("2026-08-21");
    await revaccinationToggle.trigger("click");
    revaccinationOptions = card.get(".vaccination-revaccination-options");
    await revaccinationOptions.findAll("button").find((option) => option.text() === "Через 14 дней")!.trigger("click");
    await encounterDate.setValue("2026-07-22");
    expect(revaccinationDate.element.value).toBe("2026-08-05");
    await encounterDate.setValue("");
    expect(revaccinationDate.element.value).toBe("");
    await encounterDate.setValue("2026-07-22");
    expect(revaccinationDate.element.value).toBe("2026-08-05");
    await revaccinationDate.setValue("0001-01-01");
    await revaccinationToggle.trigger("click");
    expect(card.get(".vaccination-revaccination-options").find("button.active").exists()).toBe(false);
    await revaccinationToggle.trigger("click");

    await field("Дата предыдущей вакцинации").get("input").setValue("2026-04-14");
    await field("Название предыдущей вакцины").get("input").setValue("Биокан");
    await field("Название нынешней вакцины").get("input").setValue("Мультикан-8");
    await field("Номер чипа").get("input").setValue("643094100000002");
    await wrapper.get('button[title="Сохранить запись"]').trigger("click");
    expect(repositoryMocks.saveEncounter).not.toHaveBeenCalled();
    expect(card.text()).toContain("Укажите корректную дату следующей ревакцинации");
    expect(card.text()).toContain("Укажите серию и/или номер вакцины");
    expect(card.text()).toContain("Укажите срок годности вакцины");

    await revaccinationToggle.trigger("click");
    revaccinationOptions = card.get(".vaccination-revaccination-options");
    await revaccinationOptions.findAll("button").find((option) => option.text() === "Через 14 дней")!.trigger("click");
    expect(revaccinationDate.element.value).toBe("2026-08-05");
    expect(card.text()).not.toContain("Укажите корректную дату следующей ревакцинации");
    expect(card.text()).toContain("Укажите серию и/или номер вакцины");
    expect(card.text()).toContain("Укажите срок годности вакцины");

    await revaccinationDate.setValue("2027-07-21");
    await field("Серия и/или номер вакцины").get("input").setValue("AB-123");
    await field("Срок годности препарата/вакцины").get("input").setValue("2027-12-31");
    await field("Место введения").get("input").setValue("Холка");
    await complications.setValue("no");
    await wrapper.get('button[title="Сохранить запись"]').trigger("click");
    await flushPromises();

    expect(repositoryMocks.saveEncounter).toHaveBeenCalledWith(expect.objectContaining({
      petId: "pet-1",
      sections: expect.objectContaining({
        vaccination: {
          previousVaccinationDate: "2026-04-14",
          previousVaccineName: "Биокан",
          previousVaccinationComplications: false,
          currentVaccineName: "Мультикан-8",
          currentVaccineBatch: "AB-123",
          currentVaccineExpiresOn: "2027-12-31",
          chipNumber: "643094100000002",
          administrationSite: "Холка",
          nextRevaccinationDate: "2027-07-21",
        },
      }),
    }));
  });

  it("does not offer a birthday interval when the pet birth date is unknown", async () => {
    await setMedical(snapshot(undefined, { pets: [{ ...pet, birthDate: undefined }] }));
    const wrapper = await mountAt("/doctor/pets/pet-1", "doctor-pet-detail");
    await flushPromises();
    await wrapper.get<HTMLSelectElement>(".encounter-add-section select").setValue("vaccination");
    await flushPromises();

    const card = wrapper.findAll(".encounter-section-card")
      .find((candidate) => candidate.get("h3").text() === "Вакцинация/чипирование")!;
    await card.get(".vaccination-revaccination-toggle").trigger("click");
    expect(card.get(".vaccination-revaccination-options").text()).not.toContain("В следующий день рождения");
  });

  it("reopens persisted structured vaccination data without replacing it from the profile", async () => {
    const vaccinationRecord: MedicalRecordDraft = {
      ...medicalRecord,
      sections: {
        ...medicalRecord.sections,
        vaccination: {
          kind: "vaccination",
          templateVersion: "vaccination-v1",
          value: {
            previousVaccinationDate: "2025-01-10",
            previousVaccineName: "Сохранённая вакцина",
            previousVaccinationComplications: false,
            chipNumber: "643094100000003",
          },
          authorAccountId: "doctor-1",
          authorDisplayName: "Вера Врач",
          updatedAt: "2026-07-21T10:00:00.000Z",
        },
      },
    };
    await setMedical(snapshot(undefined, { records: [vaccinationRecord] }));
    const wrapper = await mountAt("/doctor/pets/pet-1", "doctor-pet-detail");
    await flushPromises();
    await wrapper.get(".medical-record-edit").trigger("click");

    const editor = wrapper.get(".encounter-editor-inline");
    const card = editor.findAll(".encounter-section-card")
      .find((candidate) => candidate.get("h3").text() === "Вакцинация/чипирование")!;
    const field = (label: string) => card.findAll("label")
      .find((candidate) => candidate.find("span").exists() && candidate.get("span").text() === label)!;
    expect(field("Дата предыдущей вакцинации").get<HTMLInputElement>("input").element.value).toBe("2025-01-10");
    expect(field("Название предыдущей вакцины").get<HTMLInputElement>("input").element.value).toBe("Сохранённая вакцина");
    expect(field("Номер чипа").get<HTMLInputElement>("input").element.value).toBe("643094100000003");
    expect(card.get<HTMLSelectElement>(".vaccination-complications select").element.value).toBe("no");

    await editor.get('button[title="Сохранить запись"]').trigger("click");
    await flushPromises();
    expect(repositoryMocks.saveEncounter).toHaveBeenCalledWith(expect.objectContaining({
      recordId: "record-1",
      sections: expect.objectContaining({
        vaccination: expect.objectContaining({
          previousVaccinationDate: "2025-01-10",
          previousVaccineName: "Сохранённая вакцина",
          previousVaccinationComplications: false,
          chipNumber: "643094100000003",
        }),
      }),
    }));
  });

  it("uses a small icon action to remove an optional encounter section", async () => {
    const wrapper = await mountAt("/doctor/pets/pet-1", "doctor-pet-detail");
    await flushPromises();
    await wrapper.get<HTMLSelectElement>(".encounter-add-section select").setValue("diagnosis");

    const remove = wrapper.get(".encounter-section-delete");
    expect(remove.text()).toBe("");
    expect(remove.attributes("title")).toBe("Удалить раздел");
    expect(remove.attributes("aria-label")).toBe("Удалить раздел");
    expect(remove.getComponent(AppIcon).props("name")).toBe("trash");
    await remove.trigger("click");
    let dialog = wrapper.get('[role="alertdialog"]');
    expect(dialog.text()).toContain("Удалить раздел?");
    expect(dialog.text()).toContain("Раздел «Диагноз» и введённые в нём данные будут удалены из записи.");
    expect(wrapper.find(".encounter-section-card:not(.encounter-what-happened):not(.encounter-outcome)").exists()).toBe(true);
    await dialog.get(".outline-action").trigger("click");
    expect(wrapper.find(".encounter-section-card:not(.encounter-what-happened):not(.encounter-outcome)").exists()).toBe(true);

    await remove.trigger("click");
    dialog = wrapper.get('[role="alertdialog"]');
    await dialog.get(".danger").trigger("click");
    expect(wrapper.find(".encounter-section-card:not(.encounter-what-happened):not(.encounter-outcome)").exists()).toBe(false);
  });

  it("edits an unconfirmed medical record in place", async () => {
    await setMedical(snapshot(undefined, { records: [medicalRecord] }));
    const wrapper = await mountAt("/doctor/pets/pet-1", "doctor-pet-detail");
    await flushPromises();
    const record = wrapper.get(".medical-record-entry-details");

    await record.get(".medical-record-edit").trigger("click");
    const inlineEditor = record.get(".encounter-editor-inline");
    expect(record.attributes()).toHaveProperty("open");
    expect(inlineEditor.get("h2").text()).toBe("Редактирование записи");
    expect(inlineEditor.get<HTMLInputElement>('.encounter-date-field input').element.value).toBe("2026-07-21");
    expect(wrapper.find(".doctor-pet-detail > .encounter-editor").exists()).toBe(false);

    await inlineEditor.get('button[title="Отменить редактирование"]').trigger("click");
    expect(record.find(".encounter-editor-inline").exists()).toBe(false);
    expect(wrapper.get(".doctor-pet-detail > .encounter-editor h2").text()).toBe("Сегодняшний приём");

    await record.get(".medical-record-edit").trigger("click");
    const activeEditor = record.get(".encounter-editor-inline");
    await activeEditor.get(".encounter-what-happened textarea").setValue("Обновлённый комментарий");
    await activeEditor.get('button[title="Сохранить запись"]').trigger("click");
    await flushPromises();
    expect(repositoryMocks.saveEncounter).toHaveBeenCalledWith(expect.objectContaining({
      petId: "pet-1",
      recordId: "record-1",
      sections: expect.objectContaining({
        "what-happened": expect.objectContaining({ comment: "Обновлённый комментарий" }),
      }),
    }));
    expect(record.find(".encounter-editor-inline").exists()).toBe(false);
  });

  it("preserves a legacy free-text general-data section while editing", async () => {
    const legacyRecord: MedicalRecordDraft = {
      ...medicalRecord,
      sections: {
        ...medicalRecord.sections,
        "general-data": {
          kind: "general-data",
          templateVersion: "free-text-v0",
          value: { text: "Вес 11,8 кг; температура 38,4" },
          authorAccountId: "doctor-1",
          authorDisplayName: "Вера Врач",
          updatedAt: "2026-07-21T10:00:00.000Z",
        },
      },
    };
    await setMedical(snapshot(undefined, { records: [legacyRecord] }));
    const wrapper = await mountAt("/doctor/pets/pet-1", "doctor-pet-detail");
    await flushPromises();
    await wrapper.get(".medical-record-edit").trigger("click");
    const editor = wrapper.get(".encounter-editor-inline");
    expect(editor.get(".temporary-note").text()).toContain("старый шаблон");
    expect(editor.get<HTMLTextAreaElement>(".encounter-section-card:not(.encounter-what-happened):not(.encounter-outcome) textarea").element.value)
      .toBe("Вес 11,8 кг; температура 38,4");
    await editor.get('button[title="Сохранить запись"]').trigger("click");
    await flushPromises();
    expect(repositoryMocks.saveEncounter).toHaveBeenCalledWith(expect.objectContaining({
      sections: expect.objectContaining({
        "general-data": { text: "Вес 11,8 кг; температура 38,4" },
      }),
    }));
  });

  it("preserves a legacy free-text therapeutic section while editing", async () => {
    const legacyRecord: MedicalRecordDraft = {
      ...medicalRecord,
      sections: {
        ...medicalRecord.sections,
        "therapeutic-appointment": {
          kind: "therapeutic-appointment",
          templateVersion: "free-text-v0",
          value: { text: "Старый текст терапевтического приёма" },
          authorAccountId: "doctor-1",
          authorDisplayName: "Вера Врач",
          updatedAt: "2026-07-21T10:00:00.000Z",
        },
      },
    };
    await setMedical(snapshot(undefined, { records: [legacyRecord] }));
    const wrapper = await mountAt("/doctor/pets/pet-1", "doctor-pet-detail");
    await flushPromises();
    await wrapper.get(".medical-record-edit").trigger("click");
    const card = wrapper.findAll(".encounter-section-card")
      .find((candidate) => candidate.get("h3").text() === "Терапевтический приём")!;
    expect(card.find(".therapeutic-appointment-form").exists()).toBe(false);
    expect(card.get<HTMLTextAreaElement>("textarea").element.value).toBe("Старый текст терапевтического приёма");
    await wrapper.get('.encounter-editor-inline button[title="Сохранить запись"]').trigger("click");
    await flushPromises();
    expect(repositoryMocks.saveEncounter).toHaveBeenCalledWith(expect.objectContaining({
      sections: expect.objectContaining({
        "therapeutic-appointment": { text: "Старый текст терапевтического приёма" },
      }),
    }));
  });

  it("allows selections from only one general condition at a time", async () => {
    const wrapper = await mountAt("/doctor/pets/pet-1", "doctor-pet-detail");
    await flushPromises();
    expect(wrapper.get(".encounter-what-happened > .doctor-heading h3").text()).toBe("Что случилось");
    expect(wrapper.get(".encounter-what-happened .medical-card-comment-section h4").text()).toBe("Комментарий");
    expect(wrapper.get(".encounter-what-happened textarea").attributes("aria-label")).toBe("Комментарий");
    expect(wrapper.get(".encounter-what-happened textarea").attributes("rows")).toBe("2");
    expect(wrapper.get(".encounter-what-happened textarea").classes()).toContain("medical-card-comment");
    expect(wrapper.findAll('.encounter-condition-trees > .encounter-taxonomy[role="tree"]')).toHaveLength(3);
    expect(wrapper.findAll('.encounter-condition-trees > .encounter-taxonomy[role="tree"]').map((tree) => tree.attributes("aria-label")))
      .toEqual(["Всё хорошо, необходимо", "Не всё хорошо с", "Всё плохо"]);
    expect(wrapper.findAll(".encounter-condition-trees > .encounter-taxonomy > li > details").every((tree) => tree.attributes("open") === undefined)).toBe(true);
    expect(wrapper.get(".encounter-date-field").exists()).toBe(true);
    expect(wrapper.get(".encounter-add-section").exists()).toBe(true);
    const checkbox = (label: string) => wrapper.findAll(".encounter-taxonomy label")
      .find((candidate) => candidate.text() === label)!
      .get<HTMLInputElement>('input[type="checkbox"]');
    const checkup = checkbox("Контрольный осмотр");
    const vaccination = checkbox("Вакцинация");
    const notEating = checkbox("Не ест");
    const bleeding = checkbox("Обильное кровотечение");
    expect(checkup.element.closest(".medical-card-options")).not.toBeNull();
    expect(notEating.element.closest(".medical-card-options")).not.toBeNull();
    expect(bleeding.element.closest(".medical-card-options")).not.toBeNull();
    expect(checkup.element.closest(".medical-card-option-panel")?.tagName).toBe("FIELDSET");
    expect(notEating.element.closest(".medical-card-option-panel")?.tagName).toBe("FIELDSET");
    expect(bleeding.element.closest(".medical-card-option-panel")?.tagName).toBe("FIELDSET");

    await checkup.trigger("change");
    await vaccination.trigger("change");
    expect(checkup.element.checked).toBe(true);
    expect(vaccination.element.checked).toBe(true);

    await notEating.trigger("change");
    expect(checkup.element.checked).toBe(false);
    expect(vaccination.element.checked).toBe(false);
    expect(notEating.element.checked).toBe(true);

    await bleeding.trigger("change");
    expect(notEating.element.checked).toBe(false);
    expect(bleeding.element.checked).toBe(true);
  });

  it("keeps the mandatory outcome last and replaces only conflicting selections", async () => {
    const wrapper = await mountAt("/doctor/pets/pet-1", "doctor-pet-detail");
    await flushPromises();
    const form = wrapper.get(".encounter-editor > form");
    expect(form.element.lastElementChild?.classList.contains("encounter-outcome")).toBe(true);
    expect(wrapper.findAll(".encounter-add-section option").map((option) => option.text())).not.toContain("Исход");
    expect(wrapper.find(".encounter-outcome .encounter-section-delete").exists()).toBe(false);
    expect(wrapper.get(".encounter-outcome-options").classes()).toContain("medical-card-options");
    expect(wrapper.get(".encounter-outcome-option-panel").element.tagName).toBe("FIELDSET");
    expect(wrapper.get(".encounter-outcome-option-panel").classes()).toContain("medical-card-option-panel");
    expect(wrapper.get(".encounter-outcome .medical-card-comment-section h4").text()).toBe("Комментарий");
    expect(wrapper.get(".encounter-outcome textarea").attributes("aria-label")).toBe("Комментарий");
    expect(wrapper.get(".encounter-outcome textarea").attributes("rows")).toBe("2");
    expect(wrapper.get(".encounter-outcome textarea").classes()).toContain("medical-card-comment");

    const outcome = (label: string) => wrapper.findAll(".encounter-outcome .check-row")
      .find((option) => option.text() === label)!
      .get<HTMLInputElement>("input");
    const recovery = outcome("Выздоровление");
    const improvement = outcome("Улучшение");
    const deterioration = outcome("Ухудшение");
    const death = outcome("Смерть");
    const observation = outcome("В стадии наблюдения");
    const examination = outcome("В стадии обследования");
    const noObservation = outcome("Без наблюдения");

    await recovery.trigger("change");
    await improvement.trigger("change");
    expect(recovery.element.checked).toBe(true);
    expect(improvement.element.checked).toBe(true);
    await deterioration.trigger("change");
    expect(recovery.element.checked).toBe(false);
    expect(improvement.element.checked).toBe(false);
    expect(deterioration.element.checked).toBe(true);
    await death.trigger("change");
    expect(deterioration.element.checked).toBe(false);
    expect(death.element.checked).toBe(true);
    await observation.trigger("change");
    expect(death.element.checked).toBe(false);
    await examination.trigger("change");
    expect(observation.element.checked).toBe(true);
    expect(examination.element.checked).toBe(true);
    await noObservation.trigger("change");
    expect(observation.element.checked).toBe(false);
    expect(examination.element.checked).toBe(false);
    expect(noObservation.element.checked).toBe(true);
  });

  it("preserves a legacy free-text outcome as the structured outcome comment", async () => {
    const legacyOutcomeRecord: MedicalRecordDraft = {
      ...medicalRecord,
      sections: {
        ...medicalRecord.sections,
        outcome: {
          ...medicalRecord.sections.outcome!,
          templateVersion: "free-text-v0",
          value: { text: "Продолжить домашнее наблюдение" },
        },
      },
    };
    await setMedical(snapshot(undefined, { records: [legacyOutcomeRecord] }));
    const wrapper = await mountAt("/doctor/pets/pet-1", "doctor-pet-detail");
    await flushPromises();
    await wrapper.get(".medical-record-edit").trigger("click");
    const editor = wrapper.get(".encounter-editor-inline");
    const save = editor.get<HTMLButtonElement>('button[title="Сохранить запись"]');
    expect(editor.get<HTMLTextAreaElement>(".encounter-outcome textarea").element.value)
      .toBe("Продолжить домашнее наблюдение");
    expect(save.element.disabled).toBe(true);
    await editor.findAll(".encounter-outcome .check-row")
      .find((option) => option.text() === "В стадии наблюдения")!
      .get("input").trigger("change");
    expect(save.element.disabled).toBe(false);
    await save.trigger("click");
    await flushPromises();
    expect(repositoryMocks.saveEncounter).toHaveBeenCalledWith(expect.objectContaining({
      sections: expect.objectContaining({
        outcome: {
          selectedIds: ["outcome.observation"],
          comment: "Продолжить домашнее наблюдение",
        },
      }),
    }));
  });

  it("uses verified status in the medical card and does not offer changes to a confirmed record", async () => {
    await setMedical(snapshot(undefined, { records: [medicalRecord], confirmedRecordIds: [medicalRecord.recordId] }));
    const wrapper = await mountAt("/doctor/pets/pet-1", "doctor-pet-detail");
    await flushPromises();

    const details = wrapper.get(".medical-record-entry-details");
    expect(wrapper.get(".doctor-medical-record h2").text()).toBe("Медицинская карта");
    expect(wrapper.text()).not.toContain("Эпикриз");
    expect(wrapper.text()).not.toContain("Предыдущие приёмы");
    expect(wrapper.find(".medical-record-entry-epicrisis").exists()).toBe(false);
    expect(details.text()).toContain("Подтверждена");
    expect(details.find(".medical-record-edit").exists()).toBe(false);

    expect(wrapper.get(".encounter-editor h2").text()).toBe("Сегодняшний приём");
    const saveEncounterButton = wrapper.get('.encounter-editor-heading button[title="Сохранить запись"]');
    expect(saveEncounterButton.text()).toBe("");
    expect(saveEncounterButton.attributes("aria-label")).toBe("Сохранить запись");
    expect(saveEncounterButton.getComponent(AppIcon).props("name")).toBe("check");

    await wrapper.get('.doctor-history-filters select[aria-label="Статус"]').setValue("unconfirmed");
    expect(wrapper.find(".medical-record-entry-details").exists()).toBe(false);
    await wrapper.get('.doctor-history-filters select[aria-label="Статус"]').setValue("confirmed");
    expect(wrapper.findAll(".medical-record-entry-details")).toHaveLength(1);
  });

  it("deletes an unconfirmed encounter after confirmation", async () => {
    await setMedical(snapshot(undefined, { records: [medicalRecord] }));
    const wrapper = await mountAt("/doctor/pets/pet-1", "doctor-pet-detail");
    await flushPromises();

    expect(wrapper.get(".medical-record-entry-details").text()).not.toContain("doctor-1");
    await wrapper.get(".medical-record-delete").trigger("click");
    const dialog = wrapper.get('[role="alertdialog"]');
    expect(dialog.text()).toContain("Неподтверждённая запись будет удалена без возможности восстановления.");
    await dialog.get(".danger").trigger("click");
    await flushPromises();

    expect(repositoryMocks.deleteRecord).toHaveBeenCalledWith("pet-1", "record-1");
  });

  it("shows the owner pet-profile information plus the owner's full name", async () => {
    directoryMocks.loadDoctorPetAccesses.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0, pageCount: 1 });
    const wrapper = await mountAt("/doctor/pets/pet-1", "doctor-pet-detail");
    await flushPromises();

    expect(directoryMocks.lookupPetDirectory).toHaveBeenCalledWith("pet-1");
    expect(wrapper.findAll(".owner-profile-fields dt").map((node) => node.text())).toEqual([
      "Пол", "Окрас", "Номер чипа", "Клеймо", "Последняя вакцинация", "Вес",
    ]);
    const profile = wrapper.get(".owner-pet-profile");
    expect(profile.get(".owner-pet-profile-details").text()).toContain("Буся");
    expect(profile.get(".owner-pet-id").text()).toBe("pet-1");
    expect(profile.text()).toContain("трёхцветный");
    expect(profile.text()).toContain("643094100000001");
    expect(profile.text()).toContain("ABC-123");
    expect(profile.text()).toContain("15.04.2026 · Рабикан");
    expect(profile.text()).toContain("11.8 кг");
    expect(profile.text()).toContain("Ольга Петровна Владелец");
    expect(profile.get(".owner-pet-owner .person-identity-id").text()).toBe("owner-1");
    expect(profile.text()).toContain("Боится громких звуков");
    expect(wrapper.findAll(".doctor-history-date-filter > span").map((label) => label.text()))
      .toEqual(["Дата с", "Дата по"]);
    expect(wrapper.get('.doctor-history-date-filter input[type="date"]').attributes("aria-label")).toBeUndefined();
  });

  it("keeps the encounter editor read-only without write permission", async () => {
    await setMedical(snapshot(["read"]));
    const wrapper = await mountAt("/doctor/pets/pet-1", "doctor-pet-detail");
    await flushPromises();
    expect(wrapper.find(".encounter-editor").exists()).toBe(false);
    expect(wrapper.text()).toContain("Доступ только для чтения");
  });
});
