<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed } from "vue";
import AppIcon from "./AppIcon.vue";
import InstrumentalFindingsView from "./InstrumentalFindingsView.vue";
import PersonIdentity from "./PersonIdentity.vue";
import TherapeuticAppointmentView from "./TherapeuticAppointmentView.vue";
import {
  ENCOUNTER_SECTION_LABELS,
  ENCOUNTER_SECTION_ORDER,
  diagnosisChoiceSummary,
  diagnosisConfirmedSummary,
  diagnosisDifferentialCustomTexts,
  diagnosisLabel,
  freeText,
  generalDataMeasurements,
  isFreeTextValue,
  isDiagnosisValue,
  isGeneralDataValue,
  isInstrumentalTestsValue,
  isOutcomeValue,
  isVaccinationValue,
  isLaboratoryTestsValue,
  isWhatHappenedValue,
  outcomeComment,
  outcomeLabel,
  outcomeSelectedIds,
  outcomeSummary,
  vaccinationDetails,
  whatHappenedComment,
  whatHappenedPath,
  whatHappenedSecondLevelLabel,
  whatHappenedSelectedIds,
} from "../medicalEncounter";
import { isTherapeuticAppointmentValue } from "../therapeuticAppointment";
import type { MedicalEncounterSectionKind, MedicalRecordDraft } from "../repositories/types";

const props = withDefaults(defineProps<{
  record: MedicalRecordDraft;
  mode: "epicrisis" | "details";
  confirmed: boolean;
  action?: "none" | "confirm" | "edit";
  open?: boolean;
  editing?: boolean;
  showAuthorAccountId?: boolean;
}>(), {
  action: "none",
  open: false,
  editing: false,
  showAuthorAccountId: false,
});

const emit = defineEmits<{
  activate: [recordId: string];
  confirm: [record: MedicalRecordDraft];
  edit: [record: MedicalRecordDraft];
  delete: [record: MedicalRecordDraft];
  toggle: [recordId: string, open: boolean];
}>();

const encounterSectionDisplayRanks = new Map(ENCOUNTER_SECTION_ORDER.map((kind, index) => [kind, index]));

const populatedSections = computed(() =>
  (Object.entries(ENCOUNTER_SECTION_LABELS) as Array<[MedicalEncounterSectionKind, string]>)
    .flatMap(([kind, label]) => {
      const section = props.record.sections[kind];
      return section ? [{ kind, label, section }] : [];
    })
    .sort((left, right) => (encounterSectionDisplayRanks.get(left.kind) ?? Number.MAX_SAFE_INTEGER)
      - (encounterSectionDisplayRanks.get(right.kind) ?? Number.MAX_SAFE_INTEGER)),
);

const epicrisisWhatHappened = computed(() => {
  const value = props.record.sections["what-happened"]?.value;
  const paths = [...new Set(whatHappenedSelectedIds(value).map(whatHappenedSecondLevelLabel))];
  const comment = whatHappenedComment(value).trim();
  return {
    paths,
    comment,
    fallback: paths.length || comment ? "" : props.record.text.trim(),
  };
});
const epicrisisDiagnosis = computed(() => diagnosisConfirmedSummary(props.record.sections.diagnosis?.value));
const epicrisisOutcome = computed(() => outcomeSummary(props.record.sections.outcome?.value));

function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function formatLocalDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function emitToggle(event: Event) {
  const details = event.currentTarget as HTMLDetailsElement;
  emit("toggle", props.record.recordId, details.open);
}
</script>

<template>
  <button
    v-if="mode === 'epicrisis'"
    class="epicrisis-row medical-record-entry medical-record-entry-epicrisis"
    type="button"
    :aria-label="`Открыть приём от ${formatDate(record.encounterDate)}`"
    @click="emit('activate', record.recordId)"
  >
    <span class="epicrisis-cell epicrisis-date">
      <small class="epicrisis-cell-label">Дата</small>
      <span>{{ formatDate(record.encounterDate) }}</span>
    </span>
    <span class="epicrisis-cell epicrisis-what-happened">
      <small class="epicrisis-cell-label">Что случилось</small>
      <span v-for="path in epicrisisWhatHappened.paths" :key="path">{{ path }}</span>
      <span v-if="epicrisisWhatHappened.comment">{{ epicrisisWhatHappened.comment }}</span>
      <span v-if="epicrisisWhatHappened.fallback">{{ epicrisisWhatHappened.fallback }}</span>
      <span v-if="!epicrisisWhatHappened.paths.length && !epicrisisWhatHappened.comment && !epicrisisWhatHappened.fallback">—</span>
    </span>
    <span v-if="epicrisisDiagnosis" class="epicrisis-cell epicrisis-diagnosis">
      <small class="epicrisis-cell-label">Диагноз</small>
      <span>{{ epicrisisDiagnosis }}</span>
    </span>
    <span class="epicrisis-cell epicrisis-outcome">
      <small class="epicrisis-cell-label">Итог</small>
      <span>{{ epicrisisOutcome || '—' }}</span>
    </span>
  </button>

  <details
    v-else
    :id="`encounter-${record.recordId}`"
    class="owner-encounter-record medical-record-entry medical-record-entry-details"
    v-bind="open || editing ? { open: true } : {}"
    @toggle="emitToggle"
  >
    <summary class="owner-encounter-summary">
      <span class="medical-record-chevron" aria-hidden="true">
        <AppIcon class="medical-record-chevron-collapsed" name="chevron" />
        <AppIcon class="medical-record-chevron-expanded" name="chevron-down" />
      </span>
      <span class="owner-encounter-summary-copy">
        <strong>{{ formatDate(record.encounterDate) }}</strong>
        <small>{{ record.authorDisplayName }}</small>
      </span>
      <span class="status-badge" :class="confirmed ? 'approved' : 'pending'">
        {{ confirmed ? 'Подтверждена' : 'Ожидает подтверждения' }}
      </span>
    </summary>

    <div class="owner-encounter-sections" :class="{ 'owner-encounter-sections-editing': editing }">
      <slot v-if="editing" name="editor" />
      <template v-else>
      <div v-for="(item, index) in populatedSections" :key="item.kind" class="encounter-history-section">
        <div class="encounter-history-heading">
          <h3>{{ item.label }}</h3>
          <span v-if="index === 0 && !confirmed && (action === 'confirm' || action === 'edit')" class="row-actions medical-record-actions">
            <button
              v-if="action === 'confirm'"
              class="primary-action inline owner-profile-action owner-encounter-confirm"
              type="button"
              title="Подтвердить запись"
              aria-label="Подтвердить запись"
              @click="emit('confirm', record)"
            >
              <AppIcon name="check" />
            </button>
            <button
              v-if="action === 'edit'"
              class="outline-action inline owner-profile-action medical-record-edit"
              type="button"
              title="Редактировать запись"
              aria-label="Редактировать запись"
              @click="emit('edit', record)"
            >
              <AppIcon name="edit" />
            </button>
            <button
              v-if="action === 'edit'"
              class="outline-action inline danger-outline owner-profile-action medical-record-delete"
              type="button"
              title="Удалить запись"
              aria-label="Удалить запись"
              @click="emit('delete', record)"
            >
              <AppIcon name="trash" />
            </button>
          </span>
        </div>
        <template v-if="item.kind === 'what-happened' && isWhatHappenedValue(item.section.value)">
          <ul>
            <li v-for="id in whatHappenedSelectedIds(item.section.value)" :key="id">{{ whatHappenedPath(id) }}</li>
          </ul>
          <p v-if="whatHappenedComment(item.section.value)" class="encounter-history-comment">{{ whatHappenedComment(item.section.value) }}</p>
        </template>
        <template v-else-if="item.kind === 'outcome' && isOutcomeValue(item.section.value)">
          <ul>
            <li v-for="id in outcomeSelectedIds(item.section.value)" :key="id">{{ outcomeLabel(id) }}</li>
          </ul>
          <p v-if="outcomeComment(item.section.value)" class="encounter-history-comment">{{ outcomeComment(item.section.value) }}</p>
        </template>
        <ul v-else-if="item.kind === 'diagnosis' && isDiagnosisValue(item.section.value)" class="diagnosis-history-values instrumental-history-findings">
          <li>
            <span>Предварительный диагноз</span>
            <ul class="instrumental-history-findings">
              <li>{{ diagnosisChoiceSummary(item.section.value.preliminary) || 'Не указано' }}</li>
            </ul>
          </li>
          <li>
            <span>Дифференциальные диагнозы</span>
            <ul class="instrumental-history-findings">
              <template v-if="item.section.value.differential.selectedIds.length || diagnosisDifferentialCustomTexts(item.section.value.differential).length">
                <li v-for="id in item.section.value.differential.selectedIds" :key="id">{{ diagnosisLabel(id) }}</li>
                <li v-for="(text, index) in diagnosisDifferentialCustomTexts(item.section.value.differential)" :key="`custom:${index}:${text}`">{{ text }}</li>
              </template>
              <li v-else>Не указано</li>
            </ul>
          </li>
          <li v-if="diagnosisChoiceSummary(item.section.value.confirmed)">
            <span>Подтверждённый диагноз</span>
            <ul class="instrumental-history-findings">
              <li>{{ diagnosisChoiceSummary(item.section.value.confirmed) }}</li>
            </ul>
          </li>
        </ul>
        <TherapeuticAppointmentView
          v-else-if="item.kind === 'therapeutic-appointment' && isTherapeuticAppointmentValue(item.section.value)"
          :value="item.section.value"
        />
        <div v-else-if="isLaboratoryTestsValue(item.section.value)" class="laboratory-history">
          <section v-for="study in item.section.value.studies" :key="study.id" class="laboratory-history-study">
            <h4>{{ formatDate(study.date) }} · {{ study.typeName }}</h4>
            <p><span class="muted-label">Лаборатория</span> {{ study.laboratory }}</p>
            <p v-if="study.technician"><span class="muted-label">Лаборант</span> {{ study.technician }}</p>
            <p v-if="study.equipment"><span class="muted-label">Оборудование</span> {{ study.equipment }}</p>
            <div v-if="study.mode === 'panel'" class="laboratory-panel-results laboratory-history-results" role="group" aria-label="Показатели исследования">
              <div class="laboratory-panel-layout" :class="{ 'laboratory-panel-layout-multiple': study.results.length > 1 }">
                <div class="laboratory-result-headings laboratory-result-headings-primary" aria-hidden="true">
                  <span>Показатель</span><span>Результат</span><span>Референсные значения</span>
                </div>
                <div v-if="study.results.length > 1" class="laboratory-result-headings laboratory-result-headings-secondary" aria-hidden="true">
                  <span>Показатель</span><span>Результат</span><span>Референсные значения</span>
                </div>
                <div v-for="result in study.results" :key="result.indicatorId" class="laboratory-result-row">
                  <div class="laboratory-result-indicator">
                    <span>{{ result.indicatorName }}</span>
                    <span class="laboratory-result-unit">{{ result.unit || '—' }}</span>
                  </div>
                  <div><span class="laboratory-result-mobile-name" :title="`${result.indicatorName} · ${result.unit || '—'}`">{{ result.indicatorName }} · {{ result.unit || '—' }}</span><span>{{ result.result }}</span></div>
                  <div><span class="laboratory-result-label">Референсные значения</span><span>{{ result.reference || '—' }}</span></div>
                </div>
              </div>
            </div>
            <p v-else-if="study.mode === 'narrative'">{{ study.result }}</p>
            <dl v-else><div><dt>Инфекция</dt><dd>{{ study.infection }}</dd></div><div><dt>Метод</dt><dd>{{ study.method }}</dd></div><div><dt>Результат</dt><dd>{{ study.result === 'positive' ? 'Положительно' : 'Отрицательно' }}</dd></div></dl>
            <p v-if="study.comment" class="encounter-history-comment">{{ study.comment }}</p>
          </section>
        </div>
        <div v-else-if="item.kind === 'instrumental-tests' && isInstrumentalTestsValue(item.section.value)" class="instrumental-history">
          <section v-for="study in item.section.value.studies" :key="study.id" class="instrumental-history-study">
            <h4>{{ formatDate(study.date) }} · {{ study.typeName }}</h4>
            <InstrumentalFindingsView v-if="study.mode === 'tree'" :findings="study.findings" />
            <p v-else>{{ study.result }}</p>
            <p v-if="study.comment" class="encounter-history-comment">{{ study.comment }}</p>
          </section>
        </div>
        <dl v-else-if="isGeneralDataValue(item.section.value)" class="general-data-values">
          <div v-for="measurement in generalDataMeasurements(item.section.value)" :key="measurement.key">
            <dt>{{ measurement.label }}</dt>
            <dd>{{ measurement.value }}</dd>
          </div>
        </dl>
        <dl v-else-if="isVaccinationValue(item.section.value)" class="vaccination-values">
          <div v-for="detail in vaccinationDetails(item.section.value)" :key="detail.key">
            <dt>{{ detail.label }}</dt>
            <dd>{{ detail.value }}</dd>
          </div>
        </dl>
        <p v-else-if="isFreeTextValue(item.section.value)">{{ freeText(item.section.value) }}</p>
        <div v-if="showAuthorAccountId" class="encounter-history-meta">
          <PersonIdentity
            :display-name="item.section.authorDisplayName"
            :account-id="item.section.authorAccountId"
          />
          <small>{{ formatLocalDateTime(item.section.updatedAt) }}</small>
        </div>
        <small v-else>{{ item.section.authorDisplayName }} · {{ formatLocalDateTime(item.section.updatedAt) }}</small>
      </div>

      </template>

    </div>
  </details>
</template>
