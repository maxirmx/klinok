// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SyncStatus from "../src/components/SyncStatus.vue";
import type { SyncNotification } from "../src/repositories/eventTransport";

vi.mock("../src/appStore", async () => {
  const { reactive, readonly } = await import("vue");
  const state = reactive({
    repositoryConnected: true,
    sync: {
      permanentNotificationCount: 0,
      failedCount: 0,
      connectionState: "connected",
      pendingCount: 0,
      deferredCount: 0,
      syncing: false,
      lastError: "",
    },
    syncNotifications: [] as SyncNotification[],
  });
  return {
    appState: readonly(state),
    dismissSyncNotification: vi.fn().mockImplementation(async (notificationId: string) => {
      state.syncNotifications = state.syncNotifications.filter((item) => item.notificationId !== notificationId);
      state.sync.permanentNotificationCount = state.syncNotifications.length;
    }),
    setMockSyncNotifications: (notifications: SyncNotification[]) => {
      state.syncNotifications = notifications;
      state.sync.permanentNotificationCount = notifications.length;
    },
    setMockSync: (sync: Partial<typeof state.sync>) => {
      Object.assign(state.sync, sync);
    },
    setMockRepositoryConnected: (connected: boolean) => {
      state.repositoryConnected = connected;
    },
  };
});

function notification(index: number): SyncNotification {
  return {
    notificationId: `notification-${index}`,
    accountId: "account-1",
    operationId: `operation-${index}`,
    rootEventId: `event-${index}`,
    database: "medical",
    eventType: "medical.record.created",
    code: `CODE-${index}`,
    reasonKey: "permission",
    diagnosticId: `diagnostic-${index}`,
    affectedEventIds: [`event-${index}`],
    createdAt: `2026-07-${String(index).padStart(2, "0")}T10:00:00.000Z`,
    action: "none",
  };
}

async function setNotifications(notifications: SyncNotification[]) {
  const store = await import("../src/appStore") as typeof import("../src/appStore") & {
    setMockSyncNotifications: (items: SyncNotification[]) => void;
  };
  store.setMockSyncNotifications(notifications);
}

async function setSync(sync: Partial<{
  permanentNotificationCount: number;
  failedCount: number;
  connectionState: "connected" | "disconnected" | "error";
  pendingCount: number;
  deferredCount: number;
  syncing: boolean;
  lastError: string;
}>) {
  const store = await import("../src/appStore") as typeof import("../src/appStore") & {
    setMockSync: (value: typeof sync) => void;
  };
  store.setMockSync(sync);
}

async function setRepositoryConnected(connected: boolean) {
  const store = await import("../src/appStore") as typeof import("../src/appStore") & {
    setMockRepositoryConnected: (value: boolean) => void;
  };
  store.setMockRepositoryConnected(connected);
}

async function mountStatus() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { template: "<div />" } }],
  });
  await router.push("/");
  await router.isReady();
  return { wrapper: mount(SyncStatus, { global: { plugins: [router] } }), router };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await setRepositoryConnected(true);
  await setSync({
    permanentNotificationCount: 0,
    failedCount: 0,
    connectionState: "connected",
    pendingCount: 0,
    deferredCount: 0,
    syncing: false,
    lastError: "",
  });
  await setNotifications(Array.from({ length: 11 }, (_, index) => notification(index + 1)));
});

describe("SyncStatus", () => {
  it("distinguishes an unavailable repository from an offline connection", async () => {
    await setNotifications([]);
    await setRepositoryConnected(false);
    const { wrapper } = await mountStatus();

    expect(wrapper.get(".sync-status").text()).toBe("Хранилище не подключено");
    expect(wrapper.get(".sync-status").attributes("title")).toBe("Подключение к хранилищу не установлено.");

    await setRepositoryConnected(true);
    await setSync({ connectionState: "disconnected" });
    await wrapper.vm.$nextTick();

    expect(wrapper.get(".sync-status").text()).toBe("Нет соединения");
    expect(wrapper.get(".sync-status").attributes("title")).toBe("Изменения останутся на устройстве до восстановления соединения.");
  });

  it("clamps the current page when a larger page size reduces the page count", async () => {
    const { wrapper } = await mountStatus();
    await wrapper.get('button[aria-label="Открыть уведомления о синхронизации"]').trigger("click");
    await wrapper.get('button[aria-label="Страница 3"]').trigger("click");

    expect(wrapper.findAll(".sync-notification")).toHaveLength(1);
    expect(wrapper.text()).toContain("diagnostic-11");

    await wrapper.get(".app-paginator select").setValue("20");
    await flushPromises();

    expect(wrapper.find(".app-paginator").exists()).toBe(false);
    expect(wrapper.findAll(".sync-notification")).toHaveLength(11);
    expect(wrapper.text()).not.toContain("Новых уведомлений нет.");
  });

  it("navigates to a notification action and closes an empty notification dialog", async () => {
    await setNotifications([{
      ...notification(1),
      action: "permissions",
      relatedRoute: "/profile#roles",
    }]);
    const { wrapper, router } = await mountStatus();
    router.addRoute({ path: "/profile", component: { template: "<div />" } });
    await wrapper.get('button[aria-label="Открыть уведомления о синхронизации"]').trigger("click");
    await wrapper.get(".sync-notification-actions .outline-action").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/profile#roles");

    await router.push("/");
    await wrapper.get('button[aria-label="Открыть уведомления о синхронизации"]').trigger("click");
    await wrapper.get(".sync-notification-actions .primary-action").trigger("click");
    await flushPromises();
    expect(wrapper.text()).not.toContain("Уведомления о синхронизации");
  });

  it("ignores notifications without an action and supports closing the dialog", async () => {
    await setNotifications([notification(1)]);
    const { wrapper, router } = await mountStatus();
    await wrapper.get('button[aria-label="Открыть уведомления о синхронизации"]').trigger("click");
    await wrapper.get(".confirmation-dialog-actions button").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/");
    expect(wrapper.text()).not.toContain("Уведомления о синхронизации");
  });

  it.each([
    [{ connectionState: "disconnected" as const }, "Нет соединения"],
    [{ connectionState: "error" as const }, "Ошибка синхронизации"],
    [{ deferredCount: 2 }, "Ожидает связанных данных: 2"],
    [{ pendingCount: 3 }, "Ожидает сохранения: 3"],
    [{ syncing: true }, "Ожидает сохранения"],
  ])("renders each transient synchronization state", async (sync, label) => {
    await setNotifications([]);
    await setSync(sync);
    const { wrapper } = await mountStatus();
    expect(wrapper.get(".sync-status").text()).toBe(label);
  });
});
