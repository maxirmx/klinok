// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it } from "vitest";
import {
  authErrorText,
  russianPlural,
  syncActionText,
  syncNotificationText,
  syncOperationText,
  syncReasonKeyForCode,
} from "../src/russianMessages";

describe("русские пользовательские сообщения", () => {
  it("maps synchronization codes without exposing backend prose", () => {
    expect(syncReasonKeyForCode("EVENT_PARENT_MISSING")).toBe("parent");
    expect(syncReasonKeyForCode("ROLE_DECISION_FORBIDDEN")).toBe("permission");
    expect(syncReasonKeyForCode("EVENT_TOO_LARGE")).toBe("size");
    expect(syncReasonKeyForCode("DATABASE_MISMATCH")).toBe("invalid");
    expect(syncOperationText("medical.record.created")).toBe("Создание медицинской записи");
    expect(syncActionText("permissions")).toBe("Проверить права");
    expect(syncNotificationText({ reasonKey: "unknown", diagnosticId: "diagnostic-1" }))
      .toBe("Не удалось сохранить изменение. Локальные данные возвращены в предыдущее состояние. Код диагностики: diagnostic-1.");
  });

  it("maps known authentication errors and uses a Russian fallback for unknown codes", () => {
    expect(authErrorText("EMAIL_DELIVERY_FAILED"))
      .toBe("Письмо для подтверждения не отправлено. Проверьте адрес электронной почты и повторите регистрацию. Если адрес верен, повторите попытку позже.");
    expect(authErrorText("UNRECOGNIZED_BACKEND_CODE"))
      .toBe("Сервис не смог выполнить операцию. Повторите попытку позже.");
  });

  it("handles Russian singular, paucal, plural, and exceptional teens", () => {
    const forms = ["уведомление", "уведомления", "уведомлений"] as const;
    expect(russianPlural(1, forms)).toBe("уведомление");
    expect(russianPlural(2, forms)).toBe("уведомления");
    expect(russianPlural(5, forms)).toBe("уведомлений");
    expect(russianPlural(11, forms)).toBe("уведомлений");
    expect(russianPlural(21, forms)).toBe("уведомление");
    expect(russianPlural(24, forms)).toBe("уведомления");
  });
});
