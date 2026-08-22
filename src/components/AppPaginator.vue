<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed } from "vue";
import AppIcon from "./AppIcon.vue";
import AppSelect from "./AppSelect.vue";

const props = withDefaults(defineProps<{
  page: number;
  pageSize: number;
  totalItems: number;
  pageSizes?: readonly number[];
  pageSizeLabel?: string;
  ariaLabel?: string;
}>(), {
  pageSizes: () => [10, 20, 50],
  pageSizeLabel: "Строк на странице",
  ariaLabel: "Навигация по страницам",
});

const emit = defineEmits<{
  "update:page": [page: number];
  "update:pageSize": [pageSize: number];
}>();

const pageCount = computed(() => Math.max(1, Math.ceil(props.totalItems / props.pageSize)));
const currentPage = computed(() => Math.min(Math.max(1, props.page), pageCount.value));
const pageStart = computed(() => props.totalItems ? (currentPage.value - 1) * props.pageSize + 1 : 0);
const pageEnd = computed(() => Math.min(currentPage.value * props.pageSize, props.totalItems));
const pageSizeOptions = computed(() => props.pageSizes.map((size) => ({ value: String(size), label: String(size) })));

function selectPage(page: number) {
  emit("update:page", Math.min(Math.max(1, page), pageCount.value));
}

function selectPageSize(value: string) {
  emit("update:pageSize", Number(value));
}
</script>

<template>
  <nav class="app-paginator" :aria-label="ariaLabel">
    <span>Показаны {{ pageStart }}–{{ pageEnd }} из {{ totalItems }}</span>
    <div class="app-paginator-buttons">
      <button
        type="button"
        :disabled="currentPage === 1"
        title="Предыдущая страница"
        aria-label="Предыдущая страница"
        @click="selectPage(currentPage - 1)"
      >
        <AppIcon name="chevron-left" />
      </button>
      <button
        v-for="pageNumber in pageCount"
        :key="pageNumber"
        type="button"
        :class="{ active: currentPage === pageNumber }"
        :aria-label="`Страница ${pageNumber}`"
        :aria-current="currentPage === pageNumber ? 'page' : undefined"
        @click="selectPage(pageNumber)"
      >
        {{ pageNumber }}
      </button>
      <button
        type="button"
        :disabled="currentPage === pageCount"
        title="Следующая страница"
        aria-label="Следующая страница"
        @click="selectPage(currentPage + 1)"
      >
        <AppIcon name="chevron" />
      </button>
    </div>
    <label>
      <span>{{ pageSizeLabel }}</span>
      <AppSelect :model-value="String(pageSize)" :options="pageSizeOptions" @update:model-value="selectPageSize" />
    </label>
  </nav>
</template>
