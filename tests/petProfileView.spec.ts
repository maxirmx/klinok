// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PetProfileView from "../src/components/PetProfileView.vue";
import type { PetProfile } from "../src/repositories/types";

const pet: PetProfile = {
  petId: "pet-1",
  ownerAccountId: "owner-1",
  name: "Буся",
  species: "Собака",
  breed: "Бигль",
  sex: "Интактная самка",
  photoDataUrl: "data:image/png;base64,cGhvdG8=",
  birthDate: "2022-06-17",
  color: "трёхцветный",
  chip: "643094100000001",
  brandMark: "ABC-123",
  latestVaccination: { date: "2026-04-15", name: "Рабикан" },
  weightKg: 11.8,
  notes: "Боится громких звуков",
  keyVersion: 1,
  tombstoned: false,
  updatedAt: "2026-07-21T10:00:00.000Z",
};

describe("PetProfileView", () => {
  it("separates the identity summary from supplemental profile fields", () => {
    const wrapper = mount(PetProfileView, {
      props: {
        pet,
        ownerDisplayName: "Ольга Петровна Владелец",
        ownerAccountId: "owner-1",
      },
      slots: {
        actions: '<button title="Действие" aria-label="Действие">!</button>',
      },
    });

    expect(wrapper.get("img").attributes("alt")).toBe("Фотография питомца Буся");
    const summary = wrapper.get(".owner-pet-profile-details");
    expect(summary.text()).toContain("Буся");
    expect(summary.get(".owner-pet-id").text()).toBe("pet-1");
    expect(summary.text()).toContain("Собака · Бигль");
    expect(summary.text()).toMatch(/\d+ полн(?:ый|ых) (?:год|года|лет) · дата рождения 17\.06\.2022/);
    expect(summary.text()).toContain("Ольга Петровна Владелец");
    expect(summary.get(".owner-pet-owner-id").text()).toBe("owner-1");

    expect(wrapper.findAll(".pet-profile-view-fields dt").map((node) => node.text())).toEqual([
      "Пол", "Окрас", "Номер чипа", "Клеймо", "Последняя вакцинация", "Вес",
    ]);
    expect(wrapper.get(".pet-profile-view-fields").text()).toContain("15.04.2026 · Рабикан");
    expect(wrapper.get(".pet-profile-view-fields").text()).toContain("11.8 кг");
    expect(wrapper.get(".owner-pet-notes").text()).toContain("Боится громких звуков");
    expect(wrapper.get('button[title="Действие"]').attributes("aria-label")).toBe("Действие");
  });

  it("renders the placeholder and fallback values without owner information", () => {
    const wrapper = mount(PetProfileView, {
      props: {
        pet: {
          ...pet,
          photoDataUrl: undefined,
          sex: undefined,
          color: undefined,
          chip: undefined,
          brandMark: undefined,
          latestVaccination: undefined,
          weightKg: undefined,
          notes: undefined,
        },
      },
    });

    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.get(".owner-pet-placeholder").text()).toBe("С");
    expect(wrapper.find(".owner-pet-owner").exists()).toBe(false);
    expect(wrapper.find(".owner-pet-owner-id").exists()).toBe(false);
    expect(wrapper.get(".pet-profile-view-fields").text()).toContain("Не указан");
    expect(wrapper.get(".pet-profile-view-fields").text()).toContain("Нет");
    expect(wrapper.get(".pet-profile-view-fields").text()).toContain("Не указана");
    expect(wrapper.find(".owner-pet-notes").exists()).toBe(false);
  });
});
