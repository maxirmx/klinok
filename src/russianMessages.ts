// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type { SyncNotification, SyncNotificationAction, SyncReasonKey } from "./repositories/eventTransport";

const SYNC_REASONS = {
  device: "Устройство не прошло проверку. Локальные данные возвращены в предыдущее состояние.",
  permission: "Для этого изменения недостаточно действующих прав. Локальные данные возвращены в предыдущее состояние.",
  parent: "Связанное изменение не найдено. Локальные данные возвращены в предыдущее состояние.",
  signature: "Подлинность изменения не подтверждена. Локальные данные возвращены в предыдущее состояние.",
  size: "Изменение превышает допустимый размер. Локальные данные возвращены в предыдущее состояние.",
  invalid: "Данные изменения не прошли проверку. Локальные данные возвращены в предыдущее состояние.",
  unknown: "Не удалось сохранить изменение. Локальные данные возвращены в предыдущее состояние.",
} as const satisfies Record<SyncReasonKey, string>;

const SYNC_ACTIONS = {
  return: "Вернуться к записи",
  device: "Настроить устройство",
  permissions: "Проверить права",
  none: "",
} as const satisfies Record<SyncNotificationAction, string>;

const EVENT_LABELS: Record<string, string> = {
  "profile.updated": "Изменение профиля",
  "device.attested": "Подтверждение устройства",
  "device.rotated": "Обновление ключей устройства",
  "device.revoked": "Отзыв устройства",
  "role.requested": "Запрос роли",
  "role.resubmitted": "Повторный запрос роли",
  "role.approved": "Подтверждение роли",
  "role.rejected": "Отклонение роли",
  "role.cancelled": "Отмена запроса роли",
  "pet.created": "Создание профиля питомца",
  "pet.updated": "Изменение профиля питомца",
  "pet.tombstoned": "Удаление профиля питомца",
  "grant.requested": "Запрос доступа к питомцу",
  "grant.created": "Предоставление доступа к питомцу",
  "grant.delegated": "Передача доступа к питомцу",
  "grant.revoked": "Отзыв доступа к питомцу",
  "medical.record.created": "Создание медицинской записи",
  "medical.record.updated": "Изменение медицинской записи",
  "medical.record.deleted": "Удаление медицинской записи",
  "medical.record.confirmed": "Подтверждение медицинской записи",
  "medical.addendum.created": "Добавление комментария к медицинской записи",
};

const AUTH_ERRORS: Record<string, string> = {
  RATE_LIMITED: "Слишком много запросов. Повторите попытку позже.",
  AUTH_REQUIRED: "Необходимо войти в аккаунт.",
  CSRF_REJECTED: "Защитный токен недействителен. Обновите страницу и повторите попытку.",
  ORIGIN_REJECTED: "Запрос с другого сайта отклонён.",
  REGISTRATION_INVALID: "Проверьте регистрационные данные и согласия.",
  EMAIL_DELIVERY_FAILED: "Письмо для подтверждения не отправлено. Проверьте адрес электронной почты и повторите регистрацию. Если адрес верен, повторите попытку позже.",
  VERIFICATION_TOKEN_INVALID: "Ссылка подтверждения недействительна или устарела.",
  LOGIN_FAILED: "Неверная электронная почта или пароль.",
  EMAIL_NOT_VERIFIED: "Сначала подтвердите электронную почту.",
  ACTIVE_DEVICE_REQUIRED: "Для этой операции требуется действующее устройство.",
  USER_KEY_SET_NOT_FOUND: "Серверная копия ключей ещё не создана.",
  USER_KEY_SET_MISMATCH: "Ключи не соответствуют сертификату устройства.",
  USER_KEY_SET_INVALID: "Набор ключей пользователя недействителен.",
  USER_KEY_SET_STALE: "Нельзя использовать устаревшую версию ключей.",
  PASSWORD_INVALID: "Пароль должен содержать от 6 до 128 символов.",
  RESET_TOKEN_INVALID: "Ссылка восстановления недействительна или устарела.",
  PROFILE_INVALID: "Имя и фамилия обязательны.",
  DIRECTORY_PROFILE_INVALID: "Имя и фамилия обязательны.",
  DIRECTORY_ROLE_REQUIRED: "Требуется подтверждённая роль владельца или врача.",
  ADMINISTRATOR_ROLE_REQUIRED: "Требуется подтверждённая роль администратора.",
  BOOTSTRAP_ADMINISTRATOR_REQUIRED: "Изменять профили других пользователей может только начальный администратор.",
  DIRECTORY_USER_NOT_FOUND: "Пользователь не найден в каталоге.",
  DOCTOR_ROLE_REQUIRED: "Требуется подтверждённая роль врача.",
  OWNER_ROLE_REQUIRED: "Требуется подтверждённая роль владельца.",
  PET_NOT_FOUND: "Питомец с таким идентификатором не найден.",
  PET_SEARCH_INVALID: "Укажите кличку или полный идентификатор питомца.",
  PET_PROJECTION_PENDING: "Профиль питомца ещё не подтверждён хранилищем. Повторите попытку.",
  PET_TOMBSTONED: "Питомец уже удалён.",
  DIRECTORY_PET_INVALID: "Вид и кличка обязательны.",
  PROFILE_DIRECTORY_MISSING: "Сначала синхронизируйте профиль владельца.",
  PET_OWNER_REQUIRED: "Операция доступна только владельцу питомца.",
  EMAIL_INVALID: "Введите корректный адрес электронной почты.",
  CREDENTIALS_UNCHANGED: "Укажите новый адрес или пароль.",
  EMAIL_IN_USE: "Этот адрес электронной почты уже используется.",
  BOOTSTRAP_PROTECTED: "Начальный аккаунт администратора нельзя удалить.",
  DEVICE_INVALID: "Данные устройства неполны.",
  DEVICE_NAME_INVALID: "Название устройства не должно превышать 80 символов.",
  DEVICE_NOT_FOUND: "Устройство не найдено.",
  ENROLLMENT_NOT_FOUND: "Запрос устройства не найден.",
  ENROLLMENT_APPROVAL_INVALID: "Пакет ключей устройства неполон.",
};

export function syncReasonText(reason: SyncReasonKey): string {
  return SYNC_REASONS[reason];
}

export function syncReasonKeyForCode(code: string): SyncReasonKey {
  if (code.includes("DEVICE") || code.includes("KEY_")) return "device";
  if (code.includes("ROLE") || code.includes("GRANT") || code.includes("FORBIDDEN") || code.includes("PROOF")) return "permission";
  if (code.includes("PARENT")) return "parent";
  if (code.includes("SIGNATURE")) return "signature";
  if (code.includes("TOO_LARGE")) return "size";
  if (code.includes("SCHEMA") || code.includes("INVALID") || code.includes("MISMATCH")) return "invalid";
  return "unknown";
}

export function localOperationErrorText(code: string): string {
  if (code === "PET_TOMBSTONED") return "Питомец уже удалён.";
  const messages: Record<SyncReasonKey, string> = {
    device: "Устройство не прошло проверку. Проверьте его состояние в настройках.",
    permission: "Для этой операции недостаточно действующих прав.",
    parent: "Связанные данные ещё не готовы. Дождитесь синхронизации и повторите попытку.",
    signature: "Не удалось подтвердить подлинность изменения.",
    size: "Изменение превышает допустимый размер.",
    invalid: "Данные изменения не прошли проверку.",
    unknown: "Не удалось выполнить операцию.",
  };
  return messages[syncReasonKeyForCode(code)];
}

export function syncActionText(action: SyncNotificationAction): string {
  return SYNC_ACTIONS[action];
}

export function syncOperationText(eventType: string): string {
  return EVENT_LABELS[eventType] ?? "Изменение данных";
}

export function syncNotificationText(notification: Readonly<Pick<SyncNotification, "reasonKey" | "diagnosticId">>): string {
  if (notification.reasonKey === "unknown") {
    return `${syncReasonText(notification.reasonKey)} Код диагностики: ${notification.diagnosticId}.`;
  }
  return syncReasonText(notification.reasonKey);
}

export function authErrorText(code: string): string {
  return AUTH_ERRORS[code] ?? "Сервис не смог выполнить операцию. Повторите попытку позже.";
}

export function russianPlural(count: number, forms: readonly [string, string, string]): string {
  const remainder100 = Math.abs(count) % 100;
  const remainder10 = remainder100 % 10;
  if (remainder100 >= 11 && remainder100 <= 19) return forms[2];
  if (remainder10 === 1) return forms[0];
  if (remainder10 >= 2 && remainder10 <= 4) return forms[1];
  return forms[2];
}
