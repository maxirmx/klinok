// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type { SyncNotification, SyncNotificationAction, SyncReasonKey } from "./repositories/offlineStore";

const SYNC_REASONS = {
  permission: "Для этого изменения недостаточно действующих прав. Локальные данные возвращены в предыдущее состояние.",
  parent: "Связанное изменение не найдено. Локальные данные возвращены в предыдущее состояние.",
  size: "Изменение превышает допустимый размер. Локальные данные возвращены в предыдущее состояние.",
  invalid: "Данные изменения не прошли проверку. Локальные данные возвращены в предыдущее состояние.",
  unknown: "Не удалось сохранить изменение. Локальные данные возвращены в предыдущее состояние.",
} as const satisfies Record<SyncReasonKey, string>;

const SYNC_ACTIONS = {
  return: "Вернуться к записи",
  permissions: "Проверить права",
  none: "",
} as const satisfies Record<SyncNotificationAction, string>;

const EVENT_LABELS: Record<string, string> = {
  "profile.updated": "Изменение профиля",
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
  "transfer.requested": "Запрос передачи питомца",
  "transfer.completed": "Передача питомца",
  "transfer.rejected": "Отклонение передачи питомца",
  "transfer.cancelled": "Отмена передачи питомца",
  "transfer.invalidated": "Инвалидация передачи питомца",
};

const AUTH_ERRORS: Record<string, string> = {
  RATE_LIMITED: "Слишком много запросов. Повторите попытку позже.",
  AUTH_REQUIRED: "Необходимо войти в аккаунт.",
  SESSION_INVALID: "Сеанс завершён. Войдите в систему снова.",
  VALIDATION_FAILED: "Проверьте введённые данные.",
  CSRF_REJECTED: "Защитный токен недействителен. Обновите страницу и повторите попытку.",
  CSRF_INVALID: "Защитный токен недействителен. Обновите страницу и повторите попытку.",
  ORIGIN_REJECTED: "Запрос с другого сайта отклонён.",
  ORIGIN_INVALID: "Запрос с другого сайта отклонён.",
  REGISTRATION_INVALID: "Проверьте регистрационные данные и согласия.",
  CONSENT_REQUIRED: "Подтвердите согласие с условиями использования.",
  LEGAL_VERSION_MISMATCH: "Условия использования обновились. Ознакомьтесь с ними и повторите регистрацию.",
  EMAIL_DELIVERY_FAILED: "Письмо для подтверждения не отправлено. Проверьте адрес электронной почты и повторите регистрацию. Если адрес верен, повторите попытку позже.",
  VERIFICATION_TOKEN_INVALID: "Ссылка подтверждения недействительна или устарела.",
  LOGIN_FAILED: "Неверная электронная почта или пароль.",
  INVALID_CREDENTIALS: "Неверная электронная почта или пароль.",
  EMAIL_NOT_VERIFIED: "Сначала подтвердите электронную почту.",
  PASSWORD_INVALID: "Пароль должен содержать от 6 до 128 символов.",
  RESET_TOKEN_INVALID: "Ссылка восстановления недействительна или устарела.",
  TOKEN_INVALID: "Ссылка недействительна или устарела.",
  PROFILE_INVALID: "Имя и фамилия обязательны.",
  DIRECTORY_PROFILE_INVALID: "Имя и фамилия обязательны.",
  DIRECTORY_ROLE_REQUIRED: "Требуется подтверждённая роль владельца или врача.",
  ADMINISTRATOR_ROLE_REQUIRED: "Требуется подтверждённая роль администратора.",
  ADMINISTRATOR_REQUIRED: "Требуется подтверждённая роль администратора.",
  ACTIVE_ROLE_MISMATCH: "Операция недоступна для выбранной роли.",
  ROLE_REQUIRED: "Требуется подтверждённая активная роль.",
  ROLE_ALREADY_ACTIVE: "Роль уже подтверждена или ожидает решения.",
  ROLE_NOT_PENDING: "Статус заявки уже изменился.",
  ROLE_REQUEST_NOT_FOUND: "Заявка на роль не найдена.",
  BOOTSTRAP_ADMINISTRATOR_REQUIRED: "Изменять профили других пользователей может только начальный администратор.",
  DIRECTORY_USER_NOT_FOUND: "Пользователь не найден в каталоге.",
  PROFILE_NOT_FOUND: "Профиль пользователя не найден.",
  DOCTOR_ROLE_REQUIRED: "Требуется подтверждённая роль врача.",
  OWNER_ROLE_REQUIRED: "Требуется подтверждённая роль владельца.",
  PET_NOT_FOUND: "Питомец с таким идентификатором не найден.",
  PET_SEARCH_INVALID: "Укажите кличку или полный идентификатор питомца.",
  PET_TOMBSTONED: "Питомец уже удалён.",
  OWNER_SCOPE_FORBIDDEN: "Операция доступна только текущему владельцу питомца.",
  PET_GRANT_REQUIRED: "Действующего права на изменение медицинской карты больше нет.",
  DIRECTORY_PET_INVALID: "Вид и кличка обязательны.",
  PET_OWNER_REQUIRED: "Операция доступна только владельцу питомца.",
  EMAIL_INVALID: "Введите корректный адрес электронной почты.",
  CREDENTIALS_UNCHANGED: "Укажите новый адрес или пароль.",
  EMAIL_IN_USE: "Этот адрес электронной почты уже используется.",
  EMAIL_ALREADY_REGISTERED: "Этот адрес электронной почты уже используется.",
  REVISION_CONFLICT: "Данные изменились на другом устройстве. Обновите страницу и повторите действие.",
  BOOTSTRAP_PROTECTED: "Начальный аккаунт администратора нельзя удалить.",
  BOOTSTRAP_ACCOUNT_IMMUTABLE: "Начальный аккаунт администратора нельзя удалить.",
  BOOTSTRAP_ROLE_IMMUTABLE: "Роль начального администратора нельзя изменить.",
  DEVICE_INVALID: "Данные устройства неполны.",
  DEVICE_NAME_INVALID: "Название устройства не должно превышать 80 символов.",
  DEVICE_NOT_FOUND: "Устройство не найдено.",
  ACCESS_ALREADY_GRANTED: "Доступ этому врачу уже предоставлен.",
  ACCESS_ALREADY_REQUESTED: "Запрос доступа уже ожидает решения.",
  ACCESS_REQUEST_NOT_PENDING: "Статус запроса доступа уже изменился.",
  ACCESS_REQUEST_STALE: "Запрос доступа изменился. Обновите список и повторите действие.",
  GRANT_DELEGATION_FORBIDDEN: "Делегирование больше не разрешено или запрошенные права превышают исходные.",
  GRANT_NOT_ACTIVE: "Доступ уже закрыт.",
  CONFIRMED_RECORD_IMMUTABLE: "Подтверждённую медицинскую запись нельзя изменить.",
  RECORD_ALREADY_CONFIRMED: "Медицинская запись уже подтверждена.",
  RECORD_NOT_FOUND: "Медицинская запись не найдена.",
  DEPENDENCY_REJECTED: "Связанное более раннее изменение не было сохранено.",
  OPERATION_ID_REUSED: "Идентификатор операции уже использован для другого изменения.",
  LEDGER_INVALID: "Проверка журнала изменений не пройдена. Изменения временно запрещены.",
  TRANSFER_REQUEST_NOT_FOUND: "Запрос передачи питомца не найден.",
  TRANSFER_REQUEST_NOT_PENDING: "Статус запроса передачи уже изменился.",
  TRANSFER_ALREADY_PENDING: "Передача этого питомца уже ожидает решения.",
  TRANSFER_TARGET_STALE: "Данные питомца или владельца изменились. Обновите результаты поиска.",
  TRANSFER_REQUEST_STALE: "Данные передачи изменились. Запрос признан устаревшим.",
  TRANSFER_TO_SELF: "Нельзя передать питомца самому себе.",
  TRANSFER_OWNER_UNAVAILABLE: "Один из владельцев больше недоступен для передачи.",
  TRANSFER_PARTY_REQUIRED: "Операция доступна только участнику передачи.",
  TRANSFER_INITIATOR_REQUIRED: "Отменить запрос может только его инициатор.",
  TRANSFER_RESPONDER_REQUIRED: "Ответить на запрос может только вторая сторона.",
  TRANSFER_ACCESS_POLICY_OWNER_REQUIRED: "Только новый владелец может выбрать, сохранять ли доступы врачей.",
  OWNERSHIP_LOSS_ACKNOWLEDGEMENT_REQUIRED: "Подтвердите потерю управления профилем и медицинской картой питомца.",
};

export function syncReasonText(reason: SyncReasonKey): string {
  return SYNC_REASONS[reason];
}

export function syncReasonKeyForCode(code: string): SyncReasonKey {
  if (code.includes("ROLE") || code.includes("GRANT") || code.includes("FORBIDDEN") || code.includes("PROOF")) return "permission";
  if (code.includes("PARENT")) return "parent";
  if (code.includes("TOO_LARGE")) return "size";
  if (code.includes("SCHEMA") || code.includes("INVALID") || code.includes("MISMATCH")) return "invalid";
  return "unknown";
}

export function localOperationErrorText(code: string): string {
  if (code === "PET_TOMBSTONED") return "Питомец уже удалён.";
  const messages: Record<SyncReasonKey, string> = {
    permission: "Для этой операции недостаточно действующих прав.",
    parent: "Связанные данные ещё не готовы. Дождитесь синхронизации и повторите попытку.",
    size: "Изменение превышает допустимый размер.",
    invalid: "Данные изменения не прошли проверку.",
    unknown: "Не удалось выполнить операцию.",
  };
  return messages[syncReasonKeyForCode(code)];
}

export function syncActionText(action: SyncNotificationAction): string {
  return SYNC_ACTIONS[action];
}

export function syncOperationText(commandAction: string): string {
  return EVENT_LABELS[commandAction] ?? "Изменение данных";
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
