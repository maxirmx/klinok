<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { Role } from "@klinok/contracts";
import AppIcon from "./AppIcon.vue";
import AppAlert from "./AppAlert.vue";
import BrandLogo from "./BrandLogo.vue";
import PendingCountBadge from "./PendingCountBadge.vue";
import { appState } from "../appStore";
import { administratorPendingRequestCount, ownerPendingApprovals } from "../pendingApprovals";
import { roleHomePath } from "../roleNavigation";
import { APP_VERSION } from "../version";

type WorkspaceIcon = "home" | "pets" | "plus" | "user" | "book" | "bell" | "eye" | "medical-tools";
type WorkspaceNavItem = { id: string; label: string; icon: WorkspaceIcon };
type WorkspacePathNavItem = WorkspaceNavItem & { path: string; exact: boolean };
type WorkspacePendingNavItem = WorkspacePathNavItem & { pendingCount: number };

const props = defineProps<{
  role: Role | null;
  title: string;
  profileName: string;
  settings?: boolean;
  about?: boolean;
  administratorPendingCount?: number;
}>();

const emit = defineEmits<{ signOut: [] }>();
const route = useRoute();
const router = useRouter();
const activeSection = ref(route.hash.slice(1) || "workspace-top");

const navigationByRole: Record<Role, WorkspaceNavItem[]> = {
  administrator: [
    { id: "workspace-top", label: "Пользователи", icon: "user" },
    { id: "administrator-requests", label: "Заявки", icon: "bell" },
    { id: "administrator-accounts", label: "Аккаунты", icon: "user" },
    { id: "administrator-journal", label: "Журнал", icon: "book" },
  ],
  owner: [
    { id: "workspace-top", label: "Питомцы", icon: "pets" },
    { id: "owner-add-pet", label: "Добавить", icon: "plus" },
    { id: "owner-pets", label: "Питомцы", icon: "pets" },
    { id: "owner-grant-access", label: "Дать доступ", icon: "user" },
    { id: "owner-active-access", label: "Доступы", icon: "eye" },
    { id: "owner-records", label: "Медкарта", icon: "book" },
  ],
  doctor: [
    { id: "workspace-top", label: "Главная страница", icon: "medical-tools" },
    { id: "doctor-request-access", label: "Запросить доступ", icon: "plus" },
    { id: "doctor-pets", label: "Мед. карты", icon: "pets" },
    { id: "doctor-new-record", label: "Новая запись", icon: "plus" },
    { id: "doctor-delegation", label: "Делегирование", icon: "user" },
    { id: "doctor-records", label: "Медкарта", icon: "medical-tools" },
  ],
};
const ownerRootNavigation: WorkspacePathNavItem = {
  id: "owner-home",
  label: "Питомцы",
  icon: "pets",
  path: "/owner/home",
  exact: true,
};
const ownerPending = computed(() => ownerPendingApprovals(appState.medical));
const administratorPendingCount = computed(() => props.administratorPendingCount
  ?? administratorPendingRequestCount(appState.control));
const ownerChildNavigation = computed<WorkspacePendingNavItem[]>(() => [
  { id: "owner-add-pet", label: "Добавить питомца", icon: "plus", path: "/owner/pets/new", exact: true, pendingCount: 0 },
  ...appState.medical.pets.map((pet) => ({
    id: `owner-pet-${pet.petId}`,
    label: pet.name,
    icon: "pets" as const,
    path: `/owner/pets/${pet.petId}`,
    exact: false,
    pendingCount: ownerPending.value.byPet[pet.petId]?.total ?? 0,
  })),
]);
const administratorNavigation: WorkspacePathNavItem[] = [
  { id: "administrator-home", label: "Пользователи", icon: "user", path: "/admin/home", exact: true },
  { id: "administrator-audit", label: "Журнал", icon: "book", path: "/admin/audit", exact: true },
];
const doctorNavigation: WorkspacePathNavItem[] = [
  { id: "doctor-home", label: "Мед. карты", icon: "medical-tools", path: "/doctor/home", exact: true },
  { id: "doctor-request-access", label: "Запросить доступ", icon: "plus", path: "/doctor/pets/request-access", exact: true },
];
const effectiveRole = computed<Role | null>(() => props.role
  ?? (props.settings || props.about
    ? appState.activeRole ?? appState.control.roles.find((request) => request.status === "approved")?.role ?? null
    : null));
const navigation = computed(() => effectiveRole.value ? navigationByRole[effectiveRole.value] : []);
const brandHref = computed(() => effectiveRole.value
  && (props.settings || props.about || effectiveRole.value === "administrator")
  ? roleHomePath(effectiveRole.value)
  : "#workspace-top");

watch(
  [effectiveRole, () => route.hash],
  ([, hash]) => { activeSection.value = hash.slice(1) || "workspace-top"; },
);

function selectSection(id: string) {
  activeSection.value = id;
  void router.push({
    ...(props.settings && effectiveRole.value ? { path: roleHomePath(effectiveRole.value) } : {}),
    hash: `#${id}`,
  });
}

function pathActive(path: string, exact = false) {
  if (props.settings || props.about) return false;
  return exact ? route.path === path : route.path === path || route.path.startsWith(`${path}/`);
}

function selectBrand() {
  if (brandHref.value === "#workspace-top") selectSection("workspace-top");
  else selectPath(brandHref.value);
}

function selectPath(path: string) {
  void router.push(path);
}

function pendingNavigationLabel(label: string, count: number): string {
  return count ? `${label}. Ожидают решения: ${count}` : label;
}

function administratorItemPendingCount(item: WorkspacePathNavItem): number {
  return item.id === "administrator-home" ? administratorPendingCount.value : 0;
}
</script>

<template>
  <section
    class="workspace-shell"
    :class="effectiveRole ? `role-${effectiveRole}` : ''"
  >
    <aside class="workspace-sidebar" aria-label="Основная навигация">
      <a
        class="workspace-brand"
        :href="brandHref"
        @click.prevent="selectBrand"
      >
        <BrandLogo variant="full" size="compact" />
        <span>Здоровье питомца под контролем</span>
      </a>

      <nav v-if="effectiveRole === 'owner'" class="workspace-sidebar-nav owner-navigation">
        <ul class="workspace-nav-tree">
          <li>
            <a
              class="workspace-nav-item"
              :class="{ active: pathActive(ownerRootNavigation.path, ownerRootNavigation.exact) }"
              :href="ownerRootNavigation.path"
              :aria-label="pendingNavigationLabel(ownerRootNavigation.label, ownerPending.total)"
              @click.prevent="selectPath(ownerRootNavigation.path)"
            >
              <AppIcon :name="ownerRootNavigation.icon" />
              <span>{{ ownerRootNavigation.label }}</span>
              <PendingCountBadge :count="ownerPending.total" />
            </a>
            <ul>
              <li v-for="item in ownerChildNavigation" :key="item.id">
                <a
                  class="workspace-nav-item owner-child"
                  :class="{ active: pathActive(item.path, item.exact) }"
                  :href="item.path"
                  :aria-label="pendingNavigationLabel(item.label, item.pendingCount)"
                  @click.prevent="selectPath(item.path)"
                >
                  <AppIcon :name="item.icon" />
                  <span>{{ item.label }}</span>
                  <PendingCountBadge :count="item.pendingCount" />
                </a>
              </li>
            </ul>
          </li>
        </ul>
      </nav>

      <nav v-else-if="effectiveRole === 'administrator'" class="workspace-sidebar-nav">
        <a
          v-for="item in administratorNavigation"
          :key="item.id"
          class="workspace-nav-item"
          :class="{ active: pathActive(item.path, item.exact) }"
          :href="item.path"
          :aria-label="pendingNavigationLabel(item.label, administratorItemPendingCount(item))"
          @click.prevent="selectPath(item.path)"
        >
          <AppIcon :name="item.icon" />
          <span>{{ item.label }}</span>
          <PendingCountBadge :count="administratorItemPendingCount(item)" />
        </a>
      </nav>

      <nav v-else-if="effectiveRole === 'doctor'" class="workspace-sidebar-nav">
        <a v-for="item in doctorNavigation" :key="item.id" class="workspace-nav-item" :class="{ active: pathActive(item.path, item.exact) }" :href="item.path" @click.prevent="selectPath(item.path)">
          <AppIcon :name="item.icon" /><span>{{ item.label }}</span>
        </a>
      </nav>

      <nav v-else class="workspace-sidebar-nav">
        <a
          v-for="item in navigation"
          :key="item.id"
          class="workspace-nav-item"
          :class="{ active: !settings && activeSection === item.id }"
          :href="settings && effectiveRole ? `${roleHomePath(effectiveRole)}#${item.id}` : `#${item.id}`"
          @click.prevent="selectSection(item.id)"
        >
          <AppIcon :name="item.icon" />
          <span>{{ item.label }}</span>
        </a>
      </nav>

      <div class="workspace-sidebar-footer">
        <button class="workspace-nav-item workspace-settings-nav-item" :class="{ active: settings }" type="button" @click="router.push('/profile')">
          <AppIcon name="settings" />
          <span>Настройки</span>
        </button>
        <button class="workspace-nav-item workspace-about-nav-item" :class="{ active: about }" type="button" @click="router.push('/about')">
          <AppIcon name="info" />
          <span>О программе</span>
        </button>
        <button class="workspace-nav-item danger-link" type="button" @click="emit('signOut')">
          <AppIcon name="close" />
          <span>Выйти</span>
        </button>
        <span class="workspace-version">Версия {{ APP_VERSION }}</span>
      </div>
    </aside>

    <main class="workspace-main">
      <header id="workspace-top" class="workspace-topbar" data-workspace-section>
        <div>
          <h1>{{ title }}</h1>
          <p>{{ profileName }}</p>
        </div>
      </header>

      <AppAlert class="workspace-alert" />

      <div class="workspace-content">
        <slot />
      </div>

      <nav
        class="workspace-bottom-nav"
        :class="effectiveRole ? `role-${effectiveRole}` : ''"
        aria-label="Нижняя навигация"
      >
        <template v-if="effectiveRole === 'owner'">
          <button
            class="workspace-role-nav-item"
            :class="{ active: pathActive(ownerRootNavigation.path, ownerRootNavigation.exact) }"
            type="button"
            :title="pendingNavigationLabel(ownerRootNavigation.label, ownerPending.total)"
            :aria-label="pendingNavigationLabel(ownerRootNavigation.label, ownerPending.total)"
            @click="selectPath(ownerRootNavigation.path)"
          >
            <AppIcon :name="ownerRootNavigation.icon" />
            <span>{{ ownerRootNavigation.label }}</span>
            <PendingCountBadge :count="ownerPending.total" />
          </button>
        </template>
        <template v-else-if="effectiveRole === 'administrator'">
          <button
            v-for="item in administratorNavigation"
            :key="item.id"
            class="workspace-role-nav-item"
            :class="{ active: pathActive(item.path, item.exact) }"
            type="button"
            :title="pendingNavigationLabel(item.label, administratorItemPendingCount(item))"
            :aria-label="pendingNavigationLabel(item.label, administratorItemPendingCount(item))"
            @click="selectPath(item.path)"
          >
            <AppIcon :name="item.icon" />
            <span>{{ item.label }}</span>
            <PendingCountBadge :count="administratorItemPendingCount(item)" />
          </button>
        </template>
        <template v-else-if="effectiveRole === 'doctor'">
          <button
            v-for="item in doctorNavigation"
            :key="item.id"
            class="workspace-role-nav-item"
            :class="{ active: pathActive(item.path, item.exact) }"
            type="button"
            :title="item.label"
            :aria-label="item.label"
            @click="selectPath(item.path)"
          >
            <AppIcon :name="item.icon" />
            <span>{{ item.label }}</span>
          </button>
        </template>
        <template v-else>
          <button
            v-for="item in navigation"
            :key="item.id"
            class="workspace-role-nav-item"
            :class="{ active: !settings && activeSection === item.id }"
            type="button"
            :title="item.label"
            :aria-label="item.label"
            @click="selectSection(item.id)"
          >
            <AppIcon :name="item.icon" />
            <span>{{ item.label }}</span>
          </button>
        </template>
        <button
          class="workspace-settings-nav-item"
          :class="{ active: settings }"
          type="button"
          title="Настройки"
          aria-label="Настройки"
          @click="router.push('/profile')"
        >
          <AppIcon name="settings" />
          <span>Настройки</span>
        </button>
        <button
          class="workspace-about-nav-item"
          :class="{ active: about }"
          type="button"
          title="О программе"
          aria-label="О программе"
          @click="router.push('/about')"
        >
          <AppIcon name="info" />
          <span>О программе</span>
        </button>
        <button
          class="danger-link"
          type="button"
          title="Выйти"
          aria-label="Выйти"
          @click="emit('signOut')"
        >
          <AppIcon name="close" />
          <span>Выйти</span>
        </button>
      </nav>
    </main>
  </section>
</template>
