// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountProfile, DirectoryUserDto, Role, RoleRequest, SignedEvent } from "@klinok/protocol";
import AppIcon from "../src/components/AppIcon.vue";
import AdministratorScreen from "../src/screens/AdministratorScreen.vue";

const appMocks = vi.hoisted(() => ({
  decideRole: vi.fn().mockResolvedValue(undefined),
  updateAdministratorUserProfile: vi.fn(),
  directoryUsers: [] as DirectoryUserDto[],
  loadAdministratorUsers: vi.fn(async (
    query = "",
    pendingOnly = false,
    page = 1,
    pageSize = 20,
    sort = "name",
    direction = "asc",
  ) => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    const multiplier = direction === "desc" ? -1 : 1;
    const items = appMocks.directoryUsers
      .filter((user) => !normalized || user.displayName.toLocaleLowerCase("ru").includes(normalized)
        || user.accountId.toLocaleLowerCase("ru").includes(normalized))
      .filter((user) => !pendingOnly
        || user.roleStatuses.doctor === "pending" || user.roleStatuses.administrator === "pending")
      .sort((left, right) => multiplier * (sort === "name"
        ? left.displayName.localeCompare(right.displayName, "ru")
        : left.roleStatuses[sort as Role].localeCompare(right.roleStatuses[sort as Role])));
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    const selectedPage = Math.min(pageCount, Math.max(1, page));
    return {
      items: items.slice((selectedPage - 1) * pageSize, selectedPage * pageSize),
      page: selectedPage,
      pageSize,
      total: items.length,
      pageCount,
    };
  }),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/appStore", async () => {
  const { reactive, readonly } = await import("vue");
  const state = reactive({
    feedback: null as { kind: "success" | "error"; text: string } | null,
    session: { authenticated: true, accountId: "bootstrap-administrator" },
    activeRole: "administrator",
    control: {
      profile: {
        accountId: "bootstrap-administrator",
        revision: 1,
        firstName: "Начальный",
        lastName: "Администратор",
        updatedAt: "2026-07-10T10:00:00.000Z",
      },
      profiles: [] as AccountProfile[],
      roles: [] as RoleRequest[],
      allRoles: [] as RoleRequest[],
      devices: [],
      pendingQueue: [],
      notifications: [],
      events: [] as SignedEvent[],
    },
  });
  return {
    appState: readonly(state),
    decideRole: appMocks.decideRole,
    loadAdministratorUsers: appMocks.loadAdministratorUsers,
    updateAdministratorUserProfile: appMocks.updateAdministratorUserProfile,
    logout: appMocks.logout,
    getConfig: () => ({ p2p: { bootstrapAccountId: "bootstrap-administrator" } }),
    setAdministratorState: (value: {
      profiles?: AccountProfile[];
      roles?: RoleRequest[];
      events?: SignedEvent[];
      sessionAccountId?: string;
      activeRole?: Role | null;
    }) => {
      state.session.accountId = value.sessionAccountId ?? "bootstrap-administrator";
      state.activeRole = value.activeRole === undefined ? "administrator" : value.activeRole;
      state.control.profiles = value.profiles ?? [];
      state.control.allRoles = value.roles ?? [];
      state.control.events = value.events ?? [];
      const requests = new Map(state.control.allRoles.map((request) => [`${request.accountId}:${request.role}`, request.status]));
      appMocks.directoryUsers = state.control.profiles.map((profile) => ({
        accountId: profile.accountId,
        firstName: profile.firstName,
        lastName: profile.lastName,
        ...(profile.patronymic ? { patronymic: profile.patronymic } : {}),
        displayName: [profile.firstName, profile.patronymic, profile.lastName].filter(Boolean).join(" "),
        updatedAt: profile.updatedAt,
        roleStatuses: {
          owner: requests.get(`${profile.accountId}:owner`) ?? "not_requested",
          doctor: requests.get(`${profile.accountId}:doctor`) ?? "not_requested",
          administrator: requests.get(`${profile.accountId}:administrator`) ?? "not_requested",
        },
      }));
    },
  };
});

function role(
  accountId: string,
  roleName: Role,
  status: RoleRequest["status"],
  requestId = `${accountId}-${roleName}`,
): RoleRequest {
  return {
    requestId,
    accountId,
    role: roleName,
    status,
    profileRevision: 1,
    requestedAt: "2026-07-10T10:00:00.000Z",
  };
}

function profile(accountId: string, firstName: string, lastName: string): AccountProfile {
  return {
    accountId,
    revision: 1,
    firstName,
    lastName,
    updatedAt: "2026-07-10T10:00:00.000Z",
  };
}

function directoryUser(accountId: string, displayName: string): DirectoryUserDto {
  const [firstName, ...lastName] = displayName.split(" ");
  return {
    accountId,
    firstName: firstName!,
    lastName: lastName.join(" "),
    displayName,
    updatedAt: "2026-07-10T10:00:00.000Z",
    roleStatuses: { owner: "approved", doctor: "not_requested", administrator: "not_requested" },
  };
}

function directoryPage(items: DirectoryUserDto[]) {
  return { items, page: 1, pageSize: 20, total: items.length, pageCount: 1 };
}

function event(overrides: Partial<SignedEvent> & Pick<SignedEvent, "eventId" | "eventType">): SignedEvent {
  return {
    schemaVersion: 1,
    database: "control",
    operationId: `operation-${overrides.eventId}`,
    aggregateId: "doctor-1",
    resourceId: "doctor-role",
    createdAt: "2026-07-10T10:00:00.000Z",
    actorAccountId: "bootstrap-administrator",
    actorDeviceId: "bootstrap-device",
    orbitIdentityId: "bootstrap-orbit",
    activeRole: "administrator",
    parents: [],
    keyVersion: 1,
    proofIds: ["administrator-role"],
    metadata: {},
    keyring: [],
    payload: { algorithm: "AES-GCM-256", iv: "iv", ciphertext: "ciphertext" },
    signature: { algorithm: "ECDSA-P256-SHA256", value: "signature" },
    ...overrides,
  };
}

async function setState(value: {
  profiles?: AccountProfile[];
  roles?: RoleRequest[];
  events?: SignedEvent[];
  sessionAccountId?: string;
  activeRole?: Role | null;
}) {
  const store = await import("../src/appStore") as typeof import("../src/appStore") & {
    setAdministratorState: (input: typeof value) => void;
  };
  store.setAdministratorState(value);
}

async function mountAt(path: "/admin/home" | "/admin/audit", scenarioId: "administrator-home" | "administrator-audit") {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/admin/home", component: { template: "<div />" } },
      { path: "/admin/audit", component: { template: "<div />" } },
      { path: "/profile", component: { template: "<div />" } },
      { path: "/auth/login", component: { template: "<div />" } },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(AdministratorScreen, {
    props: { role: "administrator", scenarioId },
    global: { plugins: [createPinia(), router] },
  });
  await flushPromises();
  return wrapper;
}

function rowFor(wrapper: VueWrapper, text: string) {
  return wrapper.findAll(".administrator-table tbody tr").find((row) => row.text().includes(text))!;
}

beforeEach(async () => {
  vi.clearAllMocks();
  appMocks.updateAdministratorUserProfile.mockImplementation(async (accountId, input) => ({
    accountId,
    firstName: input.firstName,
    lastName: input.lastName,
    ...(input.patronymic ? { patronymic: input.patronymic } : {}),
    displayName: [input.firstName, input.patronymic, input.lastName].filter(Boolean).join(" "),
    updatedAt: "2026-07-12T10:00:00.000Z",
  }));
  localStorage.clear();
  await setState({});
});

describe("Administrator pages", () => {
  it("shows pending counters and filters the table to actionable users", async () => {
    const pendingDoctor = role("doctor-1", "doctor", "pending");
    await setState({
      profiles: [
        profile("doctor-1", "Анна", "Врач"),
        profile("doctor-2", "Борис", "Врач"),
      ],
      roles: [pendingDoctor, role("doctor-2", "doctor", "approved")],
    });
    const wrapper = await mountAt("/admin/home", "administrator-home");

    const desktopUsers = wrapper.get('.workspace-sidebar-nav a[href="/admin/home"]');
    expect(desktopUsers.get(".pending-count-badge").text()).toBe("1");
    expect(desktopUsers.attributes("aria-label")).toBe("Пользователи. Ожидают решения: 1");
    const mobileUsers = wrapper.get('.workspace-bottom-nav button[aria-label="Пользователи. Ожидают решения: 1"]');
    expect(mobileUsers.get(".pending-count-badge").text()).toBe("1");

    const pendingFilter = wrapper.findAll(".administrator-role-filters button")[1]!;
    const allFilter = wrapper.findAll(".administrator-role-filters button")[0]!;
    expect(wrapper.get(".administrator-user-filters").element.children).toHaveLength(2);
    expect(allFilter.text()).toBe("Все");
    expect(allFilter.classes()).toEqual(expect.arrayContaining(["active", "neutral"]));
    expect(pendingFilter.text()).toContain("Требуют решения");
    expect(pendingFilter.classes()).toContain("pending");
    expect(pendingFilter.get(".pending-count-badge").text()).toBe("1");
    await pendingFilter.trigger("click");
    expect(wrapper.findAll(".administrator-table tbody tr")).toHaveLength(1);
    expect(wrapper.get(".administrator-table tbody tr").text()).toContain("Анна Врач");

    await setState({
      profiles: [
        profile("doctor-1", "Анна", "Врач"),
        profile("doctor-2", "Борис", "Врач"),
      ],
      roles: [{ ...pendingDoctor, status: "approved" }, role("doctor-2", "doctor", "approved")],
    });
    await flushPromises();
    expect(wrapper.find(".workspace-sidebar-nav .pending-count-badge").exists()).toBe(false);
    expect(pendingFilter.attributes("disabled")).toBeDefined();
    expect(wrapper.findAll(".administrator-table tbody tr")).toHaveLength(2);
  });

  it("shows every initialized user with owner status and protects bootstrap", async () => {
    await setState({
      profiles: [
        profile("bootstrap-administrator", "Начальный", "Администратор"),
        profile("doctor-1", "Анна", "Врач"),
        profile("doctor-2", "Борис", "Врач"),
        profile("owner-1", "Ольга", "Владелец"),
      ],
      roles: [
        role("bootstrap-administrator", "administrator", "approved"),
        role("doctor-1", "doctor", "pending"),
        role("doctor-1", "administrator", "rejected"),
        role("doctor-2", "doctor", "revoked"),
        role("owner-1", "owner", "approved"),
      ],
    });
    const wrapper = await mountAt("/admin/home", "administrator-home");

    const auditLink = wrapper.get(".administrator-audit-link");
    expect(auditLink.attributes("title")).toBe("Открыть журнал действий");
    expect(auditLink.attributes("aria-label")).toBe("Открыть журнал действий");
    expect(auditLink.text()).toBe("");
    expect(auditLink.getComponent(AppIcon).props("name")).toBe("book");
    expect(wrapper.findAll(".administrator-table th").map((header) => header.text())).toEqual([
      "ФИО", "Владелец", "Ветеринар", "Администратор",
    ]);
    expect(wrapper.findAll(".administrator-table tbody tr")).toHaveLength(4);
    const ownerRow = rowFor(wrapper, "Ольга Владелец");
    expect(ownerRow.get('[data-label="Владелец"]').text()).toBe("Одобрена");
    expect(ownerRow.findAll("button")).toHaveLength(1);
    const ownerEdit = ownerRow.get('button[title="Изменить ФИО пользователя"]');
    expect(ownerEdit.attributes("aria-label")).toBe("Изменить ФИО пользователя");
    expect(ownerEdit.getComponent(AppIcon).props("name")).toBe("edit");
    const doctorRow = rowFor(wrapper, "Анна Врач");
    expect(doctorRow.text()).toContain("Запрошена");
    expect(doctorRow.text()).toContain("Отказ");
    const doctorName = doctorRow.get(".person-identity");
    expect(doctorName.get(".person-identity-name").text()).toBe("Анна Врач");
    expect(doctorName.get(".person-identity-id").text()).toBe("doctor-1");
    expect(rowFor(wrapper, "Борис Врач").text()).toContain("Отозвана");
    expect(wrapper.find(".administrator-actions").exists()).toBe(false);
    expect(rowFor(wrapper, "Начальный Администратор").findAll(".administrator-role-cell button")).toHaveLength(0);
    expect(rowFor(wrapper, "Начальный Администратор").find('button[title="Изменить ФИО пользователя"]').exists()).toBe(true);
    expect(doctorRow.get('[data-label="Ветеринар"]').findAll("button").map((button) => button.attributes("title"))).toEqual([
      "Одобрить роль «Ветеринар»",
      "Отклонить запрос роли «Ветеринар»",
    ]);
    expect(doctorRow.get('[data-label="Администратор"]').findAll("button").map((button) => button.attributes("title"))).toEqual([
      "Восстановить роль «Администратор»",
    ]);
  });

  it("shows actions when a fresh directory status arrives before the local role projection", async () => {
    await setState({ profiles: [profile("doctor-1", "Анна", "Врач")] });
    appMocks.directoryUsers = [{
      ...directoryUser("doctor-1", "Анна Врач"),
      roleStatuses: { owner: "approved", doctor: "pending", administrator: "not_requested" },
    }];
    const wrapper = await mountAt("/admin/home", "administrator-home");

    const doctorCell = wrapper.get('[data-label="Ветеринар"]');
    expect(doctorCell.findAll("button").map((button) => button.attributes("title"))).toEqual([
      "Одобрить роль «Ветеринар»",
      "Отклонить запрос роли «Ветеринар»",
    ]);

    await doctorCell.get('button[title="Одобрить роль «Ветеринар»"]').trigger("click");
    await wrapper.get('[role="dialog"] form').trigger("submit");
    await flushPromises();
    expect(appMocks.decideRole).toHaveBeenCalledWith({
      accountId: "doctor-1",
      role: "doctor",
      status: "pending",
    }, "approved", undefined);
  });

  it("hides profile editing from ordinary approved administrators", async () => {
    await setState({
      sessionAccountId: "ordinary-administrator",
      activeRole: "administrator",
      profiles: [profile("owner-1", "Ольга", "Владелец")],
      roles: [role("owner-1", "owner", "approved")],
    });
    const wrapper = await mountAt("/admin/home", "administrator-home");
    expect(wrapper.find('button[title="Изменить ФИО пользователя"]').exists()).toBe(false);
  });

  it("edits an owner-only user's name in a modal and refreshes the current page", async () => {
    await setState({
      profiles: [{
        ...profile("owner-1", "Ольга", "Владелец"),
        patronymic: "Петровна",
      }],
      roles: [role("owner-1", "owner", "approved")],
    });
    let resolveUpdate!: (value: DirectoryUserDto) => void;
    appMocks.updateAdministratorUserProfile.mockImplementationOnce(() =>
      new Promise<DirectoryUserDto>((resolve) => { resolveUpdate = resolve; }));
    const wrapper = await mountAt("/admin/home", "administrator-home");
    const initialLoads = appMocks.loadAdministratorUsers.mock.calls.length;

    await wrapper.get('button[title="Изменить ФИО пользователя"]').trigger("click");
    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.text()).toContain("Изменить ФИО");
    expect(dialog.get(".person-identity-name").text()).toBe("Ольга Петровна Владелец");
    const inputs = dialog.findAll<HTMLInputElement>("input");
    expect(inputs.map((input) => input.element.value)).toEqual(["Ольга", "Петровна", "Владелец"]);

    await inputs[0]!.setValue("   ");
    await dialog.get("form").trigger("submit");
    expect(dialog.get('[role="alert"]').text()).toBe("Имя и фамилия обязательны.");
    expect(appMocks.updateAdministratorUserProfile).not.toHaveBeenCalled();

    await inputs[0]!.setValue("Анна");
    await inputs[1]!.setValue("");
    await inputs[2]!.setValue("Иванова");
    await dialog.get("form").trigger("submit");
    await flushPromises();
    expect(appMocks.updateAdministratorUserProfile).toHaveBeenCalledWith("owner-1", {
      firstName: "Анна",
      lastName: "Иванова",
    });
    expect(dialog.get('button[type="submit"]').attributes("disabled")).toBeDefined();
    expect(dialog.get('button[type="submit"]').text()).toBe("Сохранение…");

    resolveUpdate(directoryUser("owner-1", "Анна Иванова"));
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(wrapper.get(".workspace-alert").text()).toContain("ФИО пользователя изменено.");
    expect(appMocks.loadAdministratorUsers.mock.calls.length).toBe(initialLoads + 1);
  });

  it("keeps profile update failures inside the open modal", async () => {
    await setState({ profiles: [profile("owner-1", "Ольга", "Владелец")] });
    appMocks.updateAdministratorUserProfile.mockRejectedValueOnce(new Error("Сервис временно недоступен."));
    const wrapper = await mountAt("/admin/home", "administrator-home");
    await wrapper.get('button[title="Изменить ФИО пользователя"]').trigger("click");
    const dialog = wrapper.get('[role="dialog"]');
    await dialog.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(dialog.get('[role="alert"]').text()).toBe("Сервис временно недоступен.");
    expect(wrapper.find(".workspace-alert").exists()).toBe(false);
  });

  it("confirms rejection with an optional reason and restoration without one", async () => {
    const pending = role("doctor-1", "doctor", "pending");
    const rejected = role("doctor-1", "administrator", "rejected");
    await setState({
      profiles: [profile("doctor-1", "Анна", "Врач")],
      roles: [pending, rejected],
    });
    const wrapper = await mountAt("/admin/home", "administrator-home");

    await wrapper.get('button[title="Отклонить запрос роли «Ветеринар»"]').trigger("click");
    const rejectDialog = wrapper.get('[role="alertdialog"]');
    const identity = rejectDialog.get(".person-identity");
    expect(identity.get(".person-identity-name").text()).toBe("Анна Врач");
    expect(identity.get(".person-identity-id").text()).toBe("doctor-1");
    expect(identity.element.children[0]).toBe(identity.get(".person-identity-name").element);
    expect(identity.element.children[1]).toBe(identity.get(".person-identity-id-row").element);
    expect(rejectDialog.attributes("aria-describedby"))
      .toBe(rejectDialog.get(".modal-dialog-description").attributes("id"));
    await rejectDialog.get("textarea").setValue("Документы не подтверждены");
    await rejectDialog.get("form").trigger("submit");
    await flushPromises();
    expect(appMocks.decideRole).toHaveBeenCalledWith(pending, "rejected", "Документы не подтверждены");
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);

    await wrapper.get('button[title="Восстановить роль «Администратор»"]').trigger("click");
    const restoreDialog = wrapper.get('[role="dialog"]');
    expect(restoreDialog.find("textarea").exists()).toBe(false);
    await restoreDialog.get("form").trigger("submit");
    await flushPromises();
    expect(appMocks.decideRole).toHaveBeenCalledWith(rejected, "approved", undefined);
  });

  it("searches, paginates, and remembers the selected page size", async () => {
    const profiles = Array.from({ length: 22 }, (_, index) =>
      profile(`doctor-${index}`, `Имя${String(index).padStart(2, "0")}`, "Врач"),
    );
    await setState({
      profiles,
      roles: profiles.map((item) => role(item.accountId, "doctor", "pending")),
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const wrapper = await mountAt("/admin/home", "administrator-home");

    expect(setItem).not.toHaveBeenCalled();
    const searchLabel = wrapper.get(".administrator-search");
    expect(searchLabel.get(":scope > span").text()).toBe("ФИО или идентификатор");
    expect(searchLabel.get("input").attributes("placeholder")).toBe("Поиск");
    expect(wrapper.findAll(".administrator-table tbody tr")).toHaveLength(20);
    expect(wrapper.get(".app-paginator").text()).toContain("Показаны 1–20 из 22");
    await wrapper.get('.app-paginator button[aria-label="Страница 2"]').trigger("click");
    await flushPromises();
    expect(wrapper.findAll(".administrator-table tbody tr")).toHaveLength(2);
    expect(appMocks.loadAdministratorUsers).toHaveBeenLastCalledWith("", false, 2, 20, "name", "asc");
    expect(setItem).not.toHaveBeenCalled();
    await wrapper.get('.app-paginator select').setValue("50");
    await flushPromises();
    expect(setItem).toHaveBeenCalledOnce();
    expect(setItem).toHaveBeenCalledWith("klinok:admin-role-table-page-size", "50");
    expect(localStorage.getItem("klinok:admin-role-table-page-size")).toBe("50");
    expect(wrapper.findAll(".administrator-table tbody tr")).toHaveLength(22);

    setItem.mockClear();
    await wrapper.get<HTMLInputElement>('.administrator-search input').setValue("Имя21");
    await flushPromises();
    expect(wrapper.findAll(".administrator-table tbody tr")).toHaveLength(1);
    expect(wrapper.get(".administrator-table tbody tr").text()).toContain("Имя21");

    await wrapper.get<HTMLInputElement>('.administrator-search input').setValue("doctor-20");
    await flushPromises();
    expect(wrapper.findAll(".administrator-table tbody tr")).toHaveLength(1);
    expect(wrapper.get(".administrator-table tbody tr").text()).toContain("doctor-20");
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it("keeps the newest user-directory response when requests finish out of order", async () => {
    let resolveInitial!: (value: ReturnType<typeof directoryPage>) => void;
    let resolveSearch!: (value: ReturnType<typeof directoryPage>) => void;
    appMocks.loadAdministratorUsers
      .mockImplementationOnce(() => new Promise((resolve) => { resolveInitial = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSearch = resolve; }));
    const wrapper = await mountAt("/admin/home", "administrator-home");

    await wrapper.get<HTMLInputElement>('.administrator-search input').setValue("новый");
    resolveSearch(directoryPage([directoryUser("new-user", "Новый Пользователь")]));
    await flushPromises();
    resolveInitial(directoryPage([directoryUser("old-user", "Старый Пользователь")]));
    await flushPromises();

    expect(wrapper.get(".administrator-table tbody tr").text()).toContain("Новый Пользователь");
    expect(wrapper.text()).not.toContain("Старый Пользователь");
  });

  it("renders user-directory failures through the shared page alert", async () => {
    appMocks.loadAdministratorUsers.mockRejectedValueOnce(new Error("network unavailable"));
    const wrapper = await mountAt("/admin/home", "administrator-home");

    expect(wrapper.get('.app-alert[role="alert"]').text()).toContain("Не удалось загрузить список пользователей.");
  });

  it("renders, filters, and paginates signed role audit actions with their actors", async () => {
    const requested = event({
      eventId: "requested",
      eventType: "role.requested",
      aggregateId: "doctor-1",
      actorAccountId: "doctor-1",
      metadata: { role: "doctor", status: "pending" },
      createdAt: "2026-07-10T10:00:00.000Z",
    });
    const requestedAudit = event({
      eventId: "requested-audit",
      eventType: "audit.role-transition",
      aggregateId: "doctor-1",
      actorAccountId: "doctor-1",
      parents: ["requested"],
      createdAt: "2026-07-10T10:00:01.000Z",
    });
    const restored = event({
      eventId: "restored",
      eventType: "role.restored",
      aggregateId: "doctor-1",
      actorAccountId: "bootstrap-administrator",
      metadata: { role: "doctor", status: "approved" },
      createdAt: "2026-07-11T10:00:00.000Z",
    });
    const restoredAudit = event({
      eventId: "restored-audit",
      eventType: "audit.role-transition",
      aggregateId: "doctor-1",
      actorAccountId: "bootstrap-administrator",
      parents: ["restored"],
      createdAt: "2026-07-11T10:00:01.000Z",
    });
    const bootstrap = event({
      eventId: "bootstrap",
      eventType: "account.bootstrap",
      aggregateId: "bootstrap-administrator",
      actorAccountId: "bootstrap-administrator",
      createdAt: "2026-07-09T10:00:00.000Z",
    });
    await setState({
      profiles: [
        profile("doctor-1", "Анна", "Врач"),
        profile("bootstrap-administrator", "Начальный", "Администратор"),
      ],
      events: [requested, requestedAudit, restored, restoredAudit, bootstrap],
    });
    const wrapper = await mountAt("/admin/audit", "administrator-audit");

    const homeLink = wrapper.get(".administrator-audit-link");
    expect(homeLink.attributes("title")).toBe("К управлению ролями");
    expect(homeLink.attributes("aria-label")).toBe("К управлению ролями");
    expect(homeLink.text()).toBe("");
    expect(homeLink.getComponent(AppIcon).props("name")).toBe("chevron-left");
    const searchLabel = wrapper.get(".administrator-audit-filters .administrator-search");
    expect(searchLabel.get(":scope > span").text()).toBe("ФИО или идентификатор");
    expect(searchLabel.get("input").attributes("placeholder")).toBe("Поиск");
    const rows = wrapper.findAll(".administrator-audit-table tbody tr");
    expect(rows).toHaveLength(3);
    expect(rows[0]!.text()).toContain("Роль восстановлена");
    expect(rows[0]!.text()).toContain("Начальный Администратор");
    expect(rows[2]!.text()).toContain("Роль назначена при инициализации");

    await wrapper.findAll<HTMLSelectElement>(".administrator-audit-filters select")[1]!.setValue("restore");
    expect(wrapper.findAll(".administrator-audit-table tbody tr")).toHaveLength(1);
    expect(wrapper.get(".administrator-audit-table tbody tr").text()).toContain("Роль восстановлена");
  });
});
