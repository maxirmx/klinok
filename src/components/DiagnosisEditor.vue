<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, ref } from "vue";
import type { DiagnosisDraft, DiagnosisDraftErrors } from "../medicalEncounter";
import { diagnosisLabel } from "../medicalEncounter";
import AppIcon from "./AppIcon.vue";
import ConfirmationDialog from "./ConfirmationDialog.vue";
import DiagnosisCombobox from "./DiagnosisCombobox.vue";

const props = defineProps<{ errors: DiagnosisDraftErrors }>();
const diagnosis = defineModel<DiagnosisDraft>({ required: true });
const replacementOpen = ref(false);
const pendingPromotion = ref<{ selectedId?: string; customText: string } | null>(null);

const preliminaryIds = computed({
  get: () => diagnosis.value.preliminarySelectedId ? [diagnosis.value.preliminarySelectedId] : [],
  set: (ids: string[]) => update({
    preliminaryMode: ids.length ? "catalog" : diagnosis.value.preliminaryCustomText.trim() ? "custom" : "catalog",
    preliminarySelectedId: ids[0] ?? "",
    ...(ids.length ? { preliminaryCustomText: "" } : {}),
  }),
});
const preliminaryCustomText = computed({
  get: () => diagnosis.value.preliminaryCustomText,
  set: (value: string) => update({
    preliminaryMode: value.trim() ? "custom" : "catalog",
    preliminarySelectedId: value ? "" : diagnosis.value.preliminarySelectedId,
    preliminaryCustomText: value,
  }),
});
const differentialIds = computed({
  get: () => diagnosis.value.differentialSelectedIds,
  set: (ids: string[]) => update({
    differentialSelectedIds: ids,
  }),
});
const differentialCustomTexts = computed({
  get: () => diagnosis.value.differentialCustomTexts,
  set: (values: string[]) => update({ differentialCustomTexts: values }),
});
const confirmedIds = computed({
  get: () => diagnosis.value.confirmedSelectedId ? [diagnosis.value.confirmedSelectedId] : [],
  set: (ids: string[]) => update({
    confirmedMode: ids.length ? "catalog" : diagnosis.value.confirmedCustomText.trim() ? "custom" : "catalog",
    confirmedSelectedId: ids[0] ?? "",
    ...(ids.length ? { confirmedCustomText: "" } : {}),
  }),
});
const confirmedCustomText = computed({
  get: () => diagnosis.value.confirmedCustomText,
  set: (value: string) => update({
    confirmedMode: value.trim() ? "custom" : "catalog",
    confirmedSelectedId: value ? "" : diagnosis.value.confirmedSelectedId,
    confirmedCustomText: value,
  }),
});
const currentConfirmed = computed(() => diagnosis.value.confirmedMode === "catalog"
  ? diagnosis.value.confirmedSelectedId
  : diagnosis.value.confirmedCustomText.trim());
const preliminaryPromotion = computed(() => diagnosis.value.preliminarySelectedId
  ? { selectedId: diagnosis.value.preliminarySelectedId, customText: "" }
  : { customText: diagnosis.value.preliminaryCustomText });

function update(patch: Partial<DiagnosisDraft>) {
  diagnosis.value = { ...diagnosis.value, ...patch };
}

function sameAsConfirmed(promotion: { selectedId?: string; customText: string }): boolean {
  return promotion.selectedId
    ? diagnosis.value.confirmedMode === "catalog" && diagnosis.value.confirmedSelectedId === promotion.selectedId
    : diagnosis.value.confirmedMode === "custom" && diagnosis.value.confirmedCustomText.trim() === promotion.customText.trim();
}

function applyPromotion(promotion = pendingPromotion.value) {
  if (!promotion) return;
  if (promotion.selectedId) {
    update({ confirmedMode: "catalog", confirmedSelectedId: promotion.selectedId, confirmedCustomText: "" });
  } else {
    update({ confirmedMode: "custom", confirmedSelectedId: "", confirmedCustomText: promotion.customText.trim() });
  }
  pendingPromotion.value = null;
  replacementOpen.value = false;
}

function requestPromotion(promotion: { selectedId?: string; customText: string }) {
  if ((!promotion.selectedId && !promotion.customText.trim()) || sameAsConfirmed(promotion)) return;
  if (currentConfirmed.value) {
    pendingPromotion.value = promotion;
    replacementOpen.value = true;
  } else {
    applyPromotion(promotion);
  }
}

function removeDifferential(id: string) {
  update({ differentialSelectedIds: diagnosis.value.differentialSelectedIds.filter((selectedId) => selectedId !== id) });
}

function removeCustomDifferential(index: number) {
  update({ differentialCustomTexts: diagnosis.value.differentialCustomTexts.filter((_, itemIndex) => itemIndex !== index) });
}
</script>

<template>
  <div class="diagnosis-editor">
    <fieldset class="medical-card-option-panel diagnosis-field">
      <legend>Предварительный диагноз</legend>
      <div class="diagnosis-value-control">
        <DiagnosisCombobox
          v-model:selected-ids="preliminaryIds"
          v-model:custom-text="preliminaryCustomText"
          label="Предварительный диагноз"
        />
        <button
          type="button"
          class="outline-action inline owner-profile-action diagnosis-promote"
          title="Назначить подтверждённым диагнозом"
          aria-label="Назначить предварительный диагноз подтверждённым"
          :disabled="!preliminaryPromotion.selectedId && !preliminaryPromotion.customText.trim() || sameAsConfirmed(preliminaryPromotion)"
          @click="requestPromotion(preliminaryPromotion)"
        ><AppIcon name="input" /></button>
      </div>
      <small v-if="props.errors.preliminary" class="field-error">{{ props.errors.preliminary }}</small>
    </fieldset>

    <fieldset class="medical-card-option-panel diagnosis-field">
      <legend>Дифференциальные диагнозы</legend>
      <DiagnosisCombobox
        v-model:selected-ids="differentialIds"
        v-model:custom-texts="differentialCustomTexts"
        label="Добавить дифференциальный диагноз"
        multiple
      />
      <div v-if="diagnosis.differentialSelectedIds.length || diagnosis.differentialCustomTexts.length" class="diagnosis-selected-chips">
        <span v-for="id in diagnosis.differentialSelectedIds" :key="id" class="diagnosis-selected-chip">
          <span>{{ diagnosisLabel(id) }}</span>
          <button
            type="button"
            class="outline-action inline owner-profile-action"
            title="Назначить подтверждённым диагнозом"
            :aria-label="`Назначить «${diagnosisLabel(id)}» подтверждённым диагнозом`"
            :disabled="sameAsConfirmed({ selectedId: id, customText: '' })"
            @click="requestPromotion({ selectedId: id, customText: '' })"
          ><AppIcon name="input" /></button>
          <button
            type="button"
            class="outline-action inline danger-outline owner-profile-action"
            title="Удалить дифференциальный диагноз"
            :aria-label="`Удалить «${diagnosisLabel(id)}» из дифференциальных диагнозов`"
            @click="removeDifferential(id)"
          ><AppIcon name="close" /></button>
        </span>
        <span v-for="(text, index) in diagnosis.differentialCustomTexts" :key="`custom:${index}:${text}`" class="diagnosis-selected-chip">
          <span>{{ text }}</span>
          <button
            type="button"
            class="outline-action inline owner-profile-action"
            title="Назначить подтверждённым диагнозом"
            :aria-label="`Назначить «${text}» подтверждённым диагнозом`"
            :disabled="sameAsConfirmed({ customText: text })"
            @click="requestPromotion({ customText: text })"
          ><AppIcon name="input" /></button>
          <button
            type="button"
            class="outline-action inline danger-outline owner-profile-action"
            title="Удалить дифференциальный диагноз"
            :aria-label="`Удалить «${text}» из дифференциальных диагнозов`"
            @click="removeCustomDifferential(index)"
          ><AppIcon name="close" /></button>
        </span>
      </div>
      <small v-if="props.errors.differential" class="field-error">{{ props.errors.differential }}</small>
    </fieldset>

    <fieldset class="medical-card-option-panel diagnosis-field">
      <legend>Подтверждённый диагноз</legend>
      <DiagnosisCombobox
        v-model:selected-ids="confirmedIds"
        v-model:custom-text="confirmedCustomText"
        label="Подтверждённый диагноз"
      />
      <small v-if="props.errors.confirmed" class="field-error">{{ props.errors.confirmed }}</small>
    </fieldset>

    <ConfirmationDialog
      v-model="replacementOpen"
      title="Заменить подтверждённый диагноз?"
      description="Текущее значение подтверждённого диагноза будет заменено. Исходный предварительный или дифференциальный диагноз сохранится."
      confirm-label="Заменить"
      @confirm="applyPromotion()"
    />
  </div>
</template>
