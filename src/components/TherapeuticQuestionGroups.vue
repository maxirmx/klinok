<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed } from "vue";
import {
  pruneTherapeuticSelections,
  therapeuticQuestionSelections,
  therapeuticQuestionVisible,
  toggleTherapeuticMultipleSelection,
} from "../therapeuticAppointment";
import type {
  TherapeuticCategoryDefinition,
  TherapeuticQuestionDefinition,
} from "../therapeuticAppointment";

const props = defineProps<{ categories: readonly TherapeuticCategoryDefinition[] }>();
const selectedIds = defineModel<string[]>({ required: true });
const compactSelectTextLimit = 40;

function isNaturallyWide(question: TherapeuticQuestionDefinition): boolean {
  return [question.label, ...question.options.map((option) => option.label)]
    .some((label) => label.length > compactSelectTextLimit);
}

const wideSelectQuestionIds = computed(() => new Set(props.categories.flatMap((category) => {
  const visibleSelectQuestions = category.questions
    .filter((question) => question.mode === "single" && therapeuticQuestionVisible(question, selectedIds.value));
  const naturallyWide = visibleSelectQuestions.filter(isNaturallyWide);
  const first = visibleSelectQuestions[0];
  const second = visibleSelectQuestions[1];
  const wideIds = new Set(naturallyWide.map((question) => question.id));
  if (first && (!second || isNaturallyWide(second))) wideIds.add(first.id);
  return [...wideIds];
})));

function replaceSingle(question: TherapeuticQuestionDefinition, event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  const questionIds = new Set(question.options.map((option) => option.id));
  selectedIds.value = pruneTherapeuticSelections([
    ...selectedIds.value.filter((id) => !questionIds.has(id)),
    ...(value ? [value] : []),
  ]);
}

function toggleMultiple(question: TherapeuticQuestionDefinition, id: string) {
  selectedIds.value = toggleTherapeuticMultipleSelection(question, selectedIds.value, id);
}

function selectedValue(question: TherapeuticQuestionDefinition): string {
  return therapeuticQuestionSelections(question, selectedIds.value)[0] ?? "";
}
</script>

<template>
  <div class="therapeutic-categories">
    <section v-for="category in categories" :key="category.id" class="therapeutic-category">
      <h5>{{ category.label }}</h5>
      <div class="therapeutic-question-grid">
        <template v-for="question in category.questions" :key="question.id">
          <label
            v-if="question.mode === 'single' && therapeuticQuestionVisible(question, selectedIds)"
            class="therapeutic-select-field"
            :class="{ 'therapeutic-select-field-wide': wideSelectQuestionIds.has(question.id) }"
          >
            <span>{{ question.label }}</span>
            <select :value="selectedValue(question)" @change="replaceSingle(question, $event)">
              <option value="">Не указано</option>
              <option v-for="option in question.options" :key="option.id" :value="option.id">{{ option.label }}</option>
            </select>
          </label>
          <fieldset
            v-else-if="question.mode === 'multiple' && therapeuticQuestionVisible(question, selectedIds)"
            class="medical-card-option-panel therapeutic-multiple-field"
          >
            <legend class="visually-hidden">{{ question.label }}</legend>
            <span class="therapeutic-group-label" aria-hidden="true">{{ question.label }}</span>
            <div class="medical-card-options">
              <label v-for="option in question.options" :key="option.id" class="check-row">
                <input
                  type="checkbox"
                  :checked="selectedIds.includes(option.id)"
                  @change="toggleMultiple(question, option.id)"
                />
                <span>{{ option.label }}</span>
              </label>
            </div>
          </fieldset>
        </template>
      </div>
    </section>
  </div>
</template>
