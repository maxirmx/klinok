<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { toast } from "../state";
</script>

<template>
  <div v-if="toast" class="toast" role="status">{{ toast }}</div>
</template>
