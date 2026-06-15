<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import packageJson from "../../package.json";
import AppShell from "../components/AppShell.vue";
import AppIcon from "../components/AppIcon.vue";
import { deleteAccountReasons, faqItems, notifications, users } from "../data";
import { darkMode } from "../state";

const props = defineProps<{
  scenarioId: string;
}>();

const deleteConfirmed = ref(false);
const selectedReasons = ref<string[]>([]);
const user = computed(() => users.find((item) => item.role === "owner") ?? users[0]);
const fullName = computed(() => `${user.value.lastName} ${user.value.firstName} ${user.value.patronymic ?? ""}`.trim());

const title = computed(() => {
  if (props.scenarioId === "owner-profile-notifications") return "Уведомления";
  if (props.scenarioId === "owner-profile-about") return "О приложении";
  if (props.scenarioId === "owner-profile-faq") return "FAQ";
  if (props.scenarioId === "owner-profile-delete") return "Удалить аккаунт";
  return "Мой профиль";
});
</script>

<template>
  <AppShell :title="title" back-to="/owner/home">
    <template v-if="scenarioId === 'owner-profile-notifications'">
      <section class="panel">
        <article v-for="item in notifications" :key="item.id" class="plain-card" :class="{ unread: item.unread }">
          <strong>{{ item.title }}</strong>
          <span>{{ item.description }}</span>
          <small>{{ item.date }}</small>
        </article>
      </section>
    </template>

    <template v-else-if="scenarioId === 'owner-profile-about'">
      <section class="panel profile-info">
        <h2>О приложении</h2>
        <p>Клинок помогает владельцам хранить историю здоровья питомцев, оформлять заявки и передавать данные врачу.</p>
        <div class="field"><span>Версия</span><strong>{{ packageJson.version }}</strong></div>
        <div class="field"><span>Поддержка</span><strong>support@klinok.app</strong></div>
        <div class="field"><span>Документы</span><strong>Политика обработки данных</strong></div>
      </section>
    </template>

    <template v-else-if="scenarioId === 'owner-profile-faq'">
      <section class="panel list-panel">
        <article v-for="item in faqItems" :key="item.id" class="faq-item">
          <h2>{{ item.question }}</h2>
          <p>{{ item.answer }}</p>
        </article>
      </section>
    </template>

    <template v-else-if="scenarioId === 'owner-profile-delete'">
      <section class="panel delete-panel">
        <template v-if="deleteConfirmed">
          <div class="success-state">
            <span><AppIcon name="check" /></span>
            <h2>Запрос принят</h2>
            <p>Аккаунт будет удален после дополнительной проверки владельца.</p>
          </div>
        </template>
        <template v-else>
          <h2>Удалить аккаунт?</h2>
          <p>История питомцев, документы и заявки будут недоступны после подтверждения.</p>
          <label v-for="reason in deleteAccountReasons" :key="reason" class="check-row">
            <input v-model="selectedReasons" type="checkbox" :value="reason" />
            <span>{{ reason }}</span>
          </label>
          <button class="primary-action danger" @click="deleteConfirmed = true">Подтвердить удаление</button>
        </template>
      </section>
    </template>

    <template v-else>
      <section class="profile-hero panel">
        <span class="avatar square" />
        <h2>{{ user.firstName }}<br />{{ user.lastName }}</h2>
      </section>
      <section class="panel profile-info">
        <h2>Основная информация</h2>
        <p>Данная информация отображается только при заполнении заявки. Остальным пользователям она не видна</p>
        <div class="field"><span>ФИО</span><strong>{{ fullName }}</strong></div>
        <div class="field"><span>E-mail</span><strong>{{ user.email }}</strong></div>
        <div class="field"><span>Телефон</span><strong>{{ user.phone }}</strong></div>
        <div class="field"><span>Город</span><strong>{{ user.city }}</strong></div>
      </section>
      <section class="panel settings-panel">
        <h2>Настройки</h2>
        <button class="settings-row" @click="darkMode = !darkMode">
          <span>Темная тема</span><span class="switch" :class="{ on: darkMode }"><i /></span>
        </button>
        <RouterLink class="settings-row" to="/owner/profile/notifications">
          <AppIcon name="bell" /><span>Уведомления</span><AppIcon name="chevron" />
        </RouterLink>
        <RouterLink class="settings-row" to="/owner/profile/about">
          <AppIcon name="book" /><span>О приложении</span><AppIcon name="chevron" />
        </RouterLink>
        <RouterLink class="settings-row" to="/owner/profile/faq">
          <span class="question">?</span><span>FAQ</span><AppIcon name="chevron" />
        </RouterLink>
        <RouterLink class="settings-row danger-link" to="/owner/profile/delete">
          <AppIcon name="close" /><span>Удалить аккаунт</span><AppIcon name="chevron" />
        </RouterLink>
      </section>
    </template>
  </AppShell>
</template>
