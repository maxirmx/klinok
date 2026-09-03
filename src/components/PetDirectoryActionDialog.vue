<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { ref, watch } from "vue";
import type { DirectoryPetDto } from "@klinok/contracts";
import { lookupPetDirectory, searchPetDirectory } from "../appStore";
import AppIcon from "./AppIcon.vue";
import ModalDialog from "./ModalDialog.vue";
import PersonIdentity from "./PersonIdentity.vue";

const props = withDefaults(defineProps<{
  modelValue: boolean;
  title: string;
  actionTitle: string;
  busy?: boolean;
  error?: string;
  searchTitle?: string;
  searchBusyTitle?: string;
  closeTitle?: string;
  currentAccountId?: string;
  transferableOnly?: boolean;
  excludedOwnerAccountId?: string;
  excludedOwnerError?: string;
  unavailablePetIds?: readonly string[];
  unavailablePetError?: string;
  validateAction?: (pet: DirectoryPetDto) => string;
}>(), {
  busy: false,
  error: "",
  searchTitle: "Найти питомца",
  searchBusyTitle: "Поиск питомца…",
  closeTitle: "Закрыть",
  currentAccountId: "",
  transferableOnly: false,
  excludedOwnerAccountId: "",
  excludedOwnerError: "Питомец этого владельца недоступен для операции.",
  unavailablePetIds: () => [],
  unavailablePetError: "Питомец больше недоступен для операции.",
  validateAction: undefined,
});

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  action: [pet: DirectoryPetDto];
  "clear-error": [];
}>();

const searchBusy = ref(false);
const searchError = ref("");
const ownerQuery = ref("");
const petQuery = ref("");
const results = ref<DirectoryPetDto[]>([]);
const searchPerformed = ref(false);

function isExcludedOwner(pet: DirectoryPetDto): boolean {
  return Boolean(props.excludedOwnerAccountId && pet.ownerAccountId === props.excludedOwnerAccountId);
}

function isUnavailable(pet: DirectoryPetDto): boolean {
  return props.unavailablePetIds.includes(pet.petId);
}

function ownerDisplayName(pet: DirectoryPetDto): string {
  return pet.ownerAccountId === props.currentAccountId ? `${pet.ownerDisplayName} (Я)` : pet.ownerDisplayName;
}

function clearErrors() {
  searchError.value = "";
  emit("clear-error");
}

function resetResults() {
  searchBusy.value = false;
  searchError.value = "";
  results.value = [];
  searchPerformed.value = false;
}

watch(() => props.modelValue, (open) => {
  if (open) resetResults();
});
watch(() => props.unavailablePetIds, () => {
  results.value = results.value.filter((pet) => !isUnavailable(pet));
});

async function findPets() {
  searchBusy.value = true;
  results.value = [];
  searchPerformed.value = false;
  clearErrors();
  try {
    const owner = ownerQuery.value.trim();
    const pet = petQuery.value.trim();
    let found: DirectoryPetDto[];
    if (!owner) {
      const exactPet = await lookupPetDirectory(pet);
      if (isExcludedOwner(exactPet)) throw new Error(props.excludedOwnerError);
      found = [exactPet];
    } else if (props.transferableOnly) {
      const page = await searchPetDirectory(owner, pet, 1, 50, "owner", "", true);
      found = page.items;
    } else {
      const page = await searchPetDirectory(owner, pet, 1, 50);
      found = page.items;
    }
    results.value = found.filter((candidate) => !isExcludedOwner(candidate) && !isUnavailable(candidate));
    searchPerformed.value = true;
  } catch (reason) {
    searchError.value = reason instanceof Error ? reason.message : "Не удалось найти питомца.";
  } finally {
    searchBusy.value = false;
  }
}

function selectPet(pet: DirectoryPetDto) {
  clearErrors();
  const validationError = props.validateAction?.(pet) ?? "";
  if (validationError) {
    results.value = results.value.filter((candidate) => candidate.petId !== pet.petId);
    searchError.value = validationError;
    return;
  }
  if (isExcludedOwner(pet)) {
    results.value = results.value.filter((candidate) => candidate.petId !== pet.petId);
    searchError.value = props.excludedOwnerError;
    return;
  }
  if (isUnavailable(pet)) {
    results.value = results.value.filter((candidate) => candidate.petId !== pet.petId);
    searchError.value = props.unavailablePetError;
    return;
  }
  emit("action", pet);
}
</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    :title="title"
    :busy="busy || searchBusy"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="form-stack directory-dialog-form doctor-request-access-form">
      <p v-if="error || searchError" class="form-alert error" role="alert">{{ error || searchError }}</p>
      <form class="form-stack doctor-request-search-form" @submit.prevent="findPets">
        <label class="doctor-request-owner-field">
          <span>ФИО владельца, его часть или полный идентификатор (необязательно при поиске по полному идентификатору питомца)</span>
          <input v-model="ownerQuery" type="search" />
        </label>
        <label class="doctor-request-pet-field">
          <span>Кличка, её часть или полный идентификатор питомца</span>
          <input v-model="petQuery" type="search" required />
        </label>
        <button
          class="primary-action inline access-icon-action doctor-request-search-action"
          type="submit"
          :disabled="busy || searchBusy"
          :title="searchBusy ? searchBusyTitle : searchTitle"
          :aria-label="searchBusy ? searchBusyTitle : searchTitle"
        ><AppIcon name="search" /></button>
      </form>
      <div v-for="pet in results" :key="pet.petId" class="list-row doctor-request-result">
        <div>
          <strong>{{ pet.species }} {{ pet.name }}</strong>
          <small>{{ pet.petId }}</small>
          <PersonIdentity :display-name="ownerDisplayName(pet)" :account-id="pet.ownerAccountId" />
        </div>
        <button
          class="primary-action inline access-icon-action"
          type="button"
          :disabled="busy || searchBusy"
          :title="actionTitle"
          :aria-label="actionTitle"
          @click="selectPet(pet)"
        ><AppIcon name="check" /></button>
      </div>
      <p v-if="searchPerformed && !results.length">Питомцы не найдены.</p>
      <div class="confirmation-dialog-actions">
        <button
          class="outline-action inline access-icon-action"
          type="button"
          :disabled="busy || searchBusy"
          :title="closeTitle"
          :aria-label="closeTitle"
          @click="emit('update:modelValue', false)"
        ><AppIcon name="close" /></button>
      </div>
    </div>
  </ModalDialog>
</template>
