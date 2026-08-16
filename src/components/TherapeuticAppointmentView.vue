<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, nextTick, ref, useId } from "vue";
import {
  DISEASE_ANAMNESIS_CATEGORIES,
  EXAMINATION_CATEGORIES,
  LIFE_ANAMNESIS_CATEGORIES,
  THERAPEUTIC_TABS,
  therapeuticOptionLabel,
  therapeuticSelectionDetails,
} from "../therapeuticAppointment";
import type { TherapeuticTab } from "../therapeuticAppointment";
import type { TherapeuticAppointmentSectionValue, TherapeuticProblemValue } from "../repositories/types";

const props = defineProps<{ value: TherapeuticAppointmentSectionValue }>();
const activeTab = ref<TherapeuticTab>(firstPopulatedTab(props.value));
const tabButtons = ref<HTMLButtonElement[]>([]);
const baseId = useId();
const diseaseDetails = computed(() => therapeuticSelectionDetails(props.value.diseaseAnamnesis.selectedIds, DISEASE_ANAMNESIS_CATEGORIES));
const lifeDetails = computed(() => therapeuticSelectionDetails(props.value.lifeAnamnesis.selectedIds, LIFE_ANAMNESIS_CATEGORIES));
const examinationDetails = computed(() => therapeuticSelectionDetails(props.value.examination.selectedIds, EXAMINATION_CATEGORIES));
const hasLife = computed(() => Boolean(props.value.lifeAnamnesis.text || lifeDetails.value.length
  || props.value.lifeAnamnesis.currentMedications || props.value.lifeAnamnesis.allergies));

function firstPopulatedTab(value: TherapeuticAppointmentSectionValue): TherapeuticTab {
  const populatedTabs: Record<TherapeuticTab, boolean> = {
    disease: Boolean(value.diseaseAnamnesis.text || value.diseaseAnamnesis.problems.length
      || value.diseaseAnamnesis.selectedIds.length),
    life: Boolean(value.lifeAnamnesis.text || value.lifeAnamnesis.selectedIds.length
      || value.lifeAnamnesis.currentMedications || value.lifeAnamnesis.allergies),
    examination: Boolean(value.examination.text || value.examination.selectedIds.length),
    recommendations: Boolean(value.recommendations),
    prescriptions: Boolean(value.prescriptions),
  };
  return THERAPEUTIC_TABS.find((tab) => populatedTabs[tab.id])?.id ?? "disease";
}

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

function tabId(tab: TherapeuticTab) {
  return `${baseId}-${tab}-view-tab`;
}

function panelId(tab: TherapeuticTab) {
  return `${baseId}-${tab}-view-panel`;
}

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
      class="therapeutic-tab-panel therapeutic-history-block"
      role="tabpanel"
      :aria-labelledby="tabId('disease')"
      :hidden="activeTab !== 'disease'"
    >
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
    <section
      :id="panelId('life')"
      class="therapeutic-tab-panel therapeutic-history-block"
      role="tabpanel"
      :aria-labelledby="tabId('life')"
      :hidden="activeTab !== 'life'"
    >
      <h4>Анамнез жизни</h4>
      <p v-if="value.lifeAnamnesis.text" class="therapeutic-history-text">{{ value.lifeAnamnesis.text }}</p>
      <dl v-if="hasLife" class="therapeutic-history-values">
        <div v-for="detail in lifeDetails" :key="detail.key"><dt>{{ detail.label }}</dt><dd>{{ detail.value }}</dd></div>
        <div v-if="value.lifeAnamnesis.currentMedications"><dt>Получаемые препараты</dt><dd class="therapeutic-history-text">{{ value.lifeAnamnesis.currentMedications }}</dd></div>
        <div v-if="value.lifeAnamnesis.allergies"><dt>Аллергии</dt><dd class="therapeutic-history-text">{{ value.lifeAnamnesis.allergies }}</dd></div>
      </dl>
    </section>
    <section
      :id="panelId('examination')"
      class="therapeutic-tab-panel therapeutic-history-block"
      role="tabpanel"
      :aria-labelledby="tabId('examination')"
      :hidden="activeTab !== 'examination'"
    >
      <h4>Осмотр</h4>
      <p v-if="value.examination.text" class="therapeutic-history-text">{{ value.examination.text }}</p>
      <dl v-if="examinationDetails.length" class="therapeutic-history-values">
        <div v-for="detail in examinationDetails" :key="detail.key"><dt>{{ detail.label }}</dt><dd>{{ detail.value }}</dd></div>
      </dl>
    </section>
    <section
      :id="panelId('recommendations')"
      class="therapeutic-tab-panel therapeutic-history-block"
      role="tabpanel"
      :aria-labelledby="tabId('recommendations')"
      :hidden="activeTab !== 'recommendations'"
    >
      <h4>Рекомендации</h4>
      <p v-if="value.recommendations" class="therapeutic-history-text">{{ value.recommendations }}</p>
    </section>
    <section
      :id="panelId('prescriptions')"
      class="therapeutic-tab-panel therapeutic-history-block"
      role="tabpanel"
      :aria-labelledby="tabId('prescriptions')"
      :hidden="activeTab !== 'prescriptions'"
    >
      <h4>Назначения</h4>
      <p v-if="value.prescriptions" class="therapeutic-history-text">{{ value.prescriptions }}</p>
    </section>
  </div>
</template>
