<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import AppIcon from "./AppIcon.vue";
import AppSelect from "./AppSelect.vue";
import DiagnosisEditor from "./DiagnosisEditor.vue";
import TherapeuticAppointmentForm from "./TherapeuticAppointmentForm.vue";
import LaboratoryTestsEditor from "./LaboratoryTestsEditor.vue";
import InstrumentalTestsEditor from "./InstrumentalTestsEditor.vue";
import WhatHappenedTree from "./WhatHappenedTree.vue";
import { focusFirstEncounterError } from "../encounterErrorNavigation";
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
import { parseInstrumentalTestsDraft } from "../instrumentalTests";
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
import type { InstrumentalTestsDraftErrors } from "../instrumentalTests";
import type { MedicalEncounterSectionKind } from "../repositories/types";
import type { InstrumentalTestsSectionValue, LaboratoryTestsSectionValue } from "@klinok/contracts";

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
const instrumentalTests = defineModel<InstrumentalTestsSectionValue>("instrumentalTests", { required: true });
const form = ref<HTMLFormElement | null>(null);
const generalDataErrors = ref<GeneralDataDraftErrors>({});
const vaccinationErrors = ref<VaccinationDraftErrors>({});
const therapeuticErrors = ref<TherapeuticAppointmentDraftErrors>({});
const diagnosisErrors = ref<DiagnosisDraftErrors>({});
const laboratoryErrors = ref<LaboratoryTestsDraftErrors>({ studies: [] });
const instrumentalErrors = ref<InstrumentalTestsDraftErrors>({ studies: [] });
const revaccinationInterval = ref<RevaccinationInterval | "">("");
const revaccinationChooserOpen = ref(false);
const errorBaseId = useId();
const revaccinationDateId = useId();
const revaccinationMenuRoot = ref<HTMLElement | null>(null);
const optionalAvailable = computed(() => OPTIONAL_ENCOUNTER_SECTION_KINDS.filter((kind) => !optionalKinds.value.includes(kind)));
const optionalSectionOptions = computed(() => [
  { value: "", label: "Выберите раздел" },
  ...optionalAvailable.value.map((kind) => ({ value: kind, label: ENCOUNTER_SECTION_LABELS[kind] })),
]);
const vaccinationComplicationOptions = [
  { value: "", label: "Не указано" },
  { value: "yes", label: "Были" },
  { value: "no", label: "Не было" },
];
const revaccinationIntervalOptions = computed(() => REVACCINATION_INTERVAL_OPTIONS
  .filter((option) => option.value !== "next-birthday" || props.petBirthDate));
const generalBloodPressureError = computed(() => generalDataErrors.value.bloodPressure
  || generalDataErrors.value.systolicMmHg
  || generalDataErrors.value.diastolicMmHg
  || generalDataErrors.value.meanMmHg);

function errorId(field: string) {
  return `${errorBaseId}-${field}-error`;
}

function invalid(message?: string) {
  return message ? true : undefined;
}

function describedBy(message: string | undefined, field: string) {
  return message ? errorId(field) : undefined;
}

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
watch(instrumentalTests, () => { instrumentalErrors.value = { studies: [] }; }, { deep: true });

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

function selectOptional(value: string) {
  const kind = value as MedicalEncounterSectionKind;
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
    if (kind === "instrumental-tests") {
      instrumentalTests.value = { studies: [] };
      instrumentalErrors.value = { studies: [] };
      const nextTexts = { ...texts.value };
      delete nextTexts["instrumental-tests"];
      texts.value = nextTexts;
    }
  }
}

function updateVaccinationComplications(value: string) {
  vaccination.value.previousVaccinationComplications = value as VaccinationDraft["previousVaccinationComplications"];
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

async function submit() {
  if (!selectedIds.value.length || !outcomeSelectedIds.value.length) return;
  let structuredValid = true;
  if (optionalKinds.value.includes("general-data") && texts.value["general-data"] === undefined) {
    const parsed = parseGeneralDataDraft(generalData.value);
    generalDataErrors.value = parsed.errors;
    if (!parsed.value) structuredValid = false;
  } else generalDataErrors.value = {};
  if (optionalKinds.value.includes("vaccination") && texts.value.vaccination === undefined) {
    const parsed = parseVaccinationDraft(vaccination.value);
    vaccinationErrors.value = parsed.errors;
    if (!parsed.value) structuredValid = false;
  } else vaccinationErrors.value = {};
  if (optionalKinds.value.includes("therapeutic-appointment") && texts.value["therapeutic-appointment"] === undefined) {
    const parsed = parseTherapeuticAppointmentDraft(therapeuticAppointment.value);
    therapeuticErrors.value = parsed.errors;
    if (!parsed.value) structuredValid = false;
  } else therapeuticErrors.value = {};
  if (optionalKinds.value.includes("diagnosis")) {
    const parsed = parseDiagnosisDraft(diagnosis.value);
    diagnosisErrors.value = parsed.errors;
    if (!parsed.value) structuredValid = false;
  } else diagnosisErrors.value = {};
  if (optionalKinds.value.includes("laboratory-tests") && texts.value["laboratory-tests"] === undefined) {
    const parsed = parseLaboratoryTestsDraft(laboratoryTests.value);
    laboratoryErrors.value = parsed.errors;
    if (!parsed.value) structuredValid = false;
  } else laboratoryErrors.value = { studies: [] };
  if (optionalKinds.value.includes("instrumental-tests") && texts.value["instrumental-tests"] === undefined) {
    const parsed = parseInstrumentalTestsDraft(instrumentalTests.value);
    instrumentalErrors.value = parsed.errors;
    if (!parsed.value) structuredValid = false;
  } else instrumentalErrors.value = { studies: [] };
  const nativeValid = form.value?.checkValidity() ?? true;
  if (!structuredValid || !nativeValid) {
    await nextTick();
    await nextTick();
    if (form.value) focusFirstEncounterError(form.value);
    return;
  }
  emit("save");
}
</script>

<template>
  <form ref="form" class="form-stack" @submit.prevent="submit">
    <div class="doctor-heading encounter-editor-heading">
      <h2>{{ editing ? 'Редактирование записи' : 'Сегодняшний приём' }}</h2>
      <label class="encounter-date-field"><span class="visually-hidden">Дата</span><input v-model="date" type="date" required /></label>
      <div class="row-actions medical-card-actions medical-card-section-rail">
        <button v-if="editing" type="button" class="outline-action inline medical-card-action" title="Отменить редактирование" aria-label="Отменить редактирование" @click="emit('cancel')"><AppIcon name="close" /></button>
        <button class="primary-action inline medical-card-action" type="button" :disabled="busy || !selectedIds.length || !outcomeSelectedIds.length" title="Сохранить запись" aria-label="Сохранить запись" @click="submit"><AppIcon name="check" /></button>
      </div>
    </div>
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
        'encounter-instrumental-tests': kind === 'instrumental-tests',
      }"
    >
      <div class="doctor-heading">
        <h3>{{ ENCOUNTER_SECTION_LABELS[kind] }}</h3>
        <button type="button" class="outline-action inline danger-outline medical-card-action medical-card-section-rail encounter-section-delete" title="Удалить раздел" aria-label="Удалить раздел" @click="emit('removeSection', kind)"><AppIcon name="trash" /></button>
      </div>
      <template v-if="kind === 'diagnosis'">
        <DiagnosisEditor v-model="diagnosis" :errors="diagnosisErrors" />
      </template>
      <template v-else-if="kind === 'general-data' && texts[kind] === undefined">
        <p v-if="generalDataErrors.section" :id="errorId('general-section')" class="field-error" role="alert" tabindex="-1" data-encounter-error-anchor="true">{{ generalDataErrors.section }}</p>
        <div class="general-data-fields" @input="updateGeneralData">
          <label>
            <span>Вес, кг</span>
            <input v-model="generalData.weightKg" type="number" min="0.01" step="0.01" inputmode="decimal" :aria-invalid="invalid(generalDataErrors.weightKg)" :aria-describedby="describedBy(generalDataErrors.weightKg, 'general-weight')" />
            <small v-if="generalDataErrors.weightKg" :id="errorId('general-weight')" class="field-error" role="alert">{{ generalDataErrors.weightKg }}</small>
          </label>
          <label>
            <span>Температура, °C</span>
            <input v-model="generalData.temperatureC" type="number" min="0.1" step="0.1" inputmode="decimal" :aria-invalid="invalid(generalDataErrors.temperatureC)" :aria-describedby="describedBy(generalDataErrors.temperatureC, 'general-temperature')" />
            <small v-if="generalDataErrors.temperatureC" :id="errorId('general-temperature')" class="field-error" role="alert">{{ generalDataErrors.temperatureC }}</small>
          </label>
          <label>
            <span>ЧСС, уд/мин</span>
            <input v-model="generalData.heartRateBpm" type="number" min="1" max="999" step="1" inputmode="numeric" :aria-invalid="invalid(generalDataErrors.heartRateBpm)" :aria-describedby="describedBy(generalDataErrors.heartRateBpm, 'general-heart-rate')" />
            <small v-if="generalDataErrors.heartRateBpm" :id="errorId('general-heart-rate')" class="field-error" role="alert">{{ generalDataErrors.heartRateBpm }}</small>
          </label>
          <label>
            <span>ЧДД, движ/мин</span>
            <input v-model="generalData.respiratoryRatePerMinute" type="number" min="1" max="999" step="1" inputmode="numeric" :aria-invalid="invalid(generalDataErrors.respiratoryRatePerMinute)" :aria-describedby="describedBy(generalDataErrors.respiratoryRatePerMinute, 'general-respiratory-rate')" />
            <small v-if="generalDataErrors.respiratoryRatePerMinute" :id="errorId('general-respiratory-rate')" class="field-error" role="alert">{{ generalDataErrors.respiratoryRatePerMinute }}</small>
          </label>
          <fieldset class="general-data-pressure">
            <legend>АД, мм рт. ст.</legend>
            <div class="general-data-pressure-inputs">
              <label><span>Сист.</span><input v-model="generalData.systolicMmHg" type="number" min="1" max="999" step="1" inputmode="numeric" :aria-invalid="invalid(generalBloodPressureError)" :aria-describedby="describedBy(generalBloodPressureError, 'general-blood-pressure')" /></label>
              <span class="general-data-pressure-separator" aria-hidden="true">/</span>
              <label><span>Диаст.</span><input v-model="generalData.diastolicMmHg" type="number" min="1" max="999" step="1" inputmode="numeric" :aria-invalid="invalid(generalBloodPressureError)" :aria-describedby="describedBy(generalBloodPressureError, 'general-blood-pressure')" /></label>
              <label><span>Сред.</span><input v-model="generalData.meanMmHg" type="number" min="1" max="999" step="1" inputmode="numeric" aria-label="Среднее артериальное давление" :aria-invalid="invalid(generalBloodPressureError)" :aria-describedby="describedBy(generalBloodPressureError, 'general-blood-pressure')" /></label>
            </div>
            <small v-if="generalBloodPressureError" :id="errorId('general-blood-pressure')" class="field-error" role="alert">
              {{ generalBloodPressureError }}
            </small>
          </fieldset>
        </div>
      </template>
      <template v-else-if="kind === 'vaccination' && texts[kind] === undefined">
        <p v-if="vaccinationErrors.section" :id="errorId('vaccination-section')" class="field-error" role="alert" tabindex="-1" data-encounter-error-anchor="true">{{ vaccinationErrors.section }}</p>
        <div class="vaccination-fields" @input="updateVaccination" @change="updateVaccination">
          <label>
            <span title="Дата предыдущей вакцинации">Дата предыдущей вакцинации</span>
            <input v-model="vaccination.previousVaccinationDate" type="date" :aria-invalid="invalid(vaccinationErrors.previousVaccinationDate)" :aria-describedby="describedBy(vaccinationErrors.previousVaccinationDate, 'vaccination-previous-date')" />
            <small v-if="vaccinationErrors.previousVaccinationDate" :id="errorId('vaccination-previous-date')" class="field-error" role="alert">{{ vaccinationErrors.previousVaccinationDate }}</small>
          </label>
          <label>
            <span title="Название предыдущей вакцины">Название предыдущей вакцины</span>
            <input v-model="vaccination.previousVaccineName" type="text" />
          </label>
          <label class="vaccination-complications">
            <span title="Осложнения после предыдущей вакцинации">Осложнения после предыдущей вакцинации</span>
            <AppSelect
              :model-value="vaccination.previousVaccinationComplications"
              :options="vaccinationComplicationOptions"
              @update:model-value="updateVaccinationComplications"
            />
          </label>
          <label>
            <span title="Название нынешней вакцины">Название нынешней вакцины</span>
            <input v-model="vaccination.currentVaccineName" type="text" :aria-invalid="invalid(vaccinationErrors.currentVaccineName)" :aria-describedby="describedBy(vaccinationErrors.currentVaccineName, 'vaccination-current-name')" />
            <small v-if="vaccinationErrors.currentVaccineName" :id="errorId('vaccination-current-name')" class="field-error" role="alert">{{ vaccinationErrors.currentVaccineName }}</small>
          </label>
          <label>
            <span title="Серия и/или номер вакцины">Серия и/или номер вакцины</span>
            <input v-model="vaccination.currentVaccineBatch" type="text" :aria-invalid="invalid(vaccinationErrors.currentVaccineBatch)" :aria-describedby="describedBy(vaccinationErrors.currentVaccineBatch, 'vaccination-current-batch')" />
            <small v-if="vaccinationErrors.currentVaccineBatch" :id="errorId('vaccination-current-batch')" class="field-error" role="alert">{{ vaccinationErrors.currentVaccineBatch }}</small>
          </label>
          <label>
            <span title="Срок годности препарата/вакцины">Срок годности препарата/вакцины</span>
            <input v-model="vaccination.currentVaccineExpiresOn" type="date" :aria-invalid="invalid(vaccinationErrors.currentVaccineExpiresOn)" :aria-describedby="describedBy(vaccinationErrors.currentVaccineExpiresOn, 'vaccination-current-expires')" />
            <small v-if="vaccinationErrors.currentVaccineExpiresOn" :id="errorId('vaccination-current-expires')" class="field-error" role="alert">{{ vaccinationErrors.currentVaccineExpiresOn }}</small>
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
            <label :for="revaccinationDateId">
              <span title="Дата следующей ревакцинации">Дата следующей ревакцинации</span>
            </label>
            <input :id="revaccinationDateId" v-model="vaccination.nextRevaccinationDate" type="date" :aria-invalid="invalid(vaccinationErrors.nextRevaccinationDate)" :aria-describedby="describedBy(vaccinationErrors.nextRevaccinationDate, 'vaccination-next-date')" @input="useManualRevaccinationDate" />
            <div
              class="vaccination-revaccination-menu"
              @keydown.esc.stop.prevent="closeRevaccinationChooser(true)"
            >
              <button
                type="button"
                class="outline-action inline medical-card-action vaccination-revaccination-toggle"
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
            <small v-if="vaccinationErrors.nextRevaccinationDate" :id="errorId('vaccination-next-date')" class="field-error" role="alert">{{ vaccinationErrors.nextRevaccinationDate }}</small>
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
      <template v-else-if="kind === 'instrumental-tests' && texts[kind] === undefined">
        <InstrumentalTestsEditor v-model="instrumentalTests" :encounter-date="date" :errors="instrumentalErrors" />
      </template>
      <template v-else>
        <p class="temporary-note">{{ kind === 'general-data' ? 'Сохранён старый шаблон free-text-v0.' : 'Временный универсальный шаблон free-text-v0.' }}</p>
        <textarea :value="texts[kind] ?? ''" rows="4" required @input="updateText(kind, $event)" />
      </template>
    </article>
    <section v-if="optionalAvailable.length" class="encounter-section-card encounter-add-section">
      <div class="doctor-heading"><h3>Добавить раздел</h3></div>
      <AppSelect model-value="" :options="optionalSectionOptions" aria-label="Добавить раздел" @update:model-value="selectOptional" />
    </section>
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
