<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, nextTick, ref, useAttrs } from "vue";
import AppIcon from "./AppIcon.vue";

defineOptions({ inheritAttrs: false });

interface AppSelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

const props = withDefaults(defineProps<{
  modelValue: string;
  options: readonly AppSelectOption[];
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
}>(), {
  disabled: false,
  required: false,
  invalid: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const attrs = useAttrs();
const select = ref<HTMLSelectElement | null>(null);
const selectedLabel = computed(() => props.options.find((option) => option.value === props.modelValue)?.label
  ?? props.modelValue);
const ariaInvalid = computed(() => props.invalid
  ? "true"
  : attrs["aria-invalid"] as "true" | "false" | "grammar" | "spelling" | undefined);

async function updateValue(event: Event) {
  emit("update:modelValue", (event.currentTarget as HTMLSelectElement).value);
  await nextTick();
  if (select.value && select.value.value !== props.modelValue) select.value.value = props.modelValue;
}
</script>

<template>
  <span class="app-select" :class="{ disabled, invalid }">
    <span class="app-select-value" aria-hidden="true">{{ selectedLabel }}</span>
    <AppIcon class="app-select-chevron" name="chevron-down" aria-hidden="true" />
    <select
      ref="select"
      v-bind="$attrs"
      class="app-select-native"
      :value="modelValue"
      :disabled="disabled"
      :required="required"
      :aria-invalid="ariaInvalid"
      @change="updateValue"
    >
      <option
        v-for="option in options"
        :key="`${option.value}:${option.label}`"
        :value="option.value"
        :disabled="option.disabled"
      >{{ option.label }}</option>
    </select>
  </span>
</template>
