<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, ref, watch } from "vue";
import type { MedicalRecordDraft } from "@klinok/contracts";
import { isLaboratoryTestsValue } from "../medicalEncounter";
import AppCatalogCombobox from "./AppCatalogCombobox.vue";
import AppIcon from "./AppIcon.vue";
import AppPaginator from "./AppPaginator.vue";

type PageSize = 10 | 20 | 50;

const props = defineProps<{ records: readonly MedicalRecordDraft[]; confirmedIds: ReadonlySet<string> }>();
const selectedIds = ref<string[]>([]);
const customText = ref("");
const page = ref(1);
const pageSize = ref<PageSize>(10);
const mobilePages = ref<Record<string, number>>({});
const mobilePageSizes = ref<Record<string, PageSize>>({});
const occurrences = computed(() => props.records.flatMap((record) => {
  const section = record.sections["laboratory-tests"];
  if (section?.templateVersion !== "laboratory-tests-v1" || !isLaboratoryTestsValue(section.value)) return [];
  return section.value.studies.flatMap((study) => study.mode === "panel" ? [{ record, study }] : []);
}).sort((a, b) => a.study.date.localeCompare(b.study.date) || a.study.id.localeCompare(b.study.id)));
const indicatorMap = computed(() => new Map(occurrences.value.flatMap(({ study }) => study.mode === "panel" ? study.results.map((result) => [result.indicatorId, { id: result.indicatorId, label: result.unit ? `${result.indicatorName}, ${result.unit}` : result.indicatorName }] as const) : [])));
const options = computed(() => [...indicatorMap.value.values()]);
const rows = computed(() => occurrences.value.filter(({ study }) => study.mode === "panel" && study.results.some((result) => selectedIds.value.includes(result.indicatorId))));
const paged = computed(() => rows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));
const indicatorHistories = computed(() => selectedIds.value.flatMap((id) => {
  const indicator = indicatorMap.value.get(id);
  if (!indicator) return [];
  const entries = occurrences.value.flatMap(({ record, study }) => {
    if (study.mode !== "panel") return [];
    const selectedResult = study.results.find((item) => item.indicatorId === id);
    return selectedResult ? [{ record, study, result: selectedResult }] : [];
  }).sort((a, b) => b.study.date.localeCompare(a.study.date) || b.study.id.localeCompare(a.study.id));
  return [{ ...indicator, entries }];
}));
watch([selectedIds, pageSize], () => { page.value = 1; }, { deep: true });
watch(selectedIds, (ids) => {
  mobilePages.value = Object.fromEntries(ids.map((id) => [id, 1]));
  mobilePageSizes.value = Object.fromEntries(ids.map((id) => [id, mobilePageSizes.value[id] ?? 10]));
}, { deep: true });
watch(indicatorHistories, (histories) => {
  const next = { ...mobilePages.value };
  for (const history of histories) next[history.id] = mobilePage(history.id, history.entries.length);
  mobilePages.value = next;
});
function result(study: (typeof occurrences.value)[number]["study"], id: string) { return study.mode === "panel" ? study.results.find((item) => item.indicatorId === id) : undefined; }
function date(value: string) { const [year, month, day] = value.split("-"); return `${day}.${month}.${year}`; }
function status(recordId: string) { return props.confirmedIds.has(recordId) ? "Подтверждено" : "Ожидает подтверждения"; }
function laboratory(value: string) { return value.trim() || "Не указана"; }
function mobilePageSize(id: string) { return mobilePageSizes.value[id] ?? 10; }
function mobilePage(id: string, totalItems: number) {
  const pageCount = Math.max(1, Math.ceil(totalItems / mobilePageSize(id)));
  return Math.min(Math.max(1, mobilePages.value[id] ?? 1), pageCount);
}
function mobileEntries(history: (typeof indicatorHistories.value)[number]) {
  const size = mobilePageSize(history.id);
  const start = (mobilePage(history.id, history.entries.length) - 1) * size;
  return history.entries.slice(start, start + size);
}
function setMobilePage(id: string, value: number) {
  mobilePages.value = { ...mobilePages.value, [id]: value };
}
function setMobilePageSize(id: string, value: number) {
  if (value !== 10 && value !== 20 && value !== 50) return;
  mobilePageSizes.value = { ...mobilePageSizes.value, [id]: value };
  setMobilePage(id, 1);
}
</script>
<template>
  <section v-if="options.length" class="panel laboratory-comparison">
    <h2>История лабораторных показателей</h2>
    <AppCatalogCombobox v-model:selected-ids="selectedIds" v-model:custom-text="customText" multiple :allow-custom="false" label="Показатели для сравнения" :options="options" placeholder="Выберите показатели" />
    <div v-if="selectedIds.length" class="laboratory-comparison-desktop">
      <div class="laboratory-results-scroll"><table class="laboratory-results"><thead><tr><th>Дата</th><th>Исследование</th><th>Лаборатория</th><th>Статус</th><th v-for="id in selectedIds" :key="id">{{ indicatorMap.get(id)?.label }}</th></tr></thead><tbody><tr v-for="row in paged" :key="`${row.record.recordId}:${row.study.id}`"><td>{{ date(row.study.date) }}</td><td>{{ row.study.typeName }}</td><td>{{ row.study.laboratory }}</td><td>{{ status(row.record.recordId) }}</td><td v-for="id in selectedIds" :key="id"><template v-if="result(row.study, id)">{{ result(row.study, id)?.result }}<small v-if="result(row.study, id)?.reference" class="muted-label">Реф.: {{ result(row.study, id)?.reference }}</small></template><span v-else>—</span></td></tr></tbody></table></div>
      <AppPaginator v-if="rows.length" v-model:page="page" v-model:page-size="pageSize" :total-items="rows.length" :page-sizes="[10, 20, 50]" page-size-label="Исследований на странице" aria-label="Навигация по истории лабораторных показателей" />
    </div>
    <div v-if="indicatorHistories.length" class="laboratory-comparison-mobile" aria-label="История выбранных лабораторных показателей">
      <section v-for="history in indicatorHistories" :key="history.id" class="laboratory-mobile-indicator">
        <h3>{{ history.label }}</h3>
        <ol class="laboratory-mobile-entries">
          <li v-for="entry in mobileEntries(history)" :key="`${entry.record.recordId}:${entry.study.id}`" class="laboratory-mobile-entry">
            <header>
              <time :datetime="entry.study.date">{{ date(entry.study.date) }}</time>
              <span
                class="laboratory-mobile-status"
                :class="confirmedIds.has(entry.record.recordId) ? 'confirmed' : 'pending'"
                :title="status(entry.record.recordId)"
              >
                <AppIcon v-if="confirmedIds.has(entry.record.recordId)" name="check" />
                <span v-else aria-hidden="true">…</span>
                <span class="visually-hidden">{{ status(entry.record.recordId) }}</span>
              </span>
            </header>
            <strong class="laboratory-mobile-value">{{ entry.result.result.trim() || '—' }}</strong>
            <small v-if="entry.result.reference" class="laboratory-mobile-reference">Реф.: {{ entry.result.reference }}</small>
            <p class="laboratory-mobile-study">{{ entry.study.typeName }}</p>
            <details class="laboratory-mobile-metadata">
              <summary :aria-label="`Подробнее о результате за ${date(entry.study.date)}`">Подробнее</summary>
              <dl>
                <div><dt>Лаборатория</dt><dd>{{ laboratory(entry.study.laboratory) }}</dd></div>
                <div><dt>Статус</dt><dd>{{ status(entry.record.recordId) }}</dd></div>
              </dl>
            </details>
          </li>
        </ol>
        <AppPaginator
          :page="mobilePage(history.id, history.entries.length)"
          :page-size="mobilePageSize(history.id)"
          :total-items="history.entries.length"
          :page-sizes="[10, 20, 50]"
          page-size-label="Результатов на странице"
          :aria-label="`Навигация по истории показателя «${history.label}»`"
          @update:page="setMobilePage(history.id, $event)"
          @update:page-size="setMobilePageSize(history.id, $event)"
        />
      </section>
    </div>
  </section>
</template>
