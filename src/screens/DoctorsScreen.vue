<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import AppShell from "../components/AppShell.vue";
import AppIcon from "../components/AppIcon.vue";
import { doctors } from "../data";
import { showToast } from "../state";

const route = useRoute();
const selectedDoctor = computed(() => {
  const id = Number(route.params.id);
  return doctors.find((doctor) => doctor.id === id) ?? null;
});
</script>

<template>
  <AppShell v-if="selectedDoctor" title="Врач" :subtitle="selectedDoctor.name" back-to="/owner/doctors">
    <section class="doctor-profile panel">
      <span class="doctor-photo large" />
      <div>
        <h2>{{ selectedDoctor.name }}</h2>
        <p>{{ selectedDoctor.role }}</p>
        <small>{{ selectedDoctor.experience }} · {{ selectedDoctor.rating }} ★</small>
      </div>
    </section>
    <section class="panel">
      <div class="section-title"><h2>О враче</h2></div>
      <p class="body-copy">{{ selectedDoctor.about }}</p>
    </section>
    <section class="panel">
      <div class="section-title"><h2>Услуги врача</h2></div>
      <div class="chips service-chips">
        <button v-for="service in selectedDoctor.services" :key="service">{{ service }}</button>
      </div>
      <button class="primary-action inline" @click="showToast('Доступ передан врачу')">Передать доступ</button>
    </section>
  </AppShell>

  <AppShell v-else title="Откликнувшиеся врачи" subtitle="Выберите специалиста" back-to="/owner/booking">
    <section class="panel">
      <RouterLink v-for="doctor in doctors" :key="doctor.id" class="doctor-card" :to="`/owner/doctors/${doctor.id}`">
        <span class="doctor-photo" />
        <div><h3>{{ doctor.name }}</h3><p>{{ doctor.role }}</p><small>{{ doctor.experience }}</small></div>
        <div class="doctor-price"><span>{{ doctor.rating }} <AppIcon name="star" /></span><strong>{{ doctor.price }}</strong></div>
      </RouterLink>
    </section>
  </AppShell>
</template>
