<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

defineProps<{
  displayName: string;
  accountId: string;
}>();

defineSlots<{
  idActions(): unknown;
}>();
</script>

<template>
  <div class="person-identity">
    <strong class="person-identity-name">{{ displayName }}</strong>
    <div class="person-identity-id-row">
      <small class="person-identity-id">{{ accountId }}</small>
      <slot name="idActions" />
    </div>
  </div>
</template>
