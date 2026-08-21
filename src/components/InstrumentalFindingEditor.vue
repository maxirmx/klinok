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
const pendingChoiceId = ref<string | null>(null);
const confirmOpen = computed({
  get: () => Boolean(removeTarget.value),
  set: (value) => {
    if (!value) {
      removeTarget.value = null;
      pendingChoiceId.value = null;
    }
  },
});
const choiceCatalog = computed(() => props.catalog.filter((item) => item.kind === "choice"));
const indicatorCatalog = computed(() => props.catalog.filter((item) => item.kind !== "choice"));
const choiceValues = computed(() => model.value.filter((value) => catalogItem(value)?.kind === "choice"));
const choiceId = computed(() => choiceValues.value[0]?.findingId ?? "");
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
const choiceRemovalTitle = computed(() => pendingChoiceId.value
  ? "Заменить выбранное значение?"
  : "Удалить выбранное значение?");

function selectPending(ids: string[]) { pendingIds.value = ids.slice(0, 1); }
function catalogItem(value: InstrumentalFindingValue) { return props.catalog.find((item) => item.id === value.findingId); }
function catalogValue(item: InstrumentalFindingCatalogItem): InstrumentalFindingValue {
  return {
    findingId: item.id,
    findingName: item.name,
    ...((item.kind === "short-text" || item.kind === "long-text") ? { value: "" } : {}),
    children: [],
  };
}
function ordered(values: readonly InstrumentalFindingValue[]): InstrumentalFindingValue[] {
  const order = new Map(props.catalog.map((candidate, index) => [candidate.id, index]));
  return [...values].sort((left, right) =>
    (order.get(left.findingId) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.findingId) ?? Number.MAX_SAFE_INTEGER));
}
function addCatalogItem(item: InstrumentalFindingCatalogItem) { model.value = ordered([...model.value, catalogValue(item)]); }
function addFinding() {
  const item = pendingFinding.value;
  if (!item) return;
  addCatalogItem(item);
  pendingIds.value = [];
}
function requestChoiceSelection(event: Event) {
  const select = event.currentTarget as HTMLSelectElement;
  const requestedId = select.value;
  const current = choiceValues.value[0];
  if (!current) {
    const item = choiceCatalog.value.find((candidate) => candidate.id === requestedId);
    if (item) addCatalogItem(item);
    return;
  }
  if (requestedId === current.findingId) return;
  select.value = current.findingId;
  pendingChoiceId.value = requestedId;
  removeTarget.value = current;
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
  if (meaningful(value)) {
    pendingChoiceId.value = null;
    removeTarget.value = value;
  }
  else removeNow(value.findingId);
}
function confirmRemove() {
  const target = removeTarget.value;
  const replacementId = removeTargetIsChoice.value ? pendingChoiceId.value : null;
  removeTarget.value = null;
  pendingChoiceId.value = null;
  const replacement = replacementId ? choiceCatalog.value.find((item) => item.id === replacementId) : undefined;
  if (target && replacement) {
    model.value = ordered([...model.value.filter((item) => item.findingId !== target.findingId), catalogValue(replacement)]);
  } else if (target) removeNow(target.findingId);
}
function updateChildren(value: InstrumentalFindingValue, children: readonly InstrumentalFindingValue[]) {
  value.children = children;
}
</script>

<template>
  <div class="instrumental-finding-level medical-card-action-subgrid">
    <label v-if="choiceCatalog.length" class="therapeutic-select-field instrumental-value-field" :style="{ '--instrumental-depth': depth }">
      <span>Значение</span>
      <select :value="choiceId" :aria-label="`Значение показателя «${parentName}»`" @change="requestChoiceSelection">
        <option value="">Не указано</option>
        <option v-for="item in choiceCatalog" :key="item.id" :value="item.id">{{ item.name }}</option>
      </select>
    </label>

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

    <div v-if="indicatorCatalog.length" class="instrumental-finding-create medical-card-action-subgrid" :style="{ '--instrumental-depth': depth }">
      <span class="field-label instrumental-finding-create-label">{{ depth ? `Добавить для «${parentName}»` : 'Раздел исследования' }}</span>
      <AppCatalogCombobox
        class="instrumental-finding-picker"
        :selected-ids="pendingIds"
        :label="depth ? `Добавить показатель для «${parentName}»` : 'Добавить раздел исследования'"
        :options="options"
        custom-text=""
        :allow-custom="false"
        :placeholder="depth ? 'Выберите показатель' : 'Выберите раздел'"
        :disabled-title="depth ? 'Все показатели добавлены' : 'Все разделы добавлены'"
        @update:selected-ids="selectPending"
      />
      <button
        type="button"
        class="outline-action inline medical-card-action instrumental-finding-add"
        :disabled="!pendingFinding"
        :title="depth ? 'Добавить показатель' : 'Добавить раздел'"
        :aria-label="depth ? 'Добавить показатель' : 'Добавить раздел'"
        @click="addFinding"
      ><AppIcon name="plus" /></button>
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
      :title="removeTargetIsChoice ? choiceRemovalTitle : 'Удалить заполненный показатель?'"
      :description="removeTargetIsChoice
        ? pendingChoiceId
          ? `Значение «${removeTarget?.findingName ?? ''}» и все вложенные данные будут заменены.`
          : `Значение «${removeTarget?.findingName ?? ''}» и все вложенные данные будут удалены.`
        : `Показатель «${removeTarget?.findingName ?? ''}» и все вложенные данные будут удалены.`"
      :confirm-label="removeTargetIsChoice && pendingChoiceId ? 'Заменить' : 'Удалить'"
      @confirm="confirmRemove"
    />
  </div>
</template>
