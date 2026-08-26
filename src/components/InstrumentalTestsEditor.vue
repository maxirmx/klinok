<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, onBeforeMount, ref, useId } from "vue";
import {
  INSTRUMENTAL_STUDY_OPTIONS,
  canonicalizeInstrumentalFindingValues,
  instrumentalFindingById,
  instrumentalStudyTypeById,
  type InstrumentalFindingValue,
  type InstrumentalStudyValue,
  type InstrumentalTestsSectionValue,
} from "@klinok/contracts";
import type { InstrumentalTestsDraftErrors } from "../instrumentalTests";
import AppCatalogCombobox from "./AppCatalogCombobox.vue";
import AppIcon from "./AppIcon.vue";
import ConfirmationDialog from "./ConfirmationDialog.vue";
import InstrumentalFindingEditor from "./InstrumentalFindingEditor.vue";

const props = withDefaults(defineProps<{ encounterDate: string; errors?: InstrumentalTestsDraftErrors }>(), {
  errors: () => ({ studies: [] }),
});
const model = defineModel<InstrumentalTestsSectionValue>({ required: true });
const pendingTypeIds = ref<string[]>([]);
const pending = ref<{ id: string; typeName: string } | null>(null);
const errorBaseId = useId();
const pendingType = computed(() => instrumentalStudyTypeById(pendingTypeIds.value[0] ?? ""));
const confirmOpen = computed({ get: () => Boolean(pending.value), set: (value) => { if (!value) pending.value = null; } });
const confirmDescription = computed(() => pending.value
  ? `Исследование «${pending.value.typeName}» и все заполненные данные будут удалены.`
  : "После подтверждения заполненные данные будут удалены.");
const uuid = () => globalThis.crypto.randomUUID();

onBeforeMount(() => {
  let changed = false;
  const studies = model.value.studies.map((study) => {
    if (study.mode !== "tree") return study;
    const findings = canonicalizeInstrumentalFindingValues(study.findings);
    if (findings === study.findings) return study;
    changed = true;
    return { ...study, findings };
  });
  if (changed) model.value = { studies };
});

function addStudy() {
  const type = pendingType.value;
  if (!type) return;
  const base = { id: uuid(), date: props.encounterDate, typeId: type.id, typeName: type.name };
  const study: InstrumentalStudyValue = type.mode === "tree"
    ? { ...base, mode: "tree", findings: [] }
    : { ...base, mode: "narrative", result: "" };
  model.value = { studies: [...model.value.studies, study] };
  pendingTypeIds.value = [];
}
function findingHasData(findings: readonly InstrumentalFindingValue[]): boolean {
  return findings.some((finding) => instrumentalFindingById(finding.findingId)?.kind === "choice"
    || Boolean(finding.value?.trim()) || findingHasData(finding.children));
}
function populated(study: InstrumentalStudyValue) {
  return Boolean(study.comment?.trim()) || (study.mode === "narrative" ? Boolean(study.result.trim()) : findingHasData(study.findings));
}
function removeNow(id: string) { model.value = { studies: model.value.studies.filter((study) => study.id !== id) }; }
function removeStudy(study: InstrumentalStudyValue) {
  if (populated(study)) pending.value = { id: study.id, typeName: study.typeName };
  else removeNow(study.id);
}
function confirmRemove() { const id = pending.value?.id; pending.value = null; if (id) removeNow(id); }
function invalid(message?: string) { return message ? true : undefined; }
function errorId(...parts: string[]) {
  return `${errorBaseId}-${parts.join("-").replace(/[^a-zA-Z0-9_-]/g, "-")}-error`;
}
function describedBy(message: string | undefined, ...parts: string[]) {
  return message ? errorId(...parts) : undefined;
}
</script>

<template>
  <div class="instrumental-study-list">
    <section v-for="(study, index) in model.studies" :key="study.id" class="instrumental-study-card">
      <div class="doctor-heading instrumental-study-heading"><h4 :title="study.typeName">{{ study.typeName }}</h4><button type="button" class="outline-action inline danger-outline medical-card-action instrumental-study-delete" title="Удалить исследование" aria-label="Удалить исследование" @click="removeStudy(study)"><AppIcon name="trash" /></button></div>
      <small v-if="errors.studies[index]?.section" :id="errorId(study.id, 'section')" class="field-error" role="alert" tabindex="-1" data-encounter-error-anchor="true">{{ errors.studies[index]?.section }}</small>
      <label class="instrumental-study-date"><span>Дата исследования</span><input v-model="study.date" type="date" :max="new Date().toISOString().slice(0, 10)" required :aria-invalid="invalid(errors.studies[index]?.date)" :aria-describedby="describedBy(errors.studies[index]?.date, study.id, 'date')" /><small v-if="errors.studies[index]?.date" :id="errorId(study.id, 'date')" class="field-error" role="alert">{{ errors.studies[index]?.date }}</small></label>
      <div v-if="study.mode === 'tree'" class="instrumental-findings-grid medical-card-action-grid">
        <InstrumentalFindingEditor v-model="study.findings" :catalog="instrumentalStudyTypeById(study.typeId)?.findings ?? []" :errors="errors.studies[index]?.findings" />
      </div>
      <label v-else><span>Результат</span><textarea v-model="study.result" rows="4" required :aria-invalid="invalid(errors.studies[index]?.result)" :aria-describedby="describedBy(errors.studies[index]?.result, study.id, 'result')" /><small v-if="errors.studies[index]?.result" :id="errorId(study.id, 'result')" class="field-error" role="alert">{{ errors.studies[index]?.result }}</small></label>
      <section v-if="study.mode === 'narrative'" class="medical-card-comment-section instrumental-study-comment"><h4>Комментарий</h4><textarea v-model="study.comment" class="medical-card-comment" rows="2" aria-label="Комментарий" /></section>
    </section>
  </div>
  <div class="instrumental-study-create">
    <span class="field-label">Тип исследования</span>
    <div class="instrumental-study-create-control medical-card-action-grid">
      <AppCatalogCombobox v-model:selected-ids="pendingTypeIds" label="Тип исследования" :options="INSTRUMENTAL_STUDY_OPTIONS" custom-text="" :allow-custom="false" :invalid="Boolean(errors.section)" :described-by="describedBy(errors.section, 'section')" />
      <button type="button" class="outline-action inline medical-card-action instrumental-study-add" :disabled="!pendingType" title="Добавить исследование" aria-label="Добавить исследование" @click="addStudy"><AppIcon name="plus" /></button>
    </div>
    <small v-if="errors.section" :id="errorId('section')" class="field-error" role="alert">{{ errors.section }}</small>
  </div>
  <ConfirmationDialog v-model="confirmOpen" title="Удалить заполненное исследование?" :description="confirmDescription" confirm-label="Удалить" @confirm="confirmRemove" />
</template>
