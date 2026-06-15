<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import AppShell from "../components/AppShell.vue";
import AppIcon from "../components/AppIcon.vue";
import { analysisTemplates, pets } from "../data";
import { analysisDraft, saveAnalysisDraft, savedAnalyses, showToast } from "../state";

const props = defineProps<{
  scenarioId: string;
}>();

const router = useRouter();
const selectedTemplate = computed(() => {
  return analysisTemplates.find((template) => template.id === analysisDraft.templateId) ?? analysisTemplates[0];
});

const isTemplates = computed(() => props.scenarioId === "owner-analysis-template");
const isSaved = computed(() => props.scenarioId === "owner-analysis-saved");

function useTemplate(templateId: number) {
  const template = analysisTemplates.find((item) => item.id === templateId);
  if (!template) return;
  analysisDraft.templateId = template.id;
  analysisDraft.rows = [...template.fields];
  router.push("/owner/analysis");
}

function addRow() {
  analysisDraft.rows.push("Параметр");
}

function save() {
  saveAnalysisDraft();
  showToast("Анализ сохранен");
  router.push("/owner/analysis/saved");
}
</script>

<template>
  <AppShell v-if="isSaved" title="Анализ сохранен" subtitle="Запись добавлена в карточку питомца" back-to="/owner/analysis">
    <section class="panel success-state">
      <span><AppIcon name="check" /></span>
      <h2>Анализ сохранен</h2>
      <p>{{ selectedTemplate.title }} для {{ analysisDraft.pet }} теперь доступен в истории.</p>
      <div class="article-list compact">
        <article v-for="analysis in savedAnalyses.slice(0, 3)" :key="`${analysis.pet}-${analysis.date}-${analysis.templateId}`" class="plain-card">
          <strong>{{ analysis.pet }}</strong>
          <span>{{ analysis.date }} · {{ analysis.rows.length }} показателя</span>
        </article>
      </div>
    </section>
  </AppShell>

  <AppShell v-else-if="isTemplates" title="Шаблоны" subtitle="Выберите структуру анализа" back-to="/owner/analysis">
    <section class="panel">
      <button
        v-for="template in analysisTemplates"
        :key="template.id"
        class="template-row"
        @click="useTemplate(template.id)"
      >
        <span>
          <strong>{{ template.title }}</strong>
          <small>{{ template.kind }} · {{ template.fields.length }} параметров</small>
          <small>{{ template.note }}</small>
        </span>
        <AppIcon name="chevron" />
      </button>
    </section>
  </AppShell>

  <AppShell v-else title="Добавление анализа" subtitle="Ручной ввод показателей" back-to="/owner/materials">
    <section class="form-panel panel">
      <h2>Добавление анализа</h2>
      <label>
        <span>Питомец</span>
        <select v-model="analysisDraft.pet">
          <option v-for="pet in pets" :key="pet.id">{{ pet.name }}</option>
        </select>
      </label>
      <label>
        <span>Тип анализа</span>
        <select v-model.number="analysisDraft.templateId" @change="useTemplate(analysisDraft.templateId)">
          <option v-for="template in analysisTemplates" :key="template.id" :value="template.id">{{ template.title }}</option>
        </select>
      </label>
      <label>
        <span>Дата анализа</span>
        <input v-model="analysisDraft.date" />
      </label>
      <RouterLink class="outline-action" to="/owner/analysis/templates">Выбрать шаблон</RouterLink>
      <div class="parameter-grid">
        <input v-for="(_, index) in analysisDraft.rows" :key="index" v-model="analysisDraft.rows[index]" />
      </div>
      <button class="outline-action" @click="addRow">Добавить показатель</button>
      <button class="primary-action inline" @click="save">Сохранить</button>
    </section>
  </AppShell>
</template>
