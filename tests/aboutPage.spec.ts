// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import packageJson from "../package.json";
import AboutContent from "../src/components/AboutContent.vue";
import AboutScreen from "../src/screens/AboutScreen.vue";

const appMocks = vi.hoisted(() => ({ logout: vi.fn().mockResolvedValue(true) }));

vi.mock("../src/appStore", async () => {
  const { reactive, readonly } = await import("vue");
  const state = reactive({
    activeRole: "owner" as "owner" | "doctor" | "administrator" | null,
    session: { authenticated: false },
    control: {
      profile: { firstName: "Ольга", patronymic: "Петровна", lastName: "Владелец" },
      roles: [],
      allRoles: [],
    },
    medical: { pets: [], accessRequests: [], records: [], confirmedRecordIds: [] },
  });
  return {
    appState: readonly(state),
    logout: appMocks.logout,
    setAboutAuthenticated: (authenticated: boolean) => { state.session.authenticated = authenticated; },
  };
});

async function setAuthenticated(authenticated: boolean) {
  const store = await import("../src/appStore") as typeof import("../src/appStore") & {
    setAboutAuthenticated: (value: boolean) => void;
  };
  store.setAboutAuthenticated(authenticated);
}

async function mountAbout() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/about", component: AboutScreen, props: { scenarioId: "about" } },
      { path: "/auth/login", component: { template: "<div>Вход</div>" } },
      { path: "/owner/home", component: { template: "<div>Питомцы</div>" } },
      { path: "/profile", component: { template: "<div>Настройки</div>" } },
    ],
  });
  await router.push("/about");
  await router.isReady();
  return { router, wrapper: mount(AboutScreen, {
    props: { scenarioId: "about" },
    global: { plugins: [createPinia(), router] },
  }) };
}

beforeEach(async () => {
  await setAuthenticated(false);
  appMocks.logout.mockClear();
});

describe("About page", () => {
  it("renders the issue credits, sponsors, development link, and application version", () => {
    const wrapper = mount(AboutContent, { props: { headingTag: "h1" } });

    expect(wrapper.get("h1").text()).toBe("О программе");
    expect(wrapper.get(".about-version").text()).toBe(`Версия ${packageJson.version}`);
    expect(wrapper.findAll(".about-card h3").map((item) => item.text())).toEqual([
      "Идея", "Дизайн логотипа", "Разработка программы", "Техническая помощь", "Спонсоры",
    ]);
    expect(wrapper.text()).not.toContain("Команда проекта");
    expect(wrapper.findAll(".about-person").map((item) => item.text())).toEqual([
      "Порада Вячеслав", "Королевич Мария Кирилловна", "Самсонов Максим Станиславович",
    ]);
    const developer = wrapper.get('a[href="https://www.sw.consulting"]');
    expect(developer.text()).toBe("Самсонов Максим Станиславович");
    expect(developer.attributes("target")).toBe("_blank");
    const technicalHelp = wrapper.findAll(".about-card")
      .find((card) => card.get("h3").text() === "Техническая помощь")!;
    expect(technicalHelp.findAll("li").map((item) => item.text())).toEqual([
      "Яшина Полина Алексеевна",
      "Радевич Мария Александровна",
      "Шпиньков Дмитрий Владимирович",
      "Шкловская Полина Евгеньевна",
      "Назаренко Елена Алексеевна",
      "Имберт Габриэла Сергеевна",
    ]);
    expect(wrapper.get(".about-sponsors").text()).toContain("Маликов Иван Андреевичведущий, блогер, инфлюенсер");
    expect(wrapper.get(".about-sponsors").findAll("li")).toHaveLength(6);
  });

  it("is reachable before sign-in and returns to the login page", async () => {
    const { router, wrapper } = await mountAbout();

    expect(wrapper.get(".about-public-shell h1").text()).toBe("О программе");
    expect(wrapper.get(".about-public-nav a").attributes("href")).toBe("/auth/login");
    await wrapper.get(".about-public-nav a").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/auth/login");
  });

  it("uses the role workspace with active desktop and compact mobile navigation after sign-in", async () => {
    await setAuthenticated(true);
    const { router, wrapper } = await mountAbout();

    expect(wrapper.get(".workspace-topbar h1").text()).toBe("О программе");
    expect(wrapper.get(".workspace-topbar p").text()).toBe("Ольга Петровна Владелец");
    expect(wrapper.get(".workspace-sidebar-footer .workspace-about-nav-item").classes()).toContain("active");
    const mobileAbout = wrapper.get('.workspace-bottom-nav button[aria-label="О программе"]');
    expect(mobileAbout.attributes("title")).toBe("О программе");
    expect(mobileAbout.classes()).toContain("active");
    expect(wrapper.get(".workspace-brand").attributes("href")).toBe("/owner/home");
    await wrapper.get(".workspace-sidebar-footer .workspace-about-nav-item").trigger("click");
    await mobileAbout.trigger("click");

    await wrapper.get(".workspace-sidebar-footer .danger-link").trigger("click");
    await flushPromises();
    expect(appMocks.logout).toHaveBeenCalledOnce();
    expect(router.currentRoute.value.path).toBe("/auth/login");
  });

  it("returns from the authenticated page to the active role home through the brand", async () => {
    await setAuthenticated(true);
    const { router, wrapper } = await mountAbout();

    await wrapper.get(".workspace-brand").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/owner/home");
  });
});
