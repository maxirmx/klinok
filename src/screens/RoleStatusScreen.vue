<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { Role, RoleStatus } from "@klinok/contracts";
import AppIcon from "../components/AppIcon.vue";
import ConfirmationDialog from "../components/ConfirmationDialog.vue";
import PasswordInput from "../components/PasswordInput.vue";
import PersonIdentity from "../components/PersonIdentity.vue";
import RoleSelectionCards from "../components/RoleSelectionCards.vue";
import SyncStatus from "../components/SyncStatus.vue";
import WorkspaceShell from "../components/WorkspaceShell.vue";
import { useAlertStore } from "../stores/alert";
import {
  appState,
  cancelRole,
  deleteAccount,
  getDeviceName,
  getConfig,
  logout,
  renameDevice,
  requestRole,
  revokeDevice,
  switchRole,
  updateCredentials,
  updateProfile,
} from "../appStore";

type ProfileValues = { firstName: string; lastName: string; patronymic: string };

const route = useRoute();
const router = useRouter();
const alertStore = useAlertStore();
const statuses: Record<RoleStatus, string> = {
  not_requested: "Не запрошена", pending: "Ожидает решения", approved: "Одобрена", rejected: "Отклонена",
  revoked: "Отозвана",
};
const requests = computed(() => new Map(appState.control.roles.map((request) => [request.role, request])));
const roleStatuses = computed<Partial<Record<Role, RoleStatus | "not_requested">>>(() => ({
  owner: requests.value.get("owner")?.status ?? "not_requested",
  doctor: requests.value.get("doctor")?.status ?? "not_requested",
  administrator: requests.value.get("administrator")?.status ?? "not_requested",
}));
const disabledRoleSelection = computed<Role[]>(() => (["owner", "doctor", "administrator"] as Role[])
  .filter((role) => requests.value.get(role)?.status !== "approved"));
const accountDeletionConfirmation = ref(false);
const devicePendingRevocation = ref<{ deviceId: string; deviceName: string } | null>(null);
const deviceSavingId = ref("");
const deviceSaving = computed(() => Boolean(deviceSavingId.value));
const deviceDrafts = reactive<Record<string, string>>({});
const savedDeviceNames = reactive<Record<string, string>>({});
const deviceErrors = reactive<Record<string, string>>({});
const formError = ref("");
const profileDraft = reactive<ProfileValues>({ firstName: "", lastName: "", patronymic: "" });
const savedProfile = reactive<ProfileValues>({ firstName: "", lastName: "", patronymic: "" });
const credentialsDraft = reactive({ email: "", password: "", confirmPassword: "" });
const savedEmail = ref("");
const savedEmailDisplay = ref("");
const normalizedProfileDraft = computed<ProfileValues>(() => ({
  firstName: profileDraft.firstName.trim(),
  lastName: profileDraft.lastName.trim(),
  patronymic: profileDraft.patronymic.trim(),
}));
const profileName = computed(() => [
  savedProfile.firstName,
  savedProfile.patronymic,
  savedProfile.lastName,
].filter(Boolean).join(" "));
const profileCanSave = computed(() => {
  const draft = normalizedProfileDraft.value;
  return Boolean(draft.firstName && draft.lastName) && (
    draft.firstName !== savedProfile.firstName
    || draft.lastName !== savedProfile.lastName
    || draft.patronymic !== savedProfile.patronymic
  );
});
const profileCanRestore = computed(() => (
  profileDraft.firstName !== savedProfile.firstName
  || profileDraft.lastName !== savedProfile.lastName
  || profileDraft.patronymic !== savedProfile.patronymic
));
const normalizedEmailDraft = computed(() => credentialsDraft.email.trim().toLocaleLowerCase());
const credentialsCanSave = computed(() => {
  const password = credentialsDraft.password;
  const passwordValid = password
    ? password.length >= 6 && password.length <= 128 && password === credentialsDraft.confirmPassword
    : !credentialsDraft.confirmPassword;
  const hasChanges = normalizedEmailDraft.value !== savedEmail.value || Boolean(password);
  return normalizedEmailDraft.value.includes("@") && passwordValid && hasChanges;
});
const credentialsCanRestore = computed(() => (
  credentialsDraft.email !== savedEmailDisplay.value
  || Boolean(credentialsDraft.password)
  || Boolean(credentialsDraft.confirmPassword)
));
const visibleDevices = computed(() => (appState.session.devices ?? [])
  .filter((device) => device.status === "active"));
const canRevokeDevice = computed(() => visibleDevices.value.length > 1);
const isBootstrapAccount = computed(() => Boolean(
  appState.session.accountId
  && appState.session.accountId === getConfig()?.bootstrapAccountId,
));

const deviceName = (device: { deviceId: string; deviceName?: string }) => device.deviceName?.trim()
  || (device.deviceId === appState.session.device?.deviceId ? getDeviceName() : null)
  || "Устройство без названия";

watch(visibleDevices, (devices) => {
  const visibleIds = new Set(devices.map((device) => device.deviceId));
  for (const device of devices) {
    const nextName = deviceName(device);
    const previousName = savedDeviceNames[device.deviceId];
    if (deviceDrafts[device.deviceId] === undefined || deviceDrafts[device.deviceId] === previousName) {
      deviceDrafts[device.deviceId] = nextName;
    }
    savedDeviceNames[device.deviceId] = nextName;
  }
  for (const deviceId of Object.keys(savedDeviceNames)) {
    if (visibleIds.has(deviceId)) continue;
    delete savedDeviceNames[deviceId];
    delete deviceDrafts[deviceId];
    delete deviceErrors[deviceId];
  }
}, { immediate: true });

function deviceCanSave(deviceId: string): boolean {
  const value = deviceDrafts[deviceId]?.trim() ?? "";
  return Boolean(value && value.length <= 80 && value !== savedDeviceNames[deviceId]);
}

function deviceCanRestore(deviceId: string): boolean {
  return (deviceDrafts[deviceId] ?? "") !== (savedDeviceNames[deviceId] ?? "");
}

function restoreDeviceName(deviceId: string) {
  deviceDrafts[deviceId] = savedDeviceNames[deviceId] ?? "";
  deviceErrors[deviceId] = "";
}

function sameProfile(left: ProfileValues, right: ProfileValues): boolean {
  return left.firstName === right.firstName
    && left.lastName === right.lastName
    && left.patronymic === right.patronymic;
}

function synchronizeProfileDraft() {
  const profile = appState.control.profile;
  const values: ProfileValues = {
    firstName: profile?.firstName ?? "",
    lastName: profile?.lastName ?? "",
    patronymic: profile?.patronymic ?? "",
  };
  const draftIsPristine = sameProfile(profileDraft, savedProfile);
  Object.assign(savedProfile, values);
  if (draftIsPristine) Object.assign(profileDraft, values);
}

watch(() => appState.control.profile, synchronizeProfileDraft, { immediate: true });
watch(() => appState.session.email, (email) => {
  credentialsDraft.email = email ?? "";
  savedEmailDisplay.value = email ?? "";
  savedEmail.value = email?.trim().toLocaleLowerCase() ?? "";
}, { immediate: true });

function restoreProfile() {
  Object.assign(profileDraft, savedProfile);
  formError.value = "";
}

function restoreCredentials() {
  credentialsDraft.email = savedEmailDisplay.value;
  credentialsDraft.password = "";
  credentialsDraft.confirmPassword = "";
  formError.value = "";
}

async function signOut(all = false) {
  if (await logout(all)) await router.replace("/auth/login");
}

async function copyAccountId() {
  const accountId = appState.session.accountId;
  if (!accountId) return;
  await action("Идентификатор пользователя скопирован.", async () => {
    await navigator.clipboard.writeText(accountId);
  });
}

async function action(success: string, task: () => Promise<unknown>) {
  alertStore.clear();
  try {
    await task();
    alertStore.success(success);
    return true;
  } catch (reason) {
    alertStore.error(reason, "Не удалось сохранить изменения.");
    return false;
  }
}

async function saveProfile() {
  const { firstName, lastName, patronymic } = normalizedProfileDraft.value;
  if (!firstName || !lastName) {
    formError.value = "Имя и фамилия обязательны.";
    return;
  }
  formError.value = "";
  const saved = await action("Изменения профиля сохранены.", async () => {
    await updateProfile({ firstName, lastName, patronymic });
  });
  if (saved) {
    Object.assign(savedProfile, { firstName, lastName, patronymic });
    Object.assign(profileDraft, { firstName, lastName, patronymic });
  }
}

async function saveCredentials() {
  const email = normalizedEmailDraft.value;
  if (!email.includes("@")) {
    formError.value = "Введите корректный адрес электронной почты.";
    return;
  }
  if (credentialsDraft.password !== credentialsDraft.confirmPassword) {
    formError.value = "Пароли не совпадают.";
    return;
  }
  if (credentialsDraft.password && (credentialsDraft.password.length < 6 || credentialsDraft.password.length > 128)) {
    formError.value = "Пароль должен содержать от 6 до 128 символов.";
    return;
  }

  const input = {
    ...(email !== savedEmail.value ? { email } : {}),
    ...(credentialsDraft.password ? { password: credentialsDraft.password } : {}),
  };
  if (!input.email && !input.password) {
    formError.value = "Измените адрес электронной почты или укажите новый пароль.";
    return;
  }
  formError.value = "";
  const successMessage = input.email && input.password
    ? "Электронная почта и пароль сохранены."
    : input.email ? "Электронная почта сохранена." : "Новый пароль сохранён.";
  const saved = await action(successMessage, () => updateCredentials(input));
  if (saved) {
    savedEmail.value = email;
    savedEmailDisplay.value = email;
    credentialsDraft.email = email;
    credentialsDraft.password = "";
    credentialsDraft.confirmPassword = "";
  }
}

async function activate(role: Role) {
  const changed = await action("Активная роль изменена.", async () => {
    await switchRole(role);
    if (typeof route.query.continue === "string" && route.query.switch === role) await router.push(route.query.continue);
  });
  if (!changed) return;
}

async function confirmAccountDeletion() {
  accountDeletionConfirmation.value = false;
  if (isBootstrapAccount.value) return;
  await action("Аккаунт удалён.", deleteAccount);
}

async function confirmDeviceRevocation() {
  const device = devicePendingRevocation.value;
  if (!device) return;
  devicePendingRevocation.value = null;
  await action("Устройство отозвано.", () => revokeDevice(device.deviceId));
}

async function saveDeviceName(deviceId: string) {
  if (deviceSaving.value) return;
  const name = deviceDrafts[deviceId]?.trim() ?? "";
  if (!name) {
    deviceErrors[deviceId] = "Введите название устройства.";
    return;
  }
  if (name.length > 80) {
    deviceErrors[deviceId] = "Название устройства не должно превышать 80 символов.";
    return;
  }
  deviceErrors[deviceId] = "";
  deviceSavingId.value = deviceId;
  try {
    const saved = await action("Название устройства сохранено.", () => renameDevice(deviceId, name));
    if (saved) {
      savedDeviceNames[deviceId] = name;
      deviceDrafts[deviceId] = name;
    }
  } finally {
    deviceSavingId.value = "";
  }
}
</script>

<template>
  <WorkspaceShell :role="appState.activeRole" title="Настройки" :profile-name="profileName" settings @sign-out="signOut()">
    <div class="profile-page">
      <div class="profile-layout">
      <section class="panel profile-section">
        <div class="profile-section-heading">
          <div><h2>Личные данные</h2><p>Измените личные данные.</p></div>
          <div class="profile-section-actions">
            <button
              class="primary-action inline profile-icon-action"
              type="submit"
              form="profile-form"
              :disabled="appState.busy || !profileCanSave"
              title="Сохранить личные данные"
              aria-label="Сохранить личные данные"
            >
              <AppIcon name="check" />
            </button>
            <button
              class="outline-action inline profile-icon-action"
              type="button"
              :disabled="appState.busy || !profileCanRestore"
              title="Восстановить личные данные"
              aria-label="Восстановить личные данные"
              @click="restoreProfile"
            >
              <AppIcon name="restore" />
            </button>
          </div>
        </div>
        <form id="profile-form" class="form-stack profile-form" @submit.prevent="saveProfile">
          <label><span>Имя</span><input v-model="profileDraft.firstName" autocomplete="given-name" required /></label>
          <label><span>Отчество, если есть</span><input v-model="profileDraft.patronymic" autocomplete="additional-name" /></label>
          <label><span>Фамилия</span><input v-model="profileDraft.lastName" autocomplete="family-name" required /></label>
        </form>
      </section>

      <section class="panel profile-section">
        <div class="profile-section-heading">
          <div><h2>Электронная почта и пароль</h2><p>Для смены пароля подтвердите его повторным вводом.</p></div>
          <div class="profile-section-actions">
            <button
              class="primary-action inline profile-icon-action"
              type="submit"
              form="credentials-form"
              :disabled="appState.busy || !credentialsCanSave"
              title="Сохранить электронную почту и пароль"
              aria-label="Сохранить электронную почту и пароль"
            >
              <AppIcon name="check" />
            </button>
            <button
              class="outline-action inline profile-icon-action"
              type="button"
              :disabled="appState.busy || !credentialsCanRestore"
              title="Восстановить электронную почту и пароль"
              aria-label="Восстановить электронную почту и пароль"
              @click="restoreCredentials"
            >
              <AppIcon name="restore" />
            </button>
          </div>
        </div>
        <form id="credentials-form" class="form-stack credentials-form" @submit.prevent="saveCredentials">
          <label><span>Электронная почта</span><input v-model="credentialsDraft.email" type="email" autocomplete="email" required /></label>
          <PasswordInput v-model="credentialsDraft.password" label="Новый пароль — от 6 до 128 символов" minlength="6" maxlength="128" autocomplete="new-password" />
          <PasswordInput v-model="credentialsDraft.confirmPassword" label="Повторите новый пароль" minlength="6" maxlength="128" autocomplete="new-password" />
          <p v-if="credentialsDraft.confirmPassword && credentialsDraft.password !== credentialsDraft.confirmPassword" class="field-error" role="alert">Пароли не совпадают.</p>
        </form>
      </section>

      <p v-if="formError" class="field-error profile-form-validation" role="alert">{{ formError }}</p>

      <section id="roles" class="panel profile-section profile-roles">
        <div class="profile-section-heading"><div><h2>Роли и доступ</h2><p>Измените активную роль или отправьте запрос на новую.</p></div></div>
        <RoleSelectionCards
          :model-value="appState.activeRole"
          :status-by-role="roleStatuses"
          :disabled-roles="disabledRoleSelection"
          include-administrator
          @update:model-value="activate"
        >
          <template #meta="{ role }">
            <div class="role-status-badges">
              <span class="status-badge" :class="requests.get(role)?.status ?? 'not_requested'">{{ statuses[requests.get(role)?.status ?? 'not_requested'] }}</span>
              <span v-if="appState.activeRole === role" class="status-badge active">Активная</span>
            </div>
          </template>
          <template #details="{ role }">
            <p v-if="requests.get(role)?.reason">Причина: {{ requests.get(role)?.reason }}</p>
          </template>
          <template #actions="{ role }">
            <button
              v-if="requests.get(role)?.status === 'pending'"
              class="outline-action inline profile-icon-action"
              title="Отменить запрос роли"
              aria-label="Отменить запрос роли"
              @click="action('Запрос на роль отменён.', () => cancelRole(role))"
            >
              <AppIcon name="close" />
            </button>
            <button
              v-else-if="requests.get(role)?.status !== 'approved'"
              class="outline-action inline profile-icon-action"
              :title="requests.has(role) ? 'Отправить запрос роли повторно' : 'Запросить роль'"
              :aria-label="requests.has(role) ? 'Отправить запрос роли повторно' : 'Запросить роль'"
              @click="action('Запрос на роль отправлен.', () => requestRole(role))"
            >
              <AppIcon :name="requests.has(role) ? 'restore' : 'plus'" />
            </button>
          </template>
        </RoleSelectionCards>
      </section>

      <section class="panel profile-section profile-sync-status" aria-labelledby="profile-sync-status-title">
        <div class="profile-section-heading">
          <div>
            <h2 id="profile-sync-status-title">Синхронизация данных</h2>
            <p>Показывается состояние синхронизации текущего аккаунта.</p>
          </div>
          <SyncStatus />
        </div>
      </section>

      <section class="panel profile-section account-security">
        <div class="profile-section-heading">
          <div><h2>Аккаунт</h2><p>Управляйте идентификатором и сеансами аккаунта.</p></div>
          <div class="profile-section-actions">
            <button class="outline-action inline profile-icon-action" title="Выйти на всех устройствах" aria-label="Выйти на всех устройствах" @click="signOut(true)"><AppIcon name="logout" /></button>
            <button
              class="outline-action inline danger-link profile-icon-action"
              :disabled="appState.busy || isBootstrapAccount"
              :title="isBootstrapAccount ? 'Начальный аккаунт администратора нельзя удалить.' : 'Удалить аккаунт'"
              :aria-label="isBootstrapAccount ? 'Начальный аккаунт администратора нельзя удалить.' : 'Удалить аккаунт'"
              @click="accountDeletionConfirmation = true"
            >
              <AppIcon name="trash" />
            </button>
          </div>
        </div>
        <PersonIdentity
          class="profile-account-identity"
          :display-name="profileName || 'Имя не указано'"
          :account-id="appState.session.accountId || ''"
        >
          <template #idActions>
            <button
              class="outline-action inline profile-icon-action"
              type="button"
              title="Копировать идентификатор пользователя"
              aria-label="Копировать идентификатор пользователя"
              @click="copyAccountId"
            >
              <AppIcon name="copy" />
            </button>
          </template>
        </PersonIdentity>
      </section>

      <section id="devices" class="panel profile-section device-security">
        <div class="profile-section-heading"><div><h2>Устройства</h2><p>Управляйте действующими сеансами входа.</p></div></div>
        <p>Вход на новом устройстве выполняется сразу. Отзыв завершает все его активные сеансы.</p>

        <form v-for="device in visibleDevices" :key="device.deviceId" class="list-row device-row" @submit.prevent="saveDeviceName(device.deviceId)">
          <div class="device-name-copy">
            <label class="device-name-label">
              <span>Название устройства</span>
              <input v-model="deviceDrafts[device.deviceId]" maxlength="80" autocomplete="off" required :disabled="deviceSaving" />
            </label>
            <span>{{ device.deviceId === appState.session.device?.deviceId ? 'Текущий сеанс' : 'Действующий сеанс' }}</span>
            <small>Идентификатор: {{ device.deviceId }}</small>
            <small v-if="deviceErrors[device.deviceId]" class="field-error" role="alert">{{ deviceErrors[device.deviceId] }}</small>
          </div>
          <div class="row-actions device-row-actions">
            <button
              class="primary-action inline profile-icon-action"
              type="submit"
              :disabled="deviceSaving || !deviceCanSave(device.deviceId)"
              title="Сохранить название устройства"
              aria-label="Сохранить название устройства"
            >
              <AppIcon name="check" />
            </button>
            <button
              class="outline-action inline profile-icon-action"
              type="button"
              :disabled="deviceSaving || !deviceCanRestore(device.deviceId)"
              title="Восстановить название устройства"
              aria-label="Восстановить название устройства"
              @click="restoreDeviceName(device.deviceId)"
            >
              <AppIcon name="restore" />
            </button>
            <button
              class="outline-action inline danger-link profile-icon-action"
              type="button"
              :disabled="deviceSaving || !canRevokeDevice"
              :title="canRevokeDevice ? 'Отозвать устройство' : 'Нельзя отозвать последнее действующее устройство.'"
              :aria-label="canRevokeDevice ? 'Отозвать устройство' : 'Нельзя отозвать последнее действующее устройство.'"
              @click="devicePendingRevocation = { deviceId: device.deviceId, deviceName: deviceName(device) }"
            >
              <AppIcon name="trash" />
            </button>
          </div>
        </form>
      </section>
      </div>
    </div>
    <ConfirmationDialog
      v-model="accountDeletionConfirmation"
      title="Удалить аккаунт?"
      description="Удаление необратимо. Аккаунт потеряет доступ, а связанные данные будут скрыты."
      confirm-label="Удалить аккаунт"
      @confirm="confirmAccountDeletion"
    />
    <ConfirmationDialog
      :model-value="Boolean(devicePendingRevocation)"
      :title="`Отозвать устройство «${devicePendingRevocation?.deviceName ?? ''}»?`"
      description="Все активные сеансы этого устройства будут завершены."
      confirm-label="Отозвать устройство"
      @update:model-value="value => { if (!value) devicePendingRevocation = null; }"
      @confirm="confirmDeviceRevocation"
    />
  </WorkspaceShell>
</template>
