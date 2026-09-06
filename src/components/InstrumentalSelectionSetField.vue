<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import AppSelect from "./AppSelect.vue";

interface SelectionOption {
  readonly value: string;
  readonly label: string;
}

interface InlineInput {
  readonly value: string;
  readonly label: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly invalid: boolean;
  readonly describedBy?: string;
  readonly error?: string;
  readonly errorId?: string;
}

withDefaults(defineProps<{
  label: string;
  modelValue: string;
  options: readonly SelectionOption[];
  wide?: boolean;
  invalid?: boolean;
  describedBy?: string;
  error?: string;
  errorId?: string;
  inlineInput?: InlineInput;
}>(), {
  wide: false,
  invalid: false,
  describedBy: undefined,
  error: undefined,
  errorId: undefined,
  inlineInput: undefined,
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:inlineInputValue": [value: string];
}>();

function updateInlineInput(event: Event) {
  emit("update:inlineInputValue", (event.currentTarget as HTMLInputElement).value);
}
</script>

<template>
  <div
    class="instrumental-selection-set-field"
    :class="{
      'instrumental-selection-set-field-wide': wide,
      'instrumental-selection-set-field-inline': inlineInput,
    }"
  >
    <span>{{ label }}</span>
    <div
      class="instrumental-selection-set-control"
      :class="{ 'instrumental-selection-set-inline-control': inlineInput }"
    >
      <AppSelect
        :model-value="modelValue"
        :options="options"
        :aria-label="label"
        :invalid="invalid"
        :aria-describedby="describedBy"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <template v-if="inlineInput">
        <span class="instrumental-selection-set-inline-affix">{{ inlineInput.prefix }}</span>
        <input
          class="instrumental-selection-set-inline-input"
          type="text"
          :value="inlineInput.value"
          :aria-label="inlineInput.label"
          :aria-invalid="inlineInput.invalid ? true : undefined"
          :aria-describedby="inlineInput.describedBy"
          @input="updateInlineInput"
        />
        <span class="instrumental-selection-set-inline-affix">{{ inlineInput.suffix }}</span>
      </template>
    </div>
    <small v-if="error" :id="errorId" class="field-error" role="alert">{{ error }}</small>
    <small v-if="inlineInput?.error" :id="inlineInput.errorId" class="field-error" role="alert">{{ inlineInput.error }}</small>
  </div>
</template>
