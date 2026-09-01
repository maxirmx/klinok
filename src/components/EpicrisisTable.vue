<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, ref } from "vue";
import AppIcon from "./AppIcon.vue";
import AppPaginator from "./AppPaginator.vue";
import AppTableSort from "./AppTableSort.vue";
import MedicalRecordEntry from "./MedicalRecordEntry.vue";
import type { MedicalRecordDraft } from "../repositories/types";

const props = withDefaults(defineProps<{
  records: readonly MedicalRecordDraft[];
  page: number;
  pageSize: number;
  pageSizes?: readonly number[];
  headingId?: string;
}>(), {
  pageSizes: () => [10, 20, 50],
  headingId: "epicrisis-heading",
});

const emit = defineEmits<{
  "update:page": [page: number];
  "update:pageSize": [pageSize: number];
  activate: [recordId: string];
}>();

const dateSortFields = [{ value: "date", label: "Дата" }] as const;
const dateSort = ref<"asc" | "desc">("desc");
const sortedRecords = computed(() => [...props.records].sort((left, right) => {
  const order = left.encounterDate.localeCompare(right.encounterDate)
    || left.createdAt.localeCompare(right.createdAt)
    || left.recordId.localeCompare(right.recordId);
  return dateSort.value === "asc" ? order : -order;
}));
const pageCount = computed(() => Math.max(1, Math.ceil(props.records.length / props.pageSize)));
const currentPage = computed(() => Math.min(Math.max(1, props.page), pageCount.value));
const pagedRecords = computed(() => sortedRecords.value.slice(
  (currentPage.value - 1) * props.pageSize,
  currentPage.value * props.pageSize,
));
function updateDateSort(direction: "asc" | "desc") {
  dateSort.value = direction;
  emit("update:page", 1);
}
function toggleDateSort() { updateDateSort(dateSort.value === "asc" ? "desc" : "asc"); }
</script>

<template>
  <article class="panel owner-epicrisis" :aria-labelledby="headingId">
    <div class="owner-epicrisis-heading">
      <h2 :id="headingId">Эпикриз</h2>
      <AppTableSort
        v-if="records.length"
        field="date"
        :direction="dateSort"
        :fields="dateSortFields"
        ascending-label="Сначала старые"
        descending-label="Сначала новые"
        descending-first
        aria-label="Сортировка эпикриза"
        @update:direction="updateDateSort"
      />
    </div>
    <p v-if="!records.length" class="owner-epicrisis-empty">Записей для эпикриза пока нет.</p>
    <template v-else>
      <div class="owner-access-table-wrap epicrisis-table-wrap">
        <div class="epicrisis-table-header">
          <span role="columnheader" :aria-sort="dateSort === 'asc' ? 'ascending' : 'descending'">
            <button class="table-sort-button" type="button" @click="toggleDateSort">
              <span>Дата</span>
              <AppIcon name="chevron-down" :class="{ descending: dateSort === 'desc' }" />
            </button>
          </span>
          <span>Что случилось</span>
          <span>Диагноз</span>
          <span>Итог</span>
        </div>
        <div class="owner-epicrisis-list">
          <MedicalRecordEntry
            v-for="record in pagedRecords"
            :key="record.recordId"
            :record="record"
            mode="epicrisis"
            :confirmed="false"
            @activate="emit('activate', $event)"
          />
        </div>
      </div>
    </template>
    <AppPaginator
      v-if="records.length"
      class="owner-epicrisis-pagination"
      :page="currentPage"
      :page-size="pageSize"
      :total-items="records.length"
      :page-sizes="pageSizes"
      page-size-label="Записей на странице"
      aria-label="Навигация по эпикризу"
      @update:page="emit('update:page', $event)"
      @update:page-size="emit('update:pageSize', $event)"
    />
  </article>
</template>
