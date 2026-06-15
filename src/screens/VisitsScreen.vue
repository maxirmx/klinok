<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import AppShell from "../components/AppShell.vue";
import { localVisits } from "../state";

const route = useRoute();
const selectedVisit = computed(() => {
  const id = Number(route.params.id);
  return localVisits.value.find((visit) => visit.id === id) ?? null;
});
</script>

<template>
  <AppShell
    v-if="selectedVisit"
    title="Визит"
    :subtitle="selectedVisit.title"
    back-to="/owner/visits"
  >
    <section class="visit-document panel">
      <div class="doctor-head">
        <span class="avatar black" />
        <div>
          <h2>{{ selectedVisit.doctor }}</h2>
          <p>{{ selectedVisit.role }}</p>
        </div>
      </div>
      <div class="visit-meta">
        <div><span>Питомец</span><strong>{{ selectedVisit.pet }}</strong></div>
        <div><span>Дата визита</span><strong>{{ selectedVisit.date }}</strong></div>
      </div>
      <hr />
      <h3>Анамнез болезни:</h3>
      <ul>
        <li>{{ selectedVisit.complaint }}</li>
        <li>Владельцы отмечают изменение активности и аппетита питомца.</li>
        <li>Состояние требует наблюдения в динамике.</li>
      </ul>
      <h3>Общее состояние:</h3>
      <ul>
        <li>Температура ректальная в пределах допустимых значений.</li>
        <li>Шерстный покров без выраженных изменений.</li>
      </ul>
      <h3>Диагноз</h3>
      <p>{{ selectedVisit.diagnosis }}</p>
      <h3>Рекомендации</h3>
      <p>{{ selectedVisit.recommendation }}</p>
    </section>
  </AppShell>

  <AppShell v-else title="История контактов" subtitle="Визиты, заявки и документы" back-to="/owner/home">
    <section class="panel">
      <RouterLink v-for="visit in localVisits" :key="visit.id" class="visit-card list-item" :to="`/owner/visits/${visit.id}`">
        <div class="visit-card-head">
          <div>
            <h3>{{ visit.title }}</h3>
            <p>{{ visit.complaint }}</p>
          </div>
          <span>{{ visit.tag }}</span>
        </div>
        <dl>
          <div><dt>Питомец</dt><dd>{{ visit.pet }}</dd></div>
          <div><dt>Дата</dt><dd>{{ visit.date }}</dd></div>
        </dl>
      </RouterLink>
    </section>
  </AppShell>
</template>
