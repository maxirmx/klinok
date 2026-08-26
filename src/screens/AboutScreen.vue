<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import AboutContent from "../components/AboutContent.vue";
import AppIcon from "../components/AppIcon.vue";
import WorkspaceShell from "../components/WorkspaceShell.vue";
import { appState, logout } from "../appStore";

defineProps<{ scenarioId: string; role?: never }>();

const router = useRouter();
const authenticated = computed(() => appState.session.authenticated);
const profileName = computed(() => [
  appState.control.profile?.firstName,
  appState.control.profile?.patronymic,
  appState.control.profile?.lastName,
].filter(Boolean).join(" "));

async function signOut() {
  if (await logout()) await router.replace("/auth/login");
}
</script>

<template>
  <WorkspaceShell
    v-if="authenticated"
    :role="appState.activeRole"
    title="О программе"
    :profile-name="profileName"
    about
    @sign-out="signOut"
  >
    <AboutContent />
  </WorkspaceShell>

  <main v-else class="about-public-shell">
    <nav class="about-public-nav" aria-label="Навигация страницы «О программе»">
      <RouterLink to="/auth/login">
        <AppIcon name="chevron-left" />
        <span>Ко входу</span>
      </RouterLink>
    </nav>
    <AboutContent heading-tag="h1" />
  </main>
</template>
