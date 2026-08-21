<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, ref } from "vue";
import type { InstrumentalFindingCatalogItem, InstrumentalFindingValue } from "@klinok/contracts";
import AppCatalogCombobox from "./AppCatalogCombobox.vue";
import AppIcon from "./AppIcon.vue";
import ConfirmationDialog from "./ConfirmationDialog.vue";

const props = withDefaults(defineProps<{
  catalog: readonly InstrumentalFindingCatalogItem[];
  errors?: Record<string, string>;
  depth?: number;
  parentName?: string;
}>(), {
  errors: () => ({}),
  depth: 0,
  parentName: "исследование",
});
const model = defineModel<readonly InstrumentalFindingValue[]>({ required: true });
const pendingIds = ref<string[]>([]);
const removeTarget = ref<InstrumentalFindingValue | null>(null);
const confirmOpen = computed({ get: () => Boolean(removeTarget.value), set: (value) => { if (!value) removeTarget.value = null; } });
const choiceCatalog = computed(() => props.catalog.filter((item) => item.kind === "choice"));
const indicatorCatalog = computed(() => props.catalog.filter((item) => item.kind !== "choice"));
const choiceOptions = computed(() => choiceCatalog.value.map((item) => ({ id: item.id, label: item.name })));
const choiceIds = computed(() => model.value.filter((value) => catalogItem(value)?.kind === "choice").map((value) => value.findingId));
const choiceValues = computed(() => model.value.filter((value) => catalogItem(value)?.kind === "choice"));
const indicatorValues = computed(() => model.value.filter((value) => catalogItem(value)?.kind !== "choice"));
const selectedChoicesWithChildren = computed(() => choiceValues.value.filter((value) => {
  const item = catalogItem(value);
  return item?.children.length;
}));
const options = computed(() => {
  const selected = new Set(model.value.map((item) => item.findingId));
  return indicatorCatalog.value.filter((item) => !selected.has(item.id)).map((item) => ({ id: item.id, label: item.name }));
});
const pendingFinding = computed(() => indicatorCatalog.value.find((item) => item.id === pendingIds.value[0]
  && !model.value.some((value) => value.findingId === item.id)));
const removeTargetIsChoice = computed(() => removeTarget.value ? catalogItem(removeTarget.value)?.kind === "choice" : false);

function selectPending(ids: string[]) { pendingIds.value = ids.slice(0, 1); }
function catalogItem(value: InstrumentalFindingValue) { return props.catalog.find((item) => item.id === value.findingId); }
function addCatalogItem(item: InstrumentalFindingCatalogItem) {
  const value: InstrumentalFindingValue = {
    findingId: item.id,
    findingName: item.name,
    ...((item.kind === "short-text" || item.kind === "long-text") ? { value: "" } : {}),
    children: [],
  };
  const order = new Map(props.catalog.map((candidate, index) => [candidate.id, index]));
  model.value = [...model.value, value].sort((left, right) =>
    (order.get(left.findingId) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.findingId) ?? Number.MAX_SAFE_INTEGER));
}
function addFinding() {
  const item = pendingFinding.value;
  if (!item) return;
  addCatalogItem(item);
  pendingIds.value = [];
}
function updateChoiceIds(ids: string[]) {
  const requested = new Set(ids);
  const removed = choiceValues.value.find((value) => !requested.has(value.findingId));
  if (removed) {
    removeTarget.value = removed;
    return;
  }
  for (const item of choiceCatalog.value) {
    if (requested.has(item.id) && !choiceIds.value.includes(item.id)) addCatalogItem(item);
  }
}
function meaningful(value: InstrumentalFindingValue): boolean {
  const item = catalogItem(value);
  return item?.kind === "choice" || Boolean(value.value?.trim()) || value.children.some(meaningfulChild);
}
function meaningfulChild(value: InstrumentalFindingValue): boolean {
  const item = catalogItemDeep(value.findingId, props.catalog);
  return item?.kind === "choice" || Boolean(value.value?.trim()) || value.children.some(meaningfulChild);
}
function catalogItemDeep(id: string, items: readonly InstrumentalFindingCatalogItem[]): InstrumentalFindingCatalogItem | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    const child = catalogItemDeep(id, item.children);
    if (child) return child;
  }
  return undefined;
}
function removeNow(id: string) { model.value = model.value.filter((item) => item.findingId !== id); }
function requestRemove(value: InstrumentalFindingValue) {
  if (meaningful(value)) removeTarget.value = value;
  else removeNow(value.findingId);
}
function confirmRemove() {
  const target = removeTarget.value;
  removeTarget.value = null;
  if (target) removeNow(target.findingId);
}
function updateChildren(value: InstrumentalFindingValue, children: readonly InstrumentalFindingValue[]) {
  value.children = children;
}
</script>

<template>
  <div class="instrumental-finding-level medical-card-action-subgrid">
    <div v-if="choiceCatalog.length" class="instrumental-finding-values" :style="{ '--instrumental-depth': depth }">
      <span class="field-label">Возможные значения: {{ parentName }}</span>
      <AppCatalogCombobox
        :selected-ids="choiceIds"
        :label="`Возможные значения показателя «${parentName}»`"
        :options="choiceOptions"
        custom-text=""
        multiple
        :allow-custom="false"
        placeholder="Выберите одно или несколько значений"
        @update:selected-ids="updateChoiceIds"
      />
      <div v-if="choiceValues.length" class="instrumental-selected-values" aria-label="Выбранные значения">
        <span v-for="value in choiceValues" :key="value.findingId">{{ value.findingName }}</span>
      </div>
    </div>

    <InstrumentalFindingEditor
      v-for="choiceValue in selectedChoicesWithChildren"
      :key="choiceValue.findingId"
      :model-value="choiceValue.children"
      :catalog="catalogItem(choiceValue)?.children ?? []"
      :errors="errors"
      :depth="depth + 1"
      :parent-name="choiceValue.findingName"
      @update:model-value="updateChildren(choiceValue, $event)"
    />

    <div v-if="indicatorCatalog.length" class="instrumental-finding-create medical-card-action-subgrid">
      <div class="instrumental-finding-content" :style="{ '--instrumental-depth': depth }">
        <span class="field-label">{{ depth ? `Добавить для «${parentName}»` : 'Раздел исследования' }}</span>
        <AppCatalogCombobox
          :selected-ids="pendingIds"
          :label="depth ? `Добавить показатель для «${parentName}»` : 'Добавить раздел исследования'"
          :options="options"
          custom-text=""
          :allow-custom="false"
          placeholder="Выберите показатель"
          disabled-title="Все показатели добавлены"
          @update:selected-ids="selectPending"
        />
      </div>
      <button type="button" class="outline-action inline medical-card-action instrumental-finding-add" :disabled="!pendingFinding" title="Добавить показатель" aria-label="Добавить показатель" @click="addFinding"><AppIcon name="plus" /></button>
    </div>

    <div v-for="finding in indicatorValues" :key="finding.findingId" class="instrumental-finding-row medical-card-action-subgrid">
      <div class="instrumental-finding-content" :style="{ '--instrumental-depth': depth }">
        <template v-if="catalogItem(finding)?.kind === 'short-text'">
          <label><span>{{ finding.findingName }}</span><input v-model="finding.value" :aria-invalid="errors[finding.findingId] ? true : undefined" /></label>
        </template>
        <template v-else-if="catalogItem(finding)?.kind === 'long-text'">
          <label><span>{{ finding.findingName }}</span><textarea v-model="finding.value" rows="2" class="medical-card-comment" :aria-invalid="errors[finding.findingId] ? true : undefined" /></label>
        </template>
        <strong v-else class="instrumental-finding-name">{{ finding.findingName }}</strong>
        <small v-if="errors[finding.findingId]" class="field-error" role="alert">{{ errors[finding.findingId] }}</small>
      </div>
      <button type="button" class="outline-action inline danger-outline medical-card-action instrumental-finding-delete" title="Удалить показатель" :aria-label="`Удалить показатель «${finding.findingName}»`" @click="requestRemove(finding)"><AppIcon name="trash" /></button>
      <InstrumentalFindingEditor
        v-if="catalogItem(finding)?.children.length"
        :model-value="finding.children"
        :catalog="catalogItem(finding)?.children ?? []"
        :errors="errors"
        :depth="depth + 1"
        :parent-name="finding.findingName"
        @update:model-value="updateChildren(finding, $event)"
      />
    </div>
    <ConfirmationDialog
      v-model="confirmOpen"
      :title="removeTargetIsChoice ? 'Удалить выбранное значение?' : 'Удалить заполненный показатель?'"
      :description="removeTargetIsChoice
        ? `Значение «${removeTarget?.findingName ?? ''}» и все вложенные данные будут удалены.`
        : `Показатель «${removeTarget?.findingName ?? ''}» и все вложенные данные будут удалены.`"
      confirm-label="Удалить"
      @confirm="confirmRemove"
    />
  </div>
</template>
