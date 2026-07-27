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
    dismissSyncNotification: vi.fn().mockResolvedValue(undefined),
    setMockSyncNotifications: (notifications: SyncNotification[]) => {
      state.syncNotifications = notifications;
      state.sync.permanentNotificationCount = notifications.length;
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

async function mountStatus() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { template: "<div />" } }],
  });
  await router.push("/");
  await router.isReady();
  return mount(SyncStatus, { global: { plugins: [router] } });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await setNotifications(Array.from({ length: 11 }, (_, index) => notification(index + 1)));
});

describe("SyncStatus", () => {
  it("clamps the current page when a larger page size reduces the page count", async () => {
    const wrapper = await mountStatus();
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
});
