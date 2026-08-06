<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import AppIcon from "./AppIcon.vue";

const DOG_COLORS = [
  "Черный",
  "Белый",
  "Рыжий / Красный",
  "Коричневый / Шоколадный",
  "Голубой",
  "Палевый",
  "Изабелловый",
  "Черно-белый",
  "Рыже-белый",
  "Подпалый",
  "Чепрачный",
  "Зонарный",
  "Черно-белый с подпалом",
  "Шоколадно-белый с подпалом",
  "Пегий",
  "Крапчатый (Тиковый)",
  "Мраморный (Арлекин, Мерль)",
  "Тигровый",
  "Пятнистый",
  "Соболиный",
  "Рыже-соболиный",
  "Серо-соболиный",
  "Бежево-соболиный",
  "Соболиный с маской",
  "Тиковый / Крапчатый",
  "Сильно крапчатый",
] as const;

const CAT_COLORS = [
  "Черный",
  "Белый",
  "Рыжий",
  "Голубой",
  "Серый",
  "Шоколадный",
  "Лиловый (серо-розовый/бежевый)",
  "Циннамон (светло-коричневый, «корица»)",
  "Фавн (светло-бежевый)",
  "Красный",
  "Кремовый",
  "Браун табби",
  "Колор табби",
  "Тигровый",
  "Мраморный",
  "Серебристый",
  "Дымчатый",
  "Колор-пойнт",
  "Сил-пойнт",
  "Блю-пойнт",
  "Ред-пойнт",
  "Черепаховый",
  "Ситцевый",
] as const;

const props = defineProps<{ species: string }>();
const color = defineModel<string>({ required: true });
const root = ref<HTMLElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const listbox = ref<HTMLElement | null>(null);
const open = ref(false);
const activeIndex = ref(-1);
const inputId = useId();
const listboxId = `${inputId}-options`;
const options = computed<readonly string[]>(() => {
  if (props.species === "Собака") return DOG_COLORS;
  if (props.species === "Кошка") return CAT_COLORS;
  return [];
});
const filteredOptions = computed(() => {
  const query = color.value.trim().toLocaleLowerCase("ru");
  if (!query) return options.value;
  return options.value.filter((option) => option.toLocaleLowerCase("ru").includes(query));
});
const activeOptionId = computed(() => activeIndex.value >= 0 ? `${listboxId}-${activeIndex.value}` : undefined);
const toggleTitle = computed(() => {
  if (!options.value.length) return "Для выбранного вида нет списка окрасов";
  return open.value ? "Скрыть варианты окраса" : "Показать варианты окраса";
});

function ensureActiveVisible() {
  void nextTick(() => listbox.value
    ?.querySelector<HTMLElement>(".owner-color-option.active")
    ?.scrollIntoView?.({ block: "nearest" }));
}

function closeOptions() {
  open.value = false;
  activeIndex.value = -1;
}

function openOptions() {
  if (!options.value.length) return;
  open.value = true;
  const selectedIndex = filteredOptions.value.findIndex((option) => option === color.value);
  activeIndex.value = selectedIndex >= 0 ? selectedIndex : filteredOptions.value.length ? 0 : -1;
  ensureActiveVisible();
}

function toggleOptions() {
  if (open.value) closeOptions();
  else openOptions();
}

function selectOption(option: string) {
  color.value = option;
  closeOptions();
  void nextTick(() => input.value?.focus());
}

function handleInput(event: Event) {
  color.value = (event.target as HTMLInputElement).value;
  if (!options.value.length) {
    closeOptions();
    return;
  }
  open.value = true;
  activeIndex.value = filteredOptions.value.length ? 0 : -1;
  ensureActiveVisible();
}

function moveActive(delta: 1 | -1) {
  if (!open.value) {
    openOptions();
    return;
  }
  const length = filteredOptions.value.length;
  if (!length) return;
  activeIndex.value = activeIndex.value < 0
    ? delta > 0 ? 0 : length - 1
    : (activeIndex.value + delta + length) % length;
  ensureActiveVisible();
}

function selectActive() {
  if (!open.value || activeIndex.value < 0) return;
  const option = filteredOptions.value[activeIndex.value];
  if (option) selectOption(option);
}

function handleDocumentInteraction(event: Event) {
  if (open.value && !root.value?.contains(event.target as Node)) closeOptions();
}

watch(() => props.species, closeOptions);
watch(filteredOptions, (nextOptions) => {
  if (!open.value) return;
  activeIndex.value = nextOptions.length ? Math.min(Math.max(activeIndex.value, 0), nextOptions.length - 1) : -1;
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
  <div ref="root" class="owner-color-field">
    <label :for="inputId"><span>Окрас</span></label>
    <div class="owner-color-control">
      <input
        :id="inputId"
        ref="input"
        :value="color"
        type="text"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        :aria-controls="listboxId"
        :aria-expanded="open"
        :aria-activedescendant="activeOptionId"
        @input="handleInput"
        @keydown.down.prevent="moveActive(1)"
        @keydown.up.prevent="moveActive(-1)"
        @keydown.enter.prevent="selectActive"
        @keydown.esc.stop.prevent="closeOptions"
      />
      <button
        type="button"
        class="outline-action inline owner-profile-action owner-color-toggle"
        :disabled="!options.length"
        :title="toggleTitle"
        :aria-label="toggleTitle"
        aria-haspopup="listbox"
        :aria-expanded="open"
        @click="toggleOptions"
        @keydown.esc.stop.prevent="closeOptions"
      ><AppIcon :name="open ? 'chevron-up' : 'chevron-down'" /></button>
    </div>
    <div v-if="open" :id="listboxId" ref="listbox" class="owner-color-options" role="listbox">
      <button
        v-for="(option, index) in filteredOptions"
        :id="`${listboxId}-${index}`"
        :key="option"
        type="button"
        class="owner-color-option"
        :class="{ active: activeIndex === index, selected: color === option }"
        role="option"
        :aria-selected="color === option"
        @mousedown.prevent
        @click="selectOption(option)"
      >{{ option }}</button>
      <p v-if="!filteredOptions.length" class="owner-color-empty" role="status">Нет подходящих вариантов</p>
    </div>
  </div>
</template>
