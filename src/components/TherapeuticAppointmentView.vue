<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed } from "vue";
import {
  DISEASE_ANAMNESIS_CATEGORIES,
  EXAMINATION_CATEGORIES,
  LIFE_ANAMNESIS_CATEGORIES,
  THERAPEUTIC_TABS,
  therapeuticOptionLabel,
  therapeuticSelectionGroups,
} from "../therapeuticAppointment";
import type { TherapeuticTab } from "../therapeuticAppointment";
import type { TherapeuticAppointmentSectionValue, TherapeuticProblemValue } from "../repositories/types";
import TherapeuticSelectionView from "./TherapeuticSelectionView.vue";

const props = defineProps<{ value: TherapeuticAppointmentSectionValue }>();
const diseaseSelectionGroups = computed(() => therapeuticSelectionGroups(
  props.value.diseaseAnamnesis.selectedIds,
  DISEASE_ANAMNESIS_CATEGORIES,
));
const lifeSelectionGroups = computed(() => therapeuticSelectionGroups(
  props.value.lifeAnamnesis.selectedIds,
  LIFE_ANAMNESIS_CATEGORIES,
  {
    "life.ectoparasites.name": props.value.lifeAnamnesis.ectoparasiteName,
    "life.deworming.name": props.value.lifeAnamnesis.dewormingName,
    "life.diet.natural-products": props.value.lifeAnamnesis.naturalDietProducts,
    "life.diet.commercial-name": props.value.lifeAnamnesis.commercialFoodName,
    "life.diseases.name": props.value.lifeAnamnesis.diseaseName,
  },
));
const examinationSelectionGroups = computed(() => therapeuticSelectionGroups(
  props.value.examination.selectedIds,
  EXAMINATION_CATEGORIES,
  {
    "exam.coat.comment": props.value.examination.coatComment,
    "exam.locomotion.comment": props.value.examination.locomotionComment,
  },
));
const populatedProblems = computed(() => props.value.diseaseAnamnesis.problems
  .map((problem) => ({ problem, details: problemDetails(problem) }))
  .filter(({ problem, details }) => Boolean(problem.title || details.length)));
const populatedTabs = computed(() => THERAPEUTIC_TABS.filter((tab) => tabPopulated(tab.id)));

function problemDetails(problem: TherapeuticProblemValue): Array<{ label: string; value: string }> {
  return [
    ...(problem.description ? [{ label: "Описание проблемы", value: problem.description }] : []),
    ...(problem.onsetId ? [{ label: "Как давно началось", value: therapeuticOptionLabel(problem.onsetId) }] : []),
    ...(problem.frequencyId ? [{ label: "Периодичность проявления", value: therapeuticOptionLabel(problem.frequencyId) }] : []),
    ...(problem.priorTherapyId ? [{ label: "Терапия до осмотра", value: therapeuticOptionLabel(problem.priorTherapyId) }] : []),
    ...(problem.medicationUseId ? [{ label: "Препараты", value: therapeuticOptionLabel(problem.medicationUseId) }] : []),
    ...(problem.medicationIds.length ? [{ label: "Применявшиеся препараты", value: problem.medicationIds.map(therapeuticOptionLabel).join(", ") }] : []),
    ...(problem.medicationName ? [{ label: "Название препарата", value: problem.medicationName }] : []),
    ...(problem.medicationDynamicsId ? [{ label: "Динамика", value: therapeuticOptionLabel(problem.medicationDynamicsId) }] : []),
  ];
}

function tabPopulated(tab: TherapeuticTab): boolean {
  if (tab === "disease") {
    return Boolean(props.value.diseaseAnamnesis.text
      || populatedProblems.value.length
      || diseaseSelectionGroups.value.length);
  }
  if (tab === "life") {
    return Boolean(props.value.lifeAnamnesis.text
      || lifeSelectionGroups.value.length
      || props.value.lifeAnamnesis.currentMedications
      || props.value.lifeAnamnesis.allergies);
  }
  if (tab === "examination") {
    return Boolean(props.value.examination.text || examinationSelectionGroups.value.length);
  }
  return Boolean(tab === "recommendations" ? props.value.recommendations : props.value.prescriptions);
}
</script>

<template>
  <div class="therapeutic-appointment-view">
    <section
      v-for="tab in populatedTabs"
      :key="tab.id"
      class="therapeutic-history-block"
      :data-document-section="tab.id"
    >
      <h4>{{ tab.label }}</h4>
      <template v-if="tab.id === 'disease'">
        <div v-if="populatedProblems.length" class="therapeutic-history-problems">
          <article v-for="({ problem, details }, index) in populatedProblems" :key="problem.id">
            <h5>Проблема {{ index + 1 }}<template v-if="problem.title">: {{ problem.title }}</template></h5>
            <dl v-if="details.length" class="therapeutic-history-values">
              <div v-for="(detail, detailIndex) in details" :key="`${detail.label}:${detailIndex}`"><dt>{{ detail.label }}</dt><dd>{{ detail.value }}</dd></div>
            </dl>
          </article>
        </div>
        <TherapeuticSelectionView v-if="diseaseSelectionGroups.length" :groups="diseaseSelectionGroups" />
        <dl v-if="value.diseaseAnamnesis.text" class="therapeutic-history-values therapeutic-history-comment-values">
          <div><dt>Комментарий</dt><dd class="therapeutic-history-text">{{ value.diseaseAnamnesis.text }}</dd></div>
        </dl>
      </template>
      <template v-else-if="tab.id === 'life'">
        <TherapeuticSelectionView v-if="lifeSelectionGroups.length" :groups="lifeSelectionGroups" />
        <dl
          v-if="value.lifeAnamnesis.currentMedications || value.lifeAnamnesis.allergies"
          class="therapeutic-history-values therapeutic-history-standalone-values"
        >
          <div v-if="value.lifeAnamnesis.currentMedications"><dt>Получаемые в данный момент препараты</dt><dd class="therapeutic-history-text">{{ value.lifeAnamnesis.currentMedications }}</dd></div>
          <div v-if="value.lifeAnamnesis.allergies"><dt>Аллергии</dt><dd class="therapeutic-history-text">{{ value.lifeAnamnesis.allergies }}</dd></div>
        </dl>
        <dl v-if="value.lifeAnamnesis.text" class="therapeutic-history-values therapeutic-history-comment-values">
          <div><dt>Комментарий</dt><dd class="therapeutic-history-text">{{ value.lifeAnamnesis.text }}</dd></div>
        </dl>
      </template>
      <template v-else-if="tab.id === 'examination'">
        <TherapeuticSelectionView v-if="examinationSelectionGroups.length" :groups="examinationSelectionGroups" />
        <dl v-if="value.examination.text" class="therapeutic-history-values therapeutic-history-comment-values">
          <div><dt>Комментарий</dt><dd class="therapeutic-history-text">{{ value.examination.text }}</dd></div>
        </dl>
      </template>
      <p v-else-if="tab.id === 'recommendations'" class="therapeutic-history-text">{{ value.recommendations }}</p>
      <p v-else class="therapeutic-history-text">{{ value.prescriptions }}</p>
    </section>
    <section v-if="value.migrationNotes.length" class="therapeutic-history-block therapeutic-migration-notes">
      <h4>Перенесённые данные</h4>
      <ul>
        <li v-for="note in value.migrationNotes" :key="note">{{ note }}</li>
      </ul>
    </section>
  </div>
</template>
