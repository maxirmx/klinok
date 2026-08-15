<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed } from "vue";
import AppCatalogCombobox from "./AppCatalogCombobox.vue";

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
const options = computed<readonly string[]>(() => {
  if (props.species === "Собака") return DOG_COLORS;
  if (props.species === "Кошка") return CAT_COLORS;
  return [];
});
const catalogOptions = computed(() => options.value.map((label) => ({ id: label, label })));
const selectedIds = computed({
  get: () => options.value.includes(color.value) ? [color.value] : [],
  set: (ids: string[]) => {
    color.value = ids[0] ?? customText.value;
  },
});
const customText = computed({
  get: () => selectedIds.value.length ? "" : color.value,
  set: (value: string) => {
    color.value = value;
  },
});
</script>

<template>
  <AppCatalogCombobox
    v-model:selected-ids="selectedIds"
    v-model:custom-text="customText"
    class="owner-color-field"
    label="Окрас"
    :options="catalogOptions"
    show-label
    placeholder="Введите окрас"
    show-options-title="Показать варианты окраса"
    hide-options-title="Скрыть варианты окраса"
    disabled-title="Для выбранного вида нет списка окрасов"
  />
</template>
