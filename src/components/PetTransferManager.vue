<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, ref, watch } from "vue";
import type { PetTransferRequest } from "@klinok/contracts";
import { appState, requireRepository } from "../appStore";
import { useAlertStore } from "../stores/alert";
import AppIcon from "./AppIcon.vue";
import AppPaginator from "./AppPaginator.vue";
import ConfirmationDialog from "./ConfirmationDialog.vue";
import ModalDialog from "./ModalDialog.vue";
import PersonIdentity from "./PersonIdentity.vue";
import PetTransferDialog from "./PetTransferDialog.vue";

const props = defineProps<{ linkedRequestId?: string }>();

const alertStore = useAlertStore();
const pageSizes = [10, 20, 50] as const;
const page = ref(1);
const pageSize = ref<(typeof pageSizes)[number]>(10);
const requestDialogOpen = ref(false);
const outgoingDialogOpen = ref(false);
const acceptTarget = ref<PetTransferRequest | null>(null);
const acceptBusy = ref(false);
const acceptError = ref("");
const acceptStale = ref(false);
const ownershipLossAcknowledged = ref(false);
const retainDoctorAccess = ref(false);
const rejectTarget = ref<PetTransferRequest | null>(null);
const cancelTarget = ref<PetTransferRequest | null>(null);
const decisionBusy = ref(false);
const rejectError = ref("");
const cancelError = ref("");
const rejectStale = ref(false);
const cancelStale = ref(false);
const handledLinkedRequestId = ref("");
const linkedRequestInFlightId = ref("");

type AcceptOpenResult = "opened" | "changed" | "terminal" | "retryable";

const currentAccountId = computed(() => appState.session.accountId ?? "");
const actionsAvailable = computed(() => appState.repositoryConnected
  && appState.sync.connectionState === "connected" && !appState.sync.syncing);
const transferablePets = computed(() => appState.medical.pets.filter((pet) => !pet.tombstoned
  && !appState.medical.transferRequests.some((request) => request.petId === pet.petId && request.status === "pending")));
const outgoingActionAvailable = computed(() => actionsAvailable.value && transferablePets.value.length > 0);
const outgoingActionTitle = computed(() => !actionsAvailable.value
  ? "Передача временно недоступна: данные синхронизируются"
  : transferablePets.value.length
    ? "Передать питомца"
    : "Нет питомцев, доступных для передачи");
const rows = computed(() => [...(appState.medical.transferRequests ?? [])]
  .sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
const pagedRows = computed(() => rows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));
const acceptOpen = computed({
  get: () => acceptTarget.value !== null,
  set: (open: boolean) => {
    if (!open && !acceptBusy.value) {
      acceptTarget.value = null;
      acceptError.value = "";
      acceptStale.value = false;
      ownershipLossAcknowledged.value = false;
      retainDoctorAccess.value = false;
    }
  },
});
const rejectOpen = computed({
  get: () => rejectTarget.value !== null,
  set: (open: boolean) => {
    if (!open && !decisionBusy.value) {
      rejectTarget.value = null;
      rejectError.value = "";
      rejectStale.value = false;
    }
  },
});
const cancelOpen = computed({
  get: () => cancelTarget.value !== null,
  set: (open: boolean) => {
    if (!open && !decisionBusy.value) {
      cancelTarget.value = null;
      cancelError.value = "";
      cancelStale.value = false;
    }
  },
});
const acceptingAsCurrentOwner = computed(() => acceptTarget.value?.fromOwnerAccountId === currentAccountId.value);

function statusLabel(status: PetTransferRequest["status"]): string {
  return {
    pending: "Ожидает решения",
    completed: "Завершена",
    rejected: "Отклонена",
    cancelled: "Отменена",
    invalidated: "Устарела",
  }[status];
}

function createdAt(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function initiatedByCurrent(request: PetTransferRequest): boolean {
  return request.initiatedByAccountId === currentAccountId.value;
}

function ownerDisplayName(displayName: string, accountId: string): string {
  return accountId === currentAccountId.value ? `${displayName} (Я)` : displayName;
}

function openReject(request: PetTransferRequest) {
  rejectTarget.value = request;
  rejectError.value = "";
  rejectStale.value = false;
}

function openCancel(request: PetTransferRequest) {
  cancelTarget.value = request;
  cancelError.value = "";
  cancelStale.value = false;
}

async function openAccept(request: PetTransferRequest, acceptRefreshedRevision = false): Promise<AcceptOpenResult> {
  if (!actionsAvailable.value) return "retryable";
  acceptBusy.value = true;
  try {
    await requireRepository().medical.refresh();
    const current = (appState.medical.transferRequests ?? []).find((candidate) => candidate.transferRequestId === request.transferRequestId);
    if (!current || current.status !== "pending") {
      alertStore.error(new Error("Статус запроса передачи изменился. Список обновлён."));
      return "terminal";
    }
    if (!acceptRefreshedRevision && current.revision !== request.revision) {
      alertStore.error(new Error("Статус запроса передачи изменился. Список обновлён."));
      return "changed";
    }
    acceptTarget.value = current;
    acceptError.value = "";
    acceptStale.value = false;
    ownershipLossAcknowledged.value = false;
    retainDoctorAccess.value = false;
    return "opened";
  } catch (reason) {
    alertStore.error(reason, "Не удалось проверить запрос передачи.");
    return "retryable";
  } finally {
    acceptBusy.value = false;
  }
}

async function openLinkedRequest(requestId: string) {
  if (!requestId || handledLinkedRequestId.value === requestId || linkedRequestInFlightId.value === requestId) return;
  const requestIndex = rows.value.findIndex((request) => request.transferRequestId === requestId);
  if (requestIndex < 0) return;
  page.value = Math.floor(requestIndex / pageSize.value) + 1;
  const request = rows.value[requestIndex]!;
  if (request.status !== "pending" || initiatedByCurrent(request)) {
    handledLinkedRequestId.value = requestId;
    return;
  }
  if (!actionsAvailable.value) return;
  linkedRequestInFlightId.value = requestId;
  try {
    const result = await openAccept(request, true);
    if (result === "opened" || result === "terminal") handledLinkedRequestId.value = requestId;
  } finally {
    if (linkedRequestInFlightId.value === requestId) linkedRequestInFlightId.value = "";
  }
}

watch(
  [() => props.linkedRequestId ?? "", rows, actionsAvailable],
  ([requestId]) => { void openLinkedRequest(String(requestId)); },
  { immediate: true },
);

async function acceptTransfer() {
  const target = acceptTarget.value;
  if (!target) return;
  if (acceptingAsCurrentOwner.value && !ownershipLossAcknowledged.value) {
    acceptError.value = "Подтвердите потерю управления профилем и медицинской картой питомца.";
    return;
  }
  acceptBusy.value = true;
  acceptError.value = "";
  try {
    if (acceptingAsCurrentOwner.value) {
      await requireRepository().medical.acceptPetTransfer(target.transferRequestId, ownershipLossAcknowledged.value);
    } else {
      await requireRepository().medical.acceptPetTransfer(target.transferRequestId, false, retainDoctorAccess.value);
    }
    acceptTarget.value = null;
    alertStore.success("Передача питомца завершена.");
  } catch (reason) {
    acceptError.value = reason instanceof Error ? reason.message : "Не удалось принять передачу.";
    const current = (appState.medical.transferRequests ?? []).find((request) => request.transferRequestId === target.transferRequestId);
    acceptStale.value = !current || current.status !== "pending" || current.revision !== target.revision;
  } finally {
    acceptBusy.value = false;
  }
}

async function rejectTransfer() {
  const target = rejectTarget.value;
  if (!target) return;
  decisionBusy.value = true;
  try {
    await requireRepository().medical.rejectPetTransfer(target.transferRequestId);
    rejectTarget.value = null;
    alertStore.success("Запрос передачи отклонён.");
  } catch (reason) {
    rejectError.value = reason instanceof Error ? reason.message : "Не удалось отклонить запрос передачи.";
    const current = (appState.medical.transferRequests ?? []).find((request) => request.transferRequestId === target.transferRequestId);
    rejectStale.value = !current || current.status !== "pending" || current.revision !== target.revision;
  } finally {
    decisionBusy.value = false;
  }
}

async function cancelTransfer() {
  const target = cancelTarget.value;
  if (!target) return;
  decisionBusy.value = true;
  try {
    await requireRepository().medical.cancelPetTransfer(target.transferRequestId);
    cancelTarget.value = null;
    alertStore.success("Запрос передачи отменён.");
  } catch (reason) {
    cancelError.value = reason instanceof Error ? reason.message : "Не удалось отменить запрос передачи.";
    const current = (appState.medical.transferRequests ?? []).find((request) => request.transferRequestId === target.transferRequestId);
    cancelStale.value = !current || current.status !== "pending" || current.revision !== target.revision;
  } finally {
    decisionBusy.value = false;
  }
}
</script>

<template>
  <section class="panel pet-transfer-manager">
    <div class="owner-section-heading transfer-manager-heading">
      <div><h3>Запросы передачи</h3><p>Входящие и исходящие запросы сохраняют профиль и историю питомца.</p></div>
      <div class="row-actions transfer-manager-actions">
        <button
          class="outline-action inline owner-profile-action"
          type="button"
          :disabled="!outgoingActionAvailable"
          :title="outgoingActionTitle"
          :aria-label="outgoingActionTitle"
          @click="outgoingDialogOpen = true"
        ><AppIcon name="building-circle-arrow-right" /></button>
        <button
          class="primary-action inline owner-profile-action"
          type="button"
          :disabled="!actionsAvailable"
          :title="actionsAvailable ? 'Запросить передачу' : 'Передача временно недоступна: данные синхронизируются'"
          :aria-label="actionsAvailable ? 'Запросить передачу' : 'Передача временно недоступна: данные синхронизируются'"
          @click="requestDialogOpen = true"
        ><AppIcon name="arrow-right-to-city" /></button>
      </div>
    </div>

    <div class="owner-access-table-wrap">
      <table class="owner-access-table transfer-table">
        <thead><tr><th>Питомец</th><th>Текущий владелец</th><th>Новый владелец</th><th>Статус</th><th>Создан</th><th>Действия</th></tr></thead>
        <tbody>
          <tr v-for="request in pagedRows" :key="request.transferRequestId" :class="{ 'transfer-row-has-actions': request.status === 'pending' }">
            <td data-label="Питомец"><strong>{{ request.petSpecies }} {{ request.petName }}</strong><small>{{ request.petId }}</small></td>
            <td data-label="Текущий владелец"><PersonIdentity :display-name="ownerDisplayName(request.fromOwnerDisplayName, request.fromOwnerAccountId)" :account-id="request.fromOwnerAccountId" /></td>
            <td data-label="Новый владелец"><PersonIdentity :display-name="ownerDisplayName(request.toOwnerDisplayName, request.toOwnerAccountId)" :account-id="request.toOwnerAccountId" /></td>
            <td data-label="Статус"><span class="status-badge" :class="request.status">{{ statusLabel(request.status) }}</span></td>
            <td data-label="Создан">{{ createdAt(request.createdAt) }}</td>
            <td data-label="Действия" :class="{ 'is-empty': request.status !== 'pending' }">
              <div v-if="request.status === 'pending'" class="row-actions transfer-row-actions">
                <button v-if="initiatedByCurrent(request)" class="outline-action inline danger-outline owner-profile-action" type="button" :disabled="!actionsAvailable" title="Отменить запрос передачи" aria-label="Отменить запрос передачи" @click="openCancel(request)"><AppIcon name="close" /></button>
                <template v-else>
                  <button class="primary-action inline owner-profile-action" type="button" :disabled="!actionsAvailable" title="Принять передачу" aria-label="Принять передачу" @click="openAccept(request)"><AppIcon name="check" /></button>
                  <button class="outline-action inline danger-outline owner-profile-action" type="button" :disabled="!actionsAvailable" title="Отклонить запрос передачи" aria-label="Отклонить запрос передачи" @click="openReject(request)"><AppIcon name="close" /></button>
                </template>
              </div>
            </td>
          </tr>
          <tr v-if="!pagedRows.length"><td class="doctor-access-empty" data-label="Результат" colspan="6">Запросов передачи пока нет.</td></tr>
        </tbody>
      </table>
    </div>
    <AppPaginator v-if="rows.length" v-model:page="page" v-model:page-size="pageSize" :total-items="rows.length" :page-sizes="pageSizes" aria-label="Навигация по запросам передачи" />

    <PetTransferDialog v-model="requestDialogOpen" mode="incoming" />
    <PetTransferDialog v-model="outgoingDialogOpen" mode="outgoing" />

    <ModalDialog v-model="acceptOpen" title="Принять передачу питомца?" :busy="acceptBusy" :role="acceptingAsCurrentOwner ? 'alertdialog' : 'dialog'">
      <form v-if="acceptTarget" class="form-stack directory-dialog-form transfer-review" @submit.prevent="acceptTransfer">
        <p v-if="acceptError" class="form-alert error" role="alert">{{ acceptError }}</p>
        <dl>
          <div><dt>Питомец</dt><dd><strong>{{ acceptTarget.petSpecies }} {{ acceptTarget.petName }}</strong><small>{{ acceptTarget.petId }}</small></dd></div>
          <div><dt>Текущий владелец</dt><dd><PersonIdentity :display-name="ownerDisplayName(acceptTarget.fromOwnerDisplayName, acceptTarget.fromOwnerAccountId)" :account-id="acceptTarget.fromOwnerAccountId" /></dd></div>
          <div><dt>Новый владелец</dt><dd><PersonIdentity :display-name="ownerDisplayName(acceptTarget.toOwnerDisplayName, acceptTarget.toOwnerAccountId)" :account-id="acceptTarget.toOwnerAccountId" /></dd></div>
        </dl>
        <fieldset v-if="acceptingAsCurrentOwner" class="transfer-acknowledgement">
          <legend class="visually-hidden">Подтверждение текущего владельца</legend>
          <div class="medical-card-options"><label class="check-row"><input v-model="ownershipLossAcknowledged" type="checkbox" /><span>Согласен с тем, что после завершения передачи я потеряю доступ к профилю и медицинской карте питомца.</span></label></div>
          <p class="transfer-access-policy-summary">
            {{ acceptTarget.retainDoctorAccess
              ? "Новый владелец решил сохранить действующие доступы врачей к медицинской карте питомца."
              : "После передачи действующие доступы врачей к медицинской карте питомца будут отозваны." }}
          </p>
        </fieldset>
        <fieldset v-else class="transfer-acknowledgement">
          <legend class="visually-hidden">Доступы врачей после передачи</legend>
          <div class="medical-card-options"><label class="check-row"><input v-model="retainDoctorAccess" type="checkbox" /><span>Сохранить действующие доступы врачей к медицинской карте питомца после передачи.</span></label></div>
        </fieldset>
        <div class="confirmation-dialog-actions">
          <button class="outline-action inline access-icon-action" type="button" :disabled="acceptBusy" title="Отмена" aria-label="Отмена" @click="acceptOpen = false"><AppIcon name="close" /></button>
          <button class="primary-action inline access-icon-action" type="submit" :disabled="acceptBusy || acceptStale || (acceptingAsCurrentOwner && !ownershipLossAcknowledged)" title="Принять передачу" aria-label="Принять передачу"><AppIcon name="check" /></button>
        </div>
      </form>
    </ModalDialog>

    <ConfirmationDialog v-model="rejectOpen" title="Отклонить запрос передачи?" :description="rejectTarget ? `Передача питомца ${rejectTarget.petName} не состоится.` : ''" confirm-label="Отклонить запрос" cancel-label="Сохранить запрос" :error="rejectError" :busy="decisionBusy" :confirm-disabled="rejectStale" @confirm="rejectTransfer" />
    <ConfirmationDialog v-model="cancelOpen" title="Отменить запрос передачи?" :description="cancelTarget ? `Запрос передачи питомца ${cancelTarget.petName} будет отменён.` : ''" confirm-label="Отменить запрос" cancel-label="Сохранить запрос" :error="cancelError" :busy="decisionBusy" :confirm-disabled="cancelStale" @confirm="cancelTransfer" />
  </section>
</template>
