<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, nextTick, ref, useId } from "vue";
import type {
  InstrumentalFindingCatalogItem,
  InstrumentalFindingValue,
  InstrumentalSelectionSet,
} from "@klinok/contracts";
import AppCatalogCombobox from "./AppCatalogCombobox.vue";
import AppIcon from "./AppIcon.vue";
import AppSelect from "./AppSelect.vue";
import ConfirmationDialog from "./ConfirmationDialog.vue";

const props = withDefaults(defineProps<{
  catalog: readonly InstrumentalFindingCatalogItem[];
  errors?: Record<string, string>;
  depth?: number;
  parentName?: string;
  choiceContinuation?: boolean;
}>(), {
  errors: () => ({}),
  depth: 0,
  parentName: "исследование",
  choiceContinuation: false,
});
const model = defineModel<readonly InstrumentalFindingValue[]>({ required: true });
const pendingIds = ref<string[]>([]);
const levelElement = ref<HTMLElement | null>(null);
const errorBaseId = useId();
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
const choiceOptions = computed(() => selectOptions(choiceCatalog.value));
const multipleChoiceCatalog = computed(() => props.catalog.filter((item) => item.selectionMode === "multiple"));
const indicatorCatalog = computed(() => props.catalog.filter((item) => item.kind !== "choice" && item.selectionMode !== "multiple"));
const choiceValues = computed(() => model.value.filter((value) => catalogItem(value)?.kind === "choice"));
const choiceId = computed(() => choiceValues.value[0]?.findingId ?? "");
const indicatorValues = computed(() => model.value.filter((value) => {
  const item = catalogItem(value);
  return item?.kind !== "choice" && item?.selectionMode !== "multiple";
}));
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
const hasResultRows = computed(() => !props.choiceContinuation && props.depth > 0
  && (choiceCatalog.value.length > 0 || multipleChoiceCatalog.value.length > 0 || indicatorValues.value.some(isResultFinding)));
const hasRenderedValues = computed(() => choiceCatalog.value.length > 0
  || multipleChoiceCatalog.value.length > 0 || model.value.length > 0);
const choiceRowDepth = computed(() => Math.max(0, props.depth - (props.choiceContinuation ? 1 : 0)));

function selectPending(ids: string[]) { pendingIds.value = ids.slice(0, 1); }
function catalogItem(value: InstrumentalFindingValue) { return props.catalog.find((item) => item.id === value.findingId); }
function catalogValue(item: InstrumentalFindingCatalogItem): InstrumentalFindingValue {
  return {
    findingId: item.id,
    findingName: item.name,
    ...((item.kind === "integer" || item.kind === "short-text" || item.kind === "long-text") ? { value: "" } : {}),
    ...(item.unit ? { unit: item.unit } : {}),
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
  void nextTick(() => {
    const row = Array.from(levelElement.value?.children ?? []).find((element) =>
      element instanceof HTMLElement && element.dataset.findingId === item.id) as HTMLElement | undefined;
    const field = row?.querySelector<HTMLElement>(
      'input:not([type="hidden"]), select, textarea, button:not(.instrumental-finding-delete)',
    );
    (field ?? row)?.focus();
  });
}
function requestChoiceChange(
  requestedId: string,
  catalog: readonly InstrumentalFindingCatalogItem[],
  values: readonly InstrumentalFindingValue[],
  update: (next: readonly InstrumentalFindingValue[]) => void,
) {
  const choices = catalog.filter((item) => item.kind === "choice");
  const current = values.find((value) => choices.some((item) => item.id === value.findingId));
  if (!current) {
    const item = choices.find((candidate) => candidate.id === requestedId);
    if (item) update(orderedFor(catalog, [...values, catalogValue(item)]));
    return;
  }
  if (requestedId === current.findingId) return;
  const replacement = choices.find((item) => item.id === requestedId);
  if (replacement) {
    update(orderedFor(catalog, [
      ...values.filter((value) => value.findingId !== current.findingId),
      catalogValue(replacement),
    ]));
    return;
  }
  update(orderedFor(catalog, [
    ...values.filter((value) => value.findingId !== current.findingId),
  ]));
}
function requestChoiceSelection(requestedId: string) {
  requestChoiceChange(requestedId, props.catalog, model.value, (next) => { model.value = next; });
}
function requestFindingChoiceSelection(
  finding: InstrumentalFindingValue,
  item: InstrumentalFindingCatalogItem | undefined,
  requestedId: string,
) {
  if (!item) return;
  requestChoiceChange(requestedId, item.children, finding.children, (next) => { finding.children = next; });
}
function selectionSetCatalog(item: InstrumentalFindingCatalogItem | undefined, set: InstrumentalSelectionSet) {
  if (!item) return [];
  const ids = new Set(set.choiceIds);
  return directChoiceCatalog(item).filter((choiceItem) => ids.has(choiceItem.id));
}
function selectedSelectionSetChoice(
  finding: InstrumentalFindingValue,
  item: InstrumentalFindingCatalogItem | undefined,
  set: InstrumentalSelectionSet,
) {
  if (!item) return "";
  const ids = new Set(set.choiceIds);
  return finding.children.find((child) => ids.has(child.findingId))?.findingId ?? "";
}
function requestSelectionSetChoice(
  finding: InstrumentalFindingValue,
  item: InstrumentalFindingCatalogItem | undefined,
  set: InstrumentalSelectionSet,
  requestedId: string,
) {
  if (!item) return;
  requestChoiceChange(requestedId, selectionSetCatalog(item, set), finding.children, (next) => {
    finding.children = orderedFor(item.children, next);
  });
}
function selectionSetErrorKey(item: InstrumentalFindingCatalogItem | undefined, set: InstrumentalSelectionSet) {
  return item ? `${item.id}:${set.key}` : set.key;
}
function selectionSetError(item: InstrumentalFindingCatalogItem | undefined, set: InstrumentalSelectionSet) {
  if (!item) return undefined;
  return props.errors[selectionSetErrorKey(item, set)];
}
function errorId(...parts: string[]) {
  return `${errorBaseId}-${parts.join("-").replace(/[^a-zA-Z0-9_-]/g, "-")}-error`;
}
function naturallyWideSelectionSet(item: InstrumentalFindingCatalogItem | undefined, set: InstrumentalSelectionSet) {
  return [set.name, ...selectionSetCatalog(item, set).map((choiceItem) => choiceItem.name)]
    .some((label) => label.length > 40);
}
function wideSelectionSet(item: InstrumentalFindingCatalogItem | undefined, index: number) {
  if (!item) return false;
  const sets = item.selectionSets ?? [];
  const set = sets[index];
  if (!set) return false;
  if (naturallyWideSelectionSet(item, set)) return true;
  const pairStart = index - (index % 2);
  const second = sets[pairStart + 1];
  return index === pairStart && (!second || naturallyWideSelectionSet(item, second));
}
function directChoiceCatalog(item?: InstrumentalFindingCatalogItem) {
  return item?.children.filter((child) => child.kind === "choice") ?? [];
}
function directIndicatorCatalog(item?: InstrumentalFindingCatalogItem) {
  return item?.children.filter((child) => child.kind !== "choice") ?? [];
}
function selectOptions(items: readonly InstrumentalFindingCatalogItem[]) {
  return [
    { value: "", label: "Не указано" },
    ...items.map((item) => ({ value: item.id, label: item.name })),
  ];
}
function directChoiceOptions(item?: InstrumentalFindingCatalogItem) {
  return selectOptions(directChoiceCatalog(item));
}
function multipleFinding(item: InstrumentalFindingCatalogItem) {
  return model.value.find((value) => value.findingId === item.id);
}
function multipleChoiceSelected(item: InstrumentalFindingCatalogItem, choiceItem: InstrumentalFindingCatalogItem) {
  return multipleFinding(item)?.children.some((child) => child.findingId === choiceItem.id) ?? false;
}
function toggleMultipleChoice(item: InstrumentalFindingCatalogItem, choiceItem: InstrumentalFindingCatalogItem) {
  const finding = multipleFinding(item);
  if (!finding) {
    model.value = ordered([...model.value, { ...catalogValue(item), children: [catalogValue(choiceItem)] }]);
    return;
  }
  const selected = finding.children.some((child) => child.findingId === choiceItem.id);
  const children = selected
    ? finding.children.filter((child) => child.findingId !== choiceItem.id)
    : orderedFor(item.children, [...finding.children, catalogValue(choiceItem)]);
  if (!children.length) model.value = model.value.filter((value) => value.findingId !== item.id);
  else finding.children = children;
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
function isChoiceContinuation(catalog: readonly InstrumentalFindingCatalogItem[]) {
  return catalog.some((item) => item.kind === "choice");
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
  return item?.kind === "integer" || item?.kind === "short-text" || item?.kind === "long-text"
    || directChoiceCatalog(item).length > 0;
}
function hasSelectionSets(item?: InstrumentalFindingCatalogItem): item is InstrumentalFindingCatalogItem {
  return Boolean(item?.selectionSets?.length);
}
function isRootChoiceFinding(finding: InstrumentalFindingValue) {
  return props.depth === 0 && directChoiceCatalog(catalogItem(finding)).length > 0;
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
  if (props.depth === 0 && meaningful(value)) {
    pendingConfirmation.value = {
      title: "Удалить заполненный раздел?",
      description: `Раздел «${value.findingName}» и все вложенные данные будут удалены.`,
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
function updateIntegerValue(finding: InstrumentalFindingValue, event: Event) {
  finding.value = (event.currentTarget as HTMLInputElement).value;
}
</script>

<template>
  <div ref="levelElement" class="instrumental-finding-level medical-card-action-subgrid">
    <div v-if="hasResultRows" class="instrumental-result-headings medical-card-action-subgrid" aria-hidden="true">
      <div class="instrumental-result-heading-content" :style="{ '--instrumental-depth': depth }" :data-hierarchy-depth="depth">
        <span>Показатель</span><span>Результат</span>
      </div>
    </div>

    <div
      v-if="choiceCatalog.length"
      class="instrumental-finding-row instrumental-result-row medical-card-action-subgrid"
      :class="{ 'instrumental-choice-continuation-row': choiceContinuation }"
    >
      <div
        class="instrumental-finding-content instrumental-result-content"
        :class="{ 'instrumental-choice-continuation-content': choiceContinuation }"
        :style="{ '--instrumental-depth': choiceRowDepth }"
        :data-hierarchy-depth="choiceRowDepth"
      >
        <span v-if="!choiceContinuation" class="instrumental-result-desktop-name">{{ parentName }}</span>
        <label class="instrumental-result-control">
          <span v-if="!choiceContinuation" class="instrumental-result-mobile-name">{{ parentName }}</span>
          <AppSelect
            :model-value="choiceId"
            :options="choiceOptions"
            :aria-label="`Значение показателя «${parentName}»`"
            @update:model-value="requestChoiceSelection"
          />
        </label>
      </div>
    </div>

    <div
      v-for="multipleItem in multipleChoiceCatalog"
      :key="multipleItem.id"
      class="instrumental-finding-row instrumental-result-row medical-card-action-subgrid instrumental-multiple-choice-row"
    >
      <div
        class="instrumental-finding-content instrumental-result-content"
        :style="{ '--instrumental-depth': depth }"
        :data-hierarchy-depth="depth"
      >
        <span class="instrumental-result-desktop-name">{{ multipleItem.name }}</span>
        <fieldset class="medical-card-option-panel instrumental-multiple-choice-panel">
          <legend class="visually-hidden">{{ multipleItem.name }}</legend>
          <span class="instrumental-result-mobile-name" aria-hidden="true">{{ multipleItem.name }}</span>
          <div class="medical-card-options">
            <label v-for="choiceItem in directChoiceCatalog(multipleItem)" :key="choiceItem.id" class="check-row">
              <input
                type="checkbox"
                :checked="multipleChoiceSelected(multipleItem, choiceItem)"
                @change="toggleMultipleChoice(multipleItem, choiceItem)"
              />
              <span>{{ choiceItem.name }}</span>
            </label>
          </div>
        </fieldset>
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
      :choice-continuation="isChoiceContinuation(catalogItem(choiceValue)?.children ?? [])"
      @update:model-value="updateChildren(choiceValue, $event)"
    />

    <div
      v-for="finding in indicatorValues"
      :key="finding.findingId"
      class="instrumental-finding-row medical-card-action-subgrid"
      :data-finding-id="finding.findingId"
      tabindex="-1"
      :aria-invalid="!isResultFinding(finding) && errors[finding.findingId] ? true : undefined"
      :aria-describedby="!isResultFinding(finding) && errors[finding.findingId] ? errorId(finding.findingId) : undefined"
      :class="{
        'instrumental-result-row': isResultFinding(finding) && !isRootFreeText(finding),
        'instrumental-root-choice-row': isRootChoiceFinding(finding),
      }"
    >
      <div
        class="instrumental-finding-content"
        :class="{
          'instrumental-result-content': isResultFinding(finding),
          'instrumental-root-free-text': isRootFreeText(finding),
        }"
        :style="{ '--instrumental-depth': depth }"
        :data-hierarchy-depth="depth"
      >
        <template v-if="catalogItem(finding)?.kind === 'integer'">
          <span class="instrumental-result-desktop-name">{{ finding.findingName }}</span>
          <label class="instrumental-result-control">
            <span class="instrumental-result-mobile-name">{{ finding.findingName }}</span>
            <span class="instrumental-integer-field">
              <input
                :value="finding.value"
                type="number"
                min="0"
                step="1"
                inputmode="numeric"
                :aria-label="`${finding.findingName}, ${finding.unit}`"
                :aria-invalid="errors[finding.findingId] ? true : undefined"
                :aria-describedby="errors[finding.findingId] ? errorId(finding.findingId) : undefined"
                @input="updateIntegerValue(finding, $event)"
              />
              <span class="instrumental-integer-unit" aria-hidden="true">{{ finding.unit }}</span>
            </span>
            <small v-if="errors[finding.findingId]" :id="errorId(finding.findingId)" class="field-error" role="alert">{{ errors[finding.findingId] }}</small>
          </label>
        </template>
        <template v-else-if="catalogItem(finding)?.kind === 'short-text'">
          <span class="instrumental-result-desktop-name">{{ finding.findingName }}</span>
          <label class="instrumental-result-control">
            <span class="instrumental-result-mobile-name">{{ finding.findingName }}</span>
            <input v-model="finding.value" :aria-label="finding.findingName" :aria-invalid="errors[finding.findingId] ? true : undefined" :aria-describedby="errors[finding.findingId] ? errorId(finding.findingId) : undefined" />
            <small v-if="errors[finding.findingId]" :id="errorId(finding.findingId)" class="field-error" role="alert">{{ errors[finding.findingId] }}</small>
          </label>
        </template>
        <template v-else-if="catalogItem(finding)?.kind === 'long-text'">
          <strong v-if="isRootFreeText(finding)" class="instrumental-finding-name">{{ finding.findingName }}</strong>
          <span v-else class="instrumental-result-desktop-name">{{ finding.findingName }}</span>
          <label class="instrumental-result-control">
            <span v-if="!isRootFreeText(finding)" class="instrumental-result-mobile-name">{{ finding.findingName }}</span>
            <textarea v-model="finding.value" :rows="isRootFreeText(finding) ? 4 : 2" :class="{ 'medical-card-comment': !isRootFreeText(finding) }" :aria-label="finding.findingName" :aria-invalid="errors[finding.findingId] ? true : undefined" :aria-describedby="errors[finding.findingId] ? errorId(finding.findingId) : undefined" />
            <small v-if="errors[finding.findingId]" :id="errorId(finding.findingId)" class="field-error" role="alert">{{ errors[finding.findingId] }}</small>
          </label>
        </template>
        <template v-else-if="hasSelectionSets(catalogItem(finding))">
          <strong v-if="isRootChoiceFinding(finding)" class="instrumental-finding-name">{{ finding.findingName }}</strong>
          <span v-else class="instrumental-result-desktop-name">{{ finding.findingName }}</span>
          <div class="instrumental-result-control">
            <span v-if="!isRootChoiceFinding(finding)" class="instrumental-result-mobile-name">{{ finding.findingName }}</span>
            <div class="instrumental-selection-set-grid">
              <label
                v-for="(set, setIndex) in catalogItem(finding)?.selectionSets ?? []"
                :key="set.key"
                class="instrumental-selection-set-field"
                :class="{ 'instrumental-selection-set-field-wide': wideSelectionSet(catalogItem(finding), setIndex) }"
              >
                <span>{{ set.name }}</span>
                <AppSelect
                  :model-value="selectedSelectionSetChoice(finding, catalogItem(finding), set)"
                  :options="selectOptions(selectionSetCatalog(catalogItem(finding), set))"
                  :aria-label="set.name"
                  :invalid="Boolean(selectionSetError(catalogItem(finding), set))"
                  :aria-describedby="selectionSetError(catalogItem(finding), set) ? errorId(selectionSetErrorKey(catalogItem(finding), set)) : undefined"
                  @update:model-value="requestSelectionSetChoice(finding, catalogItem(finding), set, $event)"
                />
                <small v-if="selectionSetError(catalogItem(finding), set)" :id="errorId(selectionSetErrorKey(catalogItem(finding), set))" class="field-error" role="alert">{{ selectionSetError(catalogItem(finding), set) }}</small>
              </label>
            </div>
          </div>
        </template>
        <template v-else-if="isResultFinding(finding)">
          <strong v-if="isRootChoiceFinding(finding)" class="instrumental-finding-name">{{ finding.findingName }}</strong>
          <span v-else class="instrumental-result-desktop-name">{{ finding.findingName }}</span>
          <label class="instrumental-result-control">
            <span v-if="!isRootChoiceFinding(finding)" class="instrumental-result-mobile-name">{{ finding.findingName }}</span>
            <AppSelect
              :model-value="selectedChoiceId(finding, catalogItem(finding))"
              :options="directChoiceOptions(catalogItem(finding))"
              :aria-label="`Значение показателя «${finding.findingName}»`"
              :invalid="Boolean(errors[finding.findingId])"
              :aria-describedby="errors[finding.findingId] ? errorId(finding.findingId) : undefined"
              @update:model-value="requestFindingChoiceSelection(finding, catalogItem(finding), $event)"
            />
            <small v-if="errors[finding.findingId]" :id="errorId(finding.findingId)" class="field-error" role="alert">{{ errors[finding.findingId] }}</small>
          </label>
        </template>
        <strong v-else class="instrumental-finding-name">{{ finding.findingName }}</strong>
        <small v-if="!isResultFinding(finding) && errors[finding.findingId]" :id="errorId(finding.findingId)" class="field-error" role="alert">{{ errors[finding.findingId] }}</small>
      </div>
      <button
        type="button"
        class="outline-action inline danger-outline medical-card-action instrumental-finding-delete"
        :title="depth ? 'Удалить показатель' : 'Удалить раздел'"
        :aria-label="depth ? `Удалить показатель «${finding.findingName}»` : `Удалить раздел «${finding.findingName}»`"
        @click="requestRemove(finding)"
      ><AppIcon name="trash" /></button>
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
        :choice-continuation="isChoiceContinuation(choiceChildrenCatalog(choiceValue, catalogItem(finding)))"
        @update:model-value="updateChildren(choiceValue, $event)"
      />
    </div>
    <div
      v-if="options.length"
      class="instrumental-finding-create medical-card-action-subgrid"
      :class="{ 'instrumental-finding-create-after-values': hasRenderedValues }"
      :style="{ '--instrumental-depth': depth }"
      :data-hierarchy-depth="depth"
    >
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
    <ConfirmationDialog
      v-model="confirmOpen"
      :title="pendingConfirmation?.title ?? 'Удалить заполненный раздел?'"
      :description="pendingConfirmation?.description ?? 'После подтверждения заполненные данные будут удалены.'"
      :confirm-label="pendingConfirmation?.confirmLabel ?? 'Удалить'"
      @confirm="confirmPending"
    />
  </div>
</template>
