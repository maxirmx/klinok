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
const pendingConfirmation = ref<{
  title: string;
  description: string;
  confirmLabel: string;
  action: () => void;
} | null>(null);
const confirmOpen = computed({
  get: () => Boolean(pendingConfirmation.value),
  set: (value) => {
    if (!value) pendingConfirmation.value = null;
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
const hasResultRows = computed(() => props.depth > 0
  && (choiceCatalog.value.length > 0 || indicatorValues.value.some(isResultFinding)));

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
function orderedFor(
  catalog: readonly InstrumentalFindingCatalogItem[],
  values: readonly InstrumentalFindingValue[],
): InstrumentalFindingValue[] {
  const order = new Map(catalog.map((candidate, index) => [candidate.id, index]));
  return [...values].sort((left, right) =>
    (order.get(left.findingId) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.findingId) ?? Number.MAX_SAFE_INTEGER));
}
function ordered(values: readonly InstrumentalFindingValue[]) { return orderedFor(props.catalog, values); }
function addCatalogItem(item: InstrumentalFindingCatalogItem) { model.value = ordered([...model.value, catalogValue(item)]); }
function addFinding() {
  const item = pendingFinding.value;
  if (!item) return;
  addCatalogItem(item);
  pendingIds.value = [];
}
function requestChoiceChange(
  event: Event,
  catalog: readonly InstrumentalFindingCatalogItem[],
  values: readonly InstrumentalFindingValue[],
  update: (next: readonly InstrumentalFindingValue[]) => void,
) {
  const select = event.currentTarget as HTMLSelectElement;
  const requestedId = select.value;
  const choices = catalog.filter((item) => item.kind === "choice");
  const current = values.find((value) => choices.some((item) => item.id === value.findingId));
  if (!current) {
    const item = choices.find((candidate) => candidate.id === requestedId);
    if (item) update(orderedFor(catalog, [...values, catalogValue(item)]));
    return;
  }
  if (requestedId === current.findingId) return;
  select.value = current.findingId;
  const replacement = choices.find((item) => item.id === requestedId);
  pendingConfirmation.value = {
    title: replacement ? "Заменить выбранное значение?" : "Удалить выбранное значение?",
    description: replacement
      ? `Значение «${current.findingName}» и все вложенные данные будут заменены.`
      : `Значение «${current.findingName}» и все вложенные данные будут удалены.`,
    confirmLabel: replacement ? "Заменить" : "Удалить",
    action: () => update(orderedFor(catalog, [
      ...values.filter((value) => value.findingId !== current.findingId),
      ...(replacement ? [catalogValue(replacement)] : []),
    ])),
  };
}
function requestChoiceSelection(event: Event) {
  requestChoiceChange(event, props.catalog, model.value, (next) => { model.value = next; });
}
function requestFindingChoiceSelection(
  finding: InstrumentalFindingValue,
  item: InstrumentalFindingCatalogItem | undefined,
  event: Event,
) {
  if (!item) return;
  requestChoiceChange(event, item.children, finding.children, (next) => { finding.children = next; });
}
function directChoiceCatalog(item?: InstrumentalFindingCatalogItem) {
  return item?.children.filter((child) => child.kind === "choice") ?? [];
}
function directIndicatorCatalog(item?: InstrumentalFindingCatalogItem) {
  return item?.children.filter((child) => child.kind !== "choice") ?? [];
}
function directIndicatorValues(finding: InstrumentalFindingValue, item?: InstrumentalFindingCatalogItem) {
  const ids = new Set(directIndicatorCatalog(item).map((child) => child.id));
  return finding.children.filter((child) => ids.has(child.findingId));
}
function selectedChoiceId(finding: InstrumentalFindingValue, item?: InstrumentalFindingCatalogItem) {
  const ids = new Set(directChoiceCatalog(item).map((child) => child.id));
  return finding.children.find((child) => ids.has(child.findingId))?.findingId ?? "";
}
function selectedFindingChoicesWithChildren(finding: InstrumentalFindingValue, item?: InstrumentalFindingCatalogItem) {
  return finding.children.filter((child) => {
    const choiceItem = directChoiceCatalog(item).find((candidate) => candidate.id === child.findingId);
    return choiceItem?.children.length;
  });
}
function choiceChildrenCatalog(value: InstrumentalFindingValue, item?: InstrumentalFindingCatalogItem) {
  return directChoiceCatalog(item).find((choiceItem) => choiceItem.id === value.findingId)?.children ?? [];
}
function updateDirectIndicators(
  finding: InstrumentalFindingValue,
  item: InstrumentalFindingCatalogItem,
  values: readonly InstrumentalFindingValue[],
) {
  const choiceIds = new Set(directChoiceCatalog(item).map((child) => child.id));
  finding.children = orderedFor(item.children, [
    ...finding.children.filter((child) => choiceIds.has(child.findingId)),
    ...values,
  ]);
}
function isResultFinding(finding: InstrumentalFindingValue) {
  const item = catalogItem(finding);
  return item?.kind === "short-text" || item?.kind === "long-text"
    || (props.depth > 0 && directChoiceCatalog(item).length > 0);
}
function isRootFreeText(finding: InstrumentalFindingValue) {
  return props.depth === 0 && catalogItem(finding)?.kind === "long-text";
}
function nestedCatalog(finding: InstrumentalFindingValue) {
  const item = catalogItem(finding);
  return isResultFinding(finding) ? directIndicatorCatalog(item) : item?.children ?? [];
}
function nestedValues(finding: InstrumentalFindingValue) {
  const item = catalogItem(finding);
  return isResultFinding(finding) ? directIndicatorValues(finding, item) : finding.children;
}
function updateNestedValues(finding: InstrumentalFindingValue, values: readonly InstrumentalFindingValue[]) {
  const item = catalogItem(finding);
  if (!item) return;
  if (isResultFinding(finding)) updateDirectIndicators(finding, item, values);
  else finding.children = values;
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
    pendingConfirmation.value = {
      title: "Удалить заполненный показатель?",
      description: `Показатель «${value.findingName}» и все вложенные данные будут удалены.`,
      confirmLabel: "Удалить",
      action: () => removeNow(value.findingId),
    };
  }
  else removeNow(value.findingId);
}
function confirmPending() {
  const action = pendingConfirmation.value?.action;
  pendingConfirmation.value = null;
  action?.();
}
function updateChildren(value: InstrumentalFindingValue, children: readonly InstrumentalFindingValue[]) {
  value.children = children;
}
</script>

<template>
  <div class="instrumental-finding-level medical-card-action-subgrid">
    <div v-if="indicatorCatalog.length" class="instrumental-finding-create medical-card-action-subgrid" :style="{ '--instrumental-depth': depth }">
      <span class="field-label instrumental-finding-create-label">{{ depth ? 'Показатель' : 'Раздел исследования' }}</span>
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

    <div v-if="hasResultRows" class="instrumental-result-headings medical-card-action-subgrid" aria-hidden="true">
      <div class="instrumental-result-heading-content" :style="{ '--instrumental-depth': depth }">
        <span>Показатель</span><span>Результат</span>
      </div>
    </div>

    <div v-if="choiceCatalog.length" class="instrumental-finding-row instrumental-result-row medical-card-action-subgrid">
      <div class="instrumental-finding-content instrumental-result-content" :style="{ '--instrumental-depth': depth }">
        <span class="instrumental-result-desktop-name">{{ parentName }}</span>
        <label class="instrumental-result-control">
          <span class="instrumental-result-mobile-name">{{ parentName }}</span>
          <select :value="choiceId" :aria-label="`Значение показателя «${parentName}»`" @change="requestChoiceSelection">
            <option value="">Не указано</option>
            <option v-for="item in choiceCatalog" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </label>
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

    <div
      v-for="finding in indicatorValues"
      :key="finding.findingId"
      class="instrumental-finding-row medical-card-action-subgrid"
      :class="{ 'instrumental-result-row': isResultFinding(finding) && !isRootFreeText(finding) }"
    >
      <div
        class="instrumental-finding-content"
        :class="{
          'instrumental-result-content': isResultFinding(finding),
          'instrumental-root-free-text': isRootFreeText(finding),
        }"
        :style="{ '--instrumental-depth': depth }"
      >
        <template v-if="catalogItem(finding)?.kind === 'short-text'">
          <span class="instrumental-result-desktop-name">{{ finding.findingName }}</span>
          <label class="instrumental-result-control">
            <span class="instrumental-result-mobile-name">{{ finding.findingName }}</span>
            <input v-model="finding.value" :aria-label="finding.findingName" :aria-invalid="errors[finding.findingId] ? true : undefined" />
            <small v-if="errors[finding.findingId]" class="field-error" role="alert">{{ errors[finding.findingId] }}</small>
          </label>
        </template>
        <template v-else-if="catalogItem(finding)?.kind === 'long-text'">
          <strong v-if="isRootFreeText(finding)" class="instrumental-finding-name">{{ finding.findingName }}</strong>
          <span v-else class="instrumental-result-desktop-name">{{ finding.findingName }}</span>
          <label class="instrumental-result-control">
            <span v-if="isRootFreeText(finding)">Результат</span>
            <span v-else class="instrumental-result-mobile-name">{{ finding.findingName }}</span>
            <textarea v-model="finding.value" :rows="isRootFreeText(finding) ? 4 : 2" :class="{ 'medical-card-comment': !isRootFreeText(finding) }" :aria-label="finding.findingName" :aria-invalid="errors[finding.findingId] ? true : undefined" />
            <small v-if="errors[finding.findingId]" class="field-error" role="alert">{{ errors[finding.findingId] }}</small>
          </label>
        </template>
        <template v-else-if="isResultFinding(finding)">
          <span class="instrumental-result-desktop-name">{{ finding.findingName }}</span>
          <label class="instrumental-result-control">
            <span class="instrumental-result-mobile-name">{{ finding.findingName }}</span>
            <select
              :value="selectedChoiceId(finding, catalogItem(finding))"
              :aria-label="`Значение показателя «${finding.findingName}»`"
              :aria-invalid="errors[finding.findingId] ? true : undefined"
              @change="requestFindingChoiceSelection(finding, catalogItem(finding), $event)"
            >
              <option value="">Не указано</option>
              <option v-for="item in directChoiceCatalog(catalogItem(finding))" :key="item.id" :value="item.id">{{ item.name }}</option>
            </select>
            <small v-if="errors[finding.findingId]" class="field-error" role="alert">{{ errors[finding.findingId] }}</small>
          </label>
        </template>
        <strong v-else class="instrumental-finding-name">{{ finding.findingName }}</strong>
        <small v-if="!isResultFinding(finding) && errors[finding.findingId]" class="field-error" role="alert">{{ errors[finding.findingId] }}</small>
      </div>
      <button type="button" class="outline-action inline danger-outline medical-card-action instrumental-finding-delete" title="Удалить показатель" :aria-label="`Удалить показатель «${finding.findingName}»`" @click="requestRemove(finding)"><AppIcon name="trash" /></button>
      <InstrumentalFindingEditor
        v-if="nestedCatalog(finding).length"
        :model-value="nestedValues(finding)"
        :catalog="nestedCatalog(finding)"
        :errors="errors"
        :depth="depth + 1"
        :parent-name="finding.findingName"
        @update:model-value="updateNestedValues(finding, $event)"
      />
      <InstrumentalFindingEditor
        v-for="choiceValue in isResultFinding(finding) ? selectedFindingChoicesWithChildren(finding, catalogItem(finding)) : []"
        :key="choiceValue.findingId"
        :model-value="choiceValue.children"
        :catalog="choiceChildrenCatalog(choiceValue, catalogItem(finding))"
        :errors="errors"
        :depth="depth + 1"
        :parent-name="choiceValue.findingName"
        @update:model-value="updateChildren(choiceValue, $event)"
      />
    </div>
    <ConfirmationDialog
      v-model="confirmOpen"
      :title="pendingConfirmation?.title ?? 'Удалить заполненный показатель?'"
      :description="pendingConfirmation?.description ?? 'После подтверждения заполненные данные будут удалены.'"
      :confirm-label="pendingConfirmation?.confirmLabel ?? 'Удалить'"
      @confirm="confirmPending"
    />
  </div>
</template>
