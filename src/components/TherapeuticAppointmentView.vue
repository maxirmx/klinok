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
  therapeuticSelectionGroups,
} from "../therapeuticAppointment";
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
));
const examinationSelectionGroups = computed(() => therapeuticSelectionGroups(
  props.value.examination.selectedIds,
  EXAMINATION_CATEGORIES,
));
const hasLife = computed(() => Boolean(props.value.lifeAnamnesis.text || lifeSelectionGroups.value.length
  || props.value.lifeAnamnesis.currentMedications || props.value.lifeAnamnesis.allergies));
const populatedProblems = computed(() => props.value.diseaseAnamnesis.problems
  .map((problem) => ({ problem, details: problemDetails(problem) }))
  .filter(({ problem, details }) => Boolean(problem.title || details.length)));
const hasDisease = computed(() => Boolean(
  props.value.diseaseAnamnesis.text || populatedProblems.value.length || diseaseSelectionGroups.value.length,
));
const hasExamination = computed(() => Boolean(props.value.examination.text || examinationSelectionGroups.value.length));

function problemDetails(problem: TherapeuticProblemValue): Array<{ label: string; value: string }> {
  return [
    ...(problem.onsetId ? [{ label: "Как давно началось", value: therapeuticOptionLabel(problem.onsetId) }] : []),
    ...(problem.frequencyId ? [{ label: "Периодичность", value: therapeuticOptionLabel(problem.frequencyId) }] : []),
    ...(problem.priorTherapyId ? [{ label: "Терапия до осмотра", value: therapeuticOptionLabel(problem.priorTherapyId) }] : []),
    ...(problem.medicationUseId ? [{ label: "Препараты", value: therapeuticOptionLabel(problem.medicationUseId) }] : []),
    ...(problem.medicationIds.length ? [{ label: "Виды препаратов", value: problem.medicationIds.map(therapeuticOptionLabel).join(", ") }] : []),
    ...(problem.medicationName ? [{ label: "Название препарата", value: problem.medicationName }] : []),
    ...(problem.medicationDynamicsId ? [{ label: "Динамика", value: therapeuticOptionLabel(problem.medicationDynamicsId) }] : []),
  ];
}
</script>

<template>
  <div class="therapeutic-appointment-view">
    <section
      v-if="hasDisease"
      class="therapeutic-history-block"
    >
      <h4>Анамнез болезни</h4>
      <dl v-if="value.diseaseAnamnesis.text" class="therapeutic-history-values">
        <div><dt>Комментарий</dt><dd class="therapeutic-history-text">{{ value.diseaseAnamnesis.text }}</dd></div>
      </dl>
      <div v-if="populatedProblems.length" class="therapeutic-history-problems">
        <article v-for="({ problem, details }, index) in populatedProblems" :key="problem.id">
          <h5>Проблема {{ index + 1 }}<template v-if="problem.title">: {{ problem.title }}</template></h5>
          <dl v-if="details.length" class="therapeutic-history-values">
            <div v-for="detail in details" :key="detail.label"><dt>{{ detail.label }}</dt><dd>{{ detail.value }}</dd></div>
          </dl>
        </article>
      </div>
      <TherapeuticSelectionView v-if="diseaseSelectionGroups.length" :groups="diseaseSelectionGroups" />
    </section>
    <section
      v-if="hasLife"
      class="therapeutic-history-block"
    >
      <h4>Анамнез жизни</h4>
      <dl v-if="value.lifeAnamnesis.text" class="therapeutic-history-values">
        <div><dt>Комментарий</dt><dd class="therapeutic-history-text">{{ value.lifeAnamnesis.text }}</dd></div>
      </dl>
      <TherapeuticSelectionView v-if="lifeSelectionGroups.length" :groups="lifeSelectionGroups" />
      <dl
        v-if="value.lifeAnamnesis.currentMedications || value.lifeAnamnesis.allergies"
        class="therapeutic-history-values"
      >
        <div v-if="value.lifeAnamnesis.currentMedications"><dt>Получаемые препараты</dt><dd class="therapeutic-history-text">{{ value.lifeAnamnesis.currentMedications }}</dd></div>
        <div v-if="value.lifeAnamnesis.allergies"><dt>Аллергии</dt><dd class="therapeutic-history-text">{{ value.lifeAnamnesis.allergies }}</dd></div>
      </dl>
    </section>
    <section
      v-if="hasExamination"
      class="therapeutic-history-block"
    >
      <h4>Осмотр</h4>
      <dl v-if="value.examination.text" class="therapeutic-history-values">
        <div><dt>Комментарий</dt><dd class="therapeutic-history-text">{{ value.examination.text }}</dd></div>
      </dl>
      <TherapeuticSelectionView v-if="examinationSelectionGroups.length" :groups="examinationSelectionGroups" />
    </section>
    <section
      v-if="value.recommendations"
      class="therapeutic-history-block"
    >
      <h4>Рекомендации</h4>
      <p class="therapeutic-history-text">{{ value.recommendations }}</p>
    </section>
    <section
      v-if="value.prescriptions"
      class="therapeutic-history-block"
    >
      <h4>Назначения</h4>
      <p class="therapeutic-history-text">{{ value.prescriptions }}</p>
    </section>
  </div>
</template>
