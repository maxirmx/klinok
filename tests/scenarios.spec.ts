// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";
import QaScenarioMenu from "../src/components/QaScenarioMenu.vue";
import { scenarioRegistry } from "../src/scenarios";
import { routes } from "../src/router";

describe("operational routes", () => {
  it("exposes auth, profile, and final role workspaces", () => {
    const paths = scenarioRegistry.map((scenario) => scenario.path);
    expect(paths).toEqual(expect.arrayContaining([
      "/auth/login", "/auth/register", "/auth/register/consent", "/auth/verify-email", "/about",
      "/profile", "/owner/home", "/owner/pets/new", "/owner/pets/:petId", "/owner/pets/:petId/edit",
      "/owner/pets/:petId/access",
      "/doctor/home", "/admin/home", "/admin/audit",
    ]));
  });

  it("contains no legacy role-first, phone-code, or removed-role routes", () => {
    const text = JSON.stringify(scenarioRegistry);
    expect(text).not.toContain("/auth/role");
    expect(text).not.toContain("/auth/code");
    expect(text).not.toContain("/company/");
    expect(text).not.toContain("/vet/");
    expect(text).not.toContain("/cancel-access");
    expect(scenarioRegistry.every((scenario) => ["issue:25", "issue:34", "issue:96", "owner-pages"].includes(scenario.figmaNodeId))).toBe(true);
  });

  it("keeps the prototype pet-list URL as a compatibility redirect", () => {
    expect(routes.find((route) => route.path === "/owner/pets")?.redirect).toBe("/owner/home");
  });

  it("derives public route metadata from the scenario access policy", () => {
    expect(scenarioRegistry.filter((scenario) => scenario.access === "public").map((scenario) => scenario.path)).toEqual([
      "/auth/login", "/auth/register", "/auth/register/consent", "/auth/verify-email",
      "/auth/forgot-password", "/auth/reset-password", "/about",
    ]);
    scenarioRegistry.forEach((scenario) => {
      expect(routes.find((route) => route.path === scenario.path)?.meta?.public)
        .toBe(scenario.access === "public");
    });
  });

  it("renders and filters the QA scenario menu", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes,
    });
    await router.push("/auth/login");
    const wrapper = mount(QaScenarioMenu, { global: { plugins: [router] } });

    expect(wrapper.get(".qa-panel").attributes("aria-label")).toBe("Тестовые сценарии");
    expect(wrapper.findAll(".qa-row")).toHaveLength(scenarioRegistry.length);
    await wrapper.findAll(".qa-role-filter button").find((button) => button.text() === "Врач")!.trigger("click");
    expect(wrapper.findAll(".qa-row")).toHaveLength(scenarioRegistry.filter((entry) => entry.role === "doctor").length);
    await wrapper.get('button[aria-label="Закрыть меню тестовых сценариев"]').trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
