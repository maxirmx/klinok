<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed } from "vue";
import AppPaginator from "./AppPaginator.vue";
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

const pagedRecords = computed(() => props.records.slice(
  (props.page - 1) * props.pageSize,
  props.page * props.pageSize,
));
</script>

<template>
  <article class="panel owner-epicrisis" :aria-labelledby="headingId">
    <h2 :id="headingId">Эпикриз</h2>
    <p v-if="!records.length" class="owner-epicrisis-empty">Записей для эпикриза пока нет.</p>
    <div v-else class="owner-access-table-wrap epicrisis-table-wrap">
      <div class="epicrisis-table-header">
        <span>Дата</span>
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
    <AppPaginator
      v-if="records.length"
      class="owner-epicrisis-pagination"
      :page="page"
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
