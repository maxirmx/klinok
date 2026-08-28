<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import AppIcon from "./AppIcon.vue";

interface CatalogOption {
  readonly id: string;
  readonly label: string;
}

interface CatalogGroup {
  readonly id: string;
  readonly label: string;
  readonly options?: readonly CatalogOption[];
  readonly groups?: readonly CatalogGroup[];
}

interface CatalogCategory {
  readonly id: string;
  readonly label: string;
  readonly parentLabel: string;
  readonly options: readonly CatalogOption[];
}

const props = withDefaults(defineProps<{
  label: string;
  options?: readonly CatalogOption[];
  groups?: readonly CatalogGroup[];
  multiple?: boolean;
  placeholder?: string;
  emptyText?: string;
  showLabel?: boolean;
  showOptionsTitle?: string;
  hideOptionsTitle?: string;
  disabledTitle?: string;
  addCustomTitle?: string;
  twoLevel?: boolean;
  categoryPrompt?: string;
  allCategoriesLabel?: string;
  allowCustom?: boolean;
  invalid?: boolean;
  describedBy?: string;
}>(), {
  options: () => [],
  groups: () => [],
  multiple: false,
  placeholder: "Начните вводить",
  emptyText: "Нет подходящих вариантов",
  showLabel: false,
  showOptionsTitle: "Показать варианты",
  hideOptionsTitle: "Скрыть варианты",
  disabledTitle: "Нет доступных вариантов",
  addCustomTitle: "Добавить введённое значение",
  twoLevel: false,
  categoryPrompt: "Выберите категорию",
  allCategoriesLabel: "Все категории",
  allowCustom: true,
  invalid: false,
});
const selectedIds = defineModel<string[]>("selectedIds", { required: true });
const customText = defineModel<string>("customText", { required: true });
const customTexts = defineModel<string[]>("customTexts", { default: () => [] });
const root = ref<HTMLElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const listbox = ref<HTMLElement | null>(null);
const open = ref(false);
const activeIndex = ref(-1);
const activeCategoryId = ref("");
const activeCategoryIndex = ref(-1);
const searching = ref(false);
const editing = ref(false);
const inputValue = ref("");
const inputId = useId();
const listboxId = `${inputId}-options`;

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

function flattenGroups(groups: readonly CatalogGroup[]): CatalogOption[] {
  return groups.flatMap((group) => [
    ...(group.options ?? []),
    ...flattenGroups(group.groups ?? []),
  ]);
}

function flattenCategories(
  groups: readonly CatalogGroup[],
  parentLabels: readonly string[] = [],
  parentIds: readonly string[] = [],
): CatalogCategory[] {
  return groups.flatMap((group) => {
    const labels = [...parentLabels, group.label];
    const ids = [...parentIds, group.id];
    return [
      ...(group.options?.length ? [{
        id: ids.join("/"),
        label: group.label,
        parentLabel: parentLabels.join(" — "),
        options: group.options,
      }] : []),
      ...flattenCategories(group.groups ?? [], labels, ids),
    ];
  });
}

const allOptions = computed<CatalogOption[]>(() => [
  ...props.options,
  ...flattenGroups(props.groups),
]);
const optionLabels = computed(() => new Map(allOptions.value.map((option) => [option.id, option.label])));
const selectedLabel = computed(() => props.multiple ? "" : optionLabels.value.get(selectedIds.value[0] ?? "") ?? "");
const categories = computed(() => flattenCategories(props.groups));
const activeCategory = computed(() => categories.value.find((category) => category.id === activeCategoryId.value));
const query = computed(() => normalizeSearch(props.twoLevel && !searching.value ? "" : inputValue.value));
const showingCategories = computed(() => props.twoLevel && !query.value && !activeCategory.value);
const showingCategoryOptions = computed(() => props.twoLevel && !query.value && Boolean(activeCategory.value));
const closedDisplayValue = computed(() => !props.multiple && !open.value && !editing.value
  ? inputValue.value
  : "");

function filterGroups(groups: readonly CatalogGroup[], query: string, parents: string[] = []): CatalogGroup[] {
  return groups.flatMap((group) => {
    const path = [...parents, group.label];
    const options = (group.options ?? []).filter((option) =>
      !query || normalizeSearch([...path, option.label].join(" ")).includes(query));
    const children = filterGroups(group.groups ?? [], query, path);
    return options.length || children.length ? [{ ...group, options, groups: children }] : [];
  });
}

const filteredOptions = computed(() => {
  return props.options.filter((option) => !query.value || normalizeSearch(option.label).includes(query.value));
});
const filteredGroups = computed(() => filterGroups(props.groups, query.value));
const visibleOptions = computed<CatalogOption[]>(() => [
  ...(showingCategoryOptions.value ? activeCategory.value?.options ?? [] : [
    ...filteredOptions.value,
    ...flattenGroups(filteredGroups.value),
  ]),
]);
const visibleOptionIndexes = computed(() => new Map<string, number>(
  visibleOptions.value.map((option, index) => [option.id, index]),
));
const activeOptionId = computed(() => showingCategories.value
  ? activeCategoryIndex.value < 0
    ? undefined
    : activeCategoryIndex.value < filteredOptions.value.length
      ? `${listboxId}-${optionIndex(filteredOptions.value[activeCategoryIndex.value]!.id)}`
      : `${listboxId}-category-${activeCategoryIndex.value - filteredOptions.value.length}`
  : activeIndex.value >= 0 ? `${listboxId}-${activeIndex.value}` : undefined);
const rootItemCount = computed(() => filteredOptions.value.length + categories.value.length);
const toggleTitle = computed(() => {
  if (!allOptions.value.length) return props.disabledTitle;
  return open.value ? props.hideOptionsTitle : props.showOptionsTitle;
});
const canAddCustomValue = computed(() => {
  const value = normalizeSearch(inputValue.value);
  return props.allowCustom && props.multiple && Boolean(value)
    && !customTexts.value.some((text) => normalizeSearch(text) === value);
});

function optionIndex(id: string): number {
  return visibleOptionIndexes.value.get(id) ?? -1;
}

function syncInputValue() {
  inputValue.value = props.multiple && selectedIds.value.length
    ? ""
    : selectedLabel.value || customText.value;
}

function ensureActiveVisible() {
  void nextTick(() => listbox.value
    ?.querySelector<HTMLElement>(".app-catalog-option.active, .app-catalog-category.active")
    ?.scrollIntoView?.({ block: "nearest" }));
}

function closeOptions() {
  open.value = false;
  activeIndex.value = -1;
  activeCategoryId.value = "";
  activeCategoryIndex.value = -1;
  searching.value = false;
  editing.value = false;
  syncInputValue();
}

function openOptions() {
  if (!allOptions.value.length) return;
  open.value = true;
  if (showingCategories.value) {
    activeCategoryIndex.value = rootItemCount.value ? 0 : -1;
    activeIndex.value = -1;
    ensureActiveVisible();
    return;
  }
  const selectedIndex = optionIndex(selectedIds.value[0] ?? "");
  activeIndex.value = selectedIndex >= 0 ? selectedIndex : visibleOptions.value.length ? 0 : -1;
  ensureActiveVisible();
}

function selectCategory(category: CatalogCategory) {
  activeCategoryId.value = category.id;
  activeCategoryIndex.value = -1;
  const selectedIndex = category.options.findIndex((option) => selectedIds.value.includes(option.id));
  activeIndex.value = selectedIndex >= 0 ? selectedIndex : category.options.length ? 0 : -1;
  ensureActiveVisible();
}

function showCategories() {
  activeCategoryId.value = "";
  activeIndex.value = -1;
  activeCategoryIndex.value = rootItemCount.value ? 0 : -1;
  ensureActiveVisible();
}

function toggleOptions() {
  if (open.value) closeOptions();
  else openOptions();
}

function selectOption(option: CatalogOption) {
  if (!props.multiple) customText.value = "";
  selectedIds.value = props.multiple
    ? selectedIds.value.includes(option.id)
      ? selectedIds.value.filter((id) => id !== option.id)
      : [...selectedIds.value, option.id]
    : [option.id];
  inputValue.value = props.multiple ? "" : option.label;
  open.value = false;
  activeIndex.value = -1;
  activeCategoryId.value = "";
  activeCategoryIndex.value = -1;
  searching.value = false;
  editing.value = false;
  void nextTick(() => input.value?.focus());
}

function addCustomValue() {
  if (!canAddCustomValue.value) return;
  customTexts.value = [...customTexts.value, inputValue.value.trim()];
  inputValue.value = "";
  open.value = false;
  activeIndex.value = -1;
  activeCategoryId.value = "";
  activeCategoryIndex.value = -1;
  searching.value = false;
  editing.value = false;
  void nextTick(() => input.value?.focus());
}

function handleInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  inputValue.value = value;
  searching.value = true;
  editing.value = true;
  activeCategoryId.value = "";
  activeCategoryIndex.value = !normalizeSearch(value) && props.twoLevel && rootItemCount.value ? 0 : -1;
  if (!props.multiple) {
    selectedIds.value = [];
    customText.value = value;
  }
  if (!allOptions.value.length) {
    open.value = false;
    activeIndex.value = -1;
    return;
  }
  open.value = true;
  activeIndex.value = visibleOptions.value.length ? 0 : -1;
  ensureActiveVisible();
}

function beginEditing() {
  editing.value = true;
}

function moveActive(delta: 1 | -1) {
  if (!open.value) {
    openOptions();
    return;
  }
  if (showingCategories.value) {
    if (!rootItemCount.value) return;
    activeCategoryIndex.value = activeCategoryIndex.value < 0
      ? delta > 0 ? 0 : rootItemCount.value - 1
      : (activeCategoryIndex.value + delta + rootItemCount.value) % rootItemCount.value;
    ensureActiveVisible();
    return;
  }
  if (!visibleOptions.value.length) return;
  activeIndex.value = activeIndex.value < 0
    ? delta > 0 ? 0 : visibleOptions.value.length - 1
    : (activeIndex.value + delta + visibleOptions.value.length) % visibleOptions.value.length;
  ensureActiveVisible();
}

function selectActive() {
  if (showingCategories.value) {
    const option = filteredOptions.value[activeCategoryIndex.value];
    if (option) {
      selectOption(option);
      return;
    }
    const category = categories.value[activeCategoryIndex.value - filteredOptions.value.length];
    if (category) selectCategory(category);
    return;
  }
  const option = visibleOptions.value[activeIndex.value];
  if (open.value && option) selectOption(option);
  else addCustomValue();
}

function handleEscape() {
  if (showingCategoryOptions.value) showCategories();
  else closeOptions();
}

function handleDocumentInteraction(event: Event) {
  if (open.value && !root.value?.contains(event.target as Node)) closeOptions();
}

watch(() => [props.multiple, selectedLabel.value, customText.value, selectedIds.value.join("\u0000")], () => {
  if (!open.value) syncInputValue();
}, { immediate: true });
watch(allOptions, () => {
  closeOptions();
});
watch(visibleOptions, (options) => {
  if (!open.value || showingCategories.value) return;
  activeIndex.value = options.length ? Math.min(Math.max(activeIndex.value, 0), options.length - 1) : -1;
});
onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentInteraction);
  document.addEventListener("focusin", handleDocumentInteraction);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentInteraction);
  document.removeEventListener("focusin", handleDocumentInteraction);
});
</script>

<template>
  <div ref="root" class="app-catalog-combobox">
    <label v-if="showLabel" :for="inputId"><span>{{ label }}</span></label>
    <div class="app-catalog-control" :class="{ 'has-custom-add': allowCustom && multiple }">
      <span class="app-catalog-input-shell">
        <input
          :id="inputId"
          ref="input"
          :value="inputValue"
          type="text"
          role="combobox"
          autocomplete="off"
          aria-autocomplete="list"
          :aria-label="label"
          :aria-controls="listboxId"
          :aria-expanded="open"
          :aria-invalid="invalid || undefined"
          :aria-describedby="describedBy"
          :aria-activedescendant="activeOptionId"
          :placeholder="placeholder"
          @pointerdown="beginEditing"
          @input="handleInput"
          @keydown.down.prevent="moveActive(1)"
          @keydown.up.prevent="moveActive(-1)"
          @keydown.enter.prevent="selectActive"
          @keydown.esc.stop.prevent="handleEscape"
        />
        <span v-if="closedDisplayValue" class="app-catalog-selected-value" aria-hidden="true">{{ closedDisplayValue }}</span>
      </span>
      <button
        v-if="allowCustom && multiple"
        type="button"
        class="outline-action inline owner-profile-action app-catalog-add"
        :disabled="!canAddCustomValue"
        :title="addCustomTitle"
        :aria-label="addCustomTitle"
        @click="addCustomValue"
      ><AppIcon name="plus" /></button>
      <button
        type="button"
        class="outline-action inline owner-profile-action app-catalog-toggle"
        :disabled="!allOptions.length"
        :title="toggleTitle"
        :aria-label="toggleTitle"
        aria-haspopup="listbox"
        :aria-expanded="open"
        @click="toggleOptions"
        @keydown.esc.stop.prevent="handleEscape"
      ><AppIcon :name="open ? 'chevron-up' : 'chevron-down'" /></button>
    </div>
    <div
      v-if="open"
      :id="listboxId"
      ref="listbox"
      class="app-catalog-options"
      role="listbox"
      :aria-label="label"
      :aria-multiselectable="multiple || undefined"
    >
      <template v-if="showingCategories">
        <p class="app-catalog-level-prompt">{{ categoryPrompt }}</p>
        <button
          v-for="(option, index) in filteredOptions"
          :id="`${listboxId}-${optionIndex(option.id)}`"
          :key="option.id"
          type="button"
          class="app-catalog-category app-catalog-root-option"
          :class="{ active: activeCategoryIndex === index, selected: selectedIds.includes(option.id) }"
          role="option"
          :aria-selected="selectedIds.includes(option.id)"
          @mousedown.prevent
          @click="selectOption(option)"
        ><span><strong>{{ option.label }}</strong></span></button>
        <button
          v-for="(category, index) in categories"
          :id="`${listboxId}-category-${index}`"
          :key="category.id"
          type="button"
          class="app-catalog-category"
          :class="{ active: activeCategoryIndex === index + filteredOptions.length }"
          role="option"
          :aria-selected="false"
          @mousedown.prevent
          @click="selectCategory(category)"
        >
          <span>
            <strong>{{ category.label }}</strong>
            <small v-if="category.parentLabel">{{ category.parentLabel }}</small>
          </span>
          <AppIcon name="chevron" />
        </button>
      </template>
      <div v-else-if="showingCategoryOptions" class="app-catalog-level-heading">
        <button type="button" class="app-catalog-back" @mousedown.prevent @click="showCategories">
          <AppIcon name="chevron-left" />
          <span>{{ allCategoriesLabel }}</span>
        </button>
        <strong>{{ activeCategory?.label }}</strong>
        <small v-if="activeCategory?.parentLabel">{{ activeCategory.parentLabel }}</small>
      </div>
      <template v-if="!showingCategories">
        <button
          v-for="option in showingCategoryOptions ? visibleOptions : filteredOptions"
          :id="`${listboxId}-${optionIndex(option.id)}`"
          :key="option.id"
          type="button"
          class="app-catalog-option"
          :class="{ active: activeIndex === optionIndex(option.id), selected: selectedIds.includes(option.id) }"
          role="option"
          :aria-selected="selectedIds.includes(option.id)"
          @mousedown.prevent
          @click="selectOption(option)"
        >{{ option.label }}</button>
      </template>
      <section
        v-for="group in showingCategories || showingCategoryOptions ? [] : filteredGroups"
        :key="group.id"
        class="app-catalog-option-root"
        role="group"
        :aria-label="group.label"
      >
        <strong>{{ group.label }}</strong>
        <button
          v-for="option in group.options"
          :id="`${listboxId}-${optionIndex(option.id)}`"
          :key="option.id"
          type="button"
          class="app-catalog-option"
          :class="{ active: activeIndex === optionIndex(option.id), selected: selectedIds.includes(option.id) }"
          role="option"
          :aria-selected="selectedIds.includes(option.id)"
          @mousedown.prevent
          @click="selectOption(option)"
        >{{ option.label }}</button>
        <div
          v-for="child in group.groups"
          :key="child.id"
          class="app-catalog-option-group"
          role="group"
          :aria-label="child.label"
        >
          <small>{{ child.label }}</small>
          <button
            v-for="option in child.options"
            :id="`${listboxId}-${optionIndex(option.id)}`"
            :key="option.id"
            type="button"
            class="app-catalog-option"
            :class="{ active: activeIndex === optionIndex(option.id), selected: selectedIds.includes(option.id) }"
            role="option"
            :aria-selected="selectedIds.includes(option.id)"
            @mousedown.prevent
            @click="selectOption(option)"
          >{{ option.label }}</button>
        </div>
      </section>
      <p v-if="!visibleOptions.length" class="app-catalog-empty" role="status">{{ emptyText }}</p>
    </div>
  </div>
</template>
