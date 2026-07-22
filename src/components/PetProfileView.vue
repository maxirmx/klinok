<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import PetProfileHeader from "./PetProfileHeader.vue";
import type { PetProfile } from "../repositories/types";

defineProps<{
  pet: PetProfile;
  ownerDisplayName?: string;
  ownerAccountId?: string;
}>();

defineSlots<{
  actions(): unknown;
}>();

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}
</script>

<template>
  <article class="panel owner-pet-profile pet-profile-view">
    <PetProfileHeader
      :pet="pet"
      :owner-display-name="ownerDisplayName"
      :owner-account-id="ownerAccountId"
    >
      <template #actions><slot name="actions" /></template>
    </PetProfileHeader>

    <dl class="owner-profile-fields pet-profile-view-fields">
      <div><dt>Пол</dt><dd>{{ pet.sex || 'Не указан' }}</dd></div>
      <div><dt>Окрас</dt><dd>{{ pet.color || 'Не указан' }}</dd></div>
      <div><dt>Номер чипа</dt><dd>{{ pet.chip || 'Нет' }}</dd></div>
      <div><dt>Клеймо</dt><dd>{{ pet.brandMark || 'Нет' }}</dd></div>
      <div><dt>Последняя вакцинация</dt><dd>{{ pet.latestVaccination ? `${formatDate(pet.latestVaccination.date)} · ${pet.latestVaccination.name}` : 'Не указана' }}</dd></div>
      <div><dt>Вес</dt><dd>{{ pet.weightKg ? `${pet.weightKg} кг` : 'Не указан' }}</dd></div>
    </dl>

    <div v-if="pet.notes" class="owner-pet-notes">
      <h3>Заметки</h3>
      <p>{{ pet.notes }}</p>
    </div>
  </article>
</template>
