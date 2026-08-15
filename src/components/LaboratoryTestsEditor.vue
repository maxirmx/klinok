<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, ref } from "vue";
import { LABORATORY_STUDY_OPTIONS, laboratoryStudyTypeById, type LaboratoryPanelStudyValue, type LaboratoryStudyValue, type LaboratoryTestsSectionValue } from "@klinok/contracts";
import AppCatalogCombobox from "./AppCatalogCombobox.vue";
import AppIcon from "./AppIcon.vue";
import ConfirmationDialog from "./ConfirmationDialog.vue";

const props = defineProps<{ encounterDate: string; errors?: string }>();
const model = defineModel<LaboratoryTestsSectionValue>({ required: true });
const pending = ref<(() => void) | null>(null);
const confirmOpen = computed({ get: () => Boolean(pending.value), set: (value) => { if (!value) pending.value = null; } });
const uuid = () => globalThis.crypto.randomUUID();
function addStudy() { model.value = { studies: [...model.value.studies, { id: uuid(), date: props.encounterDate, typeId: "", typeName: "", mode: "panel", laboratory: "", results: [] } as LaboratoryStudyValue] }; }
function populated(study: LaboratoryStudyValue) { return study.laboratory || study.technician || study.equipment || study.comment || (study.mode === "panel" ? study.results.length : study.mode === "narrative" ? study.result : study.infection); }
function destructive(action: () => void, hasData = true) { if (!hasData) action(); else pending.value = action; }
function removeStudy(index: number) { const study = model.value.studies[index]!; destructive(() => { model.value = { studies: model.value.studies.filter((_, candidate) => candidate !== index) }; }, Boolean(populated(study))); }
function changeType(study: LaboratoryStudyValue, ids: string[]) {
  const next = laboratoryStudyTypeById(ids[0] ?? ""); if (!next || next.id === study.typeId) return;
  destructive(() => { const base = { id: study.id, date: study.date, typeId: next.id, typeName: next.name, laboratory: study.laboratory, ...(study.technician ? { technician: study.technician } : {}), ...(study.equipment ? { equipment: study.equipment } : {}), ...(study.comment ? { comment: study.comment } : {}) }; const replacement = next.mode === "panel" ? { ...base, mode: "panel" as const, results: [] } : next.mode === "narrative" ? { ...base, mode: "narrative" as const, result: "" } : { ...base, mode: "infection" as const, infection: "", method: "ПЦР" as const, result: "negative" as const }; Object.assign(study, replacement); for (const key of ["results", "result", "infection", "method"] as const) if (!(key in replacement)) delete (study as unknown as Record<string, unknown>)[key]; }, Boolean(study.typeId && populated(study)));
}
function indicatorOptions(study: LaboratoryStudyValue) { return laboratoryStudyTypeById(study.typeId)?.indicators.map(({ id, name, unit }) => ({ id, label: unit ? `${name} — ${unit}` : name })) ?? []; }
function selectedIndicatorIds(study: LaboratoryStudyValue) { return study.mode === "panel" ? study.results.map((result) => result.indicatorId) : []; }
function changeIndicators(study: LaboratoryStudyValue, ids: string[]) { if (study.mode !== "panel") return; const type = laboratoryStudyTypeById(study.typeId); if (!type) return; const removed = study.results.filter((result) => !ids.includes(result.indicatorId)); const apply = () => { (study as { results: LaboratoryPanelStudyValue["results"] }).results = ids.map((id) => study.results.find((result) => result.indicatorId === id) ?? (() => { const item = type.indicators.find((candidate) => candidate.id === id)!; return { indicatorId: item.id, indicatorName: item.name, unit: item.unit, result: "" }; })()); }; destructive(apply, removed.some((item) => item.result || item.reference)); }
function confirm() { const action = pending.value; pending.value = null; action?.(); }
</script>

<template>
  <p v-if="errors" class="field-error" role="alert">{{ errors }}</p>
  <div class="laboratory-study-list">
    <section v-for="(study, index) in model.studies" :key="study.id" class="laboratory-study-card">
      <div class="doctor-heading laboratory-study-heading"><h4>Исследование {{ index + 1 }}</h4><button type="button" class="outline-action inline danger-outline owner-profile-action laboratory-study-delete" title="Удалить исследование" aria-label="Удалить исследование" @click="removeStudy(index)"><AppIcon name="trash" /></button></div>
      <div class="laboratory-metadata">
        <label><span>Дата исследования</span><input v-model="study.date" type="date" :max="new Date().toISOString().slice(0, 10)" required /></label>
        <div><span class="field-label">Название исследования</span><AppCatalogCombobox label="Название исследования" :options="LABORATORY_STUDY_OPTIONS" :selected-ids="study.typeId ? [study.typeId] : []" custom-text="" :allow-custom="false" @update:selected-ids="changeType(study, $event)" /></div>
        <label><span>Лаборатория</span><input v-model="study.laboratory" required /></label>
        <label><span>ФИО лаборанта</span><input v-model="study.technician" /></label>
        <label><span>Оборудование</span><input v-model="study.equipment" /></label>
      </div>
      <template v-if="study.mode === 'panel' && study.typeId">
        <div><span class="field-label">Показатели</span><AppCatalogCombobox label="Показатели" multiple :options="indicatorOptions(study)" :selected-ids="selectedIndicatorIds(study)" custom-text="" :allow-custom="false" @update:selected-ids="changeIndicators(study, $event)" /></div>
        <div v-if="study.results.length" class="laboratory-results-scroll"><table class="laboratory-results"><thead><tr><th>Показатель</th><th>Результат</th><th>Ед. измерения</th><th>Референсные значения</th></tr></thead><tbody><tr v-for="result in study.results" :key="result.indicatorId"><td>{{ result.indicatorName }}</td><td><input v-model="result.result" required /></td><td>{{ result.unit || '—' }}</td><td><input v-model="result.reference" /></td></tr></tbody></table></div>
      </template>
      <label v-else-if="study.mode === 'narrative'"><span>Результат</span><textarea v-model="study.result" rows="4" required /></label>
      <div v-else-if="study.mode === 'infection'" class="laboratory-infection"><label><span>Инфекция</span><input v-model="study.infection" required /></label><label><span>Метод</span><select v-model="study.method"><option v-for="method in ['ПЦР','ИФА','РМА','ELISA','ИХА']" :key="method">{{ method }}</option></select></label><fieldset class="medical-card-option-panel"><legend>Результат</legend><div class="medical-card-options"><label><input v-model="study.result" type="radio" value="positive" /> Положительно</label><label><input v-model="study.result" type="radio" value="negative" /> Отрицательно</label></div></fieldset></div>
      <label><span>Комментарий</span><textarea v-model="study.comment" class="medical-card-comment" rows="2" /></label>
    </section>
  </div>
  <button type="button" class="outline-action inline" @click="addStudy"><AppIcon name="plus" /> Добавить исследование</button>
  <ConfirmationDialog v-model="confirmOpen" title="Удалить заполненные данные?" description="После подтверждения будут удалены только данные выбранного исследования или показателя." confirm-label="Удалить" @confirm="confirm" />
</template>
