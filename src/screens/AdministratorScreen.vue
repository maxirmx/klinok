<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { normalizeRussianSearchText, type AccountProfile, type DirectoryProfileDto, type DirectoryUserDto, type Role, type RoleRequest, type RoleStatus } from "@klinok/contracts";
import AppIcon from "../components/AppIcon.vue";
import AppPaginator from "../components/AppPaginator.vue";
import ModalDialog from "../components/ModalDialog.vue";
import PendingCountBadge from "../components/PendingCountBadge.vue";
import PersonIdentity from "../components/PersonIdentity.vue";
import WorkspaceShell from "../components/WorkspaceShell.vue";
import {
  appState,
  decideRole,
  getConfig,
  loadAdministratorUsers,
  lookupAdministratorProfiles,
  logout,
  updateAdministratorUserProfile,
} from "../appStore";
import { administratorPendingRequestCount } from "../pendingApprovals";
import { useAlertStore } from "../stores/alert";

type AdvancedRole = Extract<Role, "doctor" | "administrator">;
type SortField = "name" | Role;
type SortDirection = "asc" | "desc";
type DecisionAction = "approve" | "reject" | "revoke" | "restore";
type AuditCategory = "request" | "approve" | "restore" | "reject" | "revoke" | "bootstrap";
type RoleActionTarget = Pick<RoleRequest, "accountId" | "requestId" | "revision" | "role" | "status">;

type AdministratorRow = DirectoryUserDto;

type AuditRow = {
  eventId: string;
  createdAt: string;
  category: AuditCategory;
  action: string;
  role: AdvancedRole;
  targetAccountId: string;
  actorAccountId: string;
  reason: string;
};

const props = defineProps<{ role: "administrator"; scenarioId: string }>();
const router = useRouter();
const alertStore = useAlertStore();
const displayedRoles: Role[] = ["owner", "doctor", "administrator"];
const advancedRoles: AdvancedRole[] = ["doctor", "administrator"];
const pageSizes = [10, 20, 50] as const;
const cabinetPageSizeKey = "klinok:admin-role-table-page-size";
const auditPageSizeKey = "klinok:admin-audit-page-size";
const isAudit = computed(() => props.scenarioId === "administrator-audit");

const search = ref("");
const pendingOnly = ref(false);
const sortField = ref<SortField>("name");
const sortDirection = ref<SortDirection>("asc");
const page = ref(1);
const pageSize = ref(readPageSize(cabinetPageSizeKey));
const users = ref<DirectoryUserDto[]>([]);
const userTotal = ref(0);
const directoryPendingRoleCount = ref<number | null>(null);
const usersLoading = ref(false);
let usersRefreshId = 0;
let directoryRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let directoryRefreshAttempts = 0;
const roleStatusOverrides = reactive(new Map<string, { status: RoleStatus; sourceStatus: RoleStatus }>());
const decision = ref<{ request: RoleActionTarget; action: DecisionAction; displayName: string } | null>(null);
const decisionReason = ref("");
const decisionBusy = ref(false);
const profileEdit = ref<DirectoryUserDto | null>(null);
const profileEditDraft = reactive({ firstName: "", patronymic: "", lastName: "" });
const profileEditError = ref("");
const profileEditBusy = ref(false);

const auditSearch = ref("");
const auditRole = ref<AdvancedRole | "">("");
const auditAction = ref<AuditCategory | "">("");
const auditPage = ref(1);
const auditPageSize = ref(readPageSize(auditPageSizeKey));
const auditProfiles = ref<Record<string, DirectoryProfileDto>>({});
let auditProfilesRefreshId = 0;

const roleLabels: Record<Role, string> = {
  owner: "Владелец",
  doctor: "Ветеринар",
  administrator: "Администратор",
};

const statusLabels: Record<RoleStatus, string> = {
  not_requested: "Не запрошена",
  pending: "Запрошена",
  approved: "Одобрена",
  rejected: "Отказ",
  revoked: "Отозвана",
};

const statusClasses: Record<RoleStatus, string> = {
  not_requested: "not-requested",
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
  revoked: "revoked",
};

function readPageSize(key: string): (typeof pageSizes)[number] {
  const stored = Number(localStorage.getItem(key));
  return pageSizes.includes(stored as (typeof pageSizes)[number])
    ? stored as (typeof pageSizes)[number]
    : 20;
}

function formatProfileName(profile?: Pick<AccountProfile, "firstName" | "patronymic" | "lastName"> | null): string {
  return [profile?.firstName, profile?.patronymic, profile?.lastName].filter(Boolean).join(" ");
}

function profileName(accountId: string): string {
  return auditProfiles.value[accountId]?.displayName
    || formatProfileName(appState.control.profiles.find((profile) => profile.accountId === accountId))
    || "ФИО не указано";
}

function normalize(value: string): string {
  return normalizeRussianSearchText(value);
}

const administratorRows = computed<AdministratorRow[]>(() => {
  return users.value.map((user) => ({
    ...user,
    roleStatuses: {
      ...user.roleStatuses,
      doctor: roleStatusOverrides.get(`${user.accountId}:doctor`)?.status ?? user.roleStatuses.doctor,
      administrator: roleStatusOverrides.get(`${user.accountId}:administrator`)?.status ?? user.roleStatuses.administrator,
    },
  }));
});
const pendingRoleCount = computed(() =>
  directoryPendingRoleCount.value ?? administratorPendingRequestCount(appState.control));
const localRoleRevision = computed(() => appState.control.allRoles
  .filter((request) => request.role === "doctor" || request.role === "administrator")
  .map((request) => `${request.accountId}:${request.role}:${request.requestId}:${request.status}`)
  .sort()
  .join("|"));
const mayEditProfiles = computed(() => appState.session.accountId === getConfig()?.bootstrapAccountId
  && appState.activeRole === "administrator");

function clearDirectoryRefreshTimer() {
  if (directoryRefreshTimer !== null) clearTimeout(directoryRefreshTimer);
  directoryRefreshTimer = null;
}

function directorySnapshotMayBeStale(): boolean {
  if (directoryPendingRoleCount.value === null) return true;
  if (administratorPendingRequestCount(appState.control) !== directoryPendingRoleCount.value) return true;
  const localRoles = new Map(appState.control.allRoles.map((request) => [`${request.accountId}:${request.role}`, request.status]));
  return users.value.some((user) => advancedRoles.some((role) =>
    localRoles.get(`${user.accountId}:${role}`) === "pending" && user.roleStatuses[role] !== "pending"));
}

function scheduleDirectoryRefresh(delay = 0) {
  if (directoryRefreshTimer !== null || directoryRefreshAttempts <= 0 || isAudit.value) return;
  directoryRefreshTimer = setTimeout(async () => {
    directoryRefreshTimer = null;
    directoryRefreshAttempts -= 1;
    await refreshUsers();
    if (directoryRefreshAttempts > 0 && directorySnapshotMayBeStale()) {
      scheduleDirectoryRefresh(500);
    } else {
      directoryRefreshAttempts = 0;
    }
  }, delay);
}

function changeSort(field: SortField) {
  if (sortField.value === field) sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
  else {
    sortField.value = field;
    sortDirection.value = "asc";
  }
}

function sortAria(field: SortField): "ascending" | "descending" | "none" {
  if (sortField.value !== field) return "none";
  return sortDirection.value === "asc" ? "ascending" : "descending";
}

function isBootstrapAdministrator(request: RoleActionTarget): boolean {
  return request.role === "administrator" && request.accountId === getConfig()?.bootstrapAccountId;
}

function requestFor(row: AdministratorRow, role: Role): RoleActionTarget | undefined {
  if (role === "owner") return undefined;
  const request = row.roleRequests[role];
  return !request || request.status === "not_requested" ? undefined : { accountId: row.accountId, ...request };
}

async function refreshUsers() {
  if (isAudit.value) return;
  const refreshId = ++usersRefreshId;
  usersLoading.value = true;
  try {
    const result = await loadAdministratorUsers(
      search.value,
      pendingOnly.value,
      page.value,
      pageSize.value,
      sortField.value,
      sortDirection.value,
    );
    if (refreshId !== usersRefreshId) return;
    users.value = result.items;
    userTotal.value = result.total;
    directoryPendingRoleCount.value = result.pendingCount ?? null;
    for (const user of result.items) {
      for (const role of advancedRoles) {
        const key = `${user.accountId}:${role}`;
        const override = roleStatusOverrides.get(key);
        if (override && (override.status === user.roleStatuses[role] || override.sourceStatus !== user.roleStatuses[role])) {
          roleStatusOverrides.delete(key);
        }
      }
    }
    if (page.value !== result.page) page.value = result.page;
  } catch (reason) {
    if (refreshId === usersRefreshId) alertStore.error(reason, "Не удалось загрузить список пользователей.");
  } finally {
    if (refreshId === usersRefreshId) usersLoading.value = false;
  }
}

function openProfileEdit(user: DirectoryUserDto) {
  profileEdit.value = user;
  profileEditDraft.firstName = user.firstName;
  profileEditDraft.patronymic = user.patronymic ?? "";
  profileEditDraft.lastName = user.lastName;
  profileEditError.value = "";
}

function closeProfileEdit() {
  if (profileEditBusy.value) return;
  profileEdit.value = null;
  profileEditError.value = "";
}

async function submitProfileEdit() {
  if (!profileEdit.value || profileEditBusy.value) return;
  const firstName = profileEditDraft.firstName.trim();
  const patronymic = profileEditDraft.patronymic.trim();
  const lastName = profileEditDraft.lastName.trim();
  if (!firstName || !lastName) {
    profileEditError.value = "Имя и фамилия обязательны.";
    return;
  }
  profileEditError.value = "";
  profileEditBusy.value = true;
  try {
    await updateAdministratorUserProfile(profileEdit.value.accountId, {
      firstName,
      lastName,
      expectedRevision: profileEdit.value.revision,
      ...(patronymic ? { patronymic } : {}),
    });
    profileEdit.value = null;
    alertStore.success("ФИО пользователя изменено.");
    await refreshUsers();
  } catch (reason) {
    profileEditError.value = reason instanceof Error && /[А-Яа-яЁё]/.test(reason.message)
      ? reason.message
      : "Не удалось изменить ФИО пользователя.";
    await refreshUsers();
    const currentProfile = users.value.find((user) => user.accountId === profileEdit.value?.accountId);
    if (currentProfile) profileEdit.value = currentProfile;
  } finally {
    profileEditBusy.value = false;
  }
}

function openDecision(row: AdministratorRow, role: Role, action: DecisionAction) {
  const request = requestFor(row, role);
  if (!request) return;
  decisionReason.value = "";
  decision.value = { request, action, displayName: row.displayName };
}

const decisionTitle = computed(() => {
  if (!decision.value) return "";
  const role = roleLabels[decision.value.request.role as AdvancedRole];
  if (decision.value.action === "approve") return `Одобрить роль «${role}»?`;
  if (decision.value.action === "restore") return `Восстановить роль «${role}»?`;
  if (decision.value.action === "reject") return `Отклонить запрос роли «${role}»?`;
  return `Отозвать роль «${role}»?`;
});

const decisionConfirmLabel = computed(() => {
  if (decision.value?.action === "approve") return "Одобрить";
  if (decision.value?.action === "restore") return "Восстановить";
  if (decision.value?.action === "reject") return "Отклонить";
  return "Отозвать";
});

const destructiveDecision = computed(() => decision.value?.action === "reject" || decision.value?.action === "revoke");

async function submitDecision() {
  if (!decision.value || decisionBusy.value) return;
  decisionBusy.value = true;
  alertStore.clear();
  const current = decision.value;
  try {
    const latestUser = (await loadAdministratorUsers(
      current.request.accountId,
      false,
      1,
      50,
      "name",
      "asc",
    )).items.find((user) => user.accountId === current.request.accountId);
    const latestRequest = latestUser?.roleRequests[current.request.role];
    if (!latestUser || !latestRequest || latestRequest.requestId !== current.request.requestId
      || latestRequest.revision !== current.request.revision || latestRequest.status !== current.request.status) {
      throw new Error("Статус заявки изменился. Закройте окно и повторите действие с обновлённым списком.");
    }
    const status = current.action === "reject"
      ? "rejected"
      : current.action === "revoke"
        ? "revoked"
        : "approved";
    await decideRole(
      current.request,
      status,
      destructiveDecision.value && decisionReason.value.trim() ? decisionReason.value.trim() : undefined,
    );
    roleStatusOverrides.set(`${current.request.accountId}:${current.request.role}`, {
      status,
      sourceStatus: current.request.status,
    });
    alertStore.success(current.action === "approve"
      ? "Роль одобрена."
      : current.action === "restore"
        ? "Роль восстановлена."
        : current.action === "reject"
          ? "Запрос отклонён."
          : "Роль отозвана.");
    decision.value = null;
    decisionReason.value = "";
    await refreshUsers();
  } catch (reason) {
    alertStore.error(reason, "Операция не выполнена.");
  } finally {
    decisionBusy.value = false;
  }
}

const auditRows = computed<AuditRow[]>(() => appState.control.roleAudit.map((entry) => ({
  eventId: entry.blockHash,
  createdAt: entry.createdAt,
  category: entry.category,
  action: entry.action,
  role: entry.role as AdvancedRole,
  targetAccountId: entry.targetAccountId,
  actorAccountId: entry.actorAccountId,
  reason: entry.reason,
})));

const filteredAuditRows = computed(() => {
  const query = normalize(auditSearch.value);
  return auditRows.value.filter((row) => {
    if (auditRole.value && row.role !== auditRole.value) return false;
    if (auditAction.value && row.category !== auditAction.value) return false;
    if (!query) return true;
    return [
      profileName(row.targetAccountId),
      row.targetAccountId,
      profileName(row.actorAccountId),
      row.actorAccountId,
    ].some((value) => normalize(value).includes(query));
  });
});

const auditPageCount = computed(() => Math.max(1, Math.ceil(filteredAuditRows.value.length / auditPageSize.value)));
const pagedAuditRows = computed(() =>
  filteredAuditRows.value.slice((auditPage.value - 1) * auditPageSize.value, auditPage.value * auditPageSize.value),
);

async function refreshAuditProfiles(): Promise<void> {
  if (!isAudit.value) return;
  const refreshId = ++auditProfilesRefreshId;
  const accountIds = [...new Set(auditRows.value.flatMap((row) => [row.targetAccountId, row.actorAccountId]))];
  try {
    const profiles = await lookupAdministratorProfiles(accountIds);
    if (refreshId !== auditProfilesRefreshId) return;
    auditProfiles.value = Object.fromEntries(profiles.map((profile) => [profile.accountId, profile]));
  } catch (reason) {
    if (refreshId === auditProfilesRefreshId) {
      alertStore.error(reason, "Не удалось загрузить ФИО для журнала действий.");
    }
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

async function signOut() {
  if (await logout()) await router.replace("/auth/login");
}

watch([search, pendingOnly, sortField, sortDirection, page, pageSize, isAudit], (current, previous) => {
  if (isAudit.value) {
    clearDirectoryRefreshTimer();
    usersRefreshId += 1;
    usersLoading.value = false;
    return;
  }

  if (previous) {
    const [prevSearch, prevPendingOnly, prevSortField, prevSortDirection, , prevPageSize] = previous;
    const shouldResetPage = current[0] !== prevSearch
      || current[1] !== prevPendingOnly
      || current[2] !== prevSortField
      || current[3] !== prevSortDirection
      || current[5] !== prevPageSize;
    if (shouldResetPage && page.value !== 1) {
      page.value = 1;
      return;
    }
  }

  void refreshUsers();
}, { immediate: true });
watch(localRoleRevision, () => {
  directoryRefreshAttempts = 60;
  clearDirectoryRefreshTimer();
  scheduleDirectoryRefresh();
});
watch(pendingRoleCount, (count) => { if (!count) pendingOnly.value = false; });
watch(pageSize, (value) => localStorage.setItem(cabinetPageSizeKey, String(value)));
watch([auditSearch, auditRole, auditAction, auditPageSize], () => { auditPage.value = 1; });
watch(auditPageSize, (value) => localStorage.setItem(auditPageSizeKey, String(value)));
watch(auditPageCount, (count) => { if (auditPage.value > count) auditPage.value = count; });
watch(
  [isAudit, () => auditRows.value.flatMap((row) => [row.targetAccountId, row.actorAccountId]).join("|")],
  () => { void refreshAuditProfiles(); },
  { immediate: true },
);
onBeforeUnmount(clearDirectoryRefreshTimer);
</script>

<template>
  <WorkspaceShell
    :role="role"
    title="Кабинет администратора"
    :profile-name="formatProfileName(appState.control.profile)"
    :administrator-pending-count="directoryPendingRoleCount ?? undefined"
    @sign-out="signOut"
  >
    <section v-if="!isAudit" class="administrator-page">
      <article class="panel administrator-panel">
        <div class="administrator-heading">
          <div>
            <h2>Пользователи</h2>
            <p>Просматривайте пользователей и управляйте расширенными ролями.</p>
          </div>
          <RouterLink
            class="outline-action inline administrator-audit-link administrator-icon-action"
            to="/admin/audit"
            title="Открыть журнал действий"
            aria-label="Открыть журнал действий"
          >
            <AppIcon name="book" />
          </RouterLink>
        </div>

        <div class="administrator-user-filters">
          <label class="administrator-search">
            <span>ФИО или идентификатор</span>
            <span class="administrator-search-control">
              <AppIcon name="search" />
              <input v-model="search" type="search" placeholder="Поиск" />
            </span>
          </label>

          <div class="administrator-role-filters" role="group" aria-label="Фильтр пользователей по ожидающим решениям">
            <button
              type="button"
              class="neutral"
              :class="{ active: !pendingOnly }"
              :aria-pressed="!pendingOnly"
              @click="pendingOnly = false"
            >
              Все
            </button>
            <button
              type="button"
              class="pending"
              :class="{ active: pendingOnly }"
              :aria-label="`Требуют решения: ${pendingRoleCount}`"
              :aria-pressed="pendingOnly"
              :disabled="!pendingRoleCount"
              @click="pendingOnly = true"
            >
              Требуют решения
              <PendingCountBadge :count="pendingRoleCount" />
            </button>
          </div>
        </div>

        <p v-if="usersLoading && !administratorRows.length" class="administrator-empty">Загрузка пользователей…</p>
        <p v-else-if="!administratorRows.length && !search && !pendingOnly" class="administrator-empty">Пользователей пока нет.</p>
        <p v-else-if="!administratorRows.length" class="administrator-empty">
          {{ pendingOnly ? "Ожидающие решения по выбранным условиям не найдены." : "Пользователи с таким ФИО или идентификатором не найдены." }}
        </p>
        <template v-else>
          <div class="administrator-table-wrap">
            <table class="administrator-table administrator-role-table">
              <thead>
                <tr>
                  <th :aria-sort="sortAria('name')">
                    <button type="button" @click="changeSort('name')">
                      ФИО
                      <AppIcon name="chevron-down" :class="{ descending: sortField === 'name' && sortDirection === 'desc' }" />
                    </button>
                  </th>
                  <th :aria-sort="sortAria('owner')">
                    <button type="button" @click="changeSort('owner')">
                      Владелец
                      <AppIcon name="chevron-down" :class="{ descending: sortField === 'owner' && sortDirection === 'desc' }" />
                    </button>
                  </th>
                  <th :aria-sort="sortAria('doctor')">
                    <button type="button" @click="changeSort('doctor')">
                      Ветеринар
                      <AppIcon name="chevron-down" :class="{ descending: sortField === 'doctor' && sortDirection === 'desc' }" />
                    </button>
                  </th>
                  <th :aria-sort="sortAria('administrator')">
                    <button type="button" @click="changeSort('administrator')">
                      Администратор
                      <AppIcon name="chevron-down" :class="{ descending: sortField === 'administrator' && sortDirection === 'desc' }" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in administratorRows" :key="row.accountId">
                  <td class="administrator-name" data-label="ФИО">
                    <div class="administrator-name-content">
                      <PersonIdentity :display-name="row.displayName" :account-id="row.accountId" />
                      <button
                        v-if="mayEditProfiles"
                        class="outline-action inline access-icon-action administrator-profile-edit"
                        type="button"
                        title="Изменить ФИО пользователя"
                        aria-label="Изменить ФИО пользователя"
                        @click="openProfileEdit(row)"
                      >
                        <AppIcon name="edit" />
                      </button>
                    </div>
                  </td>
                  <td
                    v-for="displayedRole in displayedRoles"
                    :key="displayedRole"
                    class="administrator-role-cell"
                    :data-label="roleLabels[displayedRole]"
                  >
                    <div class="administrator-role-content">
                      <span
                        class="status-badge"
                        :class="statusClasses[row.roleStatuses[displayedRole]]"
                      >
                        {{ statusLabels[row.roleStatuses[displayedRole]] }}
                      </span>
                      <div
                        v-if="requestFor(row, displayedRole) && !isBootstrapAdministrator(requestFor(row, displayedRole)!)"
                        class="administrator-role-actions"
                      >
                        <template v-if="requestFor(row, displayedRole)?.status === 'pending'">
                          <button
                            class="primary-action inline access-icon-action"
                            type="button"
                            :title="`Одобрить роль «${roleLabels[displayedRole]}»`"
                            :aria-label="`Одобрить роль «${roleLabels[displayedRole]}»`"
                            @click="openDecision(row, displayedRole, 'approve')"
                          >
                            <AppIcon name="check" />
                          </button>
                          <button
                            class="outline-action inline danger-outline access-icon-action"
                            type="button"
                            :title="`Отклонить запрос роли «${roleLabels[displayedRole]}»`"
                            :aria-label="`Отклонить запрос роли «${roleLabels[displayedRole]}»`"
                            @click="openDecision(row, displayedRole, 'reject')"
                          >
                            <AppIcon name="close" />
                          </button>
                        </template>
                        <button
                          v-else-if="requestFor(row, displayedRole)?.status === 'approved'"
                          class="outline-action inline danger-outline access-icon-action"
                          type="button"
                          :title="`Отозвать роль «${roleLabels[displayedRole]}»`"
                          :aria-label="`Отозвать роль «${roleLabels[displayedRole]}»`"
                          @click="openDecision(row, displayedRole, 'revoke')"
                        >
                          <AppIcon name="close" />
                        </button>
                        <button
                          v-else
                          class="primary-action inline access-icon-action"
                          type="button"
                          :title="`Восстановить роль «${roleLabels[displayedRole]}»`"
                          :aria-label="`Восстановить роль «${roleLabels[displayedRole]}»`"
                          @click="openDecision(row, displayedRole, 'restore')"
                        >
                          <AppIcon name="restore" />
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <AppPaginator
            v-model:page="page"
            v-model:page-size="pageSize"
            :total-items="userTotal"
            :page-sizes="pageSizes"
          />
        </template>
      </article>
    </section>

    <section v-else class="administrator-page">
      <article class="panel administrator-panel">
        <div class="administrator-heading">
          <div>
            <h2>Журнал действий с ролями</h2>
            <p>История запросов и решений.</p>
            <p
              class="status-badge"
              :class="appState.control.ledger.valid ? 'approved' : 'rejected'"
              :title="`Головной хеш: ${appState.control.ledger.headHash}`"
            >
              {{ appState.control.ledger.valid ? `Блокчейн проверен · блок ${appState.control.ledger.height}` : 'Блокчейн поврежден' }}
            </p>
          </div>
          <RouterLink
            class="outline-action inline administrator-audit-link administrator-icon-action"
            to="/admin/home"
            title="К управлению ролями"
            aria-label="К управлению ролями"
          >
            <AppIcon name="chevron-left" />
          </RouterLink>
        </div>

        <div class="administrator-audit-filters">
          <label class="administrator-search">
            <span>ФИО или идентификатор</span>
            <span class="administrator-search-control">
              <AppIcon name="search" />
              <input v-model="auditSearch" type="search" placeholder="Поиск" />
            </span>
          </label>
          <label>
            <span>Роль</span>
            <select v-model="auditRole">
              <option value="">Все роли</option>
              <option value="doctor">Ветеринар</option>
              <option value="administrator">Администратор</option>
            </select>
          </label>
          <label>
            <span>Действие</span>
            <select v-model="auditAction">
              <option value="">Все действия</option>
              <option value="request">Запрос</option>
              <option value="approve">Одобрение</option>
              <option value="restore">Восстановление</option>
              <option value="reject">Отказ</option>
              <option value="revoke">Отзыв или приостановка</option>
              <option value="bootstrap">Инициализация</option>
            </select>
          </label>
        </div>

        <p v-if="!auditRows.length" class="administrator-empty">Действий с расширенными ролями пока нет.</p>
        <p v-else-if="!filteredAuditRows.length" class="administrator-empty">Действия по выбранным условиям не найдены.</p>
        <template v-else>
          <div class="administrator-table-wrap">
            <table class="administrator-table administrator-audit-table">
              <thead>
                <tr>
                  <th>Дата и время</th>
                  <th>Пользователь</th>
                  <th>Действие</th>
                  <th>Роль</th>
                  <th>Администратор</th>
                  <th>Причина</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in pagedAuditRows" :key="row.eventId">
                  <td data-label="Дата и время"><time :datetime="row.createdAt">{{ formatDate(row.createdAt) }}</time></td>
                  <td class="administrator-name" data-label="Пользователь">
                    <PersonIdentity
                      :display-name="profileName(row.targetAccountId)"
                      :account-id="row.targetAccountId"
                    />
                  </td>
                  <td data-label="Действие">{{ row.action }}</td>
                  <td data-label="Роль">{{ roleLabels[row.role] }}</td>
                  <td class="administrator-name" data-label="Администратор">
                    <PersonIdentity
                      :display-name="profileName(row.actorAccountId)"
                      :account-id="row.actorAccountId"
                    />
                  </td>
                  <td :class="{ 'is-empty': !row.reason }" data-label="Причина">{{ row.reason }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <AppPaginator
            v-model:page="auditPage"
            v-model:page-size="auditPageSize"
            :total-items="filteredAuditRows.length"
            :page-sizes="pageSizes"
            aria-label="Навигация по журналу"
          />
        </template>
      </article>
    </section>

    <ModalDialog
      :model-value="Boolean(profileEdit)"
      title="Изменить ФИО"
      :busy="profileEditBusy"
      @update:model-value="closeProfileEdit"
    >
      <template #description>
        <PersonIdentity
          v-if="profileEdit"
          :display-name="profileEdit.displayName"
          :account-id="profileEdit.accountId"
        />
      </template>
      <form class="form-stack administrator-profile-edit-form" @submit.prevent="submitProfileEdit">
        <p v-if="profileEditError" class="form-alert error" role="alert">{{ profileEditError }}</p>
        <label>
          <span>Имя</span>
          <input v-model="profileEditDraft.firstName" type="text" autocomplete="off" required />
        </label>
        <label>
          <span>Отчество</span>
          <input v-model="profileEditDraft.patronymic" type="text" autocomplete="off" />
        </label>
        <label>
          <span>Фамилия</span>
          <input v-model="profileEditDraft.lastName" type="text" autocomplete="off" required />
        </label>
        <div class="confirmation-dialog-actions">
          <button class="outline-action inline" type="button" :disabled="profileEditBusy" @click="closeProfileEdit">
            Отмена
          </button>
          <button class="primary-action inline" type="submit" :disabled="profileEditBusy">
            {{ profileEditBusy ? 'Сохранение…' : 'Сохранить' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog
      :model-value="Boolean(decision)"
      :title="decisionTitle"
      :busy="decisionBusy"
      :role="destructiveDecision ? 'alertdialog' : 'dialog'"
      @update:model-value="decision = null"
    >
      <template #description>
        <PersonIdentity
          v-if="decision"
          :display-name="decision.displayName"
          :account-id="decision.request.accountId"
        />
      </template>
      <form class="form-stack administrator-decision-form" @submit.prevent="submitDecision">
        <label v-if="destructiveDecision">
          <span>Причина, необязательно</span>
          <textarea v-model="decisionReason" rows="3" />
        </label>
        <div class="confirmation-dialog-actions">
          <button class="outline-action inline" type="button" :disabled="decisionBusy" @click="decision = null">
            Отмена
          </button>
          <button
            class="primary-action inline"
            :class="{ danger: destructiveDecision }"
            type="submit"
            :disabled="decisionBusy"
          >
            {{ decisionBusy ? 'Сохранение…' : decisionConfirmLabel }}
          </button>
        </div>
      </form>
    </ModalDialog>
  </WorkspaceShell>
</template>
