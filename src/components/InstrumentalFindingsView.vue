<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type { InstrumentalFindingValue } from "@klinok/contracts";

defineProps<{ findings: readonly InstrumentalFindingValue[] }>();
</script>

<template>
  <ul class="instrumental-history-findings">
    <li v-for="finding in findings" :key="finding.findingId">
      <span>{{ finding.findingName }}<template v-if="finding.value">: {{ finding.value }}</template></span>
      <InstrumentalFindingsView v-if="finding.children.length" :findings="finding.children" />
    </li>
  </ul>
</template>
