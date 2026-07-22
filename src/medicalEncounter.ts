// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type {
  FreeTextSectionValue,
  GeneralDataSectionValue,
  MedicalEncounterSectionKind,
  MedicalRecordDraft,
  WhatHappenedSectionValue,
} from "./repositories/types";

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
  vaccination: "Вакцинация",
  recommendations: "Рекомендации",
  "laboratory-tests": "Лабораторные исследования",
  "instrumental-tests": "Инструментальные исследования",
  procedures: "Манипуляции",
  outcome: "Исход",
};

export const OPTIONAL_ENCOUNTER_SECTION_KINDS = (Object.keys(ENCOUNTER_SECTION_LABELS) as MedicalEncounterSectionKind[])
  .filter((kind) => kind !== "what-happened");

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

export function sectionSearchText(value: unknown): string {
  if (isFreeTextValue(value)) return value.text;
  if (isGeneralDataValue(value)) return generalDataMeasurements(value).map((item) => `${item.label} ${item.value}`).join(" ");
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
