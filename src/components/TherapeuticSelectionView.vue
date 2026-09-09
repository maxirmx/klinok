<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type { TherapeuticSelectionGroup } from "../therapeuticAppointment";
import TherapeuticSelectionDetailList from "./TherapeuticSelectionDetailList.vue";

defineProps<{ groups: readonly TherapeuticSelectionGroup[] }>();
</script>

<template>
  <ul class="therapeutic-history-findings">
    <li v-for="group in groups" :key="group.key" class="therapeutic-history-finding-group">
      <span>{{ group.label }}</span>
      <TherapeuticSelectionDetailList :details="group.details" />
    </li>
  </ul>
</template>
