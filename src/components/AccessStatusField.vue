<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import {
  delegationStatusLabel,
  petAccessStatusLabel,
  type PetAccessRowStatus,
} from "../petAccess";

withDefaults(defineProps<{
  status: PetAccessRowStatus;
  kind?: "access" | "delegation";
  delegationAllowed?: boolean;
}>(), {
  kind: "access",
  delegationAllowed: false,
});
</script>

<template>
  <div class="owner-access-controlled">
    <span
      v-if="kind === 'access'"
      class="status-badge"
      :class="status"
    >
      {{ petAccessStatusLabel(status) }}
    </span>
    <span
      v-else-if="status === 'granted'"
      class="status-badge delegation-badge"
      :class="delegationAllowed ? 'enabled' : 'disabled'"
    >
      {{ delegationStatusLabel(delegationAllowed) }}
    </span>
    <div v-if="$slots.default" class="row-actions">
      <slot />
    </div>
  </div>
</template>
