<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed } from "vue";
import AppSelect from "./AppSelect.vue";

type SortDirection = "asc" | "desc";

const props = withDefaults(defineProps<{
  field: string;
  direction: SortDirection;
  fields: readonly { value: string; label: string }[];
  ascendingLabel?: string;
  descendingLabel?: string;
  descendingFirst?: boolean;
  ariaLabel?: string;
}>(), {
  ascendingLabel: "По возрастанию",
  descendingLabel: "По убыванию",
  descendingFirst: false,
  ariaLabel: "Сортировка",
});

const emit = defineEmits<{
  "update:field": [field: string];
  "update:direction": [direction: SortDirection];
}>();

const directionOptions = computed(() => props.descendingFirst
  ? [["desc", props.descendingLabel], ["asc", props.ascendingLabel]] as const
  : [["asc", props.ascendingLabel], ["desc", props.descendingLabel]] as const);
const options = computed(() => props.fields.flatMap((field) => directionOptions.value.map(([direction, label]) => ({
  value: `${field.value}:${direction}`,
  label: props.fields.length === 1 ? label : `${field.label} · ${label}`,
}))));
const value = computed(() => `${props.field}:${props.direction}`);

function updateValue(next: string) {
  const separator = next.lastIndexOf(":");
  const field = next.slice(0, separator);
  const direction = next.slice(separator + 1) as SortDirection;
  if (field !== props.field) emit("update:field", field);
  if (direction !== props.direction) emit("update:direction", direction);
}
</script>

<template>
  <div class="app-table-sort" :data-sort-field="field" :data-sort-direction="direction">
    <AppSelect
      :model-value="value"
      :options="options"
      :aria-label="ariaLabel"
      @update:model-value="updateValue"
    />
  </div>
</template>
