// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import AppCatalogCombobox from "../src/components/AppCatalogCombobox.vue";
import AppIcon from "../src/components/AppIcon.vue";
import PetColorCombobox from "../src/components/PetColorCombobox.vue";

const dogColors = [
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
];

const catColors = [
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
];

let wrapper: VueWrapper | undefined;

function mountCombobox(species: string, modelValue = "") {
  let mounted!: VueWrapper;
  mounted = mount(PetColorCombobox, {
    props: {
      species,
      modelValue,
      "onUpdate:modelValue": (value: string) => mounted.setProps({ modelValue: value }),
    },
  });
  wrapper = mounted;
  return mounted;
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

describe("PetColorCombobox", () => {
  it("toggles and dismisses the complete dog color list accessibly", async () => {
    const field = mountCombobox("Собака");
    const input = field.get<HTMLInputElement>('input[role="combobox"]');
    const toggle = field.get(".app-catalog-toggle");

    expect(field.getComponent(AppCatalogCombobox).exists()).toBe(true);
    expect(input.attributes("aria-autocomplete")).toBe("list");
    expect(input.attributes("aria-expanded")).toBe("false");
    expect(toggle.attributes("title")).toBe("Показать варианты окраса");
    expect(toggle.attributes("aria-label")).toBe("Показать варианты окраса");
    expect(toggle.getComponent(AppIcon).props("name")).toBe("chevron-down");

    await toggle.trigger("click");
    expect(input.attributes("aria-expanded")).toBe("true");
    expect(toggle.attributes("title")).toBe("Скрыть варианты окраса");
    expect(toggle.getComponent(AppIcon).props("name")).toBe("chevron-up");
    expect(field.findAll(".app-catalog-option").map((option) => option.text())).toEqual(dogColors);

    await toggle.trigger("click");
    expect(field.find(".app-catalog-options").exists()).toBe(false);
    expect(toggle.getComponent(AppIcon).props("name")).toBe("chevron-down");

    await toggle.trigger("click");
    await input.trigger("keydown", { key: "Escape" });
    expect(field.find(".app-catalog-options").exists()).toBe(false);

    await toggle.trigger("click");
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(field.find(".app-catalog-options").exists()).toBe(false);
  });

  it("filters cat colors case-insensitively and supports mouse and keyboard selection", async () => {
    const field = mountCombobox("Кошка");
    const input = field.get<HTMLInputElement>('input[role="combobox"]');
    const toggle = field.get(".app-catalog-toggle");

    await toggle.trigger("click");
    expect(field.findAll(".app-catalog-option").map((option) => option.text())).toEqual(catColors);
    await toggle.trigger("click");

    await input.setValue("ПОЙНТ");
    expect(field.findAll(".app-catalog-option").map((option) => option.text())).toEqual([
      "Колор-пойнт",
      "Сил-пойнт",
      "Блю-пойнт",
      "Ред-пойнт",
    ]);
    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "Enter" });
    expect(input.element.value).toBe("Сил-пойнт");
    expect(field.find(".app-catalog-options").exists()).toBe(false);

    await input.setValue("неизвестный");
    expect(field.get(".app-catalog-empty").text()).toBe("Нет подходящих вариантов");
    expect(field.findAll(".app-catalog-option")).toHaveLength(0);

    await input.setValue("");
    await field.findAll(".app-catalog-option").find((option) => option.text() === "Ситцевый")!.trigger("click");
    expect(input.element.value).toBe("Ситцевый");
    expect(field.find(".app-catalog-options").exists()).toBe(false);
  });

  it("preserves manual colors and disables suggestions for other species", async () => {
    const field = mountCombobox("Собака", "трёхцветный");
    const input = field.get<HTMLInputElement>('input[role="combobox"]');
    const toggle = field.get(".app-catalog-toggle");

    await toggle.trigger("click");
    expect(field.get(".app-catalog-empty").text()).toBe("Нет подходящих вариантов");
    await field.setProps({ species: "Другое" });
    expect(input.element.value).toBe("трёхцветный");
    expect(field.find(".app-catalog-options").exists()).toBe(false);
    expect(toggle.attributes("disabled")).toBeDefined();
    expect(toggle.attributes("title")).toBe("Для выбранного вида нет списка окрасов");
    expect(toggle.attributes("aria-label")).toBe("Для выбранного вида нет списка окрасов");

    await input.setValue("радужный");
    expect(input.element.value).toBe("радужный");
    expect(field.find(".app-catalog-options").exists()).toBe(false);
  });
});
