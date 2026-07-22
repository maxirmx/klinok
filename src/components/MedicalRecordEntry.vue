<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed } from "vue";
import AppIcon from "./AppIcon.vue";
import {
  ENCOUNTER_SECTION_LABELS,
  encounterSummary,
  freeText,
  isFreeTextValue,
  isWhatHappenedValue,
  whatHappenedComment,
  whatHappenedPath,
  whatHappenedSelectedIds,
} from "../medicalEncounter";
import type { MedicalEncounterSectionKind, MedicalRecordDraft } from "../repositories/types";

const props = withDefaults(defineProps<{
  record: MedicalRecordDraft;
  mode: "epicrisis" | "details";
  confirmed: boolean;
  action?: "none" | "confirm" | "edit";
  open?: boolean;
  showAuthorAccountId?: boolean;
}>(), {
  action: "none",
  open: false,
  showAuthorAccountId: false,
});

const emit = defineEmits<{
  activate: [record: MedicalRecordDraft];
  confirm: [record: MedicalRecordDraft];
  edit: [record: MedicalRecordDraft];
  delete: [record: MedicalRecordDraft];
}>();

const populatedSections = computed(() =>
  (Object.entries(ENCOUNTER_SECTION_LABELS) as Array<[MedicalEncounterSectionKind, string]>)
    .flatMap(([kind, label]) => {
      const section = props.record.sections[kind];
      return section ? [{ kind, label, section }] : [];
    }),
);

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
</script>

<template>
  <button
    v-if="mode === 'epicrisis'"
    class="epicrisis-row medical-record-entry medical-record-entry-epicrisis"
    type="button"
    :aria-label="`Открыть приём от ${formatDate(record.encounterDate)}`"
    @click="emit('activate', record)"
  >
    <span>{{ formatDate(record.encounterDate) }}</span>
    <strong>{{ encounterSummary(record) }}</strong>
    <span>{{ freeText(record.sections.outcome?.value) || 'Не заполнено' }}</span>
    <span class="status-badge" :class="confirmed ? 'approved' : 'pending'">
      {{ confirmed ? 'Подтверждён' : 'Ожидает подтверждения' }}
    </span>
  </button>

  <details
    v-else
    :id="`encounter-${record.recordId}`"
    class="owner-encounter-record medical-record-entry medical-record-entry-details"
    :open="open || undefined"
  >
    <summary class="owner-encounter-summary">
      <span class="medical-record-chevron" aria-hidden="true">
        <AppIcon class="medical-record-chevron-collapsed" name="chevron" />
        <AppIcon class="medical-record-chevron-expanded" name="chevron-down" />
      </span>
      <span class="owner-encounter-summary-copy">
        <strong>{{ formatDate(record.encounterDate) }} · {{ encounterSummary(record) }}</strong>
        <small>Редакция {{ record.revision }} · {{ record.authorDisplayName }}</small>
      </span>
      <span class="status-badge" :class="confirmed ? 'approved' : 'pending'">
        {{ confirmed ? 'Подтверждён' : 'Ожидает подтверждения' }}
      </span>
    </summary>

    <div class="owner-encounter-sections">
      <button
        v-if="action === 'confirm' && !confirmed"
        class="primary-action inline owner-encounter-confirm"
        type="button"
        @click="emit('confirm', record)"
      >
        Подтвердить приём
      </button>

      <div v-for="item in populatedSections" :key="item.kind" class="encounter-history-section">
        <div class="encounter-history-heading">
          <h3>{{ item.label }}</h3>
          <span v-if="item.kind === 'what-happened' && action === 'edit' && !confirmed" class="row-actions medical-record-actions">
            <button
              class="outline-action inline owner-profile-action medical-record-edit"
              type="button"
              title="Редактировать приём"
              aria-label="Редактировать приём"
              @click="emit('edit', record)"
            >
              <AppIcon name="edit" />
            </button>
            <button
              class="outline-action inline danger-outline owner-profile-action medical-record-delete"
              type="button"
              title="Удалить приём"
              aria-label="Удалить приём"
              @click="emit('delete', record)"
            >
              <AppIcon name="trash" />
            </button>
          </span>
        </div>
        <template v-if="isWhatHappenedValue(item.section.value)">
          <ul>
            <li v-for="id in whatHappenedSelectedIds(item.section.value)" :key="id">{{ whatHappenedPath(id) }}</li>
          </ul>
          <p v-if="whatHappenedComment(item.section.value)">{{ whatHappenedComment(item.section.value) }}</p>
        </template>
        <p v-else-if="isFreeTextValue(item.section.value)">{{ freeText(item.section.value) }}</p>
        <small>
          {{ item.section.authorDisplayName }}<template v-if="showAuthorAccountId"> · {{ item.section.authorAccountId }}</template>
          · {{ formatLocalDateTime(item.section.updatedAt) }}
        </small>
      </div>

    </div>
  </details>
</template>
