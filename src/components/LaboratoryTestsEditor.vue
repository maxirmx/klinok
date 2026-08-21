<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, ref } from "vue";
import { LABORATORY_STUDY_OPTIONS, laboratoryStudyTypeById, type LaboratoryStudyValue, type LaboratoryTestsSectionValue } from "@klinok/contracts";
import AppCatalogCombobox from "./AppCatalogCombobox.vue";
import AppIcon from "./AppIcon.vue";
import ConfirmationDialog from "./ConfirmationDialog.vue";
import type { LaboratoryTestsDraftErrors } from "../laboratoryTests";

const props = withDefaults(defineProps<{ encounterDate: string; errors?: LaboratoryTestsDraftErrors }>(), {
  errors: () => ({ studies: [] }),
});
const model = defineModel<LaboratoryTestsSectionValue>({ required: true });
const pending = ref<{ action: () => void; title: string; description: string } | null>(null);
const pendingTypeIds = ref<string[]>([]);
const pendingIndicatorIds = ref<Record<string, string[]>>({});
const pendingType = computed(() => laboratoryStudyTypeById(pendingTypeIds.value[0] ?? ""));
const confirmOpen = computed({ get: () => Boolean(pending.value), set: (value) => { if (!value) pending.value = null; } });
const confirmTitle = computed(() => pending.value?.title ?? "Удалить заполненное исследование?");
const confirmDescription = computed(() => pending.value?.description ?? "После подтверждения заполненные данные будут удалены.");
const uuid = () => globalThis.crypto.randomUUID();
function addStudy() {
  const type = pendingType.value;
  if (!type) return;
  const base = { id: uuid(), date: props.encounterDate, typeId: type.id, typeName: type.name, laboratory: "" };
  const study: LaboratoryStudyValue = type.mode === "panel"
    ? { ...base, mode: "panel", results: [] }
    : type.mode === "narrative"
      ? { ...base, mode: "narrative", result: "" }
      : { ...base, mode: "infection", infection: "", method: "ПЦР", result: "negative" };
  model.value = { studies: [...model.value.studies, study] };
  if (study.mode === "panel") pendingIndicatorIds.value = { ...pendingIndicatorIds.value, [study.id]: [] };
  pendingTypeIds.value = [];
}
function hasText(value?: string) { return Boolean(value?.trim()); }
function populated(study: LaboratoryStudyValue) {
  return [study.laboratory, study.technician, study.equipment, study.comment].some(hasText)
    || (study.mode === "panel"
      ? study.results.some((result) => hasText(result.result) || hasText(result.reference))
      : study.mode === "narrative" ? hasText(study.result) : hasText(study.infection));
}
function destructive(action: () => void, hasData: boolean, title: string, description: string) {
  if (!hasData) action();
  else pending.value = { action, title, description };
}
function removeStudy(studyId: string) {
  const study = model.value.studies.find((candidate) => candidate.id === studyId);
  if (!study) return;
  destructive(() => {
    model.value = { studies: model.value.studies.filter((candidate) => candidate.id !== studyId) };
    const remaining = { ...pendingIndicatorIds.value };
    delete remaining[studyId];
    pendingIndicatorIds.value = remaining;
  }, populated(study), "Удалить заполненное исследование?", `Исследование «${study.typeName}» и все заполненные данные будут удалены.`);
}
function indicatorOptions(study: LaboratoryStudyValue) {
  if (study.mode !== "panel") return [];
  const type = laboratoryStudyTypeById(study.typeId);
  const added = new Set(study.results.map((result) => result.indicatorId));
  return (type?.indicators ?? [])
    .filter((indicator) => !added.has(indicator.id))
    .map((indicator) => ({ id: indicator.id, label: `${indicator.name} · ${indicator.unit || "—"}` }));
}
function selectedIndicatorIds(studyId: string) { return pendingIndicatorIds.value[studyId] ?? []; }
function selectIndicator(studyId: string, ids: string[]) {
  pendingIndicatorIds.value = { ...pendingIndicatorIds.value, [studyId]: ids.slice(0, 1) };
}
function pendingIndicator(study: LaboratoryStudyValue) {
  if (study.mode !== "panel") return undefined;
  const indicatorId = selectedIndicatorIds(study.id)[0];
  return laboratoryStudyTypeById(study.typeId)?.indicators.find((candidate) =>
    candidate.id === indicatorId && !study.results.some((result) => result.indicatorId === candidate.id));
}
function updateStudy(updated: LaboratoryStudyValue) {
  model.value = { studies: model.value.studies.map((study) => study.id === updated.id ? updated : study) };
}
function addIndicator(study: LaboratoryStudyValue) {
  if (study.mode !== "panel") return;
  const indicator = pendingIndicator(study);
  if (!indicator) return;
  updateStudy({
    ...study,
    results: [...study.results, {
      indicatorId: indicator.id,
      indicatorName: indicator.name,
      unit: indicator.unit,
      result: "",
    }],
  });
  selectIndicator(study.id, []);
}
function removeIndicator(studyId: string, indicatorId: string) {
  const study = model.value.studies.find((candidate) => candidate.id === studyId);
  if (study?.mode !== "panel") return;
  updateStudy({
    ...study,
    results: study.results.filter((candidate) => candidate.indicatorId !== indicatorId),
  });
}
function confirm() { const action = pending.value?.action; pending.value = null; action?.(); }
function invalid(message?: string) { return message ? true : undefined; }
</script>

<template>
  <div class="laboratory-study-create">
    <span class="field-label">Тип исследования</span>
    <div class="laboratory-study-create-control medical-card-action-grid">
      <AppCatalogCombobox v-model:selected-ids="pendingTypeIds" label="Тип исследования" :options="LABORATORY_STUDY_OPTIONS" custom-text="" :allow-custom="false" :invalid="Boolean(errors.section)" />
      <button type="button" class="outline-action inline medical-card-action laboratory-study-add" :disabled="!pendingType" title="Добавить исследование" aria-label="Добавить исследование" @click="addStudy"><AppIcon name="plus" /></button>
    </div>
    <small v-if="errors.section" class="field-error" role="alert">{{ errors.section }}</small>
  </div>
  <div class="laboratory-study-list">
    <section v-for="(study, index) in model.studies" :key="study.id" class="laboratory-study-card">
      <div class="doctor-heading laboratory-study-heading"><h4 :title="study.typeName">{{ study.typeName }}</h4><button type="button" class="outline-action inline danger-outline medical-card-action laboratory-study-delete" title="Удалить исследование" aria-label="Удалить исследование" @click="removeStudy(study.id)"><AppIcon name="trash" /></button></div>
      <small v-if="errors.studies[index]?.section" class="field-error" role="alert">{{ errors.studies[index]?.section }}</small>
      <div class="laboratory-metadata">
        <label><span>Дата исследования</span><input v-model="study.date" type="date" :max="new Date().toISOString().slice(0, 10)" required :aria-invalid="invalid(errors.studies[index]?.date)" /><small v-if="errors.studies[index]?.date" class="field-error" role="alert">{{ errors.studies[index]?.date }}</small></label>
        <label><span>Лаборатория</span><input v-model="study.laboratory" required :aria-invalid="invalid(errors.studies[index]?.laboratory)" /><small v-if="errors.studies[index]?.laboratory" class="field-error" role="alert">{{ errors.studies[index]?.laboratory }}</small></label>
        <label><span>ФИО лаборанта</span><input v-model="study.technician" /></label>
        <label><span>Оборудование</span><input v-model="study.equipment" /></label>
      </div>
      <template v-if="study.mode === 'panel' && study.typeId">
        <div class="laboratory-indicator-create">
          <span class="field-label">Показатель</span>
          <div class="laboratory-indicator-create-control medical-card-action-grid">
            <AppCatalogCombobox
              :selected-ids="selectedIndicatorIds(study.id)"
              label="Добавить показатель"
              :options="indicatorOptions(study)"
              custom-text=""
              :allow-custom="false"
              :invalid="Boolean(errors.studies[index]?.section)"
              placeholder="Выберите показатель"
              disabled-title="Все показатели добавлены"
              @update:selected-ids="selectIndicator(study.id, $event)"
            />
            <button
              type="button"
              class="outline-action inline medical-card-action laboratory-indicator-add"
              :disabled="!pendingIndicator(study)"
              title="Добавить показатель"
              aria-label="Добавить показатель"
              @click="addIndicator(study)"
            ><AppIcon name="plus" /></button>
          </div>
        </div>
        <div v-if="study.results.length" class="laboratory-panel-results laboratory-editor-results" role="group" aria-label="Показатели исследования">
          <div class="laboratory-panel-layout" :class="{ 'laboratory-panel-layout-multiple': study.results.length > 1 }">
            <div class="laboratory-result-headings laboratory-result-headings-primary" aria-hidden="true">
              <span>Показатель</span><span>Результат</span><span>Референсные значения</span>
            </div>
            <div v-if="study.results.length > 1" class="laboratory-result-headings laboratory-result-headings-secondary" aria-hidden="true">
              <span>Показатель</span><span>Результат</span><span>Референсные значения</span>
            </div>
            <div v-for="result in study.results" :key="result.indicatorId" class="laboratory-result-row medical-card-action-grid">
              <div class="laboratory-result-indicator">
                <span>{{ result.indicatorName }}</span>
                <span class="laboratory-result-unit">{{ result.unit || '—' }}</span>
              </div>
              <label>
                <span class="laboratory-result-mobile-name" :title="`${result.indicatorName} · ${result.unit || '—'}`">{{ result.indicatorName }} · {{ result.unit || '—' }}</span>
                <input v-model="result.result" required :aria-label="`${result.indicatorName}, результат`" :aria-invalid="invalid(errors.studies[index]?.indicators?.[result.indicatorId])" />
                <small v-if="errors.studies[index]?.indicators?.[result.indicatorId]" class="field-error" role="alert">{{ errors.studies[index]?.indicators?.[result.indicatorId] }}</small>
              </label>
              <label><span class="laboratory-result-label">Референсные значения</span><input v-model="result.reference" /></label>
              <button type="button" class="outline-action inline danger-outline medical-card-action laboratory-result-delete" title="Удалить показатель" :aria-label="`Удалить показатель «${result.indicatorName}»`" @click="removeIndicator(study.id, result.indicatorId)"><AppIcon name="trash" /></button>
            </div>
          </div>
        </div>
      </template>
      <label v-else-if="study.mode === 'narrative'"><span>Результат</span><textarea v-model="study.result" rows="4" required :aria-invalid="invalid(errors.studies[index]?.result)" /><small v-if="errors.studies[index]?.result" class="field-error" role="alert">{{ errors.studies[index]?.result }}</small></label>
      <div v-else-if="study.mode === 'infection'" class="laboratory-infection"><label><span>Инфекция</span><input v-model="study.infection" required :aria-invalid="invalid(errors.studies[index]?.infection)" /><small v-if="errors.studies[index]?.infection" class="field-error" role="alert">{{ errors.studies[index]?.infection }}</small></label><label><span>Метод</span><select v-model="study.method" :aria-invalid="invalid(errors.studies[index]?.method)"><option v-for="method in ['ПЦР','ИФА','РМА','ELISA','ИХА']" :key="method">{{ method }}</option></select><small v-if="errors.studies[index]?.method" class="field-error" role="alert">{{ errors.studies[index]?.method }}</small></label><fieldset class="medical-card-option-panel" :aria-invalid="invalid(errors.studies[index]?.infectionResult)"><legend>Результат</legend><div class="medical-card-options"><label><input v-model="study.result" type="radio" value="positive" /> Положительно</label><label><input v-model="study.result" type="radio" value="negative" /> Отрицательно</label></div><small v-if="errors.studies[index]?.infectionResult" class="field-error" role="alert">{{ errors.studies[index]?.infectionResult }}</small></fieldset></div>
      <section class="medical-card-comment-section laboratory-study-comment"><h4>Комментарий</h4><textarea v-model="study.comment" class="medical-card-comment" rows="2" aria-label="Комментарий" /></section>
    </section>
  </div>
  <ConfirmationDialog v-model="confirmOpen" :title="confirmTitle" :description="confirmDescription" confirm-label="Удалить" @confirm="confirm" />
</template>
