<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import AppShell from "../components/AppShell.vue";
import AppIcon from "../components/AppIcon.vue";
import { pets, visits, type Pet } from "../data";
import { applyPetFilters, filteredPets, petQuery, selectedSex, selectedType } from "../state";

const route = useRoute();
const speciesOptions: (Pet["species"] | "Все")[] = ["Все", "Собака", "Кошка"];
const sexOptions: (Pet["sex"] | "Все")[] = ["Все", "Сука", "Кобель"];

const selectedPet = computed(() => {
  const id = Number(route.params.id);
  return pets.find((pet) => pet.id === id) ?? null;
});

const petVisits = computed(() => visits.filter((visit) => visit.pet === selectedPet.value?.name));
</script>

<template>
  <AppShell
    v-if="selectedPet"
    :title="selectedPet.name"
    :subtitle="`${selectedPet.breed}, ${selectedPet.age} года`"
    back-to="/owner/pets"
  >
    <section class="profile-hero panel">
      <span class="avatar square" />
      <div>
        <h2>{{ selectedPet.name }}</h2>
        <p>{{ selectedPet.nextEvent }}</p>
      </div>
    </section>
    <section class="panel profile-info">
      <h2>Основная информация</h2>
      <div class="field"><span>Тип животного</span><strong>{{ selectedPet.species }}</strong></div>
      <div class="field"><span>Порода</span><strong>{{ selectedPet.breed }}</strong></div>
      <div class="field"><span>Пол</span><strong>{{ selectedPet.sex }}</strong></div>
      <div class="field"><span>Вес</span><strong>{{ selectedPet.weight }}</strong></div>
      <div class="field"><span>Номер чипа</span><strong>{{ selectedPet.chip }}</strong></div>
    </section>
    <section class="panel">
      <div class="section-title">
        <h2>История посещений</h2>
        <RouterLink to="/owner/visits">Все</RouterLink>
      </div>
      <RouterLink v-for="visit in petVisits" :key="visit.id" class="visit-card slim" :to="`/owner/visits/${visit.id}`">
        <div class="visit-card-head">
          <div>
            <h3>{{ visit.title }}</h3>
            <p>{{ visit.complaint }}</p>
          </div>
          <span>{{ visit.date }}</span>
        </div>
      </RouterLink>
    </section>
  </AppShell>

  <AppShell v-else title="Мои питомцы" subtitle="Поиск и фильтр карточек животных" back-to="/owner/home">
    <section class="search-panel">
      <label class="search-input">
        <AppIcon name="search" />
        <input v-model="petQuery" placeholder="Кличка питомца" />
      </label>
    </section>

    <section class="panel filter-panel">
      <div class="filter-section">
        <div class="sheet-line"><span>Тип животного</span><button @click="applyPetFilters('Все', selectedSex)">Очистить</button></div>
        <div class="chips">
          <button
            v-for="type in speciesOptions"
            :key="type"
            :class="{ active: selectedType === type }"
            @click="applyPetFilters(type, selectedSex)"
          >
            {{ type }}
          </button>
        </div>
      </div>
      <div class="filter-section">
        <div class="sheet-line"><span>Пол животного</span><button @click="applyPetFilters(selectedType, 'Все')">Очистить</button></div>
        <div class="chips">
          <button
            v-for="sex in sexOptions"
            :key="sex"
            :class="{ active: selectedSex === sex }"
            @click="applyPetFilters(selectedType, sex)"
          >
            {{ sex }}
          </button>
        </div>
      </div>
    </section>

    <section class="pet-grid-full">
      <RouterLink v-for="pet in filteredPets" :key="pet.id" class="pet-card large" :to="`/owner/pets/${pet.id}`">
        <div class="pet-art">{{ pet.species === "Кошка" ? "К" : "С" }}</div>
        <div class="pet-caption">
          <h3>{{ pet.name }}</h3>
          <p>{{ pet.breed }}</p>
          <p>{{ pet.note }}</p>
        </div>
      </RouterLink>
    </section>
  </AppShell>
</template>
