<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import AppIcon from "./AppIcon.vue";
import DiagnosisEditor from "./DiagnosisEditor.vue";
import TherapeuticAppointmentForm from "./TherapeuticAppointmentForm.vue";
import LaboratoryTestsEditor from "./LaboratoryTestsEditor.vue";
import WhatHappenedTree from "./WhatHappenedTree.vue";
import {
  ENCOUNTER_SECTION_LABELS,
  OPTIONAL_ENCOUNTER_SECTION_KINDS,
  OUTCOME_OPTIONS,
  REVACCINATION_INTERVAL_OPTIONS,
  WHAT_HAPPENED_TREE,
  calculateNextRevaccinationDate,
  emptyVaccinationDraft,
  emptyDiagnosisDraft,
  parseDiagnosisDraft,
  parseGeneralDataDraft,
  parseVaccinationDraft,
  replaceConflictingOutcome,
  whatHappenedPath,
} from "../medicalEncounter";
import {
  emptyTherapeuticAppointmentDraft,
  parseTherapeuticAppointmentDraft,
} from "../therapeuticAppointment";
import { parseLaboratoryTestsDraft } from "../laboratoryTests";
import type {
  GeneralDataDraft,
  GeneralDataDraftErrors,
  DiagnosisDraft,
  DiagnosisDraftErrors,
  VaccinationDraft,
  VaccinationDraftErrors,
  RevaccinationInterval,
} from "../medicalEncounter";
import type {
  TherapeuticAppointmentDraft,
  TherapeuticAppointmentDraftErrors,
} from "../therapeuticAppointment";
import type { LaboratoryTestsDraftErrors } from "../laboratoryTests";
import type { MedicalEncounterSectionKind } from "../repositories/types";
import type { LaboratoryTestsSectionValue } from "@klinok/contracts";

const props = defineProps<{
  busy: boolean;
  editing: boolean;
  latestConfirmedVaccination?: { date: string; name: string };
  petBirthDate?: string;
}>();
const emit = defineEmits<{
  save: [];
  cancel: [];
  removeSection: [kind: MedicalEncounterSectionKind];
}>();

const date = defineModel<string>("date", { required: true });
const selectedIds = defineModel<string[]>("selectedIds", { required: true });
const comment = defineModel<string>("comment", { required: true });
const outcomeSelectedIds = defineModel<string[]>("outcomeSelectedIds", { required: true });
const outcomeComment = defineModel<string>("outcomeComment", { required: true });
const optionalKinds = defineModel<MedicalEncounterSectionKind[]>("optionalKinds", { required: true });
const texts = defineModel<Partial<Record<MedicalEncounterSectionKind, string>>>("texts", { required: true });
const generalData = defineModel<GeneralDataDraft>("generalData", { required: true });
const vaccination = defineModel<VaccinationDraft>("vaccination", { required: true });
const therapeuticAppointment = defineModel<TherapeuticAppointmentDraft>("therapeuticAppointment", { required: true });
const diagnosis = defineModel<DiagnosisDraft>("diagnosis", { required: true });
const laboratoryTests = defineModel<LaboratoryTestsSectionValue>("laboratoryTests", { required: true });
const form = ref<HTMLFormElement | null>(null);
const generalDataErrors = ref<GeneralDataDraftErrors>({});
const vaccinationErrors = ref<VaccinationDraftErrors>({});
const therapeuticErrors = ref<TherapeuticAppointmentDraftErrors>({});
const diagnosisErrors = ref<DiagnosisDraftErrors>({});
const laboratoryErrors = ref<LaboratoryTestsDraftErrors>({ studies: [] });
const revaccinationInterval = ref<RevaccinationInterval | "">("");
const revaccinationChooserOpen = ref(false);
const revaccinationMenuRoot = ref<HTMLElement | null>(null);
const optionalAvailable = computed(() => OPTIONAL_ENCOUNTER_SECTION_KINDS.filter((kind) => !optionalKinds.value.includes(kind)));
const revaccinationIntervalOptions = computed(() => REVACCINATION_INTERVAL_OPTIONS
  .filter((option) => option.value !== "next-birthday" || props.petBirthDate));

function handleDocumentPointerDown(event: PointerEvent) {
  if (revaccinationChooserOpen.value && !revaccinationMenuRoot.value?.contains(event.target as Node)) {
    revaccinationChooserOpen.value = false;
  }
}

onMounted(() => document.addEventListener("pointerdown", handleDocumentPointerDown));
onBeforeUnmount(() => document.removeEventListener("pointerdown", handleDocumentPointerDown));

watch(date, () => {
  if (revaccinationInterval.value) applyRevaccinationInterval(revaccinationInterval.value);
});
watch(diagnosis, () => { diagnosisErrors.value = {}; }, { deep: true });
watch(laboratoryTests, () => { laboratoryErrors.value = { studies: [] }; }, { deep: true });

function toggleSelection(id: string) {
  const index = selectedIds.value.indexOf(id);
  if (index >= 0) selectedIds.value = selectedIds.value.filter((selectedId) => selectedId !== id);
  else {
    const condition = id.split(".", 1)[0];
    selectedIds.value = [
      ...selectedIds.value.filter((selectedId) => selectedId.split(".", 1)[0] === condition),
      id,
    ];
  }
}

function toggleOutcome(id: string) {
  outcomeSelectedIds.value = replaceConflictingOutcome(outcomeSelectedIds.value, id);
}

function selectOptional(event: Event) {
  const select = event.target as HTMLSelectElement;
  const kind = select.value as MedicalEncounterSectionKind;
  if (kind && !optionalKinds.value.includes(kind)) {
    optionalKinds.value = [...optionalKinds.value, kind];
    if (kind === "vaccination") {
      vaccination.value = emptyVaccinationDraft(props.latestConfirmedVaccination);
      vaccinationErrors.value = {};
      revaccinationInterval.value = "";
      revaccinationChooserOpen.value = false;
      const nextTexts = { ...texts.value };
      delete nextTexts.vaccination;
      texts.value = nextTexts;
    }
    if (kind === "therapeutic-appointment") {
      therapeuticAppointment.value = emptyTherapeuticAppointmentDraft();
      therapeuticErrors.value = {};
      const nextTexts = { ...texts.value };
      delete nextTexts["therapeutic-appointment"];
      texts.value = nextTexts;
    }
    if (kind === "diagnosis") {
      diagnosis.value = emptyDiagnosisDraft();
      diagnosisErrors.value = {};
      const nextTexts = { ...texts.value };
      delete nextTexts.diagnosis;
      texts.value = nextTexts;
    }
    if (kind === "laboratory-tests") {
      laboratoryTests.value = { studies: [] };
      laboratoryErrors.value = { studies: [] };
      const nextTexts = { ...texts.value };
      delete nextTexts["laboratory-tests"];
      texts.value = nextTexts;
    }
  }
  select.value = "";
}

function updateText(kind: MedicalEncounterSectionKind, event: Event) {
  texts.value = { ...texts.value, [kind]: (event.target as HTMLTextAreaElement).value };
}

function updateGeneralData() {
  generalDataErrors.value = {};
}

function updateVaccination() {
  vaccinationErrors.value = {};
}

function updateTherapeuticAppointment(value: TherapeuticAppointmentDraft) {
  therapeuticAppointment.value = value;
  therapeuticErrors.value = {};
}

function applyRevaccinationInterval(interval: RevaccinationInterval) {
  const nextRevaccinationDate = calculateNextRevaccinationDate(
    date.value,
    interval,
    props.petBirthDate,
  );
  vaccination.value = { ...vaccination.value, nextRevaccinationDate };
  if (vaccinationErrors.value.nextRevaccinationDate) {
    const nextErrors = { ...vaccinationErrors.value };
    delete nextErrors.nextRevaccinationDate;
    vaccinationErrors.value = nextErrors;
  }
}

function selectRevaccinationInterval(interval: RevaccinationInterval, event: Event) {
  revaccinationMenuRoot.value = (event.currentTarget as HTMLElement)
    .closest<HTMLElement>(".vaccination-revaccination-menu");
  revaccinationInterval.value = interval;
  applyRevaccinationInterval(interval);
  closeRevaccinationChooser(true);
}

function useManualRevaccinationDate() {
  revaccinationInterval.value = "";
}

function toggleRevaccinationChooser(event: Event) {
  revaccinationMenuRoot.value = (event.currentTarget as HTMLElement)
    .closest<HTMLElement>(".vaccination-revaccination-menu");
  revaccinationChooserOpen.value = !revaccinationChooserOpen.value;
}

function closeRevaccinationChooser(restoreFocus = false) {
  revaccinationChooserOpen.value = false;
  if (restoreFocus) {
    void nextTick(() => revaccinationMenuRoot.value?.querySelector<HTMLButtonElement>(".vaccination-revaccination-toggle")?.focus());
  }
}

function submit() {
  if (!selectedIds.value.length || !outcomeSelectedIds.value.length) return;
  if (optionalKinds.value.includes("general-data") && texts.value["general-data"] === undefined) {
    const parsed = parseGeneralDataDraft(generalData.value);
    generalDataErrors.value = parsed.errors;
    if (!parsed.value) return;
  }
  if (optionalKinds.value.includes("vaccination") && texts.value.vaccination === undefined) {
    const parsed = parseVaccinationDraft(vaccination.value);
    vaccinationErrors.value = parsed.errors;
    if (!parsed.value) return;
  }
  if (optionalKinds.value.includes("therapeutic-appointment") && texts.value["therapeutic-appointment"] === undefined) {
    const parsed = parseTherapeuticAppointmentDraft(therapeuticAppointment.value);
    therapeuticErrors.value = parsed.errors;
    if (!parsed.value) return;
  }
  if (optionalKinds.value.includes("diagnosis")) {
    const parsed = parseDiagnosisDraft(diagnosis.value);
    diagnosisErrors.value = parsed.errors;
    if (!parsed.value) return;
  }
  if (optionalKinds.value.includes("laboratory-tests") && texts.value["laboratory-tests"] === undefined) {
    const parsed = parseLaboratoryTestsDraft(laboratoryTests.value);
    laboratoryErrors.value = parsed.errors;
    if (!parsed.value) return;
  }
  if (form.value?.reportValidity() === false) return;
  emit("save");
}
</script>

<template>
  <form ref="form" class="form-stack" @submit.prevent="submit">
    <div class="doctor-heading encounter-editor-heading">
      <h2>{{ editing ? 'Редактирование записи' : 'Сегодняшний приём' }}</h2>
      <div class="row-actions">
        <button class="primary-action inline owner-profile-action" type="button" :disabled="busy || !selectedIds.length || !outcomeSelectedIds.length" title="Сохранить запись" aria-label="Сохранить запись" @click="submit"><AppIcon name="check" /></button>
        <button v-if="editing" type="button" class="outline-action inline owner-profile-action" title="Отменить редактирование" aria-label="Отменить редактирование" @click="emit('cancel')"><AppIcon name="close" /></button>
      </div>
    </div>
    <label class="encounter-date-field"><span>Дата</span><input v-model="date" type="date" required /></label>
    <article class="encounter-section-card encounter-what-happened">
      <div class="doctor-heading"><h3>{{ WHAT_HAPPENED_TREE.label }}</h3></div>
      <div class="encounter-chips"><button v-for="id in selectedIds" :key="id" type="button" class="selection-chip" @click="toggleSelection(id)">{{ whatHappenedPath(id) }} ×</button></div>
      <div class="encounter-condition-trees">
        <WhatHappenedTree v-for="condition in WHAT_HAPPENED_TREE.children ?? []" :key="condition.id" :node="condition" :selected="selectedIds" root @toggle="toggleSelection" />
      </div>
      <section class="medical-card-comment-section">
        <h4>Комментарий</h4>
        <textarea v-model="comment" class="medical-card-comment" rows="2" aria-label="Комментарий" />
      </section>
    </article>
    <article
      v-for="kind in optionalKinds"
      :key="kind"
      class="encounter-section-card"
      :class="{
        'encounter-diagnosis': kind === 'diagnosis',
        'encounter-laboratory-tests': kind === 'laboratory-tests',
      }"
    >
      <div class="doctor-heading">
        <h3>{{ ENCOUNTER_SECTION_LABELS[kind] }}</h3>
        <button type="button" class="outline-action inline danger-outline owner-profile-action encounter-section-delete" title="Удалить раздел" aria-label="Удалить раздел" @click="emit('removeSection', kind)"><AppIcon name="trash" /></button>
      </div>
      <template v-if="kind === 'diagnosis'">
        <DiagnosisEditor v-model="diagnosis" :errors="diagnosisErrors" />
      </template>
      <template v-else-if="kind === 'general-data' && texts[kind] === undefined">
        <p v-if="generalDataErrors.section" class="field-error" role="alert">{{ generalDataErrors.section }}</p>
        <div class="general-data-fields" @input="updateGeneralData">
          <label>
            <span>Вес, кг</span>
            <input v-model="generalData.weightKg" type="number" min="0.01" step="0.01" inputmode="decimal" />
            <small v-if="generalDataErrors.weightKg" class="field-error">{{ generalDataErrors.weightKg }}</small>
          </label>
          <label>
            <span>Температура, °C</span>
            <input v-model="generalData.temperatureC" type="number" min="0.1" step="0.1" inputmode="decimal" />
            <small v-if="generalDataErrors.temperatureC" class="field-error">{{ generalDataErrors.temperatureC }}</small>
          </label>
          <label>
            <span>ЧСС, уд/мин</span>
            <input v-model="generalData.heartRateBpm" type="number" min="1" max="999" step="1" inputmode="numeric" />
            <small v-if="generalDataErrors.heartRateBpm" class="field-error">{{ generalDataErrors.heartRateBpm }}</small>
          </label>
          <label>
            <span>ЧДД, движ/мин</span>
            <input v-model="generalData.respiratoryRatePerMinute" type="number" min="1" max="999" step="1" inputmode="numeric" />
            <small v-if="generalDataErrors.respiratoryRatePerMinute" class="field-error">{{ generalDataErrors.respiratoryRatePerMinute }}</small>
          </label>
          <fieldset class="general-data-pressure">
            <legend>АД, мм рт. ст.</legend>
            <div class="general-data-pressure-inputs">
              <label><span>Сист.</span><input v-model="generalData.systolicMmHg" type="number" min="1" max="999" step="1" inputmode="numeric" /></label>
              <span class="general-data-pressure-separator" aria-hidden="true">/</span>
              <label><span>Диаст.</span><input v-model="generalData.diastolicMmHg" type="number" min="1" max="999" step="1" inputmode="numeric" /></label>
              <label><span>Сред.</span><input v-model="generalData.meanMmHg" type="number" min="1" max="999" step="1" inputmode="numeric" aria-label="Среднее артериальное давление" /></label>
            </div>
            <small v-if="generalDataErrors.bloodPressure || generalDataErrors.systolicMmHg || generalDataErrors.diastolicMmHg || generalDataErrors.meanMmHg" class="field-error">
              {{ generalDataErrors.bloodPressure || generalDataErrors.systolicMmHg || generalDataErrors.diastolicMmHg || generalDataErrors.meanMmHg }}
            </small>
          </fieldset>
        </div>
      </template>
      <template v-else-if="kind === 'vaccination' && texts[kind] === undefined">
        <p v-if="vaccinationErrors.section" class="field-error" role="alert">{{ vaccinationErrors.section }}</p>
        <div class="vaccination-fields" @input="updateVaccination" @change="updateVaccination">
          <label>
            <span title="Дата предыдущей вакцинации">Дата предыдущей вакцинации</span>
            <input v-model="vaccination.previousVaccinationDate" type="date" />
            <small v-if="vaccinationErrors.previousVaccinationDate" class="field-error">{{ vaccinationErrors.previousVaccinationDate }}</small>
          </label>
          <label>
            <span title="Название предыдущей вакцины">Название предыдущей вакцины</span>
            <input v-model="vaccination.previousVaccineName" type="text" />
          </label>
          <label class="vaccination-complications">
            <span title="Осложнения после предыдущей вакцинации">Осложнения после предыдущей вакцинации</span>
            <select v-model="vaccination.previousVaccinationComplications">
              <option value="">Не указано</option>
              <option value="yes">Были</option>
              <option value="no">Не было</option>
            </select>
          </label>
          <label>
            <span title="Название нынешней вакцины">Название нынешней вакцины</span>
            <input v-model="vaccination.currentVaccineName" type="text" />
            <small v-if="vaccinationErrors.currentVaccineName" class="field-error">{{ vaccinationErrors.currentVaccineName }}</small>
          </label>
          <label>
            <span title="Серия и/или номер вакцины">Серия и/или номер вакцины</span>
            <input v-model="vaccination.currentVaccineBatch" type="text" />
            <small v-if="vaccinationErrors.currentVaccineBatch" class="field-error">{{ vaccinationErrors.currentVaccineBatch }}</small>
          </label>
          <label>
            <span title="Срок годности препарата/вакцины">Срок годности препарата/вакцины</span>
            <input v-model="vaccination.currentVaccineExpiresOn" type="date" />
            <small v-if="vaccinationErrors.currentVaccineExpiresOn" class="field-error">{{ vaccinationErrors.currentVaccineExpiresOn }}</small>
          </label>
          <label>
            <span title="Номер чипа">Номер чипа</span>
            <input v-model="vaccination.chipNumber" type="text" />
          </label>
          <label>
            <span title="Место введения">Место введения</span>
            <input v-model="vaccination.administrationSite" type="text" />
          </label>
          <div class="vaccination-revaccination-field">
            <label>
              <span title="Дата следующей ревакцинации">Дата следующей ревакцинации</span>
              <input v-model="vaccination.nextRevaccinationDate" type="date" @input="useManualRevaccinationDate" />
              <small v-if="vaccinationErrors.nextRevaccinationDate" class="field-error">{{ vaccinationErrors.nextRevaccinationDate }}</small>
            </label>
            <div
              class="vaccination-revaccination-menu"
              @keydown.esc.stop.prevent="closeRevaccinationChooser(true)"
            >
              <button
                type="button"
                class="outline-action inline owner-profile-action vaccination-revaccination-toggle"
                title="Рассчитать дату следующей ревакцинации"
                aria-label="Рассчитать дату следующей ревакцинации"
                aria-haspopup="menu"
                :aria-expanded="revaccinationChooserOpen"
                @click="toggleRevaccinationChooser"
              ><AppIcon :name="revaccinationChooserOpen ? 'chevron-up' : 'chevron-down'" /></button>
              <div v-if="revaccinationChooserOpen" class="vaccination-revaccination-options" role="menu">
                <button
                  v-for="option in revaccinationIntervalOptions"
                  :key="option.value"
                  type="button"
                  role="menuitem"
                  :class="{ active: revaccinationInterval === option.value }"
                  @click="selectRevaccinationInterval(option.value, $event)"
                >{{ option.label }}</button>
              </div>
            </div>
          </div>
        </div>
      </template>
      <template v-else-if="kind === 'therapeutic-appointment' && texts[kind] === undefined">
        <TherapeuticAppointmentForm
          :model-value="therapeuticAppointment"
          :what-happened-ids="selectedIds"
          :what-happened-comment="comment"
          :errors="therapeuticErrors"
          @update:model-value="updateTherapeuticAppointment"
        />
      </template>
      <template v-else-if="kind === 'laboratory-tests' && texts[kind] === undefined">
        <LaboratoryTestsEditor v-model="laboratoryTests" :encounter-date="date" :errors="laboratoryErrors" />
      </template>
      <template v-else>
        <p class="temporary-note">{{ kind === 'general-data' ? 'Сохранён старый шаблон free-text-v0.' : 'Временный универсальный шаблон free-text-v0.' }}</p>
        <textarea :value="texts[kind] ?? ''" rows="4" required @input="updateText(kind, $event)" />
      </template>
    </article>
    <label v-if="optionalAvailable.length" class="encounter-add-section"><span>Добавить раздел</span><select @change="selectOptional"><option value="">Выберите раздел</option><option v-for="kind in optionalAvailable" :key="kind" :value="kind">{{ ENCOUNTER_SECTION_LABELS[kind] }}</option></select></label>
    <article class="encounter-section-card encounter-outcome">
      <div class="doctor-heading"><h3 id="encounter-outcome-heading">{{ ENCOUNTER_SECTION_LABELS.outcome }}</h3></div>
      <fieldset class="medical-card-option-panel encounter-outcome-option-panel">
        <legend class="visually-hidden">{{ ENCOUNTER_SECTION_LABELS.outcome }}</legend>
        <div class="encounter-outcome-options medical-card-options" role="group" aria-labelledby="encounter-outcome-heading" aria-required="true">
          <label v-for="option in OUTCOME_OPTIONS" :key="option.id" class="check-row">
            <input
              type="checkbox"
              :checked="outcomeSelectedIds.includes(option.id)"
              @change="toggleOutcome(option.id)"
            />
            <span>{{ option.label }}</span>
          </label>
        </div>
      </fieldset>
      <section class="medical-card-comment-section">
        <h4>Комментарий</h4>
        <textarea v-model="outcomeComment" class="medical-card-comment" rows="2" aria-label="Комментарий" />
      </section>
    </article>
  </form>
</template>
