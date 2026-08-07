<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, nextTick, ref, useId, watch } from "vue";
import AppIcon from "./AppIcon.vue";
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

const importableSourceIds = computed(() => {
  const imported = new Set(therapeutic.value.diseaseAnamnesis.problems.map((problem) => problem.sourceWhatHappenedId));
  return props.whatHappenedIds.filter((id) => !imported.has(id));
});
const canImport = computed(() => importableSourceIds.value.length > 0
  || Boolean(props.whatHappenedComment.trim() && !therapeutic.value.diseaseAnamnesis.text.trim()));

watch(() => props.errors.tab, (tab) => {
  if (tab) activeTab.value = tab;
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

function addProblem() {
  therapeutic.value.diseaseAnamnesis.problems = [
    ...therapeutic.value.diseaseAnamnesis.problems,
    newTherapeuticProblem(),
  ];
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
  therapeutic.value.diseaseAnamnesis.problems = [
    ...therapeutic.value.diseaseAnamnesis.problems,
    ...imported,
  ];
  if (!therapeutic.value.diseaseAnamnesis.text.trim() && props.whatHappenedComment.trim()) {
    therapeutic.value.diseaseAnamnesis.text = props.whatHappenedComment;
  }
}

function removeProblem(id: string) {
  therapeutic.value.diseaseAnamnesis.problems = therapeutic.value.diseaseAnamnesis.problems
    .filter((problem) => problem.id !== id);
}

function updateProblemTherapy(problem: TherapeuticProblemDraft) {
  if (problem.priorTherapyId === "problem.therapy.none") {
    problem.medicationUseId = undefined;
    problem.medicationIds = [];
    problem.medicationDynamicsId = undefined;
  }
}

function updateProblemMedicationUse(problem: TherapeuticProblemDraft) {
  if (problem.medicationUseId !== "problem.medication.used") {
    problem.medicationIds = [];
    problem.medicationDynamicsId = undefined;
  }
}

function toggleProblemMedication(problem: TherapeuticProblemDraft, id: string) {
  problem.medicationIds = problem.medicationIds.includes(id)
    ? problem.medicationIds.filter((candidate) => candidate !== id)
    : [...problem.medicationIds, id];
}

function tabId(tab: TherapeuticTab) {
  return `${baseId}-${tab}-tab`;
}

function panelId(tab: TherapeuticTab) {
  return `${baseId}-${tab}-panel`;
}
</script>

<template>
  <div ref="formRoot" class="therapeutic-appointment-form">
    <p v-if="errors.section" class="field-error" role="alert">{{ errors.section }}</p>
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
        <div class="row-actions">
          <button
            type="button"
            class="outline-action inline owner-profile-action therapeutic-panel-action"
            :disabled="!canImport"
            title="Импортировать из «Что случилось»"
            aria-label="Импортировать из «Что случилось»"
            @click="importWhatHappened"
          ><AppIcon name="copy" /></button>
          <button
            type="button"
            class="outline-action inline owner-profile-action therapeutic-panel-action"
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
              class="outline-action inline danger-outline owner-profile-action therapeutic-problem-delete"
              :title="`Удалить проблему ${index + 1}`"
              :aria-label="`Удалить проблему ${index + 1}`"
              @click="removeProblem(problem.id)"
            ><AppIcon name="trash" /></button>
          </div>
          <label class="therapeutic-problem-title">
            <span>Проблема</span>
            <input
              v-model="problem.title"
              type="text"
            />
            <small v-if="errors.problems?.[problem.id]" class="field-error">{{ errors.problems[problem.id] }}</small>
          </label>
          <div class="therapeutic-problem-fields">
            <label><span>Как давно началось</span><select v-model="problem.onsetId"><option value="">Не указано</option><option v-for="option in PROBLEM_ONSET_OPTIONS" :key="option.id" :value="option.id">{{ option.label }}</option></select></label>
            <label><span>Периодичность проявления</span><select v-model="problem.frequencyId"><option value="">Не указано</option><option v-for="option in PROBLEM_FREQUENCY_OPTIONS" :key="option.id" :value="option.id">{{ option.label }}</option></select></label>
            <label><span>Терапия до осмотра</span><select v-model="problem.priorTherapyId" @change="updateProblemTherapy(problem)"><option value="">Не указано</option><option v-for="option in PROBLEM_THERAPY_OPTIONS" :key="option.id" :value="option.id">{{ option.label }}</option></select></label>
            <label v-if="problem.priorTherapyId === 'problem.therapy.performed'"><span>Препараты</span><select v-model="problem.medicationUseId" @change="updateProblemMedicationUse(problem)"><option value="">Не указано</option><option v-for="option in PROBLEM_MEDICATION_USE_OPTIONS" :key="option.id" :value="option.id">{{ option.label }}</option></select></label>
            <fieldset v-if="problem.medicationUseId === 'problem.medication.used'" class="medical-card-option-panel therapeutic-problem-medications">
              <legend class="visually-hidden">Применявшиеся препараты</legend>
              <span class="therapeutic-group-label" aria-hidden="true">Применявшиеся препараты</span>
              <div class="medical-card-options">
                <label v-for="option in PROBLEM_MEDICATION_OPTIONS" :key="option.id" class="check-row"><input type="checkbox" :checked="problem.medicationIds.includes(option.id)" @change="toggleProblemMedication(problem, option.id)" /><span>{{ option.label }}</span></label>
              </div>
            </fieldset>
            <label v-if="problem.medicationUseId === 'problem.medication.used'"><span>Динамика</span><select v-model="problem.medicationDynamicsId"><option value="">Не указано</option><option v-for="option in PROBLEM_DYNAMICS_OPTIONS" :key="option.id" :value="option.id">{{ option.label }}</option></select></label>
          </div>
        </article>
      </div>
      <TherapeuticQuestionGroups v-model="therapeutic.diseaseAnamnesis.selectedIds" :categories="DISEASE_ANAMNESIS_CATEGORIES" />
      <section class="medical-card-comment-section">
        <h5>Комментарий</h5>
        <textarea
          v-model="therapeutic.diseaseAnamnesis.text"
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
      <TherapeuticQuestionGroups v-model="therapeutic.lifeAnamnesis.selectedIds" :categories="LIFE_ANAMNESIS_CATEGORIES" />
      <section class="therapeutic-category therapeutic-short-text">
        <h5>Получаемые в данный момент препараты</h5>
        <textarea
          v-model="therapeutic.lifeAnamnesis.currentMedications"
          class="medical-card-comment"
          rows="2"
          aria-label="Получаемые в данный момент препараты"
        />
      </section>
      <section class="therapeutic-category therapeutic-short-text">
        <h5>Аллергии</h5>
        <textarea
          v-model="therapeutic.lifeAnamnesis.allergies"
          class="medical-card-comment"
          rows="2"
          aria-label="Аллергии"
        />
      </section>
      <section class="medical-card-comment-section">
        <h5>Комментарий</h5>
        <textarea
          v-model="therapeutic.lifeAnamnesis.text"
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
      <TherapeuticQuestionGroups v-model="therapeutic.examination.selectedIds" :categories="EXAMINATION_CATEGORIES" />
      <section class="medical-card-comment-section">
        <h5>Комментарий</h5>
        <textarea
          v-model="therapeutic.examination.text"
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
          v-model="therapeutic.recommendations"
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
          v-model="therapeutic.prescriptions"
          class="therapeutic-primary-text"
          rows="6"
          aria-label="Текст назначений"
        />
      </section>
    </section>
  </div>
</template>
