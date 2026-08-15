<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, ref } from "vue";
import { LABORATORY_STUDY_OPTIONS, laboratoryStudyTypeById, type LaboratoryStudyValue, type LaboratoryTestsSectionValue } from "@klinok/contracts";
import AppCatalogCombobox from "./AppCatalogCombobox.vue";
import AppIcon from "./AppIcon.vue";
import ConfirmationDialog from "./ConfirmationDialog.vue";

const props = defineProps<{ encounterDate: string; errors?: string }>();
const model = defineModel<LaboratoryTestsSectionValue>({ required: true });
const pending = ref<(() => void) | null>(null);
const pendingTypeIds = ref<string[]>([]);
const pendingType = computed(() => laboratoryStudyTypeById(pendingTypeIds.value[0] ?? ""));
const confirmOpen = computed({ get: () => Boolean(pending.value), set: (value) => { if (!value) pending.value = null; } });
const uuid = () => globalThis.crypto.randomUUID();
function addStudy() {
  const type = pendingType.value;
  if (!type) return;
  const base = { id: uuid(), date: props.encounterDate, typeId: type.id, typeName: type.name, laboratory: "" };
  const study: LaboratoryStudyValue = type.mode === "panel"
    ? { ...base, mode: "panel", results: type.indicators.map(({ id, name, unit }) => ({ indicatorId: id, indicatorName: name, unit, result: "" })) }
    : type.mode === "narrative"
      ? { ...base, mode: "narrative", result: "" }
      : { ...base, mode: "infection", infection: "", method: "ПЦР", result: "negative" };
  model.value = { studies: [...model.value.studies, study] };
  pendingTypeIds.value = [];
}
function populated(study: LaboratoryStudyValue) { return study.laboratory || study.technician || study.equipment || study.comment || (study.mode === "panel" ? study.results.some((result) => result.result || result.reference) : study.mode === "narrative" ? study.result : study.infection); }
function destructive(action: () => void, hasData = true) { if (!hasData) action(); else pending.value = action; }
function removeStudy(index: number) { const study = model.value.studies[index]!; destructive(() => { model.value = { studies: model.value.studies.filter((_, candidate) => candidate !== index) }; }, Boolean(populated(study))); }
function confirm() { const action = pending.value; pending.value = null; action?.(); }
</script>

<template>
  <p v-if="errors" class="field-error" role="alert">{{ errors }}</p>
  <div class="laboratory-study-create">
    <span class="field-label">Тип исследования</span>
    <div class="laboratory-study-create-control">
      <AppCatalogCombobox v-model:selected-ids="pendingTypeIds" label="Тип исследования" :options="LABORATORY_STUDY_OPTIONS" custom-text="" :allow-custom="false" />
      <button type="button" class="outline-action inline owner-profile-action laboratory-study-add" :disabled="!pendingType" title="Добавить исследование" aria-label="Добавить исследование" @click="addStudy"><AppIcon name="plus" /></button>
    </div>
  </div>
  <div class="laboratory-study-list">
    <section v-for="(study, index) in model.studies" :key="study.id" class="laboratory-study-card">
      <div class="doctor-heading laboratory-study-heading"><h4 :title="study.typeName">{{ study.typeName }}</h4><button type="button" class="outline-action inline danger-outline owner-profile-action laboratory-study-delete" title="Удалить исследование" aria-label="Удалить исследование" @click="removeStudy(index)"><AppIcon name="trash" /></button></div>
      <div class="laboratory-metadata">
        <label><span>Дата исследования</span><input v-model="study.date" type="date" :max="new Date().toISOString().slice(0, 10)" required /></label>
        <label><span>Лаборатория</span><input v-model="study.laboratory" required /></label>
        <label><span>ФИО лаборанта</span><input v-model="study.technician" /></label>
        <label><span>Оборудование</span><input v-model="study.equipment" /></label>
      </div>
      <template v-if="study.mode === 'panel' && study.typeId">
        <div v-if="study.results.length" class="laboratory-results-scroll"><table class="laboratory-results"><thead><tr><th>Показатель</th><th>Результат</th><th>Ед. измерения</th><th>Референсные значения</th></tr></thead><tbody><tr v-for="result in study.results" :key="result.indicatorId"><td>{{ result.indicatorName }}</td><td><input v-model="result.result" required /></td><td>{{ result.unit || '—' }}</td><td><input v-model="result.reference" /></td></tr></tbody></table></div>
      </template>
      <label v-else-if="study.mode === 'narrative'"><span>Результат</span><textarea v-model="study.result" rows="4" required /></label>
      <div v-else-if="study.mode === 'infection'" class="laboratory-infection"><label><span>Инфекция</span><input v-model="study.infection" required /></label><label><span>Метод</span><select v-model="study.method"><option v-for="method in ['ПЦР','ИФА','РМА','ELISA','ИХА']" :key="method">{{ method }}</option></select></label><fieldset class="medical-card-option-panel"><legend>Результат</legend><div class="medical-card-options"><label><input v-model="study.result" type="radio" value="positive" /> Положительно</label><label><input v-model="study.result" type="radio" value="negative" /> Отрицательно</label></div></fieldset></div>
      <section class="medical-card-comment-section laboratory-study-comment"><h4>Комментарий</h4><textarea v-model="study.comment" class="medical-card-comment" rows="2" aria-label="Комментарий" /></section>
    </section>
  </div>
  <ConfirmationDialog v-model="confirmOpen" title="Удалить заполненные данные?" description="После подтверждения будут удалены данные выбранного исследования." confirm-label="Удалить" @confirm="confirm" />
</template>
