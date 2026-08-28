<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed } from "vue";
import type { InstrumentalFindingValue } from "@klinok/contracts";
import { instrumentalFindingById } from "@klinok/contracts";

const props = defineProps<{ findings: readonly InstrumentalFindingValue[] }>();
const visibleFindings = computed(() => props.findings.filter((finding) => {
  const item = instrumentalFindingById(finding.findingId);
  return item?.kind !== "group" || finding.children.length > 0 || Boolean(finding.value);
}));
</script>

<template>
  <ul class="instrumental-history-findings">
    <li v-for="finding in visibleFindings" :key="finding.findingId">
      <span>{{ finding.findingName }}<template v-if="finding.value">: {{ finding.value }}{{ finding.unit ? ` ${finding.unit}` : "" }}</template></span>
      <InstrumentalFindingsView v-if="finding.children.length" :findings="finding.children" />
    </li>
  </ul>
</template>
