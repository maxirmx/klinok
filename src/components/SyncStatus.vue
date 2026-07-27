<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { appState, dismissSyncNotification } from "../appStore";
import { syncActionText, syncNotificationText, syncOperationText } from "../russianMessages";
import type { SyncNotification } from "../repositories/eventTransport";
import AppIcon from "./AppIcon.vue";
import AppPaginator from "./AppPaginator.vue";
import ModalDialog from "./ModalDialog.vue";

const router = useRouter();
const notificationsOpen = ref(false);
const page = ref(1);
const pageSize = ref(5);
const unreadNotifications = computed(() => (appState.syncNotifications ?? []).filter((item) => !item.dismissedAt));
const visibleNotifications = computed(() => unreadNotifications.value.slice(
  (page.value - 1) * pageSize.value,
  page.value * pageSize.value,
));

watch([() => unreadNotifications.value.length, pageSize], ([notificationCount, selectedPageSize]) => {
  const pageCount = Math.max(1, Math.ceil(notificationCount / selectedPageSize));
  if (page.value > pageCount) page.value = pageCount;
});

const status = computed(() => {
  if (!appState.repositoryConnected) return {
    kind: "error",
    label: "Нет соединения",
    title: "Подключение к хранилищу не установлено.",
    actionable: false,
  };
  const permanentNotificationCount = appState.sync.permanentNotificationCount ?? appState.sync.failedCount ?? 0;
  if (permanentNotificationCount) return {
    kind: "error",
    label: `Не сохранено: ${permanentNotificationCount}`,
    title: "Некоторые изменения отменены. Откройте уведомления о синхронизации.",
    actionable: true,
  };
  if (appState.sync.connectionState === "disconnected") return {
    kind: "error",
    label: "Нет соединения",
    title: "Изменения останутся на устройстве до восстановления соединения.",
    actionable: false,
  };
  if (appState.sync.connectionState === "error" || appState.sync.lastError) return {
    kind: "error",
    label: "Ошибка синхронизации",
    title: "Синхронизация временно недоступна. Приложение повторит попытку автоматически.",
    actionable: false,
  };
  if (appState.sync.deferredCount) return {
    kind: "pending",
    label: `Ожидает связанных данных: ${appState.sync.deferredCount}`,
    title: "Изменения будут сохранены автоматически после получения связанных данных.",
    actionable: false,
  };
  if (appState.sync.pendingCount || appState.sync.syncing) return {
    kind: "pending",
    label: appState.sync.pendingCount ? `Ожидает сохранения: ${appState.sync.pendingCount}` : "Ожидает сохранения",
    title: "Изменения сохранены на устройстве и ожидают подтверждения.",
    actionable: false,
  };
  return {
    kind: "saved",
    label: "Сохранено",
    title: "Все изменения подтверждены.",
    actionable: false,
  };
});

function formattedDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function dismiss(notificationId: string): Promise<void> {
  await dismissSyncNotification(notificationId);
  if (!unreadNotifications.value.length) notificationsOpen.value = false;
}

async function performAction(notification: Readonly<Pick<SyncNotification, "relatedRoute" | "action">>): Promise<void> {
  if (!notification.relatedRoute || notification.action === "none") return;
  notificationsOpen.value = false;
  await router.push(notification.relatedRoute);
}
</script>

<template>
  <button
    v-if="status.actionable"
    type="button"
    class="sync-status sync-status-button"
    :class="status.kind"
    :title="status.title"
    aria-label="Открыть уведомления о синхронизации"
    @click="notificationsOpen = true"
  >
    <span aria-hidden="true"></span>{{ status.label }}
  </button>
  <span v-else class="sync-status" :class="status.kind" role="status" :title="status.title">
    <span aria-hidden="true"></span>{{ status.label }}
  </span>

  <ModalDialog
    v-model="notificationsOpen"
    title="Уведомления о синхронизации"
    description="Здесь показаны изменения, которые не были сохранены и уже отменены на этом устройстве."
  >
    <div v-if="visibleNotifications.length" class="sync-notification-list">
      <article v-for="notification in visibleNotifications" :key="notification.notificationId" class="sync-notification">
        <header>
          <div>
            <h3>Изменение не сохранено</h3>
            <strong>{{ syncOperationText(notification.eventType) }}</strong>
          </div>
          <time :datetime="notification.createdAt">{{ formattedDate(notification.createdAt) }}</time>
        </header>
        <p>{{ syncNotificationText(notification) }}</p>
        <details>
          <summary>Технические сведения</summary>
          <dl>
            <div><dt>Код</dt><dd>{{ notification.code }}</dd></div>
            <div><dt>Код диагностики</dt><dd>{{ notification.diagnosticId }}</dd></div>
          </dl>
        </details>
        <div class="sync-notification-actions">
          <button
            v-if="notification.action !== 'none' && notification.relatedRoute"
            type="button"
            class="outline-action inline"
            @click="performAction(notification)"
          >
            {{ syncActionText(notification.action) }}
          </button>
          <button type="button" class="primary-action inline" @click="dismiss(notification.notificationId)">Понятно</button>
        </div>
      </article>
    </div>
    <p v-else>Новых уведомлений нет.</p>
    <AppPaginator
      v-if="unreadNotifications.length > pageSize"
      v-model:page="page"
      v-model:page-size="pageSize"
      :total-items="unreadNotifications.length"
      :page-sizes="[5, 10, 20]"
      page-size-label="Уведомлений на странице"
      aria-label="Страницы уведомлений о синхронизации"
    />
    <div class="confirmation-dialog-actions">
      <button type="button" class="outline-action" @click="notificationsOpen = false">
        <AppIcon name="close" /> Закрыть
      </button>
    </div>
  </ModalDialog>
</template>
