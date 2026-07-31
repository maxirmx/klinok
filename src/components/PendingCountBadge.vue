<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed } from "vue";

const props = defineProps<{ count: number }>();
const displayCount = computed(() => props.count > 99 ? "99+" : String(props.count));
</script>

<template>
  <strong v-if="count > 0" class="pending-count-badge" aria-hidden="true">{{ displayCount }}</strong>
</template>
