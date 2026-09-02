<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, nextTick, ref, watch } from "vue";
import type { DirectoryPetDto, DirectoryProfileDto, PetProfile } from "@klinok/contracts";
import { appState, lookupPetDirectory, requireRepository, searchOwnerDirectory, searchPetDirectory } from "../appStore";
import { useAlertStore } from "../stores/alert";
import AppIcon from "./AppIcon.vue";
import AppPaginator from "./AppPaginator.vue";
import ModalDialog from "./ModalDialog.vue";
import PersonIdentity from "./PersonIdentity.vue";

const props = defineProps<{
  modelValue: boolean;
  mode: "outgoing" | "incoming";
  pet?: PetProfile;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  completed: [transferRequestId: string];
}>();

const alertStore = useAlertStore();
const busy = ref(false);
const error = ref("");
const step = ref<"search" | "confirm">("search");
const ownerQuery = ref("");
const ownerResults = ref<DirectoryProfileDto[]>([]);
const ownerSearchPerformed = ref(false);
const ownerPage = ref(1);
const ownerPageSize = ref(10);
const ownerTotal = ref(0);
const selectedOwner = ref<DirectoryProfileDto | null>(null);
const petQuery = ref("");
const petResults = ref<DirectoryPetDto[]>([]);
const petSearchPerformed = ref(false);
const petPage = ref(1);
const petPageSize = ref(10);
const petTotal = ref(0);
const selectedDirectoryPet = ref<DirectoryPetDto | null>(null);
const ownershipLossAcknowledged = ref(false);
const reviewHeading = ref<HTMLElement | null>(null);

const title = computed(() => step.value === "confirm"
  ? props.mode === "outgoing" ? "Подтвердить передачу питомца" : "Подтвердить запрос передачи"
  : props.mode === "outgoing" ? "Передать питомца" : "Запросить передачу");
const currentAccountId = computed(() => appState.session.accountId ?? "");
const reviewPet = computed(() => props.mode === "outgoing" ? props.pet : selectedDirectoryPet.value);
const reviewFromOwner = computed(() => props.mode === "outgoing"
  ? {
      accountId: currentAccountId.value,
      displayName: [appState.control.profile?.firstName, appState.control.profile?.patronymic, appState.control.profile?.lastName].filter(Boolean).join(" "),
    }
  : selectedDirectoryPet.value
    ? { accountId: selectedDirectoryPet.value.ownerAccountId, displayName: selectedDirectoryPet.value.ownerDisplayName }
    : null);
const reviewToOwner = computed(() => props.mode === "outgoing"
  ? selectedOwner.value && { accountId: selectedOwner.value.accountId, displayName: selectedOwner.value.displayName }
  : {
      accountId: currentAccountId.value,
      displayName: [appState.control.profile?.firstName, appState.control.profile?.patronymic, appState.control.profile?.lastName].filter(Boolean).join(" "),
    });

function reset() {
  busy.value = false;
  error.value = "";
  step.value = "search";
  ownerQuery.value = "";
  ownerResults.value = [];
  ownerSearchPerformed.value = false;
  ownerPage.value = 1;
  ownerPageSize.value = 10;
  ownerTotal.value = 0;
  selectedOwner.value = null;
  petQuery.value = "";
  petResults.value = [];
  petSearchPerformed.value = false;
  petPage.value = 1;
  petPageSize.value = 10;
  petTotal.value = 0;
  selectedDirectoryPet.value = null;
  ownershipLossAcknowledged.value = false;
}

watch(() => props.modelValue, (open) => { if (open) reset(); });

function close() {
  if (!busy.value) emit("update:modelValue", false);
}

async function findOwners(page = ownerPage.value) {
  busy.value = true;
  error.value = "";
  ownerSearchPerformed.value = false;
  try {
    const result = await searchOwnerDirectory(ownerQuery.value, page, ownerPageSize.value);
    ownerPage.value = result.page;
    ownerResults.value = result.items;
    ownerTotal.value = result.total;
    ownerSearchPerformed.value = true;
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "Не удалось найти владельца.";
  } finally {
    busy.value = false;
  }
}

function selectOwner(owner: DirectoryProfileDto) {
  selectedOwner.value = owner;
  if (props.mode === "outgoing") openConfirmation();
  else {
    petResults.value = [];
    petSearchPerformed.value = false;
    petPage.value = 1;
  }
}

async function findPets(page = petPage.value) {
  busy.value = true;
  error.value = "";
  petResults.value = [];
  petSearchPerformed.value = false;
  try {
    const query = petQuery.value.trim();
    if (!query) throw new Error("Укажите кличку или полный идентификатор питомца.");
    if (!selectedOwner.value) {
      const pet = await lookupPetDirectory(query);
      if (pet.ownerAccountId === currentAccountId.value) throw new Error("Нельзя запросить передачу собственного питомца.");
      petResults.value = [pet];
      petPage.value = 1;
      petTotal.value = 1;
    } else {
      const result = await searchPetDirectory("", query, page, petPageSize.value, "pet", selectedOwner.value.accountId);
      petPage.value = result.page;
      petResults.value = result.items;
      petTotal.value = result.total;
    }
    petSearchPerformed.value = true;
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "Не удалось найти питомца.";
  } finally {
    busy.value = false;
  }
}

function selectPet(pet: DirectoryPetDto) {
  selectedDirectoryPet.value = pet;
  openConfirmation();
}

function openConfirmation() {
  error.value = "";
  ownershipLossAcknowledged.value = false;
  step.value = "confirm";
  void nextTick(() => reviewHeading.value?.focus());
}

function backToSearch() {
  error.value = "";
  step.value = "search";
}

async function requestTransfer() {
  if (!appState.control.profile || !currentAccountId.value) {
    error.value = "Профиль владельца ещё не синхронизирован.";
    return;
  }
  if (props.mode === "outgoing" && !ownershipLossAcknowledged.value) {
    error.value = "Подтвердите потерю управления профилем и медицинской картой питомца.";
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    const repository = requireRepository();
    await repository.medical.refresh();
    const profile = appState.control.profile;
    if (!profile || !currentAccountId.value) throw new Error("Профиль владельца ещё не синхронизирован.");
    let currentPet: DirectoryPetDto;
    let targetOwner: DirectoryProfileDto | null = null;
    if (props.mode === "outgoing") {
      if (!props.pet || !selectedOwner.value) throw new Error("Выберите принимающего владельца.");
      currentPet = await lookupPetDirectory(props.pet.petId);
      if (currentPet.ownerAccountId !== currentAccountId.value || currentPet.revision !== props.pet.revision) {
        throw new Error("Данные питомца или владельца изменились. Обновите страницу.");
      }
      const owners = await searchOwnerDirectory(selectedOwner.value.accountId, 1, 50);
      targetOwner = owners.items.find((owner) => owner.accountId === selectedOwner.value?.accountId) ?? null;
      if (!targetOwner || targetOwner.revision !== selectedOwner.value.revision) {
        throw new Error("Данные принимающего владельца изменились. Выполните поиск повторно.");
      }
    } else {
      if (!selectedDirectoryPet.value) throw new Error("Выберите питомца.");
      currentPet = await lookupPetDirectory(selectedDirectoryPet.value.petId);
      if (currentPet.ownerAccountId !== selectedDirectoryPet.value.ownerAccountId
        || currentPet.revision !== selectedDirectoryPet.value.revision
        || currentPet.ownerProfileRevision !== selectedDirectoryPet.value.ownerProfileRevision) {
        selectedDirectoryPet.value = currentPet;
        throw new Error("Данные питомца или владельца изменились. Проверьте обновлённые данные.");
      }
    }
    const transferRequestId = await repository.medical.requestPetTransfer({
      petId: currentPet.petId,
      toOwnerAccountId: props.mode === "outgoing" ? targetOwner!.accountId : currentAccountId.value,
      expectedFromOwnerAccountId: currentPet.ownerAccountId,
      expectedPetRevision: currentPet.revision,
      expectedFromOwnerProfileRevision: currentPet.ownerProfileRevision,
      expectedToOwnerProfileRevision: props.mode === "outgoing" ? targetOwner!.revision : profile.revision,
      ownershipLossAcknowledged: props.mode === "outgoing" && ownershipLossAcknowledged.value,
    });
    emit("update:modelValue", false);
    alertStore.success("Запрос передачи отправлен.");
    emit("completed", transferRequestId);
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "Не удалось отправить запрос передачи.";
  } finally {
    busy.value = false;
  }
}

function changeOwnerPage(page: number) { void findOwners(page); }
function changeOwnerPageSize(pageSize: number) { ownerPageSize.value = pageSize; ownerPage.value = 1; void findOwners(1); }
function changePetPage(page: number) { void findPets(page); }
function changePetPageSize(pageSize: number) { petPageSize.value = pageSize; petPage.value = 1; void findPets(1); }
</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    :title="title"
    :busy="busy"
    :role="step === 'confirm' && mode === 'outgoing' ? 'alertdialog' : 'dialog'"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="form-stack directory-dialog-form pet-transfer-dialog">
      <p v-if="error" class="form-alert error" role="alert">{{ error }}</p>

      <template v-if="step === 'search'">
        <p v-if="mode === 'outgoing' && pet"><strong>{{ pet.species }} {{ pet.name }}</strong><small class="transfer-identity-id">{{ pet.petId }}</small></p>
        <form class="form-stack directory-dialog-search" @submit.prevent="findOwners(1)">
          <label>
            <span>{{ mode === 'outgoing' ? 'ФИО принимающего владельца, его часть или полный идентификатор' : 'ФИО текущего владельца, его часть или полный идентификатор' }}</span>
            <input v-model="ownerQuery" type="search" :required="mode === 'outgoing'" />
          </label>
          <button class="primary-action inline access-icon-action" type="submit" :disabled="busy" :title="busy ? 'Поиск владельца…' : 'Найти владельца'" :aria-label="busy ? 'Поиск владельца…' : 'Найти владельца'"><AppIcon name="search" /></button>
        </form>
        <div v-for="owner in ownerResults" :key="owner.accountId" class="list-row directory-dialog-result">
          <PersonIdentity :display-name="owner.displayName" :account-id="owner.accountId" />
          <button class="outline-action inline access-icon-action" type="button" title="Выбрать владельца" aria-label="Выбрать владельца" @click="selectOwner(owner)"><AppIcon name="check" /></button>
        </div>
        <p v-if="ownerSearchPerformed && !ownerResults.length">Владельцы не найдены.</p>
        <AppPaginator v-if="ownerTotal" :page="ownerPage" :page-size="ownerPageSize" :total-items="ownerTotal" aria-label="Навигация по найденным владельцам" @update:page="changeOwnerPage" @update:page-size="changeOwnerPageSize" />

        <template v-if="mode === 'incoming'">
          <div v-if="selectedOwner" class="transfer-selected-owner">
            <span>Выбран текущий владелец</span>
            <PersonIdentity :display-name="selectedOwner.displayName" :account-id="selectedOwner.accountId" />
            <button class="outline-action inline access-icon-action" type="button" title="Сбросить владельца" aria-label="Сбросить владельца" @click="selectedOwner = null"><AppIcon name="close" /></button>
          </div>
          <form class="form-stack directory-dialog-search" @submit.prevent="findPets(1)">
            <label><span>Кличка, её часть или полный идентификатор питомца</span><input v-model="petQuery" type="search" required /></label>
            <button class="primary-action inline access-icon-action" type="submit" :disabled="busy" :title="busy ? 'Поиск питомца…' : 'Найти питомца'" :aria-label="busy ? 'Поиск питомца…' : 'Найти питомца'"><AppIcon name="search" /></button>
          </form>
          <p v-if="!selectedOwner" class="directory-dialog-hint">Без выбранного владельца укажите полный идентификатор питомца.</p>
          <div v-for="result in petResults" :key="result.petId" class="list-row directory-dialog-result transfer-pet-result">
            <div><strong>{{ result.species }} {{ result.name }}</strong><small>{{ result.petId }}</small><PersonIdentity :display-name="result.ownerDisplayName" :account-id="result.ownerAccountId" /></div>
            <button class="outline-action inline access-icon-action" type="button" title="Выбрать питомца" aria-label="Выбрать питомца" @click="selectPet(result)"><AppIcon name="check" /></button>
          </div>
          <p v-if="petSearchPerformed && !petResults.length">Питомцы не найдены.</p>
          <AppPaginator v-if="petTotal > petPageSize" :page="petPage" :page-size="petPageSize" :total-items="petTotal" aria-label="Навигация по найденным питомцам" @update:page="changePetPage" @update:page-size="changePetPageSize" />
        </template>

        <div class="confirmation-dialog-actions"><button class="outline-action inline access-icon-action" type="button" :disabled="busy" title="Закрыть" aria-label="Закрыть" @click="close"><AppIcon name="close" /></button></div>
      </template>

      <form v-else class="form-stack transfer-review" @submit.prevent="requestTransfer">
        <dl ref="reviewHeading" tabindex="-1" aria-label="Участники передачи">
          <div><dt>Питомец</dt><dd><strong>{{ reviewPet?.species }} {{ reviewPet?.name }}</strong><small>{{ reviewPet?.petId }}</small></dd></div>
          <div><dt>Текущий владелец</dt><dd><PersonIdentity v-if="reviewFromOwner" :display-name="reviewFromOwner.displayName" :account-id="reviewFromOwner.accountId" /></dd></div>
          <div><dt>Новый владелец</dt><dd><PersonIdentity :display-name="reviewToOwner?.displayName ?? ''" :account-id="reviewToOwner?.accountId ?? ''" /></dd></div>
        </dl>
        <fieldset v-if="mode === 'outgoing'" class="transfer-acknowledgement">
          <legend class="visually-hidden">Подтверждение текущего владельца</legend>
          <div class="medical-card-options">
            <label class="check-row"><input v-model="ownershipLossAcknowledged" type="checkbox" /><span>Согласен с тем, что после завершения передачи я потеряю доступ к профилю и медицинской карте питомца.</span></label>
          </div>
        </fieldset>
        <div class="confirmation-dialog-actions">
          <button class="outline-action inline access-icon-action" type="button" :disabled="busy" title="Назад к поиску" aria-label="Назад к поиску" @click="backToSearch"><AppIcon name="chevron-left" /></button>
          <button class="outline-action inline access-icon-action" type="button" :disabled="busy" title="Отмена" aria-label="Отмена" @click="close"><AppIcon name="close" /></button>
          <button class="primary-action inline access-icon-action" type="submit" :disabled="busy || (mode === 'outgoing' && !ownershipLossAcknowledged)" :title="busy ? 'Отправка запроса…' : 'Отправить запрос передачи'" :aria-label="busy ? 'Отправка запроса…' : 'Отправить запрос передачи'"><AppIcon name="check" /></button>
        </div>
      </form>
    </div>
  </ModalDialog>
</template>
