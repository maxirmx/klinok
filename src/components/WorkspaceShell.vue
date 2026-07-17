<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { Role } from "@klinok/protocol";
import packageJson from "../../package.json";
import AppIcon from "./AppIcon.vue";
import BrandLogo from "./BrandLogo.vue";
import SyncStatus from "./SyncStatus.vue";
import { appState } from "../appStore";
import { roleHomePath } from "../roleNavigation";

type WorkspaceIcon = "home" | "pets" | "plus" | "user" | "book" | "bell" | "eye" | "medical-tools";
type WorkspaceNavItem = { id: string; label: string; icon: WorkspaceIcon };

const props = defineProps<{
  role: Role | null;
  title: string;
  profileName: string;
  settings?: boolean;
}>();

const emit = defineEmits<{ signOut: [] }>();
const route = useRoute();
const router = useRouter();
const activeSection = ref(route.hash.slice(1) || "workspace-top");

const navigationByRole: Record<Role, WorkspaceNavItem[]> = {
  administrator: [
    { id: "workspace-top", label: "Главная страница", icon: "home" },
    { id: "administrator-requests", label: "Заявки", icon: "bell" },
    { id: "administrator-accounts", label: "Аккаунты", icon: "user" },
    { id: "administrator-conflicts", label: "Конфликты", icon: "eye" },
    { id: "administrator-journal", label: "Журнал", icon: "book" },
  ],
  owner: [
    { id: "workspace-top", label: "Главная страница", icon: "home" },
    { id: "owner-add-pet", label: "Добавить", icon: "plus" },
    { id: "owner-pets", label: "Питомцы", icon: "pets" },
    { id: "owner-grant-access", label: "Дать доступ", icon: "user" },
    { id: "owner-active-access", label: "Доступы", icon: "eye" },
    { id: "owner-records", label: "Медкарта", icon: "book" },
  ],
  doctor: [
    { id: "workspace-top", label: "Главная страница", icon: "home" },
    { id: "doctor-request-access", label: "Запросить доступ", icon: "plus" },
    { id: "doctor-pets", label: "Питомцы", icon: "pets" },
    { id: "doctor-new-record", label: "Новая запись", icon: "plus" },
    { id: "doctor-delegation", label: "Делегирование", icon: "user" },
    { id: "doctor-records", label: "Медкарта", icon: "medical-tools" },
  ],
};

const effectiveRole = computed<Role | null>(() => props.role
  ?? (props.settings
    ? appState.activeRole ?? appState.control.roles.find((request) => request.status === "approved")?.role ?? null
    : null));
const navigation = computed(() => effectiveRole.value ? navigationByRole[effectiveRole.value] : []);

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

function ownerPathActive(path: string, exact = false) {
  if (props.settings) return false;
  return exact ? route.path === path : route.path === path || route.path.startsWith(`${path}/`);
}

function selectOwnerPath(path: string) {
  void router.push(path);
}
</script>

<template>
  <section class="workspace-shell">
    <aside class="workspace-sidebar" aria-label="Основная навигация">
      <a class="workspace-brand" :href="settings && effectiveRole ? roleHomePath(effectiveRole) : '#workspace-top'" @click.prevent="selectSection('workspace-top')">
        <BrandLogo variant="full" size="compact" />
        <span>Здоровье питомца под контролем</span>
      </a>

      <nav v-if="effectiveRole === 'owner'" class="workspace-sidebar-nav owner-navigation">
        <ul class="workspace-nav-tree">
          <li>
            <a
              class="workspace-nav-item"
              :class="{ active: ownerPathActive('/owner/home', true) }"
              href="/owner/home"
              @click.prevent="selectOwnerPath('/owner/home')"
            >
              <AppIcon name="home" />
              <span>Главная страница</span>
            </a>
            <ul>
              <li>
                <a
                  class="workspace-nav-item owner-child"
                  :class="{ active: ownerPathActive('/owner/pets/new', true) }"
                  href="/owner/pets/new"
                  @click.prevent="selectOwnerPath('/owner/pets/new')"
                >
                  <AppIcon name="plus" />
                  <span>Добавить питомца</span>
                </a>
              </li>
              <li v-for="pet in appState.medical.pets" :key="pet.petId">
                <a
                  class="workspace-nav-item owner-child"
                  :class="{ active: ownerPathActive(`/owner/pets/${pet.petId}`) }"
                  :href="`/owner/pets/${pet.petId}`"
                  @click.prevent="selectOwnerPath(`/owner/pets/${pet.petId}`)"
                >
                  <AppIcon name="pets" />
                  <span>{{ pet.name }}</span>
                </a>
              </li>
            </ul>
          </li>
        </ul>
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
        <button class="workspace-nav-item" :class="{ active: settings }" type="button" @click="router.push('/profile')">
          <AppIcon name="user" />
          <span>Настройки пользователя</span>
        </button>
        <button class="workspace-nav-item danger-link" type="button" @click="emit('signOut')">
          <AppIcon name="close" />
          <span>Выйти</span>
        </button>
        <span class="workspace-version">Версия {{ packageJson.version }}</span>
      </div>
    </aside>

    <main class="workspace-main">
      <header id="workspace-top" class="workspace-topbar" data-workspace-section>
        <div>
          <h1>{{ title }}</h1>
          <p>{{ profileName }}</p>
        </div>
        <nav class="workspace-account-actions" aria-label="Действия аккаунта">
          <SyncStatus />
          <button v-if="settings && effectiveRole" class="link-action" type="button" @click="router.push(roleHomePath(effectiveRole))">Вернуться в кабинет</button>
          <button v-else class="link-action" type="button" @click="router.push('/profile')">Настройки пользователя</button>
          <button class="link-action" type="button" @click="emit('signOut')">Выйти</button>
        </nav>
      </header>

      <div class="workspace-content">
        <slot />
      </div>

      <nav v-if="effectiveRole === 'owner'" class="workspace-bottom-nav" aria-label="Нижняя навигация">
        <a href="/owner/home" :class="{ active: ownerPathActive('/owner/home', true) }" @click.prevent="selectOwnerPath('/owner/home')">
          <AppIcon name="home" />
          <span>Главная</span>
        </a>
        <a href="/owner/pets/new" :class="{ active: ownerPathActive('/owner/pets/new', true) }" @click.prevent="selectOwnerPath('/owner/pets/new')">
          <AppIcon name="plus" />
          <span>Добавить</span>
        </a>
      </nav>
      <nav v-else class="workspace-bottom-nav" aria-label="Нижняя навигация">
        <a
          v-for="item in navigation"
          :key="item.id"
          :class="{ active: !settings && activeSection === item.id }"
          :href="settings && effectiveRole ? `${roleHomePath(effectiveRole)}#${item.id}` : `#${item.id}`"
          @click.prevent="selectSection(item.id)"
        >
          <AppIcon :name="item.icon" />
          <span>{{ item.label }}</span>
        </a>
      </nav>
    </main>
  </section>
</template>
