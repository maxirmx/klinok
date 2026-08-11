// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppIcon from "../src/components/AppIcon.vue";
import RoleStatusScreen from "../src/screens/RoleStatusScreen.vue";
import { deleteAccount, logout, renameDevice, revokeDevice, switchRole, updateCredentials, updateProfile } from "../src/appStore";

const clipboardWriteText = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/appStore", async () => {
  const { reactive, readonly } = await import("vue");
  const state = reactive({
    feedback: null as { kind: "success" | "error"; text: string } | null,
    busy: false,
    activeRole: "owner" as "owner" | "doctor" | "administrator" | null,
    session: {
      authenticated: true,
      accountId: "account-1",
      email: "owner@example.ru",
      device: { deviceId: "current-device", deviceName: "Домашний ноутбук" },
      devices: [
        { deviceId: "current-device", deviceName: "Домашний ноутбук", status: "active" },
        { deviceId: "revoked-device", deviceName: "Старый телефон", status: "revoked" },
      ],
    },
    control: {
      profile: { accountId: "account-1", revision: 1, firstName: "Максим", patronymic: "Сергеевич", lastName: "Иванов", updatedAt: "2026-07-15T00:00:00.000Z" },
      profiles: [],
      roles: [
        { requestId: "owner-role", role: "owner", status: "approved" },
        { requestId: "doctor-role", role: "doctor", status: "approved" },
        { requestId: "administrator-role", role: "administrator", status: "pending" },
      ],
      allRoles: [], pendingQueue: [], notifications: [], roleAudit: [],
      ledger: { valid: true, height: 1, headHash: "a".repeat(64), verifiedAt: "2026-07-15T00:00:00.000Z" },
    },
    medical: { pets: [], grants: [], accessRequests: [], records: [], confirmations: [], confirmedRecordIds: [] },
    sync: { pendingCount: 0, failedCount: 0, syncing: false, lastError: "" },
    repositoryConnected: true,
  });
  return {
    appState: readonly(state),
    setMockAccountId: (accountId: string) => { state.session.accountId = accountId; },
    setMockActiveRole: (role: "owner" | "doctor" | "administrator" | null) => { state.activeRole = role; },
    setMockDevices: (devices: typeof state.session.devices) => { state.session.devices = devices; },
    setMockProfile: (profile: typeof state.control.profile) => { state.control.profile = profile; },
    setMockSync: (sync: typeof state.sync) => { state.sync = sync; },
    bootstrapApp: vi.fn(),
    cancelRole: vi.fn(),
    decideRole: vi.fn(),
    deleteAccount: vi.fn(),
    getConfig: vi.fn(() => ({ bootstrapAccountId: "bootstrap-administrator" })),
    getRepository: vi.fn(),
    logout: vi.fn().mockResolvedValue(true),
    requestRole: vi.fn(),
    renameDevice: vi.fn(),
    revokeDevice: vi.fn(),
    switchRole: vi.fn(),
    updateProfile: vi.fn(),
    updateCredentials: vi.fn(),
  };
});

async function mountAt(component: object, path: string, props: Record<string, unknown>) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path, component, props },
      { path: "/auth/login", component: { template: "<div>login</div>" } },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(component, { props, global: { plugins: [createPinia(), router] } });
  return { router, wrapper };
}

beforeEach(async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: clipboardWriteText },
  });
  clipboardWriteText.mockClear();
  const mockedStore = await import("../src/appStore") as typeof import("../src/appStore") & {
    setMockAccountId: (accountId: string) => void;
    setMockActiveRole: (role: "owner" | "doctor" | "administrator" | null) => void;
    setMockDevices: (devices: Array<{ deviceId: string; deviceName: string; status: string }>) => void;
    setMockProfile: (profile: {
      accountId: string;
      revision: number;
      firstName: string;
      patronymic: string;
      lastName: string;
      updatedAt: string;
    }) => void;
    setMockSync: (sync: { pendingCount: number; failedCount: number; syncing: boolean; lastError: string }) => void;
  };
  mockedStore.setMockAccountId("account-1");
  mockedStore.setMockActiveRole("owner");
  mockedStore.setMockDevices([
    { deviceId: "current-device", deviceName: "Домашний ноутбук", status: "active" },
    { deviceId: "revoked-device", deviceName: "Старый телефон", status: "revoked" },
  ]);
  mockedStore.setMockProfile({
    accountId: "account-1",
    revision: 1,
    firstName: "Максим",
    patronymic: "Сергеевич",
    lastName: "Иванов",
    updatedAt: "2026-07-15T00:00:00.000Z",
  });
  mockedStore.setMockSync({ pendingCount: 0, failedCount: 0, syncing: false, lastError: "" });
  vi.mocked(deleteAccount).mockClear();
  vi.mocked(logout).mockClear();
  vi.mocked(renameDevice).mockClear();
  vi.mocked(revokeDevice).mockClear();
  vi.mocked(updateCredentials).mockClear();
  vi.mocked(updateProfile).mockClear();
  vi.mocked(switchRole).mockClear();
});

describe("logout navigation", () => {
  it("leaves the role screen after logout on all devices", async () => {
    const { router, wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    await wrapper.get('button[title="Выйти на всех устройствах"]').trigger("click");
    await flushPromises();
    expect(logout).toHaveBeenCalledWith(true);
    expect(router.currentRoute.value.path).toBe("/auth/login");
  });

  it("shows recognizable names before device IDs", async () => {
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    expect(wrapper.findAll(".workspace-sidebar-nav .workspace-nav-item span").map((node) => node.text())).toEqual([
      "Питомцы", "Добавить питомца",
    ]);
    expect(wrapper.find(".workspace-sidebar-footer .workspace-nav-item.active").text()).toContain("Настройки");
    expect(wrapper.get<HTMLInputElement>('.device-row input').element.value).toBe("Домашний ноутбук");
    expect(wrapper.get(".account-security").text()).toContain("Управляйте идентификатором и сеансами аккаунта.");
    expect(wrapper.get(".device-security").text()).toContain("Управляйте действующими сеансами входа.");
    expect(wrapper.get(".profile-account-identity .person-identity-name").text()).toBe("Максим Сергеевич Иванов");
    expect(wrapper.get(".profile-account-identity .person-identity-id").text()).toBe("account-1");
    expect(wrapper.text()).toContain("Вход на новом устройстве выполняется сразу.");
    expect(wrapper.text()).toContain("Текущий сеанс");
    expect(wrapper.text()).not.toContain("Это устройство");
    expect(wrapper.text()).not.toContain("Старый телефон");
    expect(wrapper.text()).not.toContain("revoked-device");
    expect(wrapper.find(".workspace-account-actions").exists()).toBe(false);
    expect(wrapper.get(".workspace-bottom-nav").text()).toContain("Настройки");
    expect(wrapper.get(".workspace-bottom-nav").text()).toContain("Выйти");
    const revokeButton = wrapper.get<HTMLButtonElement>('button[title="Нельзя отозвать последнее действующее устройство."]');
    expect(revokeButton.element.disabled).toBe(true);
    await wrapper.get('button[title="Копировать идентификатор пользователя"]').trigger("click");
    await flushPromises();
    expect(clipboardWriteText).toHaveBeenCalledWith("account-1");
    expect(wrapper.get(".workspace-alert[role='status']").text()).toContain("Идентификатор пользователя скопирован.");

    const pageButtons = wrapper.findAll(".profile-layout button");
    expect(pageButtons.length).toBeGreaterThan(0);
    expect(pageButtons.every((button) => button.text() === "")).toBe(true);
    expect(pageButtons.every((button) => Boolean(button.attributes("title") && button.attributes("aria-label")))).toBe(true);
    expect(pageButtons.every((button) => button.find(".app-icon").exists())).toBe(true);
  });

  it("edits, restores, and saves a device name", async () => {
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    const input = wrapper.get<HTMLInputElement>('.device-row input');
    const save = wrapper.get<HTMLButtonElement>('button[title="Сохранить название устройства"]');
    const restore = wrapper.get<HTMLButtonElement>('button[title="Восстановить название устройства"]');

    expect(save.element.disabled).toBe(true);
    expect(restore.element.disabled).toBe(true);
    await input.setValue("macOS · Chrome");
    expect(save.element.disabled).toBe(false);
    expect(restore.element.disabled).toBe(false);
    await restore.trigger("click");
    expect(input.element.value).toBe("Домашний ноутбук");

    await input.setValue("macOS · Chrome");
    await wrapper.get(".device-row").trigger("submit");
    await flushPromises();
    expect(renameDevice).toHaveBeenCalledWith("current-device", "macOS · Chrome");
    expect(wrapper.get(".workspace-alert").text()).toContain("Название устройства сохранено.");
    expect(save.element.disabled).toBe(true);
  });

  it("locks every device control while a device name is being saved", async () => {
    const mockedStore = await import("../src/appStore") as typeof import("../src/appStore") & {
      setMockDevices: (devices: Array<{ deviceId: string; deviceName: string; status: string }>) => void;
    };
    mockedStore.setMockDevices([
      { deviceId: "current-device", deviceName: "Домашний ноутбук", status: "active" },
      { deviceId: "second-device", deviceName: "Рабочий ноутбук", status: "active" },
    ]);
    let finishRename!: () => void;
    vi.mocked(renameDevice).mockImplementationOnce(() => new Promise<void>((resolve) => { finishRename = resolve; }));
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    const inputs = wrapper.findAll<HTMLInputElement>(".device-row input");

    await inputs[0]!.setValue("Основной браузер");
    await inputs[1]!.setValue("Резервный браузер");
    await wrapper.findAll(".device-row")[0]!.trigger("submit");
    await flushPromises();

    expect(inputs.every((input) => input.element.disabled)).toBe(true);
    expect(wrapper.findAll<HTMLButtonElement>('button[title="Сохранить название устройства"]')
      .every((button) => button.element.disabled)).toBe(true);
    expect(wrapper.findAll<HTMLButtonElement>('button[title="Восстановить название устройства"]')
      .every((button) => button.element.disabled)).toBe(true);
    expect(wrapper.findAll<HTMLButtonElement>('button[title="Отозвать устройство"]')
      .every((button) => button.element.disabled)).toBe(true);

    finishRename();
    await flushPromises();
    expect(inputs.every((input) => !input.element.disabled)).toBe(true);
    expect(inputs[0]!.element.value).toBe("Основной браузер");
    expect(inputs[1]!.element.value).toBe("Резервный браузер");
  });

  it("shows current-session sync status immediately above separate account and device sections", async () => {
    const mockedStore = await import("../src/appStore") as typeof import("../src/appStore") & {
      setMockSync: (sync: { pendingCount: number; failedCount: number; syncing: boolean; lastError: string }) => void;
    };
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    const sections = wrapper.findAll(".profile-layout > .profile-section");
    const syncSectionIndex = sections.findIndex((section) => section.classes().includes("profile-sync-status"));
    const accountSectionIndex = sections.findIndex((section) => section.classes().includes("account-security"));
    const deviceSectionIndex = sections.findIndex((section) => section.classes().includes("device-security"));

    expect(syncSectionIndex).toBeGreaterThanOrEqual(0);
    expect(accountSectionIndex).toBe(syncSectionIndex + 1);
    expect(deviceSectionIndex).toBe(accountSectionIndex + 1);
    expect(sections[syncSectionIndex]!.text()).toContain("Синхронизация данных");
    expect(sections[syncSectionIndex]!.text()).toContain("текущего аккаунта");
    expect(sections[syncSectionIndex]!.get(".sync-status").text()).toBe("Сохранено");
    expect(sections[accountSectionIndex]!.get("h2").text()).toBe("Аккаунт");
    expect(sections[deviceSectionIndex]!.get("h2").text()).toBe("Устройства");

    mockedStore.setMockSync({ pendingCount: 0, failedCount: 1, syncing: false, lastError: "" });
    await flushPromises();
    expect(sections[syncSectionIndex]!.get(".sync-status").text()).toBe("Не сохранено: 1");
  });

  it("confirms account deletion in a modal before executing it", async () => {
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    const deleteButton = wrapper.get('button[title="Удалить аккаунт"]');
    await deleteButton.trigger("click");

    const dialog = wrapper.get('[role="alertdialog"]');
    expect(dialog.attributes("aria-modal")).toBe("true");
    expect(dialog.text()).toContain("Удалить аккаунт?");
    expect(deleteAccount).not.toHaveBeenCalled();

    await dialog.findAll("button").find((button) => button.text() === "Отмена")!.trigger("click");
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(deleteAccount).not.toHaveBeenCalled();

    await deleteButton.trigger("click");
    await wrapper.get('[role="alertdialog"]').findAll("button")
      .find((button) => button.text() === "Удалить аккаунт")!
      .trigger("click");
    await flushPromises();
    expect(deleteAccount).toHaveBeenCalledOnce();
  });

  it("disables account deletion for the bootstrap Administrator", async () => {
    const mockedStore = await import("../src/appStore") as typeof import("../src/appStore") & {
      setMockAccountId: (accountId: string) => void;
    };
    mockedStore.setMockAccountId("bootstrap-administrator");
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    const deleteButton = wrapper.get<HTMLButtonElement>('button[title="Начальный аккаунт администратора нельзя удалить."]');

    expect(deleteButton.element.disabled).toBe(true);
    expect(deleteButton.attributes("title")).toBe("Начальный аккаунт администратора нельзя удалить.");
    await deleteButton.trigger("click");
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("does not render legacy approval or recovery controls", async () => {
    const mockedStore = await import("../src/appStore") as typeof import("../src/appStore") & {
      setMockAccountId: (accountId: string) => void;
    };
    mockedStore.setMockAccountId("bootstrap-administrator");
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });

    expect(wrapper.text()).not.toContain("Все действующие устройства утрачены?");
    expect(wrapper.text()).not.toContain("Подтвердить и передать ключи");
  });

  it("confirms device revocation before executing it", async () => {
    const mockedStore = await import("../src/appStore") as typeof import("../src/appStore") & {
      setMockDevices: (devices: Array<{ deviceId: string; deviceName: string; status: string }>) => void;
    };
    mockedStore.setMockDevices([
      { deviceId: "current-device", deviceName: "Домашний ноутбук", status: "active" },
      { deviceId: "second-device", deviceName: "Рабочий ноутбук", status: "active" },
    ]);
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    const revokeButton = wrapper.get<HTMLButtonElement>('button[title="Отозвать устройство"]');
    expect(revokeButton.element.disabled).toBe(false);
    expect(revokeButton.classes()).toContain("danger-link");
    expect(revokeButton.getComponent(AppIcon).props("name")).toBe("trash");
    await revokeButton.trigger("click");

    const dialog = wrapper.get('[role="alertdialog"]');
    expect(dialog.text()).toContain("Отозвать устройство «Домашний ноутбук»?");
    expect(revokeDevice).not.toHaveBeenCalled();
    await dialog.findAll("button").find((button) => button.text() === "Отозвать устройство")!.trigger("click");
    await flushPromises();
    expect(revokeDevice).toHaveBeenCalledWith("current-device");
  });

  it("shows role navigation when an active role becomes available on the profile page", async () => {
    const mockedStore = await import("../src/appStore") as typeof import("../src/appStore") & {
      setMockActiveRole: (role: "owner" | "doctor" | "administrator" | null) => void;
    };
    mockedStore.setMockActiveRole(null);
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    expect(wrapper.findAll(".workspace-sidebar-nav .workspace-nav-item span").map((node) => node.text())).toEqual([
      "Питомцы", "Добавить питомца",
    ]);

    mockedStore.setMockActiveRole("administrator");
    await flushPromises();
    expect(wrapper.findAll(".workspace-sidebar-nav .workspace-nav-item span").map((node) => node.text())).toEqual([
      "Пользователи", "Журнал",
    ]);
    mockedStore.setMockActiveRole("owner");
  });

  it("shows clear success feedback after profile and credential changes", async () => {
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    const profileSave = wrapper.get<HTMLButtonElement>('button[form="profile-form"]');
    const credentialsSave = wrapper.get<HTMLButtonElement>('button[form="credentials-form"]');
    const profileRestore = wrapper.get<HTMLButtonElement>('button[title="Восстановить личные данные"]');
    const credentialsRestore = wrapper.get<HTMLButtonElement>('button[title="Восстановить электронную почту и пароль"]');

    expect(wrapper.get<HTMLInputElement>('input[autocomplete="given-name"]').element.value).toBe("Максим");
    expect(wrapper.get<HTMLInputElement>('input[autocomplete="additional-name"]').element.value).toBe("Сергеевич");
    expect(wrapper.get<HTMLInputElement>('input[autocomplete="family-name"]').element.value).toBe("Иванов");
    expect(wrapper.get<HTMLInputElement>('.credentials-form input[type="email"]').element.value).toBe("owner@example.ru");
    expect(wrapper.findAll<HTMLInputElement>('.credentials-form input[type="password"]').every((input) => input.element.value === "")).toBe(true);
    expect(wrapper.get(".workspace-topbar p").text()).toBe("Максим Сергеевич Иванов");
    expect(profileSave.element.disabled).toBe(true);
    expect(credentialsSave.element.disabled).toBe(true);
    expect(profileRestore.element.disabled).toBe(true);
    expect(credentialsRestore.element.disabled).toBe(true);

    await wrapper.get<HTMLInputElement>('input[autocomplete="given-name"]').setValue("Мария");
    expect(profileSave.element.disabled).toBe(false);
    expect(profileRestore.element.disabled).toBe(false);
    await profileRestore.trigger("click");
    expect(wrapper.get<HTMLInputElement>('input[autocomplete="given-name"]').element.value).toBe("Максим");
    expect(profileRestore.element.disabled).toBe(true);
    await wrapper.get<HTMLInputElement>('input[autocomplete="given-name"]').setValue("Мария");
    await wrapper.get(".profile-form").trigger("submit");
    await flushPromises();
    expect(updateProfile).toHaveBeenCalledWith({ firstName: "Мария", patronymic: "Сергеевич", lastName: "Иванов" });
    expect(wrapper.get(".workspace-topbar p").text()).toBe("Мария Сергеевич Иванов");
    expect(profileSave.element.disabled).toBe(true);
    expect(wrapper.get(".workspace-alert").text()).toContain("Изменения профиля сохранены.");
    expect(wrapper.findAll(".workspace-alert")).toHaveLength(1);

    const emailFields = wrapper.findAll<HTMLInputElement>('.credentials-form input[type="email"]');
    expect(emailFields).toHaveLength(1);
    await emailFields[0]!.setValue("new-owner@example.ru");
    expect(credentialsSave.element.disabled).toBe(false);
    expect(credentialsRestore.element.disabled).toBe(false);
    await credentialsRestore.trigger("click");
    expect(emailFields[0]!.element.value).toBe("owner@example.ru");
    expect(credentialsRestore.element.disabled).toBe(true);
    await emailFields[0]!.setValue("new-owner@example.ru");
    await wrapper.get(".credentials-form").trigger("submit");
    await flushPromises();
    expect(updateCredentials).toHaveBeenCalledWith({ email: "new-owner@example.ru" });
    expect(credentialsSave.element.disabled).toBe(true);
    expect(wrapper.findAll(".workspace-alert")).toHaveLength(1);
    expect(wrapper.get(".workspace-alert").text()).toContain("Электронная почта сохранена.");
    expect(wrapper.text()).not.toContain("Изменения профиля сохранены.");

    await wrapper.get('button[aria-label="Закрыть сообщение"]').trigger("click");
    expect(wrapper.find(".workspace-alert").exists()).toBe(false);
  });

  it("allows repeated profile edits while background snapshots are received", async () => {
    const mockedStore = await import("../src/appStore") as typeof import("../src/appStore") & {
      setMockProfile: (profile: {
        accountId: string;
        revision: number;
        firstName: string;
        patronymic: string;
        lastName: string;
        updatedAt: string;
      }) => void;
    };
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    const firstName = wrapper.get<HTMLInputElement>('input[autocomplete="given-name"]');
    const profileSave = wrapper.get<HTMLButtonElement>('button[form="profile-form"]');

    await firstName.setValue("Мария");
    await wrapper.get(".profile-form").trigger("submit");
    await flushPromises();
    expect(updateProfile).toHaveBeenLastCalledWith({ firstName: "Мария", patronymic: "Сергеевич", lastName: "Иванов" });

    await firstName.setValue("Анна");
    mockedStore.setMockProfile({
      accountId: "account-1",
      revision: 2,
      firstName: "Мария",
      patronymic: "Сергеевич",
      lastName: "Иванов",
      updatedAt: "2026-07-21T00:00:00.000Z",
    });
    await flushPromises();

    expect(firstName.element.value).toBe("Анна");
    expect(profileSave.element.disabled).toBe(false);
    await wrapper.get(".profile-form").trigger("submit");
    await flushPromises();
    expect(updateProfile).toHaveBeenCalledTimes(2);
    expect(updateProfile).toHaveBeenLastCalledWith({ firstName: "Анна", patronymic: "Сергеевич", lastName: "Иванов" });
  });

  it("changes approved active roles through real radio controls", async () => {
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    const radios = wrapper.findAll<HTMLInputElement>('.profile-roles input[type="radio"]');
    expect(radios).toHaveLength(3);
    expect(radios[0]!.element.checked).toBe(true);
    expect(radios[1]!.element.disabled).toBe(false);
    expect(radios[2]!.element.disabled).toBe(true);
    expect(wrapper.text()).toContain("Активная");
    expect(wrapper.text()).not.toContain("Сделать активной");

    await radios[1]!.setValue(true);
    await flushPromises();
    expect(switchRole).toHaveBeenCalledWith("doctor");
  });
});
