// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectoryPetDto, DirectoryProfileDto, MedicalSnapshot, PetProfile, PetTransferRequest } from "@klinok/contracts";

const mocks = vi.hoisted(() => ({
  lookupPetDirectory: vi.fn(),
  searchOwnerDirectory: vi.fn(),
  searchPetDirectory: vi.fn(),
  requestPetTransfer: vi.fn(),
  acceptPetTransfer: vi.fn(),
  rejectPetTransfer: vi.fn(),
  cancelPetTransfer: vi.fn(),
  refresh: vi.fn(),
}));

const timestamp = "2026-09-02T10:00:00.000Z";

const pet: PetProfile = {
  petId: "pet-1", ownerAccountId: "owner-1", revision: 4, name: "Ёжик", species: "Кошка", breed: "Домашняя",
  sex: "Кастрированный самец", weightKg: 5, tombstoned: false, updatedAt: timestamp,
};
const directoryPet: DirectoryPetDto = {
  petId: "pet-1", ownerAccountId: "owner-1", ownerDisplayName: "Алёна Ёлкина", ownerProfileRevision: 2,
  revision: 4, species: "Кошка", name: "Ёжик", updatedAt: timestamp,
};
const targetOwner: DirectoryProfileDto = {
  accountId: "owner-2", revision: 3, firstName: "Иван", lastName: "Петров", displayName: "Иван Петров", updatedAt: timestamp,
};

const state = vi.hoisted(() => ({
  session: { authenticated: true, accountId: "owner-1" },
  repositoryConnected: true,
  sync: { connectionState: "connected", syncing: false },
  control: {
    profile: { accountId: "owner-1", revision: 2, firstName: "Алёна", lastName: "Ёлкина", updatedAt: "2026-09-02T10:00:00.000Z" } as {
      accountId: string; revision: number; firstName: string; lastName: string; updatedAt: string;
    } | null,
  },
  medical: {
    pets: [], grants: [], accessRequests: [], transferRequests: [], records: [], confirmations: [], confirmedRecordIds: [],
  } as MedicalSnapshot,
}));

vi.mock("../src/appStore", () => ({
  appState: state,
  lookupPetDirectory: mocks.lookupPetDirectory,
  searchOwnerDirectory: mocks.searchOwnerDirectory,
  searchPetDirectory: mocks.searchPetDirectory,
  requireRepository: () => ({ medical: {
    requestPetTransfer: mocks.requestPetTransfer,
    acceptPetTransfer: mocks.acceptPetTransfer,
    rejectPetTransfer: mocks.rejectPetTransfer,
    cancelPetTransfer: mocks.cancelPetTransfer,
    refresh: mocks.refresh,
  } }),
}));

import AppIcon from "../src/components/AppIcon.vue";
import PersonIdentity from "../src/components/PersonIdentity.vue";
import PetDirectoryActionDialog from "../src/components/PetDirectoryActionDialog.vue";
import PetTransferDialog from "../src/components/PetTransferDialog.vue";
import PetTransferManager from "../src/components/PetTransferManager.vue";

function transfer(overrides: Partial<PetTransferRequest> = {}): PetTransferRequest {
  return {
    transferRequestId: "transfer-1", petId: "pet-1", petRevision: 4,
    fromOwnerAccountId: "owner-1", fromOwnerDisplayName: "Алёна Ёлкина", fromOwnerProfileRevision: 2,
    toOwnerAccountId: "owner-2", toOwnerDisplayName: "Иван Петров", toOwnerProfileRevision: 3,
    initiatedByAccountId: "owner-2", retainDoctorAccess: false, petName: "Ёжик", petSpecies: "Кошка",
    status: "pending", revision: 1, createdAt: timestamp,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.session.accountId = "owner-1";
  state.medical = {
    pets: [], grants: [], accessRequests: [], transferRequests: [], records: [], confirmations: [], confirmedRecordIds: [],
  };
  state.control.profile = { accountId: "owner-1", revision: 2, firstName: "Алёна", lastName: "Ёлкина", updatedAt: timestamp };
  state.sync.connectionState = "connected";
  state.sync.syncing = false;
  mocks.lookupPetDirectory.mockResolvedValue(directoryPet);
  mocks.searchOwnerDirectory.mockResolvedValue({ items: [targetOwner], page: 1, pageSize: 10, total: 1, pageCount: 1 });
  mocks.searchPetDirectory.mockResolvedValue({ items: [directoryPet], page: 1, pageSize: 10, total: 1, pageCount: 1 });
  mocks.requestPetTransfer.mockResolvedValue("transfer-new");
  mocks.acceptPetTransfer.mockResolvedValue(undefined);
  mocks.rejectPetTransfer.mockResolvedValue(undefined);
  mocks.cancelPetTransfer.mockResolvedValue(undefined);
  mocks.refresh.mockResolvedValue(undefined);
});

describe("pet transfer overlay", () => {
  it("configures shared pet-directory dialog labels and close actions", async () => {
    const wrapper = mount(PetDirectoryActionDialog, {
      props: {
        modelValue: true,
        title: "Выбрать животное",
        actionTitle: "Продолжить",
        searchTitle: "Искать животное",
        closeTitle: "Закрыть поиск",
      },
      global: { plugins: [createPinia()] },
    });

    expect(wrapper.get('[role="dialog"] h2').text()).toBe("Выбрать животное");
    expect(wrapper.get(".doctor-request-search-action").attributes("title")).toBe("Искать животное");
    await wrapper.get('button[title="Закрыть поиск"]').trigger("click");
    await wrapper.get(".confirmation-dialog-backdrop").trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([[false], [false]]);
  });

  it("removes a shared search result that becomes unavailable before its action", async () => {
    const unavailablePetIds: string[] = [];
    const wrapper = mount(PetDirectoryActionDialog, {
      props: {
        modelValue: true,
        title: "Запросить передачу",
        actionTitle: "Выбрать питомца",
        currentAccountId: "owner-1",
        unavailablePetIds,
        unavailablePetError: "Передача уже ожидает решения.",
      },
      global: { plugins: [createPinia()] },
    });
    const form = wrapper.get("form.doctor-request-search-form");
    await form.get('.doctor-request-owner-field input[type="search"]').setValue("Алёна");
    await form.get('.doctor-request-pet-field input[type="search"]').setValue("Ёжик");
    await form.trigger("submit");
    await flushPromises();
    expect(wrapper.getComponent(PersonIdentity).props("displayName")).toBe("Алёна Ёлкина (Я)");
    const action = wrapper.get('button[title="Выбрать питомца"]');

    unavailablePetIds.push("pet-1");
    await action.trigger("click");

    expect(wrapper.get('[role="alert"]').text()).toBe("Передача уже ожидает решения.");
    expect(wrapper.find('button[title="Выбрать питомца"]').exists()).toBe(false);
    expect(wrapper.emitted("action")).toBeUndefined();
  });

  it("uses distinct dedicated icons for outgoing and incoming transfer entry points", () => {
    const outgoing = mount(AppIcon, { props: { name: "building-circle-arrow-right" } });
    const incoming = mount(AppIcon, { props: { name: "arrow-right-to-city" } });

    expect(outgoing.findAll("circle")).toHaveLength(1);
    expect(incoming.findAll("circle")).toHaveLength(0);
    expect(outgoing.html()).not.toBe(incoming.html());
    expect(outgoing.attributes("aria-hidden")).toBe("true");
    expect(incoming.attributes("aria-hidden")).toBe("true");
  });

  it("runs outgoing owner search and loss acknowledgement in one alertdialog", async () => {
    const wrapper = mount(PetTransferDialog, {
      props: { modelValue: true, mode: "outgoing", pet },
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });
    expect(wrapper.get('[role="dialog"]').text()).toContain("Передать питомца");
    await wrapper.get('input[type="search"]').setValue("Иван");
    await wrapper.get("form.directory-dialog-search").trigger("submit");
    await flushPromises();
    expect(mocks.searchOwnerDirectory).toHaveBeenCalledWith("Иван", 1, 10);
    expect(wrapper.text()).toContain("Иван Петров");

    await wrapper.get('button[title="Выбрать владельца"]').trigger("click");
    expect(wrapper.get('[role="alertdialog"]').text()).toContain("Подтвердить передачу питомца");
    expect(wrapper.get(".transfer-review").findAllComponents(PersonIdentity)
      .map((identity) => identity.props("displayName"))).toEqual(["Алёна Ёлкина (Я)", "Иван Петров"]);
    expect(wrapper.find(".transfer-review > h3").exists()).toBe(false);
    expect(wrapper.get("fieldset.transfer-acknowledgement legend").classes()).toContain("visually-hidden");
    expect(wrapper.get("fieldset.transfer-acknowledgement label").findAll(":scope > *").map((child) => child.element.tagName)).toEqual(["INPUT", "SPAN"]);
    expect(wrapper.get("fieldset.transfer-acknowledgement").text()).toContain("потеряю доступ к профилю");
    expect(wrapper.get('button[title="Отправить запрос передачи"]').attributes("disabled")).toBeDefined();
    await wrapper.get('fieldset input[type="checkbox"]').setValue(true);
    await wrapper.get("form.transfer-review").trigger("submit");
    await flushPromises();

    expect(mocks.lookupPetDirectory).toHaveBeenCalledWith("pet-1");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.requestPetTransfer).toHaveBeenCalledWith({
      petId: "pet-1", toOwnerAccountId: "owner-2", expectedFromOwnerAccountId: "owner-1",
      expectedPetRevision: 4, expectedFromOwnerProfileRevision: 2, expectedToOwnerProfileRevision: 3,
      ownershipLossAcknowledged: true,
    });
    expect(wrapper.emitted("completed")?.[0]).toEqual(["transfer-new"]);
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });

  it("selects an eligible current pet with a selector before starting an outgoing transfer", async () => {
    const pendingPet = { ...pet, petId: "pet-pending", name: "Ожидающий" };
    state.medical.pets = [pet, pendingPet];
    state.medical.transferRequests = [transfer({ petId: pendingPet.petId })];
    const wrapper = mount(PetTransferDialog, {
      props: { modelValue: true, mode: "outgoing" },
      global: { plugins: [createPinia()] },
    });

    const petSelector = wrapper.get<HTMLSelectElement>('select[aria-label="Питомец для передачи"]');
    expect(petSelector.findAll("option").map((option) => option.text())).toEqual([
      "Выберите питомца",
      "Кошка Ёжик",
    ]);
    expect(petSelector.text()).not.toContain("Ожидающий");
    await petSelector.setValue("pet-1");
    await wrapper.get('input[type="search"]').setValue("Иван");
    await wrapper.get("form.directory-dialog-search").trigger("submit");
    await flushPromises();
    await wrapper.get('button[title="Выбрать владельца"]').trigger("click");

    const review = wrapper.get('[role="alertdialog"]');
    expect(review.text()).toContain("Кошка Ёжик");
    expect(review.text()).toContain("Иван Петров");
    await review.get('button[title="Назад к поиску"]').trigger("click");
    expect(wrapper.get<HTMLSelectElement>('select[aria-label="Питомец для передачи"]').element.value).toBe("pet-1");
    await wrapper.get('button[title="Выбрать владельца"]').trigger("click");
    await wrapper.get('[role="alertdialog"] input[type="checkbox"]').setValue(true);
    await wrapper.get('[role="alertdialog"] form.transfer-review').trigger("submit");
    await flushPromises();

    expect(mocks.lookupPetDirectory).toHaveBeenCalledWith("pet-1");
    expect(mocks.requestPetTransfer).toHaveBeenCalledWith(expect.objectContaining({
      petId: "pet-1",
      toOwnerAccountId: "owner-2",
      ownershipLossAcknowledged: true,
    }));
  });

  it("stops an outgoing selector choice that becomes pending during confirmation", async () => {
    state.medical.pets = [pet];
    const wrapper = mount(PetTransferDialog, {
      props: { modelValue: true, mode: "outgoing" },
      global: { plugins: [createPinia()] },
    });
    await wrapper.get('select[aria-label="Питомец для передачи"]').setValue("pet-1");
    await wrapper.get('input[type="search"]').setValue("Иван");
    await wrapper.get("form.directory-dialog-search").trigger("submit");
    await flushPromises();
    await wrapper.get('button[title="Выбрать владельца"]').trigger("click");
    await wrapper.get('input[type="checkbox"]').setValue(true);
    mocks.refresh.mockImplementationOnce(async () => {
      state.medical.transferRequests = [transfer({ initiatedByAccountId: "owner-1" })];
    });

    await wrapper.get("form.transfer-review").trigger("submit");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("уже ожидает решения");
    expect(mocks.lookupPetDirectory).not.toHaveBeenCalled();
    expect(mocks.requestPetTransfer).not.toHaveBeenCalled();
  });

  it("supports exact pet lookup without selecting an owner for an incoming request", async () => {
    const otherPet = { ...directoryPet, ownerAccountId: "owner-2", ownerDisplayName: "Иван Петров", ownerProfileRevision: 3 };
    mocks.lookupPetDirectory.mockResolvedValue(otherPet);
    mocks.searchPetDirectory.mockResolvedValue({ items: [otherPet], page: 1, pageSize: 50, total: 1, pageCount: 1 });
    const wrapper = mount(PetTransferDialog, {
      props: { modelValue: true, mode: "incoming" },
      global: { plugins: [createPinia()] },
    });
    const sharedDialog = wrapper.getComponent(PetDirectoryActionDialog);
    expect(sharedDialog.props("title")).toBe("Запросить передачу");
    expect(sharedDialog.props("actionTitle")).toBe("Выбрать питомца");
    const petForm = wrapper.get("form.doctor-request-search-form");
    await petForm.get('.doctor-request-pet-field input[type="search"]').setValue("pet-1");
    await petForm.trigger("submit");
    await flushPromises();
    expect(mocks.searchPetDirectory).toHaveBeenCalledWith("", "pet-1", 1, 50, "owner", "", true);
    expect(mocks.lookupPetDirectory).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Иван Петров");
    await wrapper.get('button[title="Выбрать питомца"]').trigger("click");
    expect(wrapper.get('[role="dialog"]').text()).toContain("Подтвердить запрос передачи");
    expect(wrapper.get(".transfer-review").findAllComponents(PersonIdentity)
      .map((identity) => identity.props("displayName"))).toEqual(["Иван Петров", "Алёна Ёлкина (Я)"]);
    expect(wrapper.get("fieldset.transfer-acknowledgement").text()).toContain("Сохранить действующие доступы врачей");
    await wrapper.get('fieldset.transfer-acknowledgement input[type="checkbox"]').setValue(true);
    await wrapper.get("form.transfer-review").trigger("submit");
    await flushPromises();

    expect(mocks.requestPetTransfer).toHaveBeenCalledWith(expect.objectContaining({
      petId: "pet-1", toOwnerAccountId: "owner-1", expectedFromOwnerAccountId: "owner-2",
      expectedFromOwnerProfileRevision: 3, expectedToOwnerProfileRevision: 2,
      ownershipLossAcknowledged: false,
      retainDoctorAccess: true,
    }));
  });

  it("restores focus to the trigger after the shared search advances to confirmation", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const otherPet = { ...directoryPet, ownerAccountId: "owner-2", ownerDisplayName: "Иван Петров", ownerProfileRevision: 3 };
    mocks.lookupPetDirectory.mockResolvedValue(otherPet);
    mocks.searchPetDirectory.mockResolvedValue({ items: [otherPet], page: 1, pageSize: 50, total: 1, pageCount: 1 });
    const wrapper = mount(PetTransferDialog, {
      props: { modelValue: false, mode: "incoming" },
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });

    await wrapper.setProps({ modelValue: true });
    await wrapper.get('.doctor-request-pet-field input[type="search"]').setValue("pet-1");
    await wrapper.get("form.doctor-request-search-form").trigger("submit");
    await flushPromises();
    await wrapper.get('button[title="Выбрать питомца"]').trigger("click");
    await wrapper.get("form.transfer-review").trigger("submit");
    await flushPromises();

    expect(document.activeElement).toBe(trigger);
    wrapper.unmount();
    trigger.remove();
  });

  it("continues to reject an exact lookup of the current Owner's pet", async () => {
    const wrapper = mount(PetTransferDialog, {
      props: { modelValue: true, mode: "incoming" },
      global: { plugins: [createPinia()] },
    });
    const petForm = wrapper.get("form.doctor-request-search-form");
    await petForm.get('.doctor-request-pet-field input[type="search"]').setValue("pet-1");
    await petForm.trigger("submit");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("собственного питомца");
    expect(wrapper.find('button[title="Выбрать питомца"]').exists()).toBe(false);
  });

  it("marks the current Owner in outgoing transfer search results", async () => {
    mocks.searchOwnerDirectory.mockResolvedValue({
      items: [{ accountId: "owner-1", revision: 2, firstName: "Алёна", lastName: "Ёлкина", displayName: "Алёна Ёлкина", updatedAt: timestamp }],
      page: 1, pageSize: 10, total: 1, pageCount: 1,
    });
    const wrapper = mount(PetTransferDialog, {
      props: { modelValue: true, mode: "outgoing", pet },
      global: { plugins: [createPinia()] },
    });

    await wrapper.get('input[type="search"]').setValue("Алёна");
    await wrapper.get("form.directory-dialog-search").trigger("submit");
    await flushPromises();

    expect(wrapper.get(".directory-dialog-result").getComponent(PersonIdentity).props("displayName"))
      .toBe("Алёна Ёлкина (Я)");
  });

  it("keeps stale search errors inside the overlay and preserves the selected review", async () => {
    const changedPet = { ...directoryPet, revision: 5 };
    mocks.lookupPetDirectory.mockResolvedValue(changedPet);
    const wrapper = mount(PetTransferDialog, {
      props: { modelValue: true, mode: "outgoing", pet },
      global: { plugins: [createPinia()] },
    });
    await wrapper.get('input[type="search"]').setValue("Иван");
    await wrapper.get("form.directory-dialog-search").trigger("submit");
    await flushPromises();
    await wrapper.get('button[title="Выбрать владельца"]').trigger("click");
    await wrapper.get('fieldset input[type="checkbox"]').setValue(true);
    await wrapper.get("form.transfer-review").trigger("submit");
    await flushPromises();

    expect(mocks.requestPetTransfer).not.toHaveBeenCalled();
    expect(wrapper.get('[role="alertdialog"] .form-alert').text()).toContain("изменились");
    expect(wrapper.get(".transfer-review dl").attributes("aria-label")).toBe("Участники передачи");
  });

  it("uses the same owner-and-pet name search as the doctor access dialog", async () => {
    const otherPet = { ...directoryPet, ownerAccountId: "owner-2", ownerDisplayName: "Иван Петров", ownerProfileRevision: 3 };
    mocks.searchPetDirectory.mockResolvedValue({ items: [otherPet], page: 1, pageSize: 50, total: 1, pageCount: 1 });
    const wrapper = mount(PetTransferDialog, {
      props: { modelValue: true, mode: "incoming" },
      global: { plugins: [createPinia()] },
    });
    const petForm = wrapper.get("form.doctor-request-search-form");
    await petForm.get('.doctor-request-owner-field input[type="search"]').setValue("Иван");
    await petForm.get('.doctor-request-pet-field input[type="search"]').setValue("Еж");
    await petForm.trigger("submit");
    await flushPromises();

    expect(mocks.searchPetDirectory).toHaveBeenCalledWith("Иван", "Еж", 1, 50, "owner", "", true);
    expect(wrapper.get(".doctor-request-result").text()).toContain("Иван Петров");
  });

  it("does not show an exact pet excluded by the authoritative transfer filter", async () => {
    mocks.searchPetDirectory.mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0, pageCount: 1 });
    const wrapper = mount(PetTransferDialog, {
      props: { modelValue: true, mode: "incoming" },
      global: { plugins: [createPinia()] },
    });
    const petForm = wrapper.get("form.doctor-request-search-form");
    await petForm.get('.doctor-request-pet-field input[type="search"]').setValue("pet-1");
    await petForm.trigger("submit");
    await flushPromises();

    expect(mocks.searchPetDirectory).toHaveBeenCalledWith("", "pet-1", 1, 50, "owner", "", true);
    expect(mocks.lookupPetDirectory).not.toHaveBeenCalled();
    expect(wrapper.find('button[title="Выбрать питомца"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Питомцы не найдены");
  });

  it("removes a pet if its transfer becomes pending after the search", async () => {
    const otherPet = { ...directoryPet, ownerAccountId: "owner-2", ownerDisplayName: "Иван Петров", ownerProfileRevision: 3 };
    mocks.searchPetDirectory.mockResolvedValue({ items: [otherPet], page: 1, pageSize: 10, total: 1, pageCount: 1 });
    const wrapper = mount(PetTransferDialog, {
      props: { modelValue: true, mode: "incoming" },
      global: { plugins: [createPinia()] },
    });
    const petForm = wrapper.get("form.doctor-request-search-form");
    await petForm.get('.doctor-request-owner-field input[type="search"]').setValue("Иван");
    await petForm.get('.doctor-request-pet-field input[type="search"]').setValue("Еж");
    await petForm.trigger("submit");
    await flushPromises();
    state.medical.transferRequests = [transfer({ petId: otherPet.petId })];

    await wrapper.get('button[title="Выбрать питомца"]').trigger("click");

    expect(wrapper.get('[role="alert"]').text()).toContain("уже ожидает решения");
    expect(wrapper.find('button[title="Выбрать питомца"]').exists()).toBe(false);
    expect(wrapper.get('[role="dialog"]').text()).toContain("Запросить передачу");
  });

  it("resets on opening, keeps search errors local, and closes through the overlay action", async () => {
    mocks.searchOwnerDirectory.mockRejectedValueOnce(new Error("Каталог временно недоступен"));
    const wrapper = mount(PetTransferDialog, {
      props: { modelValue: false, mode: "outgoing", pet },
      global: { plugins: [createPinia()] },
    });
    await wrapper.setProps({ modelValue: true });
    await wrapper.get('input[type="search"]').setValue("Иван");
    await wrapper.get("form.directory-dialog-search").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Каталог временно недоступен");
    await wrapper.get('button[title="Закрыть"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([false]);
  });

  it("returns from review and validates acknowledgement and synchronized profile", async () => {
    const wrapper = mount(PetTransferDialog, {
      props: { modelValue: true, mode: "outgoing", pet },
      global: { plugins: [createPinia()] },
    });
    await wrapper.get('input[type="search"]').setValue("Иван");
    await wrapper.get("form.directory-dialog-search").trigger("submit");
    await flushPromises();
    await wrapper.get('button[title="Выбрать владельца"]').trigger("click");
    await wrapper.get("form.transfer-review").trigger("submit");
    expect(wrapper.get('[role="alert"]').text()).toContain("Подтвердите потерю управления");
    await wrapper.get('button[title="Назад к поиску"]').trigger("click");
    expect(wrapper.get('input[type="search"]').element).toBeTruthy();

    await wrapper.get('button[title="Выбрать владельца"]').trigger("click");
    await wrapper.get('input[type="checkbox"]').setValue(true);
    state.control.profile = null;
    await wrapper.get("form.transfer-review").trigger("submit");
    expect(wrapper.get('[role="alert"]').text()).toContain("Профиль владельца ещё не синхронизирован");
  });

  it("rejects a renamed selected Owner and an exact pet that became stale", async () => {
    const outgoing = mount(PetTransferDialog, {
      props: { modelValue: true, mode: "outgoing", pet }, global: { plugins: [createPinia()] },
    });
    await outgoing.get('input[type="search"]').setValue("Иван");
    await outgoing.get("form.directory-dialog-search").trigger("submit");
    await flushPromises();
    await outgoing.get('button[title="Выбрать владельца"]').trigger("click");
    await outgoing.get('input[type="checkbox"]').setValue(true);
    mocks.searchOwnerDirectory.mockResolvedValueOnce({
      items: [{ ...targetOwner, revision: 4 }], page: 1, pageSize: 10, total: 1, pageCount: 1,
    });
    await outgoing.get("form.transfer-review").trigger("submit");
    await flushPromises();
    expect(outgoing.get('[role="alert"]').text()).toContain("принимающего владельца изменились");

    const incoming = mount(PetTransferDialog, {
      props: { modelValue: true, mode: "incoming" }, global: { plugins: [createPinia()] },
    });
    const selected = { ...directoryPet, ownerAccountId: "owner-2", ownerDisplayName: "Иван Петров", ownerProfileRevision: 3 };
    mocks.searchPetDirectory.mockResolvedValueOnce({ items: [selected], page: 1, pageSize: 50, total: 1, pageCount: 1 });
    mocks.lookupPetDirectory.mockResolvedValueOnce({ ...selected, ownerProfileRevision: 4 });
    const petForm = incoming.get("form.doctor-request-search-form");
    await petForm.get('.doctor-request-pet-field input[type="search"]').setValue("pet-1");
    await petForm.trigger("submit");
    await flushPromises();
    await incoming.get('button[title="Выбрать питомца"]').trigger("click");
    await incoming.get("form.transfer-review").trigger("submit");
    await flushPromises();
    expect(incoming.get('[role="alert"]').text()).toContain("изменились");
  });
});

describe("pet transfer request manager", () => {
  it("opens the outgoing dialog from the transfer list and disables it without eligible pets", async () => {
    state.medical.pets = [pet];
    const wrapper = mount(PetTransferManager, { global: { plugins: [createPinia()] } });
    const outgoingButton = wrapper.get('button[title="Передать питомца"]');
    expect(outgoingButton.getComponent(AppIcon).props("name")).toBe("building-circle-arrow-right");
    expect(wrapper.get('button[title="Запросить передачу"]').getComponent(AppIcon).props("name"))
      .toBe("arrow-right-to-city");

    await outgoingButton.trigger("click");
    expect(wrapper.get('[role="dialog"] select[aria-label="Питомец для передачи"]').exists()).toBe(true);
    await wrapper.get('[role="dialog"] button[title="Закрыть"]').trigger("click");

    state.medical = {
      ...state.medical,
      transferRequests: [transfer({ initiatedByAccountId: "owner-1" })],
    };
    const blocked = mount(PetTransferManager, { global: { plugins: [createPinia()] } });
    expect(blocked.get('button[title="Нет питомцев, доступных для передачи"]').attributes("disabled")).toBeDefined();
  });

  it("opens an emailed pending request directly for authoritative confirmation", async () => {
    state.medical.transferRequests = [transfer()];
    const wrapper = mount(PetTransferManager, {
      props: { linkedRequestId: "transfer-1" },
      global: { plugins: [createPinia()] },
    });
    await flushPromises();

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(wrapper.get('[role="alertdialog"]').text()).toContain("Принять передачу питомца?");
    expect(wrapper.get('[role="alertdialog"]').text()).toContain("Кошка Ёжик");
  });

  it("waits for synchronization before opening an emailed request", async () => {
    state.medical.transferRequests = [transfer()];
    state.sync = reactive({ ...state.sync, syncing: true });
    const wrapper = mount(PetTransferManager, {
      props: { linkedRequestId: "transfer-1" },
      global: { plugins: [createPinia()] },
    });
    await flushPromises();
    expect(mocks.refresh).not.toHaveBeenCalled();

    state.sync.syncing = false;
    await flushPromises();

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(wrapper.get('[role="alertdialog"]').text()).toContain("Принять передачу питомца?");
  });

  it("retries an emailed request after a transient authoritative refresh failure", async () => {
    state.medical.transferRequests = [transfer()];
    mocks.refresh.mockRejectedValueOnce(new Error("Сеть недоступна")).mockResolvedValueOnce(undefined);
    const wrapper = mount(PetTransferManager, {
      props: { linkedRequestId: "transfer-1" },
      global: { plugins: [createPinia()] },
    });
    await flushPromises();

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);

    state.sync.connectionState = "connecting";
    await flushPromises();
    state.sync.connectionState = "connected";
    await flushPromises();

    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    expect(wrapper.get('[role="alertdialog"]').text()).toContain("Принять передачу питомца?");
  });

  it("marks an emailed request handled after authoritative refresh makes it terminal", async () => {
    state.medical.transferRequests = [transfer()];
    mocks.refresh.mockImplementationOnce(async () => {
      state.medical.transferRequests = [transfer({ status: "completed", revision: 2 })];
    });
    const wrapper = mount(PetTransferManager, {
      props: { linkedRequestId: "transfer-1" },
      global: { plugins: [createPinia()] },
    });
    await flushPromises();

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);

    state.sync.connectionState = "connecting";
    await flushPromises();
    state.sync.connectionState = "connected";
    await flushPromises();

    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("does not open confirmation for an unknown or self-initiated emailed request", async () => {
    state.medical.transferRequests = [transfer({ initiatedByAccountId: "owner-1" })];
    const wrapper = mount(PetTransferManager, {
      props: { linkedRequestId: "missing-transfer" },
      global: { plugins: [createPinia()] },
    });
    await flushPromises();
    expect(mocks.refresh).not.toHaveBeenCalled();

    await wrapper.setProps({ linkedRequestId: "transfer-1" });
    await flushPromises();

    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
  });

  it("renders table-first rows with the current viewer marked and handles accept, reject, and cancel overlays", async () => {
    state.medical.transferRequests = [
      transfer(),
      transfer({
        transferRequestId: "transfer-2", fromOwnerAccountId: "owner-2", fromOwnerDisplayName: "Иван Петров",
        toOwnerAccountId: "owner-1", toOwnerDisplayName: "Алёна Ёлкина", initiatedByAccountId: "owner-1",
      }),
    ];
    const wrapper = mount(PetTransferManager, { global: { plugins: [createPinia()] } });
    expect(wrapper.findAll(".transfer-table th").map((header) => header.text())).toEqual([
      "Питомец", "Текущий владелец", "Новый владелец", "Статус", "Создан", "Действия",
    ]);
    const rows = wrapper.findAll(".transfer-table tbody tr");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.findAll("td").every((cell) => Boolean(cell.attributes("data-label")))).toBe(true);
    expect(rows.map((row) => row.findAllComponents(PersonIdentity).map((identity) => identity.props("displayName")))).toEqual([
      ["Алёна Ёлкина (Я)", "Иван Петров"],
      ["Иван Петров", "Алёна Ёлкина (Я)"],
    ]);
    expect(rows[0]!.findAll(".transfer-row-actions button").map((button) => button.attributes("title")))
      .toEqual(["Принять передачу", "Отклонить запрос передачи"]);

    await wrapper.get('button[title="Принять передачу"]').trigger("click");
    await flushPromises();
    const accept = wrapper.get('[role="alertdialog"]');
    expect(accept.findAllComponents(PersonIdentity).map((identity) => identity.props("displayName")))
      .toEqual(["Алёна Ёлкина (Я)", "Иван Петров"]);
    expect(accept.text()).toContain("потеряю доступ к профилю");
    expect(accept.get("fieldset.transfer-acknowledgement .transfer-access-policy-summary").text())
      .toContain("доступы врачей к медицинской карте питомца будут отозваны");
    await accept.get("form").trigger("submit");
    expect(accept.get('[role="alert"]').text()).toContain("Подтвердите потерю управления");
    await accept.get('input[type="checkbox"]').setValue(true);
    await accept.get("form").trigger("submit");
    await flushPromises();
    expect(mocks.acceptPetTransfer).toHaveBeenCalledWith("transfer-1", true);

    await wrapper.get('button[title="Отклонить запрос передачи"]').trigger("click");
    await wrapper.get('[role="alertdialog"] button.primary-action').trigger("click");
    await flushPromises();
    expect(mocks.rejectPetTransfer).toHaveBeenCalledWith("transfer-1");

    await wrapper.get('button[title="Отменить запрос передачи"]').trigger("click");
    await wrapper.get('[role="alertdialog"] button.primary-action').trigger("click");
    await flushPromises();
    expect(mocks.cancelPetTransfer).toHaveBeenCalledWith("transfer-2");
  });

  it("shows the new Owner's retained-access choice without letting the current Owner change it", async () => {
    state.medical.transferRequests = [transfer({ retainDoctorAccess: true })];
    const wrapper = mount(PetTransferManager, { global: { plugins: [createPinia()] } });

    await wrapper.get('button[title="Принять передачу"]').trigger("click");
    await flushPromises();
    const accept = wrapper.get('[role="alertdialog"]');
    expect(accept.get("fieldset.transfer-acknowledgement .transfer-access-policy-summary").text())
      .toContain("Новый владелец решил сохранить действующие доступы врачей");
    expect(accept.findAll('input[type="checkbox"]')).toHaveLength(1);
    await accept.get('input[type="checkbox"]').setValue(true);
    await accept.get("form").trigger("submit");
    await flushPromises();

    expect(mocks.acceptPetTransfer).toHaveBeenCalledWith("transfer-1", true);
  });

  it("lets the new Owner choose whether to retain Doctor access while accepting an outgoing request", async () => {
    state.session.accountId = "owner-2";
    state.medical.transferRequests = [transfer({ initiatedByAccountId: "owner-1" })];
    const wrapper = mount(PetTransferManager, { global: { plugins: [createPinia()] } });

    await wrapper.get('button[title="Принять передачу"]').trigger("click");
    await flushPromises();
    const accept = wrapper.get('[role="dialog"]');
    expect(accept.find("fieldset.transfer-acknowledgement").exists()).toBe(true);
    expect(accept.text()).toContain("Сохранить действующие доступы врачей");
    expect(accept.text()).not.toContain("потеряю доступ к профилю");
    await accept.get('input[type="checkbox"]').setValue(true);
    await accept.get("form").trigger("submit");
    await flushPromises();

    expect(mocks.acceptPetTransfer).toHaveBeenCalledWith("transfer-1", false, true);
  });

  it("does not open a stale request after authoritative refresh", async () => {
    state.medical.transferRequests = [transfer()];
    mocks.refresh.mockImplementationOnce(async () => { state.medical.transferRequests = [transfer({ revision: 2 })]; });
    const wrapper = mount(PetTransferManager, { global: { plugins: [createPinia()] } });
    await wrapper.get('button[title="Принять передачу"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(mocks.acceptPetTransfer).not.toHaveBeenCalled();
  });

  it("keeps a server-stale acceptance error in the overlay and disables retry", async () => {
    state.medical.transferRequests = [transfer()];
    mocks.acceptPetTransfer.mockImplementationOnce(async () => {
      state.medical.transferRequests = [transfer({ status: "cancelled", revision: 2 })];
      throw new Error("Статус запроса передачи изменился. Обновите список.");
    });
    const wrapper = mount(PetTransferManager, { global: { plugins: [createPinia()] } });
    await wrapper.get('button[title="Принять передачу"]').trigger("click");
    await flushPromises();
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get("form.transfer-review").trigger("submit");
    await flushPromises();

    const dialog = wrapper.get('[role="alertdialog"]');
    expect(dialog.get('[role="alert"]').text()).toContain("изменился");
    expect(dialog.get('button[title="Принять передачу"]').attributes("disabled")).toBeDefined();
  });

  it("keeps a stale cancellation error in its confirmation overlay", async () => {
    state.medical.transferRequests = [transfer({ initiatedByAccountId: "owner-1" })];
    mocks.cancelPetTransfer.mockImplementationOnce(async () => {
      state.medical.transferRequests = [transfer({ initiatedByAccountId: "owner-1", status: "completed", revision: 2 })];
      throw new Error("Статус запроса передачи изменился. Обновите список.");
    });
    const wrapper = mount(PetTransferManager, { global: { plugins: [createPinia()] } });
    await wrapper.get('button[title="Отменить запрос передачи"]').trigger("click");
    await wrapper.get('[role="alertdialog"] button.primary-action').trigger("click");
    await flushPromises();

    const dialog = wrapper.get('[role="alertdialog"]');
    expect(dialog.get('[role="alert"]').text()).toContain("изменился");
    expect(dialog.get("button.primary-action").attributes("disabled")).toBeDefined();
  });

  it("closes every decision overlay through its cancel action and renders read-only statuses", async () => {
    state.medical.transferRequests = [
      transfer(),
      transfer({ transferRequestId: "own", initiatedByAccountId: "owner-1" }),
      transfer({ transferRequestId: "done", status: "completed" }),
      transfer({ transferRequestId: "rejected", status: "rejected" }),
      transfer({ transferRequestId: "cancelled", status: "cancelled" }),
      transfer({ transferRequestId: "invalid", status: "invalidated" }),
    ];
    const wrapper = mount(PetTransferManager, { global: { plugins: [createPinia()] } });
    expect(wrapper.text()).toContain("Завершена");
    expect(wrapper.text()).toContain("Отклонена");
    expect(wrapper.text()).toContain("Отменена");
    expect(wrapper.text()).toContain("Устарела");
    const completedRow = wrapper.findAll(".transfer-table tbody tr")
      .find((row) => row.text().includes("Завершена"))!;
    const completedActions = completedRow.findAll("td").at(-1)!;
    expect(completedActions.classes()).toContain("is-empty");
    expect(completedActions.text()).toBe("");

    await wrapper.get('button[title="Принять передачу"]').trigger("click");
    await flushPromises();
    await wrapper.get('[role="alertdialog"] button[title="Отмена"]').trigger("click");
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    await wrapper.get('button[title="Отклонить запрос передачи"]').trigger("click");
    await wrapper.get('[role="alertdialog"] button.outline-action').trigger("click");
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    await wrapper.get('button[title="Отменить запрос передачи"]').trigger("click");
    const cancellationDialog = wrapper.get('[role="alertdialog"]');
    expect(cancellationDialog.get("button.outline-action").text()).toBe("Сохранить запрос");
    await cancellationDialog.get("button.outline-action").trigger("click");
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
  });

  it("disables actions while the authoritative projection is synchronizing", async () => {
    state.medical.transferRequests = [transfer()];
    state.sync.syncing = true;
    const wrapper = mount(PetTransferManager, { global: { plugins: [createPinia()] } });
    expect(wrapper.findAll('button[aria-label*="синхронизируются"]')).toHaveLength(2);
    expect(wrapper.findAll('button[aria-label*="синхронизируются"]')
      .every((button) => button.attributes("disabled") !== undefined)).toBe(true);
    expect(wrapper.get('button[title="Принять передачу"]').attributes("disabled")).toBeDefined();
    state.sync.syncing = false;
  });
});
