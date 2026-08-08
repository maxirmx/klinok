<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed } from "vue";
import {
  DISEASE_ANAMNESIS_CATEGORIES,
  EXAMINATION_CATEGORIES,
  LIFE_ANAMNESIS_CATEGORIES,
  therapeuticOptionLabel,
  therapeuticSelectionDetails,
} from "../therapeuticAppointment";
import type { TherapeuticAppointmentSectionValue, TherapeuticProblemValue } from "../repositories/types";

const props = defineProps<{ value: TherapeuticAppointmentSectionValue }>();
const diseaseDetails = computed(() => therapeuticSelectionDetails(props.value.diseaseAnamnesis.selectedIds, DISEASE_ANAMNESIS_CATEGORIES));
const lifeDetails = computed(() => therapeuticSelectionDetails(props.value.lifeAnamnesis.selectedIds, LIFE_ANAMNESIS_CATEGORIES));
const examinationDetails = computed(() => therapeuticSelectionDetails(props.value.examination.selectedIds, EXAMINATION_CATEGORIES));
const hasDisease = computed(() => Boolean(props.value.diseaseAnamnesis.text
  || props.value.diseaseAnamnesis.problems.length || diseaseDetails.value.length));
const hasLife = computed(() => Boolean(props.value.lifeAnamnesis.text || lifeDetails.value.length
  || props.value.lifeAnamnesis.currentMedications || props.value.lifeAnamnesis.allergies));
const hasExamination = computed(() => Boolean(props.value.examination.text || examinationDetails.value.length));

function problemDetails(problem: TherapeuticProblemValue): Array<{ label: string; value: string }> {
  return [
    ...(problem.onsetId ? [{ label: "Как давно началось", value: therapeuticOptionLabel(problem.onsetId) }] : []),
    ...(problem.frequencyId ? [{ label: "Периодичность", value: therapeuticOptionLabel(problem.frequencyId) }] : []),
    ...(problem.priorTherapyId ? [{ label: "Терапия до осмотра", value: therapeuticOptionLabel(problem.priorTherapyId) }] : []),
    ...(problem.medicationUseId ? [{ label: "Препараты", value: therapeuticOptionLabel(problem.medicationUseId) }] : []),
    ...(problem.medicationIds.length ? [{ label: "Виды препаратов", value: problem.medicationIds.map(therapeuticOptionLabel).join(", ") }] : []),
    ...(problem.medicationDynamicsId ? [{ label: "Динамика", value: therapeuticOptionLabel(problem.medicationDynamicsId) }] : []),
  ];
}
</script>

<template>
  <div class="therapeutic-appointment-view">
    <section v-if="hasDisease" class="therapeutic-history-block">
      <h4>Анамнез болезни</h4>
      <p v-if="value.diseaseAnamnesis.text" class="therapeutic-history-text">{{ value.diseaseAnamnesis.text }}</p>
      <div v-if="value.diseaseAnamnesis.problems.length" class="therapeutic-history-problems">
        <article v-for="(problem, index) in value.diseaseAnamnesis.problems" :key="problem.id">
          <h5>Проблема {{ index + 1 }}: {{ problem.title }}</h5>
          <dl v-if="problemDetails(problem).length" class="therapeutic-history-values">
            <div v-for="detail in problemDetails(problem)" :key="detail.label"><dt>{{ detail.label }}</dt><dd>{{ detail.value }}</dd></div>
          </dl>
        </article>
      </div>
      <dl v-if="diseaseDetails.length" class="therapeutic-history-values">
        <div v-for="detail in diseaseDetails" :key="detail.key"><dt>{{ detail.label }}</dt><dd>{{ detail.value }}</dd></div>
      </dl>
    </section>
    <section v-if="hasLife" class="therapeutic-history-block">
      <h4>Анамнез жизни</h4>
      <p v-if="value.lifeAnamnesis.text" class="therapeutic-history-text">{{ value.lifeAnamnesis.text }}</p>
      <dl class="therapeutic-history-values">
        <div v-for="detail in lifeDetails" :key="detail.key"><dt>{{ detail.label }}</dt><dd>{{ detail.value }}</dd></div>
        <div v-if="value.lifeAnamnesis.currentMedications"><dt>Получаемые препараты</dt><dd class="therapeutic-history-text">{{ value.lifeAnamnesis.currentMedications }}</dd></div>
        <div v-if="value.lifeAnamnesis.allergies"><dt>Аллергии</dt><dd class="therapeutic-history-text">{{ value.lifeAnamnesis.allergies }}</dd></div>
      </dl>
    </section>
    <section v-if="hasExamination" class="therapeutic-history-block">
      <h4>Осмотр</h4>
      <p v-if="value.examination.text" class="therapeutic-history-text">{{ value.examination.text }}</p>
      <dl v-if="examinationDetails.length" class="therapeutic-history-values">
        <div v-for="detail in examinationDetails" :key="detail.key"><dt>{{ detail.label }}</dt><dd>{{ detail.value }}</dd></div>
      </dl>
    </section>
    <section v-if="value.recommendations" class="therapeutic-history-block">
      <h4>Рекомендации</h4>
      <p class="therapeutic-history-text">{{ value.recommendations }}</p>
    </section>
    <section v-if="value.prescriptions" class="therapeutic-history-block">
      <h4>Назначения</h4>
      <p class="therapeutic-history-text">{{ value.prescriptions }}</p>
    </section>
  </div>
</template>
