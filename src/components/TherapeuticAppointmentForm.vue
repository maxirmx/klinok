<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, nextTick, ref, useId, watch } from "vue";
import AppIcon from "./AppIcon.vue";
import AppSelect from "./AppSelect.vue";
import TherapeuticQuestionGroups from "./TherapeuticQuestionGroups.vue";
import { whatHappenedPath } from "../medicalEncounter";
import {
  DISEASE_ANAMNESIS_CATEGORIES,
  EXAMINATION_CATEGORIES,
  LIFE_ANAMNESIS_CATEGORIES,
  PROBLEM_DYNAMICS_OPTIONS,
  PROBLEM_FREQUENCY_OPTIONS,
  PROBLEM_MEDICATION_OPTIONS,
  PROBLEM_MEDICATION_USE_OPTIONS,
  PROBLEM_ONSET_OPTIONS,
  PROBLEM_THERAPY_OPTIONS,
  THERAPEUTIC_TABS,
  newTherapeuticProblem,
} from "../therapeuticAppointment";
import type {
  TherapeuticAppointmentDraft,
  TherapeuticAppointmentDraftErrors,
  TherapeuticProblemDraft,
  TherapeuticTab,
} from "../therapeuticAppointment";

const props = defineProps<{
  whatHappenedIds: readonly string[];
  whatHappenedComment: string;
  errors: TherapeuticAppointmentDraftErrors;
}>();
const therapeutic = defineModel<TherapeuticAppointmentDraft>({ required: true });
const activeTab = ref<TherapeuticTab>("disease");
const tabButtons = ref<HTMLButtonElement[]>([]);
const formRoot = ref<HTMLElement | null>(null);
const baseId = useId();
const errorBaseId = useId();
const onsetOptions = selectOptions(PROBLEM_ONSET_OPTIONS);
const frequencyOptions = selectOptions(PROBLEM_FREQUENCY_OPTIONS);
const priorTherapyOptions = selectOptions(PROBLEM_THERAPY_OPTIONS);
const medicationUseOptions = selectOptions(PROBLEM_MEDICATION_USE_OPTIONS);
const medicationDynamicsOptions = selectOptions(PROBLEM_DYNAMICS_OPTIONS);

function selectOptions(options: readonly { id: string; label: string }[]) {
  return [{ value: "", label: "Не указано" }, ...options.map((option) => ({ value: option.id, label: option.label }))];
}

const importableSourceIds = computed(() => {
  const imported = new Set(therapeutic.value.diseaseAnamnesis.problems.map((problem) => problem.sourceWhatHappenedId));
  return props.whatHappenedIds.filter((id) => !imported.has(id));
});
const canImport = computed(() => importableSourceIds.value.length > 0
  || Boolean(props.whatHappenedComment.trim() && !therapeutic.value.diseaseAnamnesis.text.trim()));
const diseaseSelectedIds = computed({
  get: () => therapeutic.value.diseaseAnamnesis.selectedIds,
  set: (selectedIds: string[]) => updateDiseaseAnamnesis({ selectedIds }),
});
const diseaseText = computed({
  get: () => therapeutic.value.diseaseAnamnesis.text,
  set: (text: string) => updateDiseaseAnamnesis({ text }),
});
const lifeSelectedIds = computed({
  get: () => therapeutic.value.lifeAnamnesis.selectedIds,
  set: (selectedIds: string[]) => updateLifeAnamnesis({ selectedIds }),
});
const lifeCurrentMedications = computed({
  get: () => therapeutic.value.lifeAnamnesis.currentMedications,
  set: (currentMedications: string) => updateLifeAnamnesis({ currentMedications }),
});
const lifeAllergies = computed({
  get: () => therapeutic.value.lifeAnamnesis.allergies,
  set: (allergies: string) => updateLifeAnamnesis({ allergies }),
});
const lifeText = computed({
  get: () => therapeutic.value.lifeAnamnesis.text,
  set: (text: string) => updateLifeAnamnesis({ text }),
});
const examinationSelectedIds = computed({
  get: () => therapeutic.value.examination.selectedIds,
  set: (selectedIds: string[]) => updateExamination({ selectedIds }),
});
const examinationText = computed({
  get: () => therapeutic.value.examination.text,
  set: (text: string) => updateExamination({ text }),
});
const recommendations = computed({
  get: () => therapeutic.value.recommendations,
  set: (value: string) => updateTherapeutic({ ...therapeutic.value, recommendations: value }),
});
const prescriptions = computed({
  get: () => therapeutic.value.prescriptions,
  set: (value: string) => updateTherapeutic({ ...therapeutic.value, prescriptions: value }),
});

watch(() => props.errors, (errors) => {
  if (errors.tab) activeTab.value = errors.tab;
});

function activateTab(tab: TherapeuticTab, focus = false) {
  activeTab.value = tab;
  if (focus) {
    const index = THERAPEUTIC_TABS.findIndex((candidate) => candidate.id === tab);
    void nextTick(() => tabButtons.value[index]?.focus());
  }
}

function handleTabKeydown(event: KeyboardEvent, index: number) {
  let target = index;
  if (["ArrowRight", "ArrowDown"].includes(event.key)) target = (index + 1) % THERAPEUTIC_TABS.length;
  else if (["ArrowLeft", "ArrowUp"].includes(event.key)) target = (index - 1 + THERAPEUTIC_TABS.length) % THERAPEUTIC_TABS.length;
  else if (event.key === "Home") target = 0;
  else if (event.key === "End") target = THERAPEUTIC_TABS.length - 1;
  else return;
  event.preventDefault();
  activateTab(THERAPEUTIC_TABS[target]!.id, true);
}

function updateTherapeutic(value: TherapeuticAppointmentDraft) {
  therapeutic.value = value;
}

function updateDiseaseAnamnesis(update: Partial<TherapeuticAppointmentDraft["diseaseAnamnesis"]>) {
  updateTherapeutic({
    ...therapeutic.value,
    diseaseAnamnesis: { ...therapeutic.value.diseaseAnamnesis, ...update },
  });
}

function updateLifeAnamnesis(update: Partial<TherapeuticAppointmentDraft["lifeAnamnesis"]>) {
  updateTherapeutic({
    ...therapeutic.value,
    lifeAnamnesis: { ...therapeutic.value.lifeAnamnesis, ...update },
  });
}

function updateExamination(update: Partial<TherapeuticAppointmentDraft["examination"]>) {
  updateTherapeutic({
    ...therapeutic.value,
    examination: { ...therapeutic.value.examination, ...update },
  });
}

function updateProblem(id: string, update: (problem: TherapeuticProblemDraft) => TherapeuticProblemDraft) {
  updateDiseaseAnamnesis({
    problems: therapeutic.value.diseaseAnamnesis.problems.map((problem) => problem.id === id
      ? update({ ...problem, medicationIds: [...problem.medicationIds] })
      : problem),
  });
}

function updateProblemTitle(id: string, event: Event) {
  const title = (event.target as HTMLInputElement).value;
  updateProblem(id, (problem) => ({ ...problem, title }));
}

function updateProblemMedicationName(id: string, event: Event) {
  const medicationName = (event.target as HTMLInputElement).value;
  updateProblem(id, (problem) => ({ ...problem, medicationName }));
}

type ProblemSelectField = "onsetId" | "frequencyId" | "priorTherapyId" | "medicationUseId" | "medicationDynamicsId";

function updateProblemSelect(id: string, field: ProblemSelectField, requestedValue: string) {
  const value = requestedValue || undefined;
  updateProblem(id, (problem) => {
    const next = { ...problem, [field]: value };
    if (field === "priorTherapyId" && value !== "problem.therapy.performed") {
      next.medicationUseId = undefined;
      next.medicationIds = [];
      next.medicationName = undefined;
      next.medicationDynamicsId = undefined;
    }
    if (field === "medicationUseId" && value !== "problem.medication.used") {
      next.medicationIds = [];
      next.medicationName = undefined;
      next.medicationDynamicsId = undefined;
    }
    return next;
  });
}

function addProblem() {
  updateDiseaseAnamnesis({ problems: [
    ...therapeutic.value.diseaseAnamnesis.problems,
    newTherapeuticProblem(),
  ] });
  void nextTick(() => {
    const inputs = formRoot.value?.querySelectorAll<HTMLInputElement>(".therapeutic-problem-title input");
    if (inputs?.length) inputs[inputs.length - 1]?.focus();
  });
}

function importWhatHappened() {
  const imported = importableSourceIds.value.map((id) => {
    const path = whatHappenedPath(id);
    return newTherapeuticProblem(id, path.split(" › ").at(-1) ?? path);
  });
  updateDiseaseAnamnesis({
    problems: [...therapeutic.value.diseaseAnamnesis.problems, ...imported],
    ...(!therapeutic.value.diseaseAnamnesis.text.trim() && props.whatHappenedComment.trim()
      ? { text: props.whatHappenedComment }
      : {}),
  });
}

function removeProblem(id: string) {
  updateDiseaseAnamnesis({
    problems: therapeutic.value.diseaseAnamnesis.problems.filter((problem) => problem.id !== id),
  });
}

function toggleProblemMedication(problem: TherapeuticProblemDraft, id: string) {
  updateProblem(problem.id, (current) => ({
    ...current,
    medicationIds: current.medicationIds.includes(id)
      ? current.medicationIds.filter((candidate) => candidate !== id)
      : [...current.medicationIds, id],
  }));
}

function tabId(tab: TherapeuticTab) {
  return `${baseId}-${tab}-tab`;
}

function panelId(tab: TherapeuticTab) {
  return `${baseId}-${tab}-panel`;
}

function errorId(field: string) {
  return `${errorBaseId}-${field.replace(/[^a-zA-Z0-9_-]/g, "-")}-error`;
}
</script>

<template>
  <div ref="formRoot" class="therapeutic-appointment-form">
    <p v-if="errors.section" :id="errorId('section')" class="field-error" role="alert" tabindex="-1" data-encounter-error-anchor="true">{{ errors.section }}</p>
    <div class="therapeutic-tabs" role="tablist" aria-label="Разделы терапевтического приёма">
      <button
        v-for="(tab, index) in THERAPEUTIC_TABS"
        :id="tabId(tab.id)"
        :key="tab.id"
        :ref="(element) => { if (element) tabButtons[index] = element as HTMLButtonElement }"
        type="button"
        role="tab"
        :aria-controls="panelId(tab.id)"
        :aria-selected="activeTab === tab.id"
        :tabindex="activeTab === tab.id ? 0 : -1"
        :class="{ active: activeTab === tab.id }"
        @click="activateTab(tab.id)"
        @keydown="handleTabKeydown($event, index)"
      >{{ tab.label }}</button>
    </div>

    <section
      :id="panelId('disease')"
      class="therapeutic-tab-panel"
      role="tabpanel"
      :aria-labelledby="tabId('disease')"
      :hidden="activeTab !== 'disease'"
    >
      <div class="therapeutic-panel-heading">
        <h4>Анамнез болезни</h4>
        <div class="row-actions medical-card-actions medical-card-section-rail">
          <button
            type="button"
            class="outline-action inline medical-card-action therapeutic-panel-action"
            :disabled="!canImport"
            title="Импортировать из «Что случилось»"
            aria-label="Импортировать из «Что случилось»"
            @click="importWhatHappened"
          ><AppIcon name="copy" /></button>
          <button
            type="button"
            class="outline-action inline medical-card-action therapeutic-panel-action"
            title="Добавить проблему"
            aria-label="Добавить проблему"
            @click="addProblem"
          ><AppIcon name="plus" /></button>
        </div>
      </div>
      <div v-if="therapeutic.diseaseAnamnesis.problems.length" class="therapeutic-problems">
        <article v-for="(problem, index) in therapeutic.diseaseAnamnesis.problems" :key="problem.id" class="therapeutic-problem-card">
          <div class="therapeutic-problem-heading">
            <h5>Проблема {{ index + 1 }}</h5>
            <button
              type="button"
              class="outline-action inline danger-outline medical-card-action therapeutic-problem-delete"
              :title="`Удалить проблему ${index + 1}`"
              :aria-label="`Удалить проблему ${index + 1}`"
              @click="removeProblem(problem.id)"
            ><AppIcon name="trash" /></button>
          </div>
          <label class="therapeutic-problem-title">
            <span>Проблема</span>
            <input
              :value="problem.title"
              type="text"
              :aria-invalid="errors.problems?.[problem.id] ? true : undefined"
              :aria-describedby="errors.problems?.[problem.id] ? errorId(`problem-${problem.id}`) : undefined"
              @input="updateProblemTitle(problem.id, $event)"
            />
            <small v-if="errors.problems?.[problem.id]" :id="errorId(`problem-${problem.id}`)" class="field-error" role="alert">{{ errors.problems[problem.id] }}</small>
          </label>
          <div class="therapeutic-problem-fields">
            <label><span>Как давно началось</span><AppSelect :model-value="problem.onsetId ?? ''" :options="onsetOptions" @update:model-value="updateProblemSelect(problem.id, 'onsetId', $event)" /></label>
            <label><span>Периодичность проявления</span><AppSelect :model-value="problem.frequencyId ?? ''" :options="frequencyOptions" @update:model-value="updateProblemSelect(problem.id, 'frequencyId', $event)" /></label>
            <label><span>Терапия до осмотра</span><AppSelect :model-value="problem.priorTherapyId ?? ''" :options="priorTherapyOptions" @update:model-value="updateProblemSelect(problem.id, 'priorTherapyId', $event)" /></label>
            <label v-if="problem.priorTherapyId === 'problem.therapy.performed'"><span>Препараты</span><AppSelect :model-value="problem.medicationUseId ?? ''" :options="medicationUseOptions" @update:model-value="updateProblemSelect(problem.id, 'medicationUseId', $event)" /></label>
            <fieldset v-if="problem.medicationUseId === 'problem.medication.used'" class="medical-card-option-panel therapeutic-problem-medications">
              <legend class="visually-hidden">Применявшиеся препараты</legend>
              <span class="therapeutic-group-label" aria-hidden="true">Применявшиеся препараты</span>
              <div class="medical-card-options">
                <label v-for="option in PROBLEM_MEDICATION_OPTIONS" :key="option.id" class="check-row"><input type="checkbox" :checked="problem.medicationIds.includes(option.id)" @change="toggleProblemMedication(problem, option.id)" /><span>{{ option.label }}</span></label>
              </div>
            </fieldset>
            <label v-if="problem.medicationUseId === 'problem.medication.used'" class="therapeutic-problem-medication-name">
              <span>Название препарата</span>
              <input
                :value="problem.medicationName ?? ''"
                type="text"
                autocomplete="off"
                @input="updateProblemMedicationName(problem.id, $event)"
              />
            </label>
            <label v-if="problem.medicationUseId === 'problem.medication.used'"><span>Динамика</span><AppSelect :model-value="problem.medicationDynamicsId ?? ''" :options="medicationDynamicsOptions" @update:model-value="updateProblemSelect(problem.id, 'medicationDynamicsId', $event)" /></label>
          </div>
        </article>
      </div>
      <TherapeuticQuestionGroups v-model="diseaseSelectedIds" :categories="DISEASE_ANAMNESIS_CATEGORIES" />
      <section class="medical-card-comment-section">
        <h5>Комментарий</h5>
        <textarea
          v-model="diseaseText"
          class="medical-card-comment"
          rows="2"
          aria-label="Комментарий"
        />
      </section>
    </section>

    <section
      :id="panelId('life')"
      class="therapeutic-tab-panel"
      role="tabpanel"
      :aria-labelledby="tabId('life')"
      :hidden="activeTab !== 'life'"
    >
      <h4>Анамнез жизни</h4>
      <TherapeuticQuestionGroups v-model="lifeSelectedIds" :categories="LIFE_ANAMNESIS_CATEGORIES" />
      <section class="therapeutic-category therapeutic-short-text">
        <h5>Получаемые в данный момент препараты</h5>
        <textarea
          v-model="lifeCurrentMedications"
          class="medical-card-comment"
          rows="2"
          aria-label="Получаемые в данный момент препараты"
        />
      </section>
      <section class="therapeutic-category therapeutic-short-text">
        <h5>Аллергии</h5>
        <textarea
          v-model="lifeAllergies"
          class="medical-card-comment"
          rows="2"
          aria-label="Аллергии"
        />
      </section>
      <section class="medical-card-comment-section">
        <h5>Комментарий</h5>
        <textarea
          v-model="lifeText"
          class="medical-card-comment"
          rows="2"
          aria-label="Комментарий"
        />
      </section>
    </section>

    <section
      :id="panelId('examination')"
      class="therapeutic-tab-panel"
      role="tabpanel"
      :aria-labelledby="tabId('examination')"
      :hidden="activeTab !== 'examination'"
    >
      <h4>Осмотр</h4>
      <TherapeuticQuestionGroups v-model="examinationSelectedIds" :categories="EXAMINATION_CATEGORIES" />
      <section class="medical-card-comment-section">
        <h5>Комментарий</h5>
        <textarea
          v-model="examinationText"
          class="medical-card-comment"
          rows="2"
          aria-label="Комментарий"
        />
      </section>
    </section>

    <section
      :id="panelId('recommendations')"
      class="therapeutic-tab-panel"
      role="tabpanel"
      :aria-labelledby="tabId('recommendations')"
      :hidden="activeTab !== 'recommendations'"
    >
      <section class="medical-card-comment-section">
        <h4>Рекомендации</h4>
        <textarea
          v-model="recommendations"
          class="therapeutic-primary-text"
          rows="6"
          aria-label="Текст рекомендаций"
        />
      </section>
    </section>

    <section
      :id="panelId('prescriptions')"
      class="therapeutic-tab-panel"
      role="tabpanel"
      :aria-labelledby="tabId('prescriptions')"
      :hidden="activeTab !== 'prescriptions'"
    >
      <section class="medical-card-comment-section">
        <h4>Назначения</h4>
        <textarea
          v-model="prescriptions"
          class="therapeutic-primary-text"
          rows="6"
          aria-label="Текст назначений"
        />
      </section>
    </section>
  </div>
</template>
