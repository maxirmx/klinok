<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, ref, watch } from "vue";
import type { LaboratoryTestsSectionValue, MedicalRecordDraft } from "@klinok/contracts";
import AppCatalogCombobox from "./AppCatalogCombobox.vue";
import AppPaginator from "./AppPaginator.vue";

const props = defineProps<{ records: readonly MedicalRecordDraft[]; confirmedIds: ReadonlySet<string> }>();
const selectedIds = ref<string[]>([]); const customText = ref(""); const page = ref(1); const pageSize = ref<10 | 20 | 50>(10);
const occurrences = computed(() => props.records.flatMap((record) => { const value = record.sections["laboratory-tests"]?.value as LaboratoryTestsSectionValue | undefined; return value?.studies.flatMap((study) => study.mode === "panel" ? [{ record, study }] : []) ?? []; }).sort((a, b) => a.study.date.localeCompare(b.study.date) || a.study.id.localeCompare(b.study.id)));
const indicatorMap = computed(() => new Map(occurrences.value.flatMap(({ study }) => study.mode === "panel" ? study.results.map((result) => [result.indicatorId, { id: result.indicatorId, label: result.unit ? `${result.indicatorName}, ${result.unit}` : result.indicatorName }] as const) : [])));
const options = computed(() => [...indicatorMap.value.values()]);
const rows = computed(() => occurrences.value.filter(({ study }) => study.mode === "panel" && study.results.some((result) => selectedIds.value.includes(result.indicatorId))));
const paged = computed(() => rows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));
watch([selectedIds, pageSize], () => { page.value = 1; }, { deep: true });
function result(study: (typeof occurrences.value)[number]["study"], id: string) { return study.mode === "panel" ? study.results.find((item) => item.indicatorId === id) : undefined; }
function date(value: string) { const [year, month, day] = value.split("-"); return `${day}.${month}.${year}`; }
</script>
<template>
  <section v-if="options.length" class="laboratory-comparison">
    <h3>Сравнение лабораторных показателей</h3>
    <AppCatalogCombobox v-model:selected-ids="selectedIds" v-model:custom-text="customText" multiple :allow-custom="false" label="Показатели для сравнения" :options="options" placeholder="Выберите показатели" />
    <div v-if="selectedIds.length" class="laboratory-results-scroll"><table class="laboratory-results"><thead><tr><th>Дата</th><th>Исследование</th><th>Лаборатория</th><th>Статус</th><th v-for="id in selectedIds" :key="id">{{ indicatorMap.get(id)?.label }}</th></tr></thead><tbody><tr v-for="row in paged" :key="`${row.record.recordId}:${row.study.id}`"><td>{{ date(row.study.date) }}</td><td>{{ row.study.typeName }}</td><td>{{ row.study.laboratory }}</td><td>{{ confirmedIds.has(row.record.recordId) ? 'Подтверждено' : 'Ожидает подтверждения' }}</td><td v-for="id in selectedIds" :key="id"><template v-if="result(row.study, id)">{{ result(row.study, id)?.result }}<small v-if="result(row.study, id)?.reference" class="muted-label">Реф.: {{ result(row.study, id)?.reference }}</small></template><span v-else>—</span></td></tr></tbody></table></div>
    <AppPaginator v-if="selectedIds.length && rows.length" v-model:page="page" v-model:page-size="pageSize" :total-items="rows.length" :page-sizes="[10, 20, 50]" page-size-label="Исследований на странице" aria-label="Навигация по сравнению лабораторных показателей" />
  </section>
</template>
