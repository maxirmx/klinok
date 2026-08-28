<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { DIAGNOSIS_CATALOG, DIAGNOSIS_TOP_LEVEL_OPTIONS } from "../repositories/types";
import AppCatalogCombobox from "./AppCatalogCombobox.vue";

withDefaults(defineProps<{
  label: string;
  multiple?: boolean;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
}>(), {
  multiple: false,
  placeholder: "Начните вводить диагноз",
});
const selectedIds = defineModel<string[]>("selectedIds", { required: true });
const customText = defineModel<string>("customText", { default: "" });
const customTexts = defineModel<string[]>("customTexts", { default: () => [] });
</script>

<template>
  <AppCatalogCombobox
    v-model:selected-ids="selectedIds"
    v-model:custom-text="customText"
    v-model:custom-texts="customTexts"
    class="diagnosis-combobox"
    :label="label"
    :options="DIAGNOSIS_TOP_LEVEL_OPTIONS"
    :groups="DIAGNOSIS_CATALOG"
    :multiple="multiple"
    :invalid="invalid"
    :described-by="describedBy"
    two-level
    category-prompt="Выберите диагноз или категорию"
    :placeholder="placeholder"
    empty-text="Нет подходящих диагнозов"
    show-options-title="Показать варианты диагнозов"
    hide-options-title="Скрыть варианты диагнозов"
    add-custom-title="Добавить диагноз в свободной форме"
  />
</template>
