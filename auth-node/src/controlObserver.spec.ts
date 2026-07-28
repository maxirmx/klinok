// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it } from "vitest";
import { roleRequestMailText, roleStatusMailText } from "./controlObserver.js";

describe("role status email", () => {
  it("confirms an approved Doctor role in Russian", () => {
    expect(roleStatusMailText("doctor", "approved")).toBe("Ваша роль «Врач» подтверждена.");
  });

  it("confirms an approved Administrator role in Russian", () => {
    expect(roleStatusMailText("administrator", "approved")).toBe("Ваша роль «Администратор» подтверждена.");
  });

  it("uses the same confirmation template for every localized role", () => {
    expect(roleStatusMailText("owner", "approved")).toBe("Ваша роль «Владелец» подтверждена.");
  });

  it.each([
    ["not_requested", "Запрос роли «Врач» отменён."],
    ["pending", "Ваша заявка на роль «Врач» ожидает подтверждения."],
    ["rejected", "Ваша заявка на роль «Врач» отклонена."],
    ["revoked", "Ваша роль «Врач» отозвана."],
  ])("localizes the %s transition", (status, expected) => {
    expect(roleStatusMailText("doctor", status)).toBe(expected);
  });
});

describe("new role request email", () => {
  it("uses the requester's full name and localized Administrator role", () => {
    expect(roleRequestMailText("Анна Сергеевна Иванова", "administrator"))
      .toBe("Пользователь Анна Сергеевна Иванова запросил роль «Администратор».");
  });

  it("uses the localized Doctor role", () => {
    expect(roleRequestMailText("Иван Петров", "doctor"))
      .toBe("Пользователь Иван Петров запросил роль «Врач».");
  });

  it("does not expose the account ID when the profile is unavailable", () => {
    expect(roleRequestMailText(null, "administrator"))
      .toBe("Пользователь с неуказанным ФИО запросил роль «Администратор».");
  });
});
