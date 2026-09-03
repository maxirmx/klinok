<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import ModalDialog from "./ModalDialog.vue";

const props = withDefaults(defineProps<{
  modelValue: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  error?: string;
  busy?: boolean;
  confirmDisabled?: boolean;
  tone?: "danger" | "primary";
}>(), {
  cancelLabel: "Отмена",
  error: "",
  busy: false,
  confirmDisabled: false,
  tone: "danger",
});

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  confirm: [];
}>();

function cancel() {
  if (props.busy) return;
  emit("update:modelValue", false);
}

function confirm() {
  if (props.busy) return;
  emit("confirm");
}

</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    :title="title"
    :description="description"
    :busy="busy"
    :role="tone === 'danger' ? 'alertdialog' : 'dialog'"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <p v-if="error" class="form-alert error" role="alert">{{ error }}</p>
    <div class="confirmation-dialog-actions">
      <button class="outline-action inline" type="button" :disabled="busy" @click="cancel">
        {{ cancelLabel }}
      </button>
      <button
        class="primary-action inline"
        :class="{ danger: tone === 'danger' }"
        type="button"
        :disabled="busy || confirmDisabled"
        @click="confirm"
      >
        {{ confirmLabel }}
      </button>
    </div>
  </ModalDialog>
</template>
