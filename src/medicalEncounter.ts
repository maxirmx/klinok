// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type {
  DiagnosisSectionValue,
  DiagnosisTaxonomyId,
  FreeTextSectionValue,
  GeneralDataSectionValue,
  MedicalEncounterSectionKind,
  MedicalRecordDraft,
  OutcomeSectionValue,
  VaccinationSectionValue,
  WhatHappenedSectionValue,
} from "./repositories/types";
import {
  DIAGNOSIS_CATALOG_OPTIONS,
  isDiagnosisTaxonomyId,
} from "./repositories/types";
import {
  isTherapeuticAppointmentValue,
  therapeuticAppointmentSearchText,
} from "./therapeuticAppointment";

export interface GeneralDataDraft {
  weightKg: string | number;
  temperatureC: string | number;
  heartRateBpm: string | number;
  respiratoryRatePerMinute: string | number;
  systolicMmHg: string | number;
  diastolicMmHg: string | number;
  meanMmHg: string | number;
}

export type GeneralDataDraftField = keyof GeneralDataDraft | "section" | "bloodPressure";
export type GeneralDataDraftErrors = Partial<Record<GeneralDataDraftField, string>>;

export interface VaccinationDraft {
  previousVaccinationDate: string;
  previousVaccineName: string;
  previousVaccinationComplications: "" | "yes" | "no";
  currentVaccineName: string;
  currentVaccineBatch: string;
  currentVaccineExpiresOn: string;
  chipNumber: string;
  administrationSite: string;
  nextRevaccinationDate: string;
}

export type DiagnosisInputMode = "catalog" | "custom";

export interface DiagnosisDraft {
  preliminaryMode: DiagnosisInputMode;
  preliminarySelectedId: string;
  preliminaryCustomText: string;
  differentialSelectedIds: string[];
  differentialCustomTexts: string[];
  confirmedMode: DiagnosisInputMode;
  confirmedSelectedId: string;
  confirmedCustomText: string;
}

export type DiagnosisDraftField = "preliminary" | "differential" | "confirmed";
export type DiagnosisDraftErrors = Partial<Record<DiagnosisDraftField, string>>;

export type RevaccinationInterval = "days-14" | "month-1" | "months-4" | "months-6" | "months-12" | "next-birthday";

export const REVACCINATION_INTERVAL_OPTIONS: ReadonlyArray<{ value: RevaccinationInterval; label: string }> = [
  { value: "days-14", label: "Через 14 дней" },
  { value: "month-1", label: "Через месяц" },
  { value: "months-4", label: "Через 4 месяца" },
  { value: "months-6", label: "Через полгода" },
  { value: "months-12", label: "Через год" },
  { value: "next-birthday", label: "В следующий день рождения" },
];

export type VaccinationDraftField = keyof VaccinationDraft | "section";
export type VaccinationDraftErrors = Partial<Record<VaccinationDraftField, string>>;

export interface WhatHappenedOption {
  id: string;
  label: string;
  children?: WhatHappenedOption[];
}

const leaves = (prefix: string, labels: string[]): WhatHappenedOption[] => labels.map((label, index) => ({
  id: `${prefix}.${index + 1}`,
  label,
}));

export const WHAT_HAPPENED_TREE: WhatHappenedOption = {
  id: "what-happened",
  label: "Что случилось",
  children: [
    {
      id: "well",
      label: "Всё хорошо, необходимо",
      children: leaves("well", ["Контрольный осмотр", "Чипирование", "Вакцинация", "Стрижка", "Манипуляции", "Транспортировка", "Повторный осмотр"]),
    },
    {
      id: "problem",
      label: "Не всё хорошо с",
      children: [
        { id: "problem.general", label: "Общим состоянием", children: leaves("problem.general", ["Изменилось поведение", "Вялый", "Всё время спит", "Всё время лежит", "Стал агрессивный", "Стал жаловаться, выть, плакать", "Вокализирует при дотрагивании", "Возбуждённый", "Не играет", "Теряет вес", "Набирает вес", "Не набирает вес", "Нарушена ориентация в пространстве", "Натыкается на предметы", "Ходит кругами", "Заваливается на бок", "Шаткость походки", "Ездит на попе"]) },
        { id: "problem.digestive", label: "Пищеварением", children: leaves("problem.digestive", ["Не ест", "Снижен аппетит", "Повышен аппетит", "Извращённый аппетит", "Жажда отсутствует", "Повышенная жажда", "Рвота", "Рвота розовым", "Диарея (понос)", "Запор", "Тужится", "Срыгивает", "Слюнотечение", "Запах из пасти", "Налёт или камень на зубах", "Кровоточивость или воспаление дёсен", "Что-то в пасти", "Что-то под хвостом", "Синий язык", "Красный или алый язык", "Что-то с языком", "Кал с кровью", "Кал со слизью", "Чёрный кал", "Гельминты в кале"]) },
        { id: "problem.respiratory", label: "Дыханием", children: leaves("problem.respiratory", ["Чихает", "Кашляет", "Течёт из носа", "Одышка", "Задыхается"]) },
        { id: "problem.skin", label: "Кожным покровом", children: leaves("problem.skin", ["Чрезмерно вылизывается", "Чешется", "Выгрызает", "Лысеет", "Жирный хвост", "Корочки на коже", "Жирные корочки или струп на коже", "Пятна на коже", "Сыпь на коже", "Участки мокнущей кожи", "Участки облысения", "Трясёт ушами или ухом", "Истечения из ушей или уха", "Мокнет между пальцами", "Уплотнения между пальцами", "Опухание морды", "Уплотнения на коже", "Уплотнение под кожей", "Язва на коже", "Изменение цвета или качества шерсти", "Изменение цвета носа", "Рана", "Ожог", "Кровотечение"]) },
        { id: "problem.urinary", label: "Мочеиспусканием и половой системой", children: leaves("problem.urinary", ["Не может пописать", "Писает не в положенном месте", "Частое мочеиспускание", "Мочеиспускание малыми порциями или по каплям", "Непроизвольное мочеиспускание или недержание", "Моча с кровью", "Моча изменила цвет", "Моча изменила запах", "Большой объём мочи", "Истечение из петли влагалища", "Кричит или вокализирует при мочеиспускании", "Кричит или вокализирует при вязке", "Уплотнение на молочных железах"]) },
        { id: "problem.eyes", label: "Глазами", children: leaves("problem.eyes", ["Слезятся, мокрые дорожки около глаз", "Мутные истечения из глаз", "Щурится", "Глаз закрыт, не открывается", "Не может закрыть глаз", "Травма глаза", "Зрачок расширен", "Зрачки разного размера", "Зрачок сужен", "Ослеп", "Натыкается на предметы"]) },
        { id: "problem.musculoskeletal", label: "Опорно-двигательной системой", children: leaves("problem.musculoskeletal", ["Не наступает на лапу", "Хромает", "Подволакивает конечность", "Заваливается зад", "Не может поднять хвост", "Не запрыгивает на возвышенности", "Вокализирует при дотрагивании", "Не встаёт на тазовые конечности", "Не может опираться на конечности", "Не поднимает шею", "Трясёт головой", "Голова наклонена на бок", "Подёргиваются мышцы", "Судороги"]) },
        {
          id: "problem.laboratory",
          label: "Лабораторными анализами",
          children: [
            { id: "problem.laboratory.cbc", label: "Общеклиническим анализом крови", children: leaves("problem.laboratory.cbc", ["Повышены лейкоциты", "Понижены лейкоциты", "Понижен гематокрит", "Повышен гематокрит", "Повышены эозинофилы", "Понижены тромбоциты"]) },
            { id: "problem.laboratory.biochemistry", label: "Биохимическим анализом крови", children: leaves("problem.laboratory.biochemistry", ["Повышен креатинин", "Повышена мочевина", "Повышен АЛТ", "Повышен билирубин", "Повышена глюкоза", "Повышена ЩФ", "Повышен общий белок", "Повышена ГГТ", "Повышен калий", "Повышен фосфор", "Повышен кальций"]) },
            { id: "problem.laboratory.urine", label: "Анализом мочи", children: leaves("problem.laboratory.urine", ["Повышен белок", "Повышена глюкоза", "Повышена плотность", "Понижена плотность", "Высокий pH", "Низкий pH", "Есть эритроциты", "Есть лейкоциты", "Есть слизь", "Есть кристаллы"]) },
          ],
        },
        { id: "problem.research", label: "Результатами исследований", children: leaves("problem.research", ["По УЗИ", "По рентгену", "По ЭХО сердца", "По МРТ", "По КТ", "По ЭКГ"]) },
      ],
    },
    {
      id: "critical",
      label: "Всё плохо",
      children: leaves("critical", ["Задыхается", "Обильное кровотечение", "Упало с высоты", "Автотравма или сбила машина", "Потерял сознание", "Необходима эвтаназия", "Необходима кремация"]),
    },
  ],
};

export const ENCOUNTER_SECTION_LABELS: Record<MedicalEncounterSectionKind, string> = {
  "what-happened": "Что случилось",
  "general-data": "Общие данные/Габитус",
  "therapeutic-appointment": "Терапевтический приём",
  diagnosis: "Диагноз",
  vaccination: "Вакцинация/чипирование",
  recommendations: "Рекомендации",
  "laboratory-tests": "Лабораторные исследования",
  "instrumental-tests": "Инструментальные исследования",
  procedures: "Манипуляции",
  outcome: "Исход",
};

export const OPTIONAL_ENCOUNTER_SECTION_KINDS = (Object.keys(ENCOUNTER_SECTION_LABELS) as MedicalEncounterSectionKind[])
  .filter((kind) => kind !== "what-happened" && kind !== "outcome");

export const OUTCOME_OPTIONS = [
  { id: "outcome.no-observation", label: "Без наблюдения" },
  { id: "outcome.observation", label: "В стадии наблюдения" },
  { id: "outcome.examination", label: "В стадии обследования" },
  { id: "outcome.recovery", label: "Выздоровление" },
  { id: "outcome.improvement", label: "Улучшение" },
  { id: "outcome.deterioration", label: "Ухудшение" },
  { id: "outcome.death", label: "Смерть" },
] as const;

const outcomeLabels = new Map<string, string>(OUTCOME_OPTIONS.map((option) => [option.id, option.label]));
const outcomeOrder = new Map<string, number>(OUTCOME_OPTIONS.map((option, index) => [option.id, index]));
const outcomeConflictPairs = new Set([
  ...OUTCOME_OPTIONS.filter((option) => option.id !== "outcome.death")
    .map((option) => ["outcome.death", option.id].sort().join("|")),
  ["outcome.no-observation", "outcome.observation"].sort().join("|"),
  ["outcome.no-observation", "outcome.examination"].sort().join("|"),
  ["outcome.deterioration", "outcome.improvement"].sort().join("|"),
  ["outcome.deterioration", "outcome.recovery"].sort().join("|"),
]);

export function outcomeLabel(id: string): string {
  return outcomeLabels.get(id) ?? id;
}

export function outcomeIdsConflict(left: string, right: string): boolean {
  return left !== right && outcomeConflictPairs.has([left, right].sort().join("|"));
}

export function canonicalOutcomeIds(ids: readonly string[]): string[] {
  return [...ids].sort((left, right) => (outcomeOrder.get(left) ?? Number.MAX_SAFE_INTEGER)
    - (outcomeOrder.get(right) ?? Number.MAX_SAFE_INTEGER));
}

export function replaceConflictingOutcome(ids: readonly string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter((selectedId) => selectedId !== id);
  return canonicalOutcomeIds([...ids.filter((selectedId) => !outcomeIdsConflict(selectedId, id)), id]);
}

export function outcomeValidationError(value: unknown): string {
  if (!value || typeof value !== "object" || !("selectedIds" in value) || !("comment" in value) ||
    !Array.isArray((value as OutcomeSectionValue).selectedIds) || typeof (value as OutcomeSectionValue).comment !== "string") {
    return "Заполните раздел «Исход».";
  }
  const ids = (value as OutcomeSectionValue).selectedIds;
  if (!ids.length) return "В разделе «Исход» выберите хотя бы один вариант.";
  if (ids.some((id) => typeof id !== "string" || !outcomeLabels.has(id))) return "Раздел «Исход» содержит неизвестный вариант.";
  if (new Set(ids).size !== ids.length) return "Раздел «Исход» содержит повторяющийся вариант.";
  if (ids.some((id, index) => ids.slice(index + 1).some((other) => outcomeIdsConflict(id, other)))) {
    return "Раздел «Исход» содержит несовместимые варианты.";
  }
  return "";
}

export function isOutcomeValue(value: unknown): value is OutcomeSectionValue {
  return !outcomeValidationError(value);
}

export function normalizeOutcomeValue(value: OutcomeSectionValue): OutcomeSectionValue {
  return { selectedIds: canonicalOutcomeIds(value.selectedIds), comment: value.comment.trim() };
}

export function outcomeSummary(value: unknown): string {
  if (isOutcomeValue(value)) {
    return [...value.selectedIds.map(outcomeLabel), value.comment.trim()].filter(Boolean).join("; ");
  }
  return isFreeTextValue(value) ? value.text.trim() : "";
}

export function outcomeSelectedIds(value: unknown): readonly string[] {
  return isOutcomeValue(value) ? value.selectedIds : [];
}

export function outcomeComment(value: unknown): string {
  return isOutcomeValue(value) ? value.comment : "";
}

const MAX_DIAGNOSIS_CUSTOM_TEXT_LENGTH = 10_000;
const diagnosisLabels = new Map(DIAGNOSIS_CATALOG_OPTIONS.map((option) => [option.id, option.label]));

function diagnosisChoiceValidationError(value: unknown, required: boolean): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Укажите диагноз.";
  const choice = value as Record<string, unknown>;
  if (choice.selectedId !== undefined && typeof choice.selectedId !== "string") return "Выбран некорректный диагноз.";
  if (typeof choice.customText !== "string") return "Укажите диагноз.";
  const selectedId = typeof choice.selectedId === "string" ? choice.selectedId : "";
  const customText = choice.customText.trim();
  if (selectedId && customText) return "Выберите диагноз из справочника или заполните свободную форму.";
  if (selectedId && !isDiagnosisTaxonomyId(selectedId)) return "Выбран неизвестный диагноз.";
  if (customText.length > MAX_DIAGNOSIS_CUSTOM_TEXT_LENGTH) return "Текст диагноза не должен превышать 10 000 символов.";
  if (required && !selectedId && !customText) return "Укажите подтверждённый диагноз.";
  return "";
}

export function diagnosisValidationError(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Заполните раздел «Диагноз».";
  const diagnosis = value as Record<string, unknown>;
  const preliminaryError = diagnosisChoiceValidationError(diagnosis.preliminary, false);
  if (preliminaryError) return preliminaryError;
  if (!diagnosis.differential || typeof diagnosis.differential !== "object" || Array.isArray(diagnosis.differential)) {
    return "Укажите дифференциальные диагнозы.";
  }
  const differential = diagnosis.differential as Record<string, unknown>;
  if (!Array.isArray(differential.selectedIds)) return "Укажите дифференциальные диагнозы.";
  const hasCustomTexts = "customTexts" in differential;
  const hasLegacyCustomText = "customText" in differential;
  if (hasCustomTexts === hasLegacyCustomText
    || (hasCustomTexts && !Array.isArray(differential.customTexts))
    || (hasLegacyCustomText && typeof differential.customText !== "string")) {
    return "Укажите дифференциальные диагнозы.";
  }
  const selectedIds = differential.selectedIds as unknown[];
  if (selectedIds.some((id) => typeof id !== "string" || !isDiagnosisTaxonomyId(id))) {
    return "Выбран неизвестный дифференциальный диагноз.";
  }
  if (new Set(selectedIds).size !== selectedIds.length) {
    return "Дифференциальные диагнозы не должны повторяться.";
  }
  const customTexts = hasCustomTexts
    ? differential.customTexts as unknown[]
    : [(differential.customText as string).trim()].filter(Boolean);
  if (customTexts.some((text) => typeof text !== "string" || !text.trim())) {
    return "Дифференциальные диагнозы в свободной форме не должны быть пустыми.";
  }
  const normalizedCustomTexts = customTexts.map((text) => (text as string).trim());
  if (new Set(normalizedCustomTexts).size !== normalizedCustomTexts.length) {
    return "Дифференциальные диагнозы в свободной форме не должны повторяться.";
  }
  if (!hasCustomTexts && selectedIds.length && normalizedCustomTexts.length) {
    return "Выберите дифференциальные диагнозы из справочника или заполните свободную форму.";
  }
  if (normalizedCustomTexts.some((text) => text.length > MAX_DIAGNOSIS_CUSTOM_TEXT_LENGTH)) {
    return "Текст дифференциальных диагнозов не должен превышать 10 000 символов.";
  }
  return diagnosisChoiceValidationError(diagnosis.confirmed, true);
}

export function isDiagnosisValue(value: unknown): value is DiagnosisSectionValue {
  return !diagnosisValidationError(value);
}

export function normalizeDiagnosisValue(value: DiagnosisSectionValue): DiagnosisSectionValue {
  return {
    preliminary: {
      ...(value.preliminary.selectedId ? { selectedId: value.preliminary.selectedId } : {}),
      customText: value.preliminary.customText.trim(),
    },
    differential: {
      selectedIds: [...value.differential.selectedIds],
      customTexts: diagnosisDifferentialCustomTexts(value.differential).map((text) => text.trim()),
    },
    confirmed: {
      ...(value.confirmed.selectedId ? { selectedId: value.confirmed.selectedId } : {}),
      customText: value.confirmed.customText.trim(),
    },
  };
}

export function diagnosisLabel(id: string): string {
  return diagnosisLabels.get(id as DiagnosisTaxonomyId) ?? id;
}

export function diagnosisChoiceSummary(value: DiagnosisSectionValue["preliminary"]): string {
  return value.selectedId ? diagnosisLabel(value.selectedId) : value.customText.trim();
}

export function diagnosisDifferentialCustomTexts(value: DiagnosisSectionValue["differential"]): readonly string[] {
  return "customTexts" in value
    ? value.customTexts
    : value.customText.trim() ? [value.customText.trim()] : [];
}

export function diagnosisConfirmedSummary(value: unknown): string {
  return isDiagnosisValue(value) ? diagnosisChoiceSummary(value.confirmed) : "";
}

export function diagnosisSearchText(value: DiagnosisSectionValue): string {
  return [
    diagnosisChoiceSummary(value.preliminary),
    ...value.differential.selectedIds.map(diagnosisLabel),
    ...diagnosisDifferentialCustomTexts(value.differential),
    diagnosisChoiceSummary(value.confirmed),
  ].filter(Boolean).join(" ");
}

export function emptyDiagnosisDraft(): DiagnosisDraft {
  return {
    preliminaryMode: "catalog",
    preliminarySelectedId: "",
    preliminaryCustomText: "",
    differentialSelectedIds: [],
    differentialCustomTexts: [],
    confirmedMode: "catalog",
    confirmedSelectedId: "",
    confirmedCustomText: "",
  };
}

export function diagnosisDraft(value: DiagnosisSectionValue): DiagnosisDraft {
  return {
    preliminaryMode: value.preliminary.selectedId ? "catalog" : value.preliminary.customText ? "custom" : "catalog",
    preliminarySelectedId: value.preliminary.selectedId ?? "",
    preliminaryCustomText: value.preliminary.customText,
    differentialSelectedIds: [...value.differential.selectedIds],
    differentialCustomTexts: [...diagnosisDifferentialCustomTexts(value.differential)],
    confirmedMode: value.confirmed.selectedId ? "catalog" : "custom",
    confirmedSelectedId: value.confirmed.selectedId ?? "",
    confirmedCustomText: value.confirmed.customText,
  };
}

export function parseDiagnosisDraft(draft: DiagnosisDraft): { value?: DiagnosisSectionValue; errors: DiagnosisDraftErrors } {
  const errors: DiagnosisDraftErrors = {};
  const preliminarySelectedId = draft.preliminaryMode === "catalog" ? draft.preliminarySelectedId : "";
  const preliminaryCustomText = draft.preliminaryMode === "custom" ? draft.preliminaryCustomText.trim() : "";
  const differentialSelectedIds = [...new Set(draft.differentialSelectedIds)];
  const differentialCustomTexts = [...new Set(draft.differentialCustomTexts.map((text) => text.trim()).filter(Boolean))];
  const confirmedSelectedId = draft.confirmedMode === "catalog" ? draft.confirmedSelectedId : "";
  const confirmedCustomText = draft.confirmedMode === "custom" ? draft.confirmedCustomText.trim() : "";

  if (preliminarySelectedId && !isDiagnosisTaxonomyId(preliminarySelectedId)) errors.preliminary = "Выбран неизвестный диагноз.";
  if (preliminaryCustomText.length > MAX_DIAGNOSIS_CUSTOM_TEXT_LENGTH) errors.preliminary = "Не больше 10 000 символов.";
  if (differentialSelectedIds.some((id) => !isDiagnosisTaxonomyId(id))) errors.differential = "Выбран неизвестный диагноз.";
  if (differentialCustomTexts.some((text) => text.length > MAX_DIAGNOSIS_CUSTOM_TEXT_LENGTH)) errors.differential = "Не больше 10 000 символов.";
  if (confirmedSelectedId && !isDiagnosisTaxonomyId(confirmedSelectedId)) errors.confirmed = "Выбран неизвестный диагноз.";
  if (confirmedCustomText.length > MAX_DIAGNOSIS_CUSTOM_TEXT_LENGTH) errors.confirmed = "Не больше 10 000 символов.";
  if (!confirmedSelectedId && !confirmedCustomText) errors.confirmed = "Укажите подтверждённый диагноз.";
  if (Object.keys(errors).length) return { errors };

  return {
    value: {
      preliminary: {
        ...(preliminarySelectedId ? { selectedId: preliminarySelectedId as DiagnosisTaxonomyId } : {}),
        customText: preliminaryCustomText,
      },
      differential: {
        selectedIds: differentialSelectedIds as DiagnosisTaxonomyId[],
        customTexts: differentialCustomTexts,
      },
      confirmed: {
        ...(confirmedSelectedId ? { selectedId: confirmedSelectedId as DiagnosisTaxonomyId } : {}),
        customText: confirmedCustomText,
      },
    },
    errors,
  };
}

const paths = new Map<string, string>();
function indexPaths(nodes: WhatHappenedOption[], parents: string[] = []) {
  for (const node of nodes) {
    const path = [...parents, node.label];
    if (!node.children?.length) paths.set(node.id, path.join(" › "));
    else indexPaths(node.children, path);
  }
}
indexPaths(WHAT_HAPPENED_TREE.children ?? []);

export function whatHappenedPath(id: string): string {
  return paths.get(id) ?? id;
}

export function isWhatHappenedValue(value: unknown): value is WhatHappenedSectionValue {
  return Boolean(value && typeof value === "object" && "selectedIds" in value && "comment" in value
    && Array.isArray((value as WhatHappenedSectionValue).selectedIds));
}

export function isFreeTextValue(value: unknown): value is FreeTextSectionValue {
  return Boolean(value && typeof value === "object" && "text" in value && typeof (value as FreeTextSectionValue).text === "string");
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isThreeDigitInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 999;
}

export function generalDataValidationError(value: GeneralDataSectionValue): string {
  const hasMeasurement = value.weightKg !== undefined || value.temperatureC !== undefined ||
    value.heartRateBpm !== undefined || value.respiratoryRatePerMinute !== undefined || value.bloodPressure !== undefined;
  if (!hasMeasurement) return "Заполните хотя бы один показатель в разделе «Общие данные/Габитус».";
  if (value.weightKg !== undefined && !isPositiveFinite(value.weightKg)) return "Укажите положительный вес в килограммах.";
  if (value.temperatureC !== undefined && !isPositiveFinite(value.temperatureC)) return "Укажите положительную температуру.";
  if (value.heartRateBpm !== undefined && !isThreeDigitInteger(value.heartRateBpm)) return "ЧСС должна быть целым числом от 1 до 999.";
  if (value.respiratoryRatePerMinute !== undefined && !isThreeDigitInteger(value.respiratoryRatePerMinute)) return "ЧДД должна быть целым числом от 1 до 999.";
  if (value.bloodPressure) {
    const { systolicMmHg, diastolicMmHg, meanMmHg } = value.bloodPressure;
    if (![systolicMmHg, diastolicMmHg, meanMmHg].every(isThreeDigitInteger)) {
      return "Все значения АД должны быть целыми числами от 1 до 999.";
    }
    if (diastolicMmHg > meanMmHg || meanMmHg > systolicMmHg) {
      return "Для АД должно выполняться: диастолическое ≤ среднее ≤ систолическое.";
    }
  }
  return "";
}

export function isGeneralDataValue(value: unknown): value is GeneralDataSectionValue {
  if (!value || typeof value !== "object" || isFreeTextValue(value)) return false;
  return !generalDataValidationError(value as GeneralDataSectionValue);
}

export function emptyGeneralDataDraft(): GeneralDataDraft {
  return {
    weightKg: "",
    temperatureC: "",
    heartRateBpm: "",
    respiratoryRatePerMinute: "",
    systolicMmHg: "",
    diastolicMmHg: "",
    meanMmHg: "",
  };
}

export function generalDataDraft(value?: GeneralDataSectionValue): GeneralDataDraft {
  return {
    weightKg: value?.weightKg === undefined ? "" : String(value.weightKg),
    temperatureC: value?.temperatureC === undefined ? "" : String(value.temperatureC),
    heartRateBpm: value?.heartRateBpm === undefined ? "" : String(value.heartRateBpm),
    respiratoryRatePerMinute: value?.respiratoryRatePerMinute === undefined ? "" : String(value.respiratoryRatePerMinute),
    systolicMmHg: value?.bloodPressure ? String(value.bloodPressure.systolicMmHg) : "",
    diastolicMmHg: value?.bloodPressure ? String(value.bloodPressure.diastolicMmHg) : "",
    meanMmHg: value?.bloodPressure ? String(value.bloodPressure.meanMmHg) : "",
  };
}

function decimalDraftValue(raw: string | number, field: keyof GeneralDataDraft, label: string, errors: GeneralDataDraftErrors): number | undefined {
  if (!String(raw).trim()) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) errors[field] = `Укажите положительное значение: ${label}.`;
  return value;
}

function integerDraftValue(raw: string | number, field: keyof GeneralDataDraft, label: string, errors: GeneralDataDraftErrors): number | undefined {
  if (!String(raw).trim()) return undefined;
  const value = Number(raw);
  if (!isThreeDigitInteger(value)) errors[field] = `${label}: целое число от 1 до 999.`;
  return value;
}

export function parseGeneralDataDraft(draft: GeneralDataDraft): { value?: GeneralDataSectionValue; errors: GeneralDataDraftErrors } {
  const errors: GeneralDataDraftErrors = {};
  const weightKg = decimalDraftValue(draft.weightKg, "weightKg", "вес", errors);
  const temperatureC = decimalDraftValue(draft.temperatureC, "temperatureC", "температура", errors);
  const heartRateBpm = integerDraftValue(draft.heartRateBpm, "heartRateBpm", "ЧСС", errors);
  const respiratoryRatePerMinute = integerDraftValue(draft.respiratoryRatePerMinute, "respiratoryRatePerMinute", "ЧДД", errors);
  const pressureEntered = [draft.systolicMmHg, draft.diastolicMmHg, draft.meanMmHg].some((item) => String(item).trim());
  let bloodPressure: GeneralDataSectionValue["bloodPressure"];
  if (pressureEntered) {
    if ([draft.systolicMmHg, draft.diastolicMmHg, draft.meanMmHg].some((item) => !String(item).trim())) {
      errors.bloodPressure = "Заполните все три значения артериального давления.";
    }
    const systolicMmHg = integerDraftValue(draft.systolicMmHg, "systolicMmHg", "Систолическое АД", errors);
    const diastolicMmHg = integerDraftValue(draft.diastolicMmHg, "diastolicMmHg", "Диастолическое АД", errors);
    const meanMmHg = integerDraftValue(draft.meanMmHg, "meanMmHg", "Среднее АД", errors);
    if (systolicMmHg !== undefined && diastolicMmHg !== undefined && meanMmHg !== undefined) {
      if (diastolicMmHg > meanMmHg || meanMmHg > systolicMmHg) {
        errors.bloodPressure = "Должно выполняться: диастолическое ≤ среднее ≤ систолическое.";
      } else {
        bloodPressure = { systolicMmHg, diastolicMmHg, meanMmHg };
      }
    }
  }
  if ([weightKg, temperatureC, heartRateBpm, respiratoryRatePerMinute, bloodPressure].every((item) => item === undefined)) {
    errors.section = "Заполните хотя бы один показатель.";
  }
  if (Object.keys(errors).length) return { errors };
  return {
    value: {
      ...(weightKg !== undefined ? { weightKg } : {}),
      ...(temperatureC !== undefined ? { temperatureC } : {}),
      ...(heartRateBpm !== undefined ? { heartRateBpm } : {}),
      ...(respiratoryRatePerMinute !== undefined ? { respiratoryRatePerMinute } : {}),
      ...(bloodPressure ? { bloodPressure } : {}),
    },
    errors,
  };
}

export function generalDataMeasurements(value: GeneralDataSectionValue): Array<{ key: string; label: string; value: string }> {
  return [
    ...(value.weightKg === undefined ? [] : [{ key: "weight", label: "Вес", value: `${value.weightKg} кг` }]),
    ...(value.temperatureC === undefined ? [] : [{ key: "temperature", label: "Температура", value: `${value.temperatureC} °C` }]),
    ...(value.heartRateBpm === undefined ? [] : [{ key: "heart-rate", label: "ЧСС", value: `${value.heartRateBpm} уд/мин` }]),
    ...(value.respiratoryRatePerMinute === undefined ? [] : [{ key: "respiratory-rate", label: "ЧДД", value: `${value.respiratoryRatePerMinute} движ/мин` }]),
    ...(value.bloodPressure ? [{
      key: "blood-pressure",
      label: "АД",
      value: `${value.bloodPressure.systolicMmHg}/${value.bloodPressure.diastolicMmHg} сред. ${value.bloodPressure.meanMmHg} мм рт. ст.`,
    }] : []),
  ];
}

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3]);
}

function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isoDateParts(value: string): { year: number; month: number; day: number } | undefined {
  if (!isIsoDate(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return { year: year!, month: month!, day: day! };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonths(value: string, months: number): string {
  const parts = isoDateParts(value)!;
  const absoluteMonth = parts.year * 12 + parts.month - 1 + months;
  const year = Math.floor(absoluteMonth / 12);
  const month = absoluteMonth - year * 12 + 1;
  return isoDate(year, month, Math.min(parts.day, daysInMonth(year, month)));
}

export function calculateNextRevaccinationDate(
  encounterDate: string,
  interval: RevaccinationInterval,
  birthDate?: string,
): string {
  const encounter = isoDateParts(encounterDate);
  if (!encounter) return "";
  if (interval === "days-14") {
    const result = new Date(Date.UTC(encounter.year, encounter.month - 1, encounter.day + 14));
    return isoDate(result.getUTCFullYear(), result.getUTCMonth() + 1, result.getUTCDate());
  }
  if (interval !== "next-birthday") {
    const months = interval === "month-1" ? 1 : interval === "months-4" ? 4 : interval === "months-6" ? 6 : 12;
    return addMonths(encounterDate, months);
  }
  const birth = birthDate ? isoDateParts(birthDate) : undefined;
  if (!birth) return "";
  const birthdayInYear = (year: number) => isoDate(year, birth.month, Math.min(birth.day, daysInMonth(year, birth.month)));
  const thisBirthday = birthdayInYear(encounter.year);
  return thisBirthday > encounterDate ? thisBirthday : birthdayInYear(encounter.year + 1);
}

export function emptyVaccinationDraft(previous?: { date: string; name: string }): VaccinationDraft {
  return {
    previousVaccinationDate: previous?.date ?? "",
    previousVaccineName: previous?.name ?? "",
    previousVaccinationComplications: "",
    currentVaccineName: "",
    currentVaccineBatch: "",
    currentVaccineExpiresOn: "",
    chipNumber: "",
    administrationSite: "",
    nextRevaccinationDate: "",
  };
}

export function vaccinationDraft(value?: VaccinationSectionValue): VaccinationDraft {
  return {
    previousVaccinationDate: value?.previousVaccinationDate ?? "",
    previousVaccineName: value?.previousVaccineName ?? "",
    previousVaccinationComplications: value?.previousVaccinationComplications === undefined
      ? ""
      : value.previousVaccinationComplications ? "yes" : "no",
    currentVaccineName: value?.currentVaccineName ?? "",
    currentVaccineBatch: value?.currentVaccineBatch ?? "",
    currentVaccineExpiresOn: value?.currentVaccineExpiresOn ?? "",
    chipNumber: value?.chipNumber ?? "",
    administrationSite: value?.administrationSite ?? "",
    nextRevaccinationDate: value?.nextRevaccinationDate ?? "",
  };
}

export function parseVaccinationDraft(draft: VaccinationDraft): { value?: VaccinationSectionValue; errors: VaccinationDraftErrors } {
  const errors: VaccinationDraftErrors = {};
  const previousVaccinationDate = draft.previousVaccinationDate.trim();
  const previousVaccineName = draft.previousVaccineName.trim();
  const currentVaccineName = draft.currentVaccineName.trim();
  const currentVaccineBatch = draft.currentVaccineBatch.trim();
  const currentVaccineExpiresOn = draft.currentVaccineExpiresOn.trim();
  const chipNumber = draft.chipNumber.trim();
  const administrationSite = draft.administrationSite.trim();
  const nextRevaccinationDate = draft.nextRevaccinationDate.trim();
  const currentVaccinationStarted = Boolean(currentVaccineName || currentVaccineBatch || currentVaccineExpiresOn || nextRevaccinationDate);

  if (previousVaccinationDate && !isIsoDate(previousVaccinationDate)) {
    errors.previousVaccinationDate = "Укажите корректную дату предыдущей вакцинации.";
  }
  if (currentVaccineExpiresOn && !isIsoDate(currentVaccineExpiresOn)) {
    errors.currentVaccineExpiresOn = "Укажите корректный срок годности вакцины.";
  }
  if (nextRevaccinationDate && !isIsoDate(nextRevaccinationDate)) {
    errors.nextRevaccinationDate = "Укажите корректную дату следующей ревакцинации.";
  }
  if (currentVaccinationStarted) {
    if (!currentVaccineName) errors.currentVaccineName = "Укажите название нынешней вакцины.";
    if (!currentVaccineBatch) errors.currentVaccineBatch = "Укажите серию и/или номер вакцины.";
    if (!currentVaccineExpiresOn) errors.currentVaccineExpiresOn = "Укажите срок годности вакцины.";
  }
  if (!currentVaccinationStarted && !chipNumber) {
    errors.section = "Заполните данные нынешней вакцинации или номер чипа.";
  }
  if (Object.keys(errors).length) return { errors };

  return {
    value: {
      ...(previousVaccinationDate ? { previousVaccinationDate } : {}),
      ...(previousVaccineName ? { previousVaccineName } : {}),
      ...(draft.previousVaccinationComplications === ""
        ? {}
        : { previousVaccinationComplications: draft.previousVaccinationComplications === "yes" }),
      ...(currentVaccineName ? { currentVaccineName } : {}),
      ...(currentVaccineBatch ? { currentVaccineBatch } : {}),
      ...(currentVaccineExpiresOn ? { currentVaccineExpiresOn } : {}),
      ...(chipNumber ? { chipNumber } : {}),
      ...(administrationSite ? { administrationSite } : {}),
      ...(nextRevaccinationDate ? { nextRevaccinationDate } : {}),
    },
    errors,
  };
}

export function isVaccinationValue(value: unknown): value is VaccinationSectionValue {
  if (!value || typeof value !== "object" || isFreeTextValue(value)) return false;
  const candidate = value as Record<string, unknown>;
  const stringFields = [
    "previousVaccinationDate",
    "previousVaccineName",
    "currentVaccineName",
    "currentVaccineBatch",
    "currentVaccineExpiresOn",
    "chipNumber",
    "administrationSite",
    "nextRevaccinationDate",
  ];
  if (stringFields.some((field) => candidate[field] !== undefined && typeof candidate[field] !== "string")) return false;
  if (candidate.previousVaccinationComplications !== undefined && typeof candidate.previousVaccinationComplications !== "boolean") return false;
  return Boolean(parseVaccinationDraft(vaccinationDraft(candidate as VaccinationSectionValue)).value);
}

export function normalizeVaccinationValue(value: VaccinationSectionValue): VaccinationSectionValue {
  return parseVaccinationDraft(vaccinationDraft(value)).value ?? value;
}

function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

export function vaccinationDetails(value: VaccinationSectionValue): Array<{ key: string; label: string; value: string }> {
  return [
    ...(value.previousVaccinationDate ? [{ key: "previous-date", label: "Дата предыдущей вакцинации", value: formatDate(value.previousVaccinationDate) }] : []),
    ...(value.previousVaccineName ? [{ key: "previous-name", label: "Название предыдущей вакцины", value: value.previousVaccineName }] : []),
    ...(value.previousVaccinationComplications === undefined ? [] : [{
      key: "previous-complications",
      label: "Осложнения после предыдущей вакцинации",
      value: value.previousVaccinationComplications ? "Были" : "Не было",
    }]),
    ...(value.currentVaccineName ? [{ key: "current-name", label: "Название нынешней вакцины", value: value.currentVaccineName }] : []),
    ...(value.currentVaccineBatch ? [{ key: "current-batch", label: "Серия и/или номер вакцины", value: value.currentVaccineBatch }] : []),
    ...(value.currentVaccineExpiresOn ? [{ key: "current-expiry", label: "Срок годности препарата/вакцины", value: formatDate(value.currentVaccineExpiresOn) }] : []),
    ...(value.chipNumber ? [{ key: "chip", label: "Номер чипа", value: value.chipNumber }] : []),
    ...(value.administrationSite ? [{ key: "site", label: "Место введения", value: value.administrationSite }] : []),
    ...(value.nextRevaccinationDate ? [{ key: "next-revaccination", label: "Дата следующей ревакцинации", value: formatDate(value.nextRevaccinationDate) }] : []),
  ];
}

export function sectionSearchText(value: unknown): string {
  if (isOutcomeValue(value)) return outcomeSummary(value);
  if (isDiagnosisValue(value)) return diagnosisSearchText(value);
  if (isFreeTextValue(value)) return value.text;
  if (isTherapeuticAppointmentValue(value)) return therapeuticAppointmentSearchText(value);
  if (isGeneralDataValue(value)) return generalDataMeasurements(value).map((item) => `${item.label} ${item.value}`).join(" ");
  if (isVaccinationValue(value)) return vaccinationDetails(value).map((item) => `${item.label} ${item.value}`).join(" ");
  return "";
}

export function whatHappenedSelectedIds(value: unknown): readonly string[] {
  return isWhatHappenedValue(value) ? value.selectedIds : [];
}

export function whatHappenedComment(value: unknown): string {
  return isWhatHappenedValue(value) ? value.comment : "";
}

export function freeText(value: unknown): string {
  return isFreeTextValue(value) ? value.text : "";
}

export function encounterSummary(record: { sections?: MedicalRecordDraft["sections"]; text?: string }): string {
  const value = record.sections?.["what-happened"]?.value;
  if (!isWhatHappenedValue(value)) return record.text || "Не заполнено";
  const selected = value.selectedIds.map(whatHappenedPath);
  return [...selected, value.comment.trim()].filter(Boolean).join("; ") || "Не заполнено";
}
