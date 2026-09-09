<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type { TherapeuticSelectionDetail } from "../therapeuticAppointment";

defineProps<{ details: readonly TherapeuticSelectionDetail[] }>();
</script>

<template>
  <ul class="therapeutic-history-findings">
    <li
      v-for="detail in details"
      :key="detail.key"
      class="therapeutic-history-finding-detail"
      :data-selection-key="detail.key"
    >
      <span><template v-if="detail.label">{{ detail.label }}: </template>{{ detail.value }}</span>
      <TherapeuticSelectionDetailList v-if="detail.children.length" :details="detail.children" />
    </li>
  </ul>
</template>
