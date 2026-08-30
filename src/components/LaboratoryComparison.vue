<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, ref, watch } from "vue";
import type { MedicalRecordDraft } from "@klinok/contracts";
import {
  laboratoryComparisonPreferenceKey,
  readLaboratoryComparisonPreference,
  writeLaboratoryComparisonPreference,
  type LaboratoryComparisonRole,
  type LaboratoryComparisonScope,
} from "../laboratoryComparisonPreferences";
import { isLaboratoryTestsValue } from "../medicalEncounter";
import AppIcon from "./AppIcon.vue";
import AppCatalogCombobox from "./AppCatalogCombobox.vue";
import AppPaginator from "./AppPaginator.vue";

type PageSize = 10 | 20 | 50;

const props = defineProps<{
  records: readonly MedicalRecordDraft[];
  confirmedIds: ReadonlySet<string>;
  accountId: string;
  role: LaboratoryComparisonRole;
  petId: string;
}>();
const selectedIds = ref<string[]>([]);
const customText = ref("");
const page = ref(1);
const pageSize = ref<PageSize>(10);
const dateSort = ref<"asc" | "desc">("asc");
const sessionSelections = new Map<string, string[]>();
let hydratingPreference = false;
let hydratedPreferenceKey = "";
const preferenceScope = computed<LaboratoryComparisonScope>(() => ({
  accountId: props.accountId,
  role: props.role,
  petId: props.petId,
}));
const preferenceKey = computed(() => laboratoryComparisonPreferenceKey(preferenceScope.value));
const occurrences = computed(() => props.records.flatMap((record) => {
  const section = record.sections["laboratory-tests"];
  if (section?.templateVersion !== "laboratory-tests-v1" || !isLaboratoryTestsValue(section.value)) return [];
  return section.value.studies.flatMap((study) => study.mode === "panel" ? [{ record, study }] : []);
}).sort((a, b) => a.study.date.localeCompare(b.study.date) || a.study.id.localeCompare(b.study.id)));
const indicatorMap = computed(() => new Map(occurrences.value.flatMap(({ study }) => study.mode === "panel" ? study.results.map((result) => [result.indicatorId, { id: result.indicatorId, label: result.unit ? `${result.indicatorName}, ${result.unit}` : result.indicatorName }] as const) : [])));
const options = computed(() => [...indicatorMap.value.values()]);
const selectedIndicators = computed(() => selectedIds.value.flatMap((id) => {
  const indicator = indicatorMap.value.get(id);
  return indicator ? [indicator] : [];
}));
const rows = computed(() => occurrences.value
  .filter(({ study }) => study.mode === "panel" && study.results.some((result) => selectedIds.value.includes(result.indicatorId)))
  .sort((left, right) => {
    const order = left.study.date.localeCompare(right.study.date) || left.study.id.localeCompare(right.study.id);
    return dateSort.value === "asc" ? order : -order;
  }));
const pageCount = computed(() => Math.max(1, Math.ceil(rows.value.length / pageSize.value)));
const currentPage = computed(() => Math.min(Math.max(1, page.value), pageCount.value));
const paged = computed(() => rows.value.slice(
  (currentPage.value - 1) * pageSize.value,
  currentPage.value * pageSize.value,
));
watch(preferenceKey, (key) => {
  hydratingPreference = true;
  page.value = 1;
  const stored = sessionSelections.get(key) ?? readLaboratoryComparisonPreference(preferenceScope.value);
  selectedIds.value = [...stored];
  sessionSelections.set(key, [...stored]);
  hydratedPreferenceKey = key;
  hydratingPreference = false;
}, { immediate: true, flush: "sync" });
watch([selectedIds, pageSize], () => { page.value = 1; }, { deep: true });
watch(pageCount, (count) => {
  if (page.value > count) page.value = count;
});
watch(selectedIds, (ids) => {
  if (hydratingPreference || hydratedPreferenceKey !== preferenceKey.value) return;
  sessionSelections.set(preferenceKey.value, [...ids]);
  writeLaboratoryComparisonPreference(preferenceScope.value, ids);
}, { deep: true, flush: "sync" });
watch([preferenceKey, indicatorMap], ([key, indicators]) => {
  if (!indicators.size || hydratedPreferenceKey !== key) return;
  const availableIds = selectedIds.value.filter((id) => indicators.has(id));
  if (availableIds.length !== selectedIds.value.length) selectedIds.value = availableIds;
}, { immediate: true });
function result(study: (typeof occurrences.value)[number]["study"], id: string) { return study.mode === "panel" ? study.results.find((item) => item.indicatorId === id) : undefined; }
function date(value: string) { const [year, month, day] = value.split("-"); return `${day}.${month}.${year}`; }
function toggleDateSort() {
  dateSort.value = dateSort.value === "asc" ? "desc" : "asc";
  page.value = 1;
}
function removeIndicator(id: string) {
  selectedIds.value = selectedIds.value.filter((selectedId) => selectedId !== id);
}
</script>
<template>
  <section v-if="options.length" class="panel laboratory-comparison">
    <h2>История лабораторных показателей</h2>
    <AppCatalogCombobox v-model:selected-ids="selectedIds" v-model:custom-text="customText" multiple :allow-custom="false" label="Показатели для сравнения" :options="options" placeholder="Выберите показатели" />
    <div v-if="selectedIds.length" class="laboratory-comparison-table">
      <div class="owner-access-table-wrap laboratory-results-scroll">
        <table class="owner-access-table laboratory-results">
          <caption class="laboratory-results-mobile-columns">
            <span v-for="indicator in selectedIndicators" :key="indicator.id" class="laboratory-comparison-column-heading">
              <span class="laboratory-comparison-column-label">{{ indicator.label }}</span>
              <button
                type="button"
                class="laboratory-comparison-remove"
                :title="`Удалить показатель «${indicator.label}»`"
                :aria-label="`Удалить показатель «${indicator.label}»`"
                @click="removeIndicator(indicator.id)"
              ><AppIcon name="close" /></button>
            </span>
          </caption>
          <thead>
            <tr>
              <th :aria-sort="dateSort === 'asc' ? 'ascending' : 'descending'">
                <button class="table-sort-button" type="button" @click="toggleDateSort">
                  <span>Дата</span>
                  <AppIcon name="chevron-down" :class="{ descending: dateSort === 'desc' }" />
                </button>
              </th>
              <th><span class="laboratory-comparison-column-label">Исследование</span></th>
              <th v-for="id in selectedIds" :key="id">
                <span class="laboratory-comparison-column-heading">
                  <span class="laboratory-comparison-column-label">{{ indicatorMap.get(id)?.label }}</span>
                  <button
                    type="button"
                    class="laboratory-comparison-remove"
                    :title="`Удалить показатель «${indicatorMap.get(id)?.label}»`"
                    :aria-label="`Удалить показатель «${indicatorMap.get(id)?.label}»`"
                    @click="removeIndicator(id)"
                  ><AppIcon name="close" /></button>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paged" :key="`${row.record.recordId}:${row.study.id}`">
              <td data-label="Дата">{{ date(row.study.date) }}</td>
              <td data-label="Исследование">{{ row.study.typeName }}</td>
              <td v-for="id in selectedIds" :key="id" :data-label="indicatorMap.get(id)?.label">
                <span v-if="result(row.study, id)" class="laboratory-result-content">
                  <span>{{ result(row.study, id)?.result }}</span>
                  <small v-if="result(row.study, id)?.reference" class="laboratory-result-reference">Реф.: {{ result(row.study, id)?.reference }}</small>
                </span>
                <span v-else>—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPaginator
        v-if="rows.length"
        v-model:page-size="pageSize"
        :page="currentPage"
        :total-items="rows.length"
        :page-sizes="[10, 20, 50]"
        page-size-label="Исследований на странице"
        aria-label="Навигация по истории лабораторных показателей"
        @update:page="page = $event"
      />
    </div>
  </section>
</template>
