// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type {
  TherapeuticAppointmentSectionValue,
  TherapeuticProblemValue,
} from "./repositories/types";

export type TherapeuticTab = "disease" | "life" | "examination" | "recommendations" | "prescriptions";
export type TherapeuticQuestionMode = "single" | "multiple";

export interface TherapeuticOptionDefinition {
  id: string;
  label: string;
}

export interface TherapeuticQuestionDefinition {
  id: string;
  label: string;
  mode: TherapeuticQuestionMode;
  options: readonly TherapeuticOptionDefinition[];
  visibleWhenAny?: readonly string[];
}

export interface TherapeuticCategoryDefinition {
  id: string;
  label: string;
  questions: readonly TherapeuticQuestionDefinition[];
}

export interface TherapeuticSelectionDetail {
  key: string;
  label: string;
  value: string;
}

export interface TherapeuticSelectionGroup {
  key: string;
  label: string;
  details: readonly TherapeuticSelectionDetail[];
}

export interface TherapeuticProblemDraft extends Omit<TherapeuticProblemValue, "medicationIds"> {
  medicationIds: string[];
}

export interface TherapeuticAppointmentDraft {
  diseaseAnamnesis: {
    text: string;
    problems: TherapeuticProblemDraft[];
    selectedIds: string[];
  };
  lifeAnamnesis: {
    text: string;
    selectedIds: string[];
    currentMedications: string;
    allergies: string;
  };
  examination: {
    text: string;
    selectedIds: string[];
  };
  recommendations: string;
  prescriptions: string;
}

export interface TherapeuticAppointmentDraftErrors {
  section?: string;
  tab?: TherapeuticTab;
  problems?: Record<string, string>;
}

type Choice = readonly [key: string, label: string];

function question(
  id: string,
  label: string,
  mode: TherapeuticQuestionMode,
  choices: readonly Choice[],
  visibleWhenAny?: readonly string[],
): TherapeuticQuestionDefinition {
  return {
    id,
    label,
    mode,
    options: choices.map(([key, optionLabel]) => ({ id: `${id}.${key}`, label: optionLabel })),
    ...(visibleWhenAny?.length ? { visibleWhenAny } : {}),
  };
}

function single(id: string, label: string, choices: readonly Choice[], visibleWhenAny?: readonly string[]) {
  return question(id, label, "single", choices, visibleWhenAny);
}

function multiple(id: string, label: string, choices: readonly Choice[], visibleWhenAny?: readonly string[]) {
  return question(id, label, "multiple", choices, visibleWhenAny);
}

export const PROBLEM_ONSET_OPTIONS: readonly TherapeuticOptionDefinition[] = [
  ["today", "Сегодня"], ["hours", "Несколько часов назад"], ["today-morning", "Сегодня утром"],
  ["today-evening", "Сегодня вечером"], ["today-night", "Сегодня ночью"], ["yesterday", "Вчера"],
  ["yesterday-morning", "Вчера утром"], ["yesterday-evening", "Вчера вечером"], ["yesterday-night", "Вчера ночью"],
  ["days-2", "2 дня назад"], ["days-3", "3 дня назад"], ["days-4", "4 дня назад"],
  ["days-5", "5 дней назад"], ["days-6", "6 дней назад"], ["week-1", "Неделю назад"],
  ["weeks-2", "2 недели назад"], ["weeks-3", "3 недели назад"], ["weeks-several", "Несколько недель назад"],
  ["month-1", "Месяц назад"], ["months-2", "2 месяца назад"], ["months-3", "3 месяца назад"],
  ["months-4", "4 месяца назад"], ["months-5", "5 месяцев назад"], ["months-several", "Несколько месяцев назад"],
  ["months-6", "Полгода назад"], ["year-1", "Год назад"], ["year-over-1", "Больше года назад"],
  ["year-1-5", "Полтора года назад"], ["years-2", "2 года назад"], ["years-over-2", "Больше 2 лет назад"],
].map(([key, label]) => ({ id: `problem.onset.${key}`, label })) as TherapeuticOptionDefinition[];

export const PROBLEM_FREQUENCY_OPTIONS: readonly TherapeuticOptionDefinition[] = [
  ["constant", "Постоянно"], ["periodic-regular", "Периодически равномерно"],
  ["periodic-irregular", "Периодически неравномерно"], ["all-day", "Весь день"],
  ["morning", "Утром"], ["evening", "Вечером"], ["night", "Ночью"], ["often", "Часто"], ["rarely", "Редко"],
  ["daily-1", "1 раз в сутки"], ["daily-2-5", "2–5 раз в сутки"], ["daily-5-10", "5–10 раз в сутки"],
  ["daily-over-10", "Более 10 раз в сутки"], ["days-2", "1 раз в 2 дня"], ["days-3", "1 раз в 3 дня"],
  ["weekly-1", "Раз в неделю"], ["weekly-1-2", "1–2 раза в неделю"],
  ["weeks-2-1-2", "1–2 раза в 2 недели"], ["monthly-1", "Раз в месяц"],
  ["monthly-less", "Реже раза в месяц"], ["half-year", "Раз в полгода"], ["yearly-1", "Раз в год"],
  ["yearly-1-2", "1–2 раза в год"],
].map(([key, label]) => ({ id: `problem.frequency.${key}`, label })) as TherapeuticOptionDefinition[];

export const PROBLEM_THERAPY_OPTIONS: readonly TherapeuticOptionDefinition[] = [
  { id: "problem.therapy.none", label: "Не проводилась" },
  { id: "problem.therapy.performed", label: "Проводилась" },
];

export const PROBLEM_MEDICATION_USE_OPTIONS: readonly TherapeuticOptionDefinition[] = [
  { id: "problem.medication.none", label: "Не применялись" },
  { id: "problem.medication.used", label: "Применялись" },
];

export const PROBLEM_MEDICATION_OPTIONS: readonly TherapeuticOptionDefinition[] = [
  ["analgesic", "Обезболивающее"], ["antispasmodic", "Спазмолитик"], ["antibiotic", "Антибиотик"],
  ["nsaid", "НПВС"], ["antiviral", "Противовирусное"], ["anticonvulsant", "Противосудорожное"],
  ["diuretic", "Мочегонное"], ["cardiac", "Сердечное"], ["glucocorticoid", "ГКС/ГПВС"],
].map(([key, label]) => ({ id: `problem.medication.type.${key}`, label })) as TherapeuticOptionDefinition[];

export const PROBLEM_DYNAMICS_OPTIONS: readonly TherapeuticOptionDefinition[] = [
  { id: "problem.dynamics.positive", label: "Положительная" },
  { id: "problem.dynamics.negative", label: "Отрицательная" },
  { id: "problem.dynamics.none", label: "Отсутствовала" },
];

export const DISEASE_ANAMNESIS_CATEGORIES: readonly TherapeuticCategoryDefinition[] = [
  {
    id: "disease.activity", label: "Активность", questions: [
      single("disease.activity.state", "Изменение активности", [["unchanged", "Не изменилась"], ["changed", "Изменилась"]]),
      single("disease.activity.baseline", "Обычная активность", [["active", "Всегда активное"], ["inactive", "Всегда неактивное"]], ["disease.activity.state.unchanged"]),
      single("disease.activity.change", "Как изменилась", [["excited", "Стало более возбуждённым"], ["less-active", "Стало менее активным"], ["lethargic", "Стало более вялым"], ["aggressive", "Стало более агрессивным"], ["affectionate", "Стало более ласковым"], ["sleeps", "Постоянно спит"], ["lies", "Постоянно лежит"]], ["disease.activity.state.changed"]),
    ],
  },
  {
    id: "disease.appetite", label: "Аппетит", questions: [
      single("disease.appetite.state", "Изменение аппетита", [["unchanged", "Не изменился"], ["changed", "Изменился"]]),
      single("disease.appetite.baseline", "Обычный аппетит", [["low", "Всегда снижен"], ["high", "Всегда повышен"]], ["disease.appetite.state.unchanged"]),
      single("disease.appetite.change", "Как изменился", [["down-25", "Снижен на 25%"], ["down-50", "Снижен на 50%"], ["down-75", "Снижен на 75%"], ["increased", "Повышен"], ["absent", "Отсутствует"], ["absent-day", "Отсутствует более суток"], ["absent-days-2", "Отсутствует более 2 суток"]], ["disease.appetite.state.changed"]),
    ],
  },
  {
    id: "disease.water", label: "Потребление жидкости", questions: [
      single("disease.water.state", "Изменение потребления жидкости", [["unchanged", "Не изменено"], ["changed", "Изменено"]]),
      single("disease.water.baseline", "Обычное потребление", [["low", "Всегда мало пьёт"], ["high", "Всегда много пьёт"]], ["disease.water.state.unchanged"]),
      single("disease.water.change", "Как изменилось", [["absent", "Отсутствует"], ["increased", "Повышено"], ["decreased", "Снижено"]], ["disease.water.state.changed"]),
    ],
  },
  {
    id: "disease.defecation", label: "Дефекация", questions: [
      single("disease.defecation.state", "Изменение дефекации", [["unchanged", "Не изменилась"], ["changed", "Изменилась"]]),
      single("disease.defecation.baseline", "Обычная частота", [["twice-day", "Всегда 2 раза в день"], ["daily", "Всегда 1 раз в день"], ["days-2", "Всегда 1 раз в 2 дня"], ["rare", "Всегда редко"]], ["disease.defecation.state.unchanged"]),
      single("disease.defecation.change", "Как изменилась", [["diarrhea-1-2", "Диарея 1–2 раза в сутки"], ["diarrhea-5", "Диарея до 5 раз в сутки"], ["diarrhea-10", "Диарея до 10 раз в сутки"], ["diarrhea-over-10", "Диарея более 10 раз в сутки"], ["absent-1-2", "Не было 1–2 суток"], ["absent-3-5", "Не было 3–5 суток"], ["absent-over-5", "Не было более 5 суток"]], ["disease.defecation.state.changed"]),
    ],
  },
  {
    id: "disease.stool", label: "Кал", questions: [
      single("disease.stool.form", "Консистенция", [["formed", "Сформированный"], ["unformed", "Несформированный"]]),
      single("disease.stool.formed-detail", "Характер сформированного кала", [["dry", "Сухой"], ["sausage", "Колбаской"], ["soft", "Мягкий"]], ["disease.stool.form.formed"]),
      single("disease.stool.unformed-detail", "Характер несформированного кала", [["mushy", "Кашицеобразный"], ["watery", "Водянистый"], ["foamy", "Пенистый"], ["melena", "Мелена"]], ["disease.stool.form.unformed"]),
      multiple("disease.stool.findings", "Примеси", [["blood", "С кровью"], ["mucus", "Со слизью"], ["helminths", "С заметными гельминтами"]]),
    ],
  },
  {
    id: "disease.urination", label: "Мочеиспускание", questions: [
      single("disease.urination.state", "Изменение мочеиспускания", [["unchanged", "Не изменилось"], ["changed", "Изменилось"]]),
      single("disease.urination.baseline", "Обычная частота", [["daily-1-2", "Всегда 1–2 раза в день"], ["daily", "Всегда 1 раз в день"], ["days-2", "Всегда 1 раз в 2 дня"]], ["disease.urination.state.unchanged"]),
      single("disease.urination.change", "Как изменилось", [["absent", "Отсутствует"], ["absent-day", "Отсутствует более суток"], ["absent-days-2", "Отсутствует более 2 суток"], ["dysuria", "Болезненное (дизурия)"], ["pollakiuria", "Частое (поллакиурия)"], ["periuria", "В неположенном месте (периурия)"], ["stranguria", "Непродуктивное, по каплям (странгурия)"]], ["disease.urination.state.changed"]),
    ],
  },
  {
    id: "disease.urine", label: "Моча", questions: [
      single("disease.urine.state", "Общее состояние", [["unchanged", "Без изменений"], ["changed", "Есть изменения"]]),
      single("disease.urine.volume", "Общий суточный объём", [["increased", "Увеличен (полиурия)"], ["decreased", "Уменьшен (олигурия)"], ["absent", "Отсутствует (анурия)"]], ["disease.urine.state.changed"]),
      multiple("disease.urine.quality", "Изменения качества", [["blood", "С кровью"], ["pink", "Розовая"], ["colorless", "Бесцветная"], ["meat-washings", "Цвета мясных помоев"], ["strong-odor", "С сильным запахом"]], ["disease.urine.state.changed"]),
    ],
  },
  {
    id: "disease.vomiting", label: "Рвота", questions: [
      single("disease.vomiting.state", "Наличие рвоты", [["absent", "Отсутствует"], ["present", "Есть"]]),
      single("disease.vomiting.frequency", "Частота", [["rare", "Редко"], ["often", "Часто"]], ["disease.vomiting.state.present"]),
      single("disease.vomiting.rare-count", "Количество при редкой рвоте", [["daily-1-2", "1–2 раза в сутки"]], ["disease.vomiting.frequency.rare"]),
      single("disease.vomiting.often-count", "Количество при частой рвоте", [["daily-3-10", "3–10 раз в сутки"], ["daily-over-10", "Более 10 раз в сутки"]], ["disease.vomiting.frequency.often"]),
      single("disease.vomiting.feeding", "Связь с кормлением", [["before", "В основном до еды"], ["after", "В основном после еды"], ["minutes-after", "Через несколько минут после еды"], ["hours-after", "Через 1–2 часа после еды"], ["unrelated", "Не связана с приёмом корма"]], ["disease.vomiting.state.present"]),
      multiple("disease.vomiting.contents", "Рвотные массы", [["white-clear", "Белые или прозрачные"], ["yellow", "Жёлтые"], ["blood-traces", "Со следами крови"], ["blood", "С кровью"], ["coffee", "Кофейного цвета"], ["undigested", "С непереваренным кормом"], ["partly-digested", "С полупереваренным кормом"], ["foreign", "С инородными предметами или трихобезоарами"], ["helminths", "С гельминтами"]], ["disease.vomiting.state.present"]),
      single("disease.vomiting.foam", "Пенистость светлых или жёлтых масс", [["foamy", "Пенистые"], ["not-foamy", "Не пенистые"]], ["disease.vomiting.contents.white-clear", "disease.vomiting.contents.yellow"]),
    ],
  },
  {
    id: "disease.regurgitation", label: "Регургитация/срыгивание", questions: [
      single("disease.regurgitation.state", "Наличие", [["absent", "Отсутствует"], ["present", "Есть"]]),
      single("disease.regurgitation.frequency", "Частота", [["rare", "Редко"], ["often", "Часто"], ["constant", "Постоянно"]], ["disease.regurgitation.state.present"]),
    ],
  },
  {
    id: "disease.eye-discharge", label: "Истечения из глаз", questions: [
      single("disease.eye-discharge.state", "Наличие", [["absent", "Нет"], ["present", "Есть"]]),
      multiple("disease.eye-discharge.type", "Характер", [["clear", "Прозрачные"], ["cloudy", "Мутные"], ["purulent", "Гнойные"], ["hemorrhagic", "Геморрагические"], ["tear-tracks", "Слёзные дорожки"]], ["disease.eye-discharge.state.present"]),
    ],
  },
  {
    id: "disease.sneezing", label: "Чихание", questions: [
      single("disease.sneezing.state", "Наличие", [["absent", "Нет"], ["present", "Есть"]]),
      single("disease.sneezing.frequency", "Частота", [["rare", "Редко"], ["often", "Часто"]], ["disease.sneezing.state.present"]),
    ],
  },
  {
    id: "disease.nasal-discharge", label: "Истечения из носа", questions: [
      single("disease.nasal-discharge.state", "Наличие", [["absent", "Нет"], ["present", "Есть"]]),
      multiple("disease.nasal-discharge.type", "Характер", [["clear", "Прозрачные"], ["cloudy", "Мутные"], ["purulent", "Гнойные"], ["hemorrhagic", "Геморрагические или кровь"], ["putrid", "Гнилостные (ихорозные)"], ["crusts", "Корки вокруг ноздрей"]], ["disease.nasal-discharge.state.present"]),
    ],
  },
  {
    id: "disease.cough", label: "Кашель", questions: [
      single("disease.cough.state", "Наличие", [["absent", "Отсутствует"], ["present", "Есть"]]),
      single("disease.cough.frequency", "Частота", [["rare", "Редко"], ["often", "Часто"]], ["disease.cough.state.present"]),
      single("disease.cough.rare-count", "Редкий кашель", [["days", "1 раз в несколько дней"], ["daily", "1 раз в день"]], ["disease.cough.frequency.rare"]),
      single("disease.cough.often-count", "Частый кашель", [["daily-2-5", "2–5 раз в день"], ["daily-over-6", "Более 6 раз в день"]], ["disease.cough.frequency.often"]),
      multiple("disease.cough.features", "Особенности", [["paroxysmal", "Приступообразный"], ["excitement", "При возбуждении"], ["position", "Связан с положением тела"], ["dry", "Сухой"], ["sputum", "С отхождением мокроты"]], ["disease.cough.state.present"]),
    ],
  },
  {
    id: "disease.pain", label: "Проявление боли/беспокойства", questions: [
      single("disease.pain.state", "Наличие", [["absent", "Отсутствует"], ["localized", "Есть локально"], ["unlocalized", "Есть без локализации"]]),
      multiple("disease.pain.location", "Локализация", [["muzzle", "Морда"], ["head", "Голова"], ["neck", "Шея"], ["back", "Холка или спина"], ["forelimbs", "Грудные конечности"], ["abdomen", "Живот"], ["lower-back", "Поясница или крестец"], ["hindlimbs", "Тазовые конечности"], ["tail", "Хвост или корень хвоста"]], ["disease.pain.state.localized"]),
    ],
  },
];

export const LIFE_ANAMNESIS_CATEGORIES: readonly TherapeuticCategoryDefinition[] = [
  { id: "life.origin", label: "Где приобрели/откуда взяли", questions: [
    single("life.origin.source", "Источник", [["street", "С улицы"], ["dacha", "На даче"], ["travel", "Привезли из путешествия"], ["breeder", "У заводчика"], ["shelter", "Из приюта"], ["private", "С рук"], ["other-city", "Из другого города"]]),
  ] },
  { id: "life.housing", label: "Содержание", questions: [
    single("life.housing.place", "Где содержится", [["street", "На улице"], ["apartment", "В квартире"], ["house", "В частном доме"], ["shelter", "В приюте"], ["aviary", "В вольере"], ["kennel", "В будке"], ["cage", "В клетке"]]),
    single("life.housing.apartment-walk", "Выгул из квартиры", [["none", "Без выгула"], ["leash", "Выгул на привязи"], ["free", "Свободный выгул"]], ["life.housing.place.apartment"]),
    single("life.housing.house-walk", "Выгул из частного дома", [["none", "Без выгула"], ["yard", "В пределах двора"], ["outside-leash", "За территорией двора на привязи"], ["outside-free", "Свободный выгул за территорией двора"]], ["life.housing.place.house"]),
  ] },
  { id: "life.other-animals", label: "Другие животные", questions: [
    single("life.housing.arrangement", "Как содержится", [["single", "Одиночное содержание"], ["group", "Групповое содержание"], ["crowded", "Мультидом/скученное содержание"]]),
    single("life.housing.group-size", "Количество других животных", [["one-two", "Ещё 1–2 животных"], ["over-three", "Ещё более 3 животных"]], ["life.housing.arrangement.group"]),
    single("life.housing.group-vaccination", "Вакцинация других животных", [["vaccinated", "Вакцинированы"], ["not-vaccinated", "Не вакцинированы"]], ["life.housing.group-size.one-two", "life.housing.group-size.over-three"]),
  ] },
  { id: "life.travel", label: "Где бывает", questions: [
    multiple("life.travel.places", "Места", [["nowhere", "Не выезжает"], ["dacha", "Только на даче"], ["other-apartment", "В другой квартире"], ["other-region", "В другом городе или области"], ["other-country", "В другой стране"]]),
    single("life.travel.dacha-walk", "На даче", [["no-walk", "Без выгула"], ["walk", "С выгулом"]], ["life.travel.places.dacha"]),
    single("life.travel.apartment-frequency", "Другая квартира", [["rare", "Редко"], ["often", "Часто"]], ["life.travel.places.other-apartment"]),
    single("life.travel.region-frequency", "Другой город или область", [["once", "Редко, один раз"], ["several", "Редко, несколько раз"], ["yearly", "Часто, несколько раз в год"], ["constant", "Постоянно в путешествиях"]], ["life.travel.places.other-region"]),
  ] },
  { id: "life.ectoparasites", label: "Обработки от эктопаразитов", questions: [
    single("life.ectoparasites.state", "Проводились ли обработки", [["none", "Нет"], ["yes", "Есть"]]),
    single("life.ectoparasites.none-reason", "Если не проводились", [["never", "Никогда не обрабатывали или не знают"], ["long-ago", "Давно не обрабатывали"]], ["life.ectoparasites.state.none"]),
    single("life.ectoparasites.regularity", "Регулярность", [["regular", "Регулярно"], ["irregular", "Нерегулярно"]], ["life.ectoparasites.state.yes"]),
    single("life.ectoparasites.interval", "Интервал", [["month", "Каждый месяц"], ["quarter", "Каждый квартал"], ["half-year", "Каждые полгода"], ["year", "Каждый год"]], ["life.ectoparasites.regularity.regular"]),
    single("life.ectoparasites.last", "Последний раз", [["unknown", "Неизвестно"], ["days", "Несколько дней назад"], ["days-7-14", "7–14 дней назад"], ["month", "Месяц назад"], ["less-month", "Меньше месяца назад"], ["over-month", "Больше месяца назад"], ["less-half-year", "Меньше полугода назад"], ["half-year", "Полгода назад"], ["over-half-year", "Более полугода назад"]], ["life.ectoparasites.state.yes"]),
    multiple("life.ectoparasites.method", "Чем обрабатывали", [["drops", "Капли на кожу, шею или холку"], ["tablets", "Таблетки"], ["collar", "Ошейник"], ["spray", "Спрей"]], ["life.ectoparasites.state.yes"]),
  ] },
  { id: "life.deworming", label: "Дегельминтизация", questions: [
    single("life.deworming.state", "Проводилась ли", [["none", "Не проводилась"], ["yes", "Проводилась"]]),
    single("life.deworming.none-reason", "Если не проводилась", [["never", "Никогда или не знают"], ["years", "Не проводилась несколько лет"]], ["life.deworming.state.none"]),
    single("life.deworming.regularity", "Регулярность", [["regular", "Регулярно"], ["irregular", "Нерегулярно"]], ["life.deworming.state.yes"]),
    single("life.deworming.interval", "Интервал", [["month", "Каждый месяц"], ["quarter", "Каждый квартал"], ["half-year", "Каждые полгода"], ["year", "Каждый год"]], ["life.deworming.regularity.regular"]),
    single("life.deworming.last", "Последний раз", [["unknown", "Неизвестно"], ["days", "Несколько дней назад"], ["days-7-14", "7–14 дней назад"], ["month", "Месяц назад"], ["months", "Несколько месяцев назад"], ["half-year", "Полгода назад"], ["over-half-year", "Более полугода назад"], ["year", "Год назад"]], ["life.deworming.state.yes"]),
    multiple("life.deworming.method", "Чем обрабатывали", [["tablets", "Таблетки"], ["drops", "Капли на кожу, холку или шею"]], ["life.deworming.state.yes"]),
  ] },
  { id: "life.vaccination", label: "Вакцинация", questions: [
    single("life.vaccination.state", "Статус", [["none", "Не вакцинировано"], ["yes", "Вакцинировано"]]),
    single("life.vaccination.none-reason", "Причина отсутствия", [["never", "Никогда"], ["unknown", "Не знают"], ["unconfirmed", "Нет подтверждения"]], ["life.vaccination.state.none"]),
    single("life.vaccination.regularity", "Регулярность", [["regular", "Регулярно"], ["irregular", "Нерегулярно"]], ["life.vaccination.state.yes"]),
    single("life.vaccination.last", "Последний раз", [["this-year", "В этом году"], ["year", "Год назад"], ["over-year", "Более года назад"], ["years-2-3", "2–3 года назад"]], ["life.vaccination.state.yes"]),
    single("life.vaccination.coverage", "Состав вакцинации", [["complex-rabies", "Комплекс от инфекционных заболеваний и бешенства"], ["complex", "Только от инфекционных заболеваний, без бешенства"], ["rabies", "Только от бешенства"]], ["life.vaccination.state.yes"]),
  ] },
  { id: "life.diet", label: "Рацион", questions: [
    single("life.diet.type", "Тип рациона", [["natural", "Натуральный"], ["commercial", "Промышленный"], ["mixed", "Смешанный: натуральный и промышленный"]]),
    single("life.diet.natural", "Натуральный рацион", [["nutritionist", "Разработан диетологом"], ["self", "Разработан самостоятельно"], ["table", "Со стола"], ["barf", "BARF-рацион"]], ["life.diet.type.natural"]),
    single("life.diet.commercial-purpose", "Промышленный рацион", [["daily", "Повседневный"], ["dietary", "Диетический"]], ["life.diet.type.commercial"]),
    single("life.diet.commercial-form", "Форма промышленного рациона", [["dry", "Только сухой"], ["wet", "Только влажный"], ["mixed", "Сухой и влажный"]], ["life.diet.commercial-purpose.daily", "life.diet.commercial-purpose.dietary"]),
  ] },
  { id: "life.diseases", label: "Перенесённые/сопутствующие заболевания", questions: [
    multiple("life.diseases.types", "Типы заболеваний", [["infectious", "Инфекционные"], ["trauma", "Травма"], ["genetic", "Врождённые генетические"], ["prenatal", "Врождённые внутриутробные"], ["acquired", "Приобретённые"], ["chronic", "Хронические"]]),
    single("life.diseases.infectious-outcome", "Исход инфекционного заболевания", [["recovered", "Полностью вылечились"], ["carrier-no-shedding", "Носительство без выделения"], ["carrier-shedding", "Носительство с выделением"]], ["life.diseases.types.infectious"]),
  ] },
];

export const EXAMINATION_CATEGORIES: readonly TherapeuticCategoryDefinition[] = [
  { id: "exam.general", label: "Общее состояние", questions: [
    single("exam.general.state", "Состояние", [["good", "Удовлетворительное/хорошее"], ["moderate", "Средней тяжести"], ["severe", "Тяжёлое"], ["very-severe", "Крайне тяжёлое"], ["critical", "Критическое"]]),
  ] },
  { id: "exam.posture", label: "Положение тела", questions: [
    single("exam.posture.type", "Положение", [["natural", "Естественное"], ["forced", "Вынужденное"]]),
    single("exam.posture.natural", "Естественное положение", [["standing", "Стоячее"], ["sitting", "Сидя"], ["sphinx", "В позе сфинкса"], ["lateral", "Боковое"]], ["exam.posture.type.natural"]),
    single("exam.posture.forced", "Вынужденное положение", [["lateral", "Боковое"], ["curved", "Изогнутое"], ["sternal", "Стернальное"], ["stiff", "Скованное"]], ["exam.posture.type.forced"]),
  ] },
  { id: "exam.mucosa", label: "Видимые слизистые оболочки (ВСО)", questions: [
    single("exam.mucosa.color", "Цвет", [["pale-pink", "Бледно-розовые"], ["bright-pink", "Ярко-розовые"], ["cyanotic", "Цианотичные"], ["icteric", "Иктеричные"], ["pale-white", "Бледные/белые"]]),
    single("exam.mucosa.moisture", "Влажность", [["moist", "Влажные"], ["sticky", "Липкие/суховатые"], ["dry", "Сухие"]]),
  ] },
  { id: "exam.crt", label: "Скорость наполнения капилляров (СНК)", questions: [
    single("exam.crt.value", "СНК", [["under-1", "Менее 1 сек"], ["one", "1 сек"], ["one-two", "1–2 сек"], ["over-2", "Более 2 сек"], ["unavailable", "Не оценивается"]]),
  ] },
  { id: "exam.oral", label: "Ротовая полость", questions: [
    single("exam.oral.state", "Общее состояние", [["normal", "Без изменений"], ["changed", "Есть изменения"]]),
    multiple("exam.oral.findings", "Изменения", [["ulcers", "Язвы"], ["hyperemia", "Участки гиперемии"], ["papules-pustules", "Папулы/пустулы"], ["wounds", "Раны"], ["necrosis", "Участки некроза"], ["masses", "Новообразования"], ["foreign", "Инородное тело"]], ["exam.oral.state.changed"]),
    single("exam.oral.lesions", "Поражения", [["absent", "Отсутствуют"], ["present", "Есть"]]),
    multiple("exam.oral.locations", "Область поражения", [["lips", "Губы"], ["gums", "Дёсны"], ["tongue-tip", "Кончик языка"], ["tongue-back", "Спинка языка"], ["tongue-root", "Корень языка"], ["cheeks", "Щёки"], ["tmj", "Верхнечелюстной сустав"], ["hard-palate", "Твёрдое нёбо"], ["soft-palate", "Мягкое нёбо"]], ["exam.oral.lesions.present"]),
    single("exam.oral.calculus", "Дентолитиаз", [["absent", "Отсутствует"], ["present", "Есть"]]),
    single("exam.oral.calculus-grade", "Выраженность дентолитиаза", [["slight", "Незначительный/налёт"], ["moderate", "Умеренный"], ["marked", "Выраженный"], ["significant", "Значимый"]], ["exam.oral.calculus.present"]),
    single("exam.oral.gingivitis", "Гингивит/гингивостоматит", [["absent", "Не наблюдается"], ["present", "Наблюдается"]]),
    single("exam.oral.gingivitis-grade", "Выраженность воспаления", [["slight", "Незначительный"], ["moderate", "Умеренный"], ["marked", "Выраженный"], ["significant", "Значимый"]], ["exam.oral.gingivitis.present"]),
  ] },
  { id: "exam.eyes", label: "Глаза", questions: [
    single("exam.eyes.state", "Изменения", [["none", "Не наблюдаются"], ["present", "Наблюдаются"]]),
    single("exam.eyes.side", "Локализация", [["bilateral", "Билатерально"], ["right", "В правом глазу"], ["left", "В левом глазу"], ["no-right", "Отсутствует правый глаз"], ["no-left", "Отсутствует левый глаз"], ["no-both", "Отсутствуют оба глаза"]], ["exam.eyes.state.present"]),
    single("exam.eyes.size-state", "Размер", [["unchanged", "Не изменён"], ["changed", "Изменён"]]),
    single("exam.eyes.size", "Изменение размера", [["enlarged", "Увеличен (буфтальм)"], ["reduced", "Уменьшен"]], ["exam.eyes.size-state.changed"]),
    single("exam.eyes.discharge-state", "Выделения", [["absent", "Отсутствуют"], ["present", "Есть"]]),
    multiple("exam.eyes.discharge", "Характер выделений", [["epiphora", "Эпифора (слезотечение)"], ["catarrhal", "Катаральные"], ["mucous", "Слизистые"], ["purulent", "Гнойные"], ["dry-pus", "Сухой гной"], ["hemorrhagic", "Геморрагические"]], ["exam.eyes.discharge-state.present"]),
    single("exam.eyes.eyelids-state", "Веки", [["normal", "Не изменены"], ["changed", "Есть изменения"]]),
    multiple("exam.eyes.eyelids", "Изменения век", [["edema", "Отёчность"], ["blepharospasm", "Блефароспазм"], ["medial-entropion", "Медиальный заворот (энтропион)"], ["lateral-entropion", "Латеральный заворот (энтропион)"], ["medial-ectropion", "Медиальный выворот (эктропион)"], ["lateral-ectropion", "Латеральный выворот (эктропион)"], ["distichiasis", "Дистрихиаз"]], ["exam.eyes.eyelids-state.changed"]),
    multiple("exam.eyes.conjunctiva", "Конъюнктива", [["normal", "Без изменений"], ["hyperemic", "Гиперемирована"], ["edematous", "Отёчная"], ["hemorrhage", "С кровоизлияниями"], ["integrity", "С нарушением целостности"], ["third-eyelid", "С пролапсом третьего века"], ["cartilage", "С заломом ножки хряща третьего века"]]),
    multiple("exam.eyes.cornea", "Роговица", [["normal", "Без изменений"], ["opaque", "Непрозрачная"], ["dull", "Неблестящая"], ["vascular", "С инъекцией сосудов"], ["ulcer", "С язвой"], ["hemorrhage", "С кровоизлиянием"], ["gaping", "С зиянием"]]),
    multiple("exam.eyes.anterior-chamber", "Передняя камера глаза", [["normal", "Без изменений"], ["hyphema", "С кровоизлиянием (гифема)"], ["precipitates", "С преципитатами"]]),
    multiple("exam.eyes.pupil", "Зрачок", [["normal", "Без изменений"], ["cataract", "Изменён катарактой"], ["mydriasis", "Расширен (мидриаз)"], ["miosis", "Сужен (миоз)"], ["anisocoria", "Разного размера (анизокория)"]]),
  ] },
  { id: "exam.ear", label: "Наружный слуховой проход (НСП)", questions: [
    multiple("exam.ear.changes", "Изменения", [["none", "Не наблюдаются"], ["left", "Есть слева"], ["right", "Есть справа"]]),
    multiple("exam.ear.skin", "Кожа", [["clean", "Чистая, без признаков воспаления"], ["erythema", "С участками эритемы"], ["ulcers", "С язвами"]]),
    single("exam.ear.secretion", "Количество церумена/секрета", [["scant", "Скудное"], ["moderate", "Умеренное"], ["increased", "Повышенное"], ["significant", "Значимое, канал заполнен"]]),
    single("exam.ear.filling", "Чем заполнен канал", [["partial", "Частично"], ["total", "Тотально"], ["pus", "Гноем"], ["brown", "Тёмно-коричневым экссудатом"]], ["exam.ear.secretion.significant"]),
    single("exam.ear.tympanum", "Барабанная перепонка", [["visible", "Визуализируется"], ["not-visible", "Не визуализируется"]]),
    multiple("exam.ear.canal", "Канал", [["stenotic", "Стенозирован"], ["relief", "Имеет повышенный рельеф"], ["unavailable", "Недоступен для осмотра"]]),
  ] },
  { id: "exam.lymph", label: "Поверхностные лимфатические узлы (ПЛУ)", questions: [
    single("exam.lymph.state", "Увеличение", [["normal", "Не увеличены"], ["enlarged", "Увеличены"], ["multifocal", "Увеличены мультифокально"]]),
    single("exam.lymph.grade", "Степень увеличения", [["slight", "Незначительно"], ["moderate", "Умеренно"], ["significant", "Значимо"]], ["exam.lymph.state.enlarged", "exam.lymph.state.multifocal"]),
    multiple("exam.lymph.location", "Локализация", [["submandibular", "Подчелюстные"], ["prescapular", "Предлопаточные"], ["inguinal", "Паховые"], ["popliteal", "Подколенные"]], ["exam.lymph.state.enlarged"]),
  ] },
  { id: "exam.turgor", label: "Тургор", questions: [
    single("exam.turgor.state", "Состояние", [["normal", "В норме"], ["dehydration", "Эксикоз"]]),
    single("exam.turgor.dehydration", "Степень эксикоза", [["under-5", "Менее 5%"], ["5", "5%"], ["6", "6%"], ["7", "7%"], ["8", "8%"], ["9", "9%"], ["10", "10%"], ["over-10", "Более 10%"]], ["exam.turgor.state.dehydration"]),
  ] },
  { id: "exam.condition", label: "Кондиция тела", questions: [
    single("exam.condition.score", "Оценка", [["1", "1/9"], ["2-3", "2–3/9"], ["4", "4/9"], ["5", "5/9"], ["6", "6/9"], ["7-8", "7–8/9"], ["9", "9/9"]]),
  ] },
  { id: "exam.coat", label: "Шерсть", questions: [
    multiple("exam.coat.quality", "Качество", [["shiny", "Блестящая"], ["dull", "Тусклая"], ["unkempt", "Неопрятная"], ["matted", "Сваляна в колтуны"]]),
    multiple("exam.coat.changes", "Изменённые участки", [["physiological-hypotrichosis", "Физиологический гипотрихоз"], ["hypotrichosis", "Гипотрихоз"], ["alopecia", "Алопеция"]]),
    single("exam.coat.distribution", "Распределение", [["local", "Локально"], ["diffuse", "Диффузно"]], ["exam.coat.changes.hypotrichosis", "exam.coat.changes.alopecia"]),
    single("exam.coat.number", "Количество локальных участков", [["single", "Единичный"], ["multiple", "Множественные"]], ["exam.coat.distribution.local"]),
    single("exam.coat.shape", "Форма", [["round", "Округлая"], ["oval", "Овальная"]], ["exam.coat.distribution.local"]),
  ] },
  { id: "exam.skin", label: "Кожный покров", questions: [
    single("exam.skin.state", "Состояние", [["normal", "Без патологий"], ["changed", "Есть изменения"]]),
    multiple("exam.skin.findings", "Изменения", [["scarification-single", "Единичные скарификации"], ["scarification-multiple", "Множественные скарификации"], ["erythema-single", "Единичные участки эритемы"], ["erythema-multiple", "Множественные участки эритемы"], ["collarettes", "Эпидермальные воротнички"], ["papules", "Папулы"], ["pustules", "Пустулы"], ["erosions", "Эрозии"], ["crust", "Участки, покрытые струпом"], ["ulcers", "Язвы"], ["fistula", "Фистула"], ["hyperpigmentation", "Гиперпигментация"], ["lichenification", "Лихенификация"]], ["exam.skin.state.changed"]),
  ] },
  { id: "exam.mass", label: "Новообразования кожи", questions: [
    single("exam.mass.count", "Количество", [["absent", "Отсутствуют"], ["single", "Единичное"], ["several", "Несколько"], ["multiple", "Множественные"]]),
    single("exam.mass.location", "Расположение", [["intradermal", "Внутрикожно"], ["subcutaneous", "Подкожно"]], ["exam.mass.count.single", "exam.mass.count.several", "exam.mass.count.multiple"]),
    single("exam.mass.growth", "Рост", [["endophytic", "Эндофитный"], ["exophytic", "Экзофитный"]], ["exam.mass.location.intradermal"]),
    single("exam.mass.consistency", "Консистенция", [["dense", "Плотное"], ["doughy", "Тестоватое"], ["soft", "Мягкое"]], ["exam.mass.count.single", "exam.mass.count.several", "exam.mass.count.multiple"]),
    single("exam.mass.ulceration", "Изъязвлённость", [["yes", "Есть"], ["no", "Нет"]], ["exam.mass.count.single", "exam.mass.count.several", "exam.mass.count.multiple"]),
    single("exam.mass.mobility", "Подвижность", [["yes", "Есть"], ["no", "Нет"]], ["exam.mass.count.single", "exam.mass.count.several", "exam.mass.count.multiple"]),
    single("exam.mass.size", "Диаметр", [["under-0-5", "Менее 0,5 см"], ["over-0-5", "Более 0,5 см"], ["over-1", "Более 1 см"], ["over-2", "Более 2 см"]], ["exam.mass.count.single", "exam.mass.count.several", "exam.mass.count.multiple"]),
  ] },
  { id: "exam.abdomen", label: "Брюшная стенка", questions: [
    single("exam.abdomen.visual", "Визуально", [["normal", "Не изменена"], ["enlarged", "Увеличена"], ["significant", "Значимо увеличена"], ["sagging", "Провисает"]]),
    single("exam.abdomen.bulging", "Выпячивание", [["none", "Не наблюдается"], ["left", "Латерально слева"], ["right", "Латерально справа"], ["bilateral", "Билатерально"]]),
    single("exam.abdomen.palpation", "При пальпации", [["soft", "Мягкая"], ["moderate", "Умеренно напряжена"], ["tense", "Напряжённая"], ["anxiety", "Вызывает беспокойство"]]),
    single("exam.abdomen.pain", "Болезненность", [["none", "Не отмечается"], ["present", "Есть"]]),
    multiple("exam.abdomen.pain-location", "Область болезненности", [["epigastrium", "Эпигастрий"], ["mesogastrium", "Мезогастрий"], ["hypogastrium", "Гипогастрий"]], ["exam.abdomen.pain.present"]),
    multiple("exam.abdomen.findings", "Пальпируемые находки", [["bladder", "Мочевой пузырь"], ["feces", "Каловые массы"], ["spleen", "Увеличенная селезёнка"], ["induration", "Уплотнение"], ["kidney", "Почка"], ["uterine-horns", "Увеличенные рога матки"], ["fetus", "Плод"]]),
    single("exam.abdomen.bladder", "Мочевой пузырь", [["empty", "Пустой"], ["moderate", "Умеренно наполнен"], ["full", "Переполнен"]], ["exam.abdomen.findings.bladder"]),
    single("exam.abdomen.feces", "Каловые массы", [["none", "Отсутствуют"], ["moderate", "Умеренное количество"], ["significant", "Значимое количество"]], ["exam.abdomen.findings.feces"]),
    single("exam.abdomen.induration", "Область уплотнения", [["epigastrium", "Эпигастрий"], ["mesogastrium", "Мезогастрий"], ["hypogastrium", "Гипогастрий"]], ["exam.abdomen.findings.induration"]),
    single("exam.abdomen.kidney-size", "Размер почки", [["enlarged", "Увеличена"], ["reduced", "Уменьшена"]], ["exam.abdomen.findings.kidney"]),
    single("exam.abdomen.kidney-side", "Сторона", [["left", "Слева"], ["right", "Справа"]], ["exam.abdomen.kidney-size.enlarged", "exam.abdomen.kidney-size.reduced"]),
    single("exam.abdomen.fetus", "Количество плодов", [["single", "Единичный"], ["multiple", "Несколько"]], ["exam.abdomen.findings.fetus"]),
    single("exam.abdomen.peristalsis", "Звуки перистальтики", [["absent", "Отсутствуют"], ["moderate", "Умеренные"], ["increased", "Усиленные"]]),
    single("exam.abdomen.fetal-heartbeat", "Сердцебиение плода", [["heard", "Прослушивается"], ["not-heard", "Не прослушивается"]], ["exam.abdomen.findings.fetus"]),
  ] },
  { id: "exam.chest", label: "Грудная полость", questions: [
    single("exam.chest.breathing", "Дыхание", [["thoracic", "Грудного типа"], ["abdominal", "Брюшного типа"], ["mixed", "Грудо-брюшного типа"], ["dyspnea", "С одышкой"], ["agonal", "Агональное"]]),
    single("exam.chest.dyspnea", "Тип одышки", [["inspiratory", "Инспираторная"], ["expiratory", "Экспираторная"]], ["exam.chest.breathing.dyspnea"]),
    single("exam.chest.wall", "Грудная стенка", [["normal", "Не изменена"], ["left", "Увеличена латерально слева"], ["right", "Увеличена латерально справа"]]),
    single("exam.chest.heart-tones", "Тоны сердца", [["clear", "Ясные"], ["muffled", "Приглушённые"], ["dull", "Глухие"], ["absent", "Не прослушиваются"]]),
    single("exam.chest.heart-rhythm", "Ритм сердца", [["rhythmic", "Ритмичный"], ["respiratory-arrhythmia", "Дыхательная аритмия"], ["atrial-fibrillation", "Мерцательная аритмия"], ["gallop", "Ритм галопа"]], ["exam.chest.heart-tones.clear", "exam.chest.heart-tones.muffled", "exam.chest.heart-tones.dull"]),
    multiple("exam.chest.arrhythmia", "Дополнительные нарушения ритма", [["tachyarrhythmia", "Тахиаритмия"], ["bradyarrhythmia", "Брадиаритмия"], ["extrasystole", "Экстрасистола"]]),
    single("exam.chest.murmur", "Шум сердца", [["absent", "Отсутствует"], ["systolic", "Систолический"], ["diastolic", "Диастолический"], ["machinery", "Машинный"]]),
    single("exam.chest.murmur-grade", "Интенсивность шума", [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"], ["6", "6"]], ["exam.chest.murmur.systolic", "exam.chest.murmur.diastolic", "exam.chest.murmur.machinery"]),
    multiple("exam.chest.lung-breathing", "Дыхание в лёгких", [["vesicular-soft-all", "Везикулярное мягкое по всем полям"], ["vesicular-soft-right", "Везикулярное мягкое справа"], ["vesicular-soft-left", "Везикулярное мягкое слева"], ["vesicular-hard-all", "Везикулярное жёсткое по всем полям"], ["vesicular-hard-right", "Везикулярное жёсткое справа"], ["vesicular-hard-left", "Везикулярное жёсткое слева"], ["bronchial-hard-all", "Бронхиальное жёсткое по всем полям"], ["bronchial-hard-right", "Бронхиальное жёсткое справа"], ["bronchial-hard-left", "Бронхиальное жёсткое слева"]]),
    multiple("exam.chest.lung-noises", "Шумы", [["upper-airway", "Верхних дыхательных путей"], ["stridor", "Стридор"], ["stertor", "Стертор"], ["friction", "Трение"], ["crepitation", "Крепитация"], ["fine", "Мелкопузырчатые"], ["coarse", "Крупнопузырчатые"]]),
  ] },
  { id: "exam.locomotion", label: "Опороспособность", questions: [
    single("exam.locomotion.state", "Состояние", [["normal", "В норме"], ["lameness", "Отмечается хромота"], ["changed", "Есть другие изменения"]]),
    single("exam.locomotion.lameness", "Степень хромоты", [["1", "1 степень: проявляется периодически"], ["2", "2 степень: проявляется постоянно"], ["3", "3 степень: периодическое отсутствие опоры"], ["4", "4 степень: постоянное отсутствие опоры"]], ["exam.locomotion.state.lameness"]),
    multiple("exam.locomotion.findings", "Другие изменения", [["ataxia", "Атаксия"], ["hypomobility", "Гипомобильность"], ["monoparesis", "Монопарез"], ["hemiparesis", "Гемипарез"], ["paraparesis", "Парапарез"], ["tetraparesis", "Тетрапарез"], ["monoplegia", "Моноплегия"], ["paraplegia", "Параплегия"], ["tetraplegia", "Тетраплегия"], ["seizures", "Судороги"], ["dyskinesia", "Дискинезия"]], ["exam.locomotion.state.changed"]),
    single("exam.locomotion.ataxia", "Тип атаксии", [["cerebellar", "Мозжечковая"], ["positional", "Позиционная"], ["vestibular", "Вестибулярная"]], ["exam.locomotion.findings.ataxia"]),
    multiple("exam.locomotion.seizures", "Тип судорог", [["myoclonic", "Миоклонические"], ["tonic", "Тонические"], ["tonic-clonic", "Тонико-клонические"], ["cluster", "Кластерные"]], ["exam.locomotion.findings.seizures"]),
  ] },
  { id: "exam.completeness", label: "Полнота осмотра", questions: [
    single("exam.completeness.state", "Осмотр", [["complete", "Проведён полностью"], ["partial", "Проведён частично"], ["none", "Не проводился"]]),
    single("exam.completeness.partial-reason", "Причина частичного осмотра", [["aggressive", "Агрессивное поведение животного"], ["fearful", "Пугливое поведение животного"], ["fear-aggression", "Пугливо-агрессивное поведение животного"], ["owner-refusal", "Несогласие владельца на некоторые методы исследования"]], ["exam.completeness.state.partial"]),
    single("exam.completeness.none-reason", "Причина отсутствия осмотра", [["owner-refusal", "Несогласие владельца на осмотр"], ["animal-absent", "Отсутствие животного"], ["death", "Гибель животного"]], ["exam.completeness.state.none"]),
  ] },
];

export const THERAPEUTIC_TABS: readonly { id: TherapeuticTab; label: string }[] = [
  { id: "disease", label: "Анамнез болезни" },
  { id: "life", label: "Анамнез жизни" },
  { id: "examination", label: "Осмотр" },
  { id: "recommendations", label: "Рекомендации" },
  { id: "prescriptions", label: "Назначения" },
];

const allCategories = [...DISEASE_ANAMNESIS_CATEGORIES, ...LIFE_ANAMNESIS_CATEGORIES, ...EXAMINATION_CATEGORIES];
const allQuestions = allCategories.flatMap((category) => category.questions);
const optionDefinitions = new Map(allQuestions.flatMap((item) => item.options.map((option) => [option.id, option] as const)));
const optionOrder = new Map([...optionDefinitions.keys()].map((id, index) => [id, index]));
const onsetIds = new Set(PROBLEM_ONSET_OPTIONS.map((option) => option.id));
const frequencyIds = new Set(PROBLEM_FREQUENCY_OPTIONS.map((option) => option.id));
const therapyIds = new Set(PROBLEM_THERAPY_OPTIONS.map((option) => option.id));
const medicationUseIds = new Set(PROBLEM_MEDICATION_USE_OPTIONS.map((option) => option.id));
const medicationIds = new Set(PROBLEM_MEDICATION_OPTIONS.map((option) => option.id));
const dynamicsIds = new Set(PROBLEM_DYNAMICS_OPTIONS.map((option) => option.id));
const questionByOption = new Map(allQuestions.flatMap((item) => item.options.map((option) => [option.id, item] as const)));
const exclusiveMultipleOptionIds = new Set([
  "life.travel.places.nowhere",
  "exam.eyes.conjunctiva.normal",
  "exam.eyes.cornea.normal",
  "exam.eyes.anterior-chamber.normal",
  "exam.eyes.pupil.normal",
  "exam.ear.changes.none",
  "exam.ear.skin.clean",
  "exam.coat.quality.shiny",
]);

export function emptyTherapeuticAppointmentDraft(): TherapeuticAppointmentDraft {
  return {
    diseaseAnamnesis: { text: "", problems: [], selectedIds: [] },
    lifeAnamnesis: { text: "", selectedIds: [], currentMedications: "", allergies: "" },
    examination: { text: "", selectedIds: [] },
    recommendations: "",
    prescriptions: "",
  };
}

export function therapeuticAppointmentDraft(value?: TherapeuticAppointmentSectionValue): TherapeuticAppointmentDraft {
  if (!value) return emptyTherapeuticAppointmentDraft();
  return {
    diseaseAnamnesis: {
      text: value.diseaseAnamnesis.text,
      selectedIds: [...value.diseaseAnamnesis.selectedIds],
      problems: value.diseaseAnamnesis.problems.map((problem) => ({ ...problem, medicationIds: [...problem.medicationIds] })),
    },
    lifeAnamnesis: {
      text: value.lifeAnamnesis.text,
      selectedIds: [...value.lifeAnamnesis.selectedIds],
      currentMedications: value.lifeAnamnesis.currentMedications,
      allergies: value.lifeAnamnesis.allergies,
    },
    examination: { text: value.examination.text, selectedIds: [...value.examination.selectedIds] },
    recommendations: value.recommendations,
    prescriptions: value.prescriptions,
  };
}

export function newTherapeuticProblem(sourceWhatHappenedId?: string, title = ""): TherapeuticProblemDraft {
  return {
    id: crypto.randomUUID(),
    ...(sourceWhatHappenedId ? { sourceWhatHappenedId } : {}),
    title,
    medicationIds: [],
  };
}

export function therapeuticOptionLabel(id: string): string {
  return optionDefinitions.get(id)?.label
    ?? [...PROBLEM_ONSET_OPTIONS, ...PROBLEM_FREQUENCY_OPTIONS, ...PROBLEM_THERAPY_OPTIONS,
      ...PROBLEM_MEDICATION_USE_OPTIONS, ...PROBLEM_MEDICATION_OPTIONS, ...PROBLEM_DYNAMICS_OPTIONS]
      .find((option) => option.id === id)?.label
    ?? id;
}

export function therapeuticQuestionVisible(questionDefinition: TherapeuticQuestionDefinition, selectedIds: readonly string[]): boolean {
  return !questionDefinition.visibleWhenAny?.length
    || questionDefinition.visibleWhenAny.some((id) => selectedIds.includes(id));
}

export function therapeuticQuestionSelections(questionDefinition: TherapeuticQuestionDefinition, selectedIds: readonly string[]): string[] {
  const allowed = new Set(questionDefinition.options.map((option) => option.id));
  return selectedIds.filter((id) => allowed.has(id));
}

export function toggleTherapeuticMultipleSelection(
  questionDefinition: TherapeuticQuestionDefinition,
  selectedIds: readonly string[],
  id: string,
): string[] {
  const questionIds = new Set(questionDefinition.options.map((option) => option.id));
  if (selectedIds.includes(id)) return pruneTherapeuticSelections(selectedIds.filter((candidate) => candidate !== id));
  const withoutConflicts = selectedIds.filter((candidate) => !questionIds.has(candidate)
    || (!exclusiveMultipleOptionIds.has(id) && !exclusiveMultipleOptionIds.has(candidate)));
  return pruneTherapeuticSelections([...withoutConflicts, id]);
}

export function pruneTherapeuticSelections(selectedIds: readonly string[]): string[] {
  let next = [...new Set(selectedIds.filter((id) => optionDefinitions.has(id)))];
  let changed = true;
  while (changed) {
    const visible = new Set(allQuestions
      .filter((item) => therapeuticQuestionVisible(item, next))
      .flatMap((item) => item.options.map((option) => option.id)));
    const pruned = next.filter((id) => visible.has(id));
    changed = pruned.length !== next.length;
    next = pruned;
  }
  return next.sort((left, right) => (optionOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (optionOrder.get(right) ?? Number.MAX_SAFE_INTEGER));
}

function validateSelections(selectedIds: unknown, categories: readonly TherapeuticCategoryDefinition[]): string {
  if (!Array.isArray(selectedIds) || selectedIds.some((id) => typeof id !== "string")) return "Некорректный список выбранных вариантов.";
  if (new Set(selectedIds).size !== selectedIds.length) return "Список содержит повторяющиеся варианты.";
  const allowedQuestions = categories.flatMap((category) => category.questions);
  const allowed = new Set(allowedQuestions.flatMap((item) => item.options.map((option) => option.id)));
  if (selectedIds.some((id) => !allowed.has(id))) return "Список содержит неизвестный вариант.";
  for (const item of allowedQuestions) {
    const itemSelections = therapeuticQuestionSelections(item, selectedIds);
    if (item.mode === "single" && itemSelections.length > 1) {
      return `В поле «${item.label}» можно выбрать только один вариант.`;
    }
    if (item.mode === "multiple" && itemSelections.length > 1
      && itemSelections.some((id) => exclusiveMultipleOptionIds.has(id))) {
      return `Поле «${item.label}» содержит несовместимые варианты.`;
    }
    if (!therapeuticQuestionVisible(item, selectedIds) && therapeuticQuestionSelections(item, selectedIds).length) {
      return `Поле «${item.label}» заполнено без необходимого родительского ответа.`;
    }
  }
  return "";
}

function problemHasContent(problem: TherapeuticProblemDraft): boolean {
  return Boolean(problem.title.trim() || problem.sourceWhatHappenedId || problem.onsetId || problem.frequencyId
    || problem.priorTherapyId || problem.medicationUseId || problem.medicationIds.length
    || problem.medicationName?.trim() || problem.medicationDynamicsId);
}

function normalizeProblem(problem: TherapeuticProblemDraft): TherapeuticProblemValue {
  return {
    id: problem.id.trim(),
    ...(problem.sourceWhatHappenedId ? { sourceWhatHappenedId: problem.sourceWhatHappenedId } : {}),
    title: problem.title.trim(),
    ...(problem.onsetId ? { onsetId: problem.onsetId } : {}),
    ...(problem.frequencyId ? { frequencyId: problem.frequencyId } : {}),
    ...(problem.priorTherapyId ? { priorTherapyId: problem.priorTherapyId } : {}),
    ...(problem.medicationUseId ? { medicationUseId: problem.medicationUseId } : {}),
    medicationIds: PROBLEM_MEDICATION_OPTIONS.map((option) => option.id).filter((id) => problem.medicationIds.includes(id)),
    ...(problem.medicationName?.trim() ? { medicationName: problem.medicationName.trim() } : {}),
    ...(problem.medicationDynamicsId ? { medicationDynamicsId: problem.medicationDynamicsId } : {}),
  };
}

export function parseTherapeuticAppointmentDraft(draft: TherapeuticAppointmentDraft): {
  value?: TherapeuticAppointmentSectionValue;
  errors: TherapeuticAppointmentDraftErrors;
} {
  const errors: TherapeuticAppointmentDraftErrors = {};
  const problemErrors: Record<string, string> = {};
  const populatedProblems = draft.diseaseAnamnesis.problems.filter(problemHasContent);
  const ids = new Set<string>();
  for (const problem of populatedProblems) {
    const problemId = problem.id.trim();
    if (!problemId || ids.has(problemId)) problemErrors[problem.id || "missing"] = "У проблемы должен быть уникальный идентификатор.";
    ids.add(problemId);
    if (!problem.title.trim()) problemErrors[problem.id] = "Укажите название проблемы.";
    if (problem.onsetId && !onsetIds.has(problem.onsetId)) problemErrors[problem.id] = "Выбран неизвестный срок начала.";
    if (problem.frequencyId && !frequencyIds.has(problem.frequencyId)) problemErrors[problem.id] = "Выбрана неизвестная периодичность.";
    if (problem.priorTherapyId && !therapyIds.has(problem.priorTherapyId)) problemErrors[problem.id] = "Выбран неизвестный вариант терапии.";
    if (problem.medicationUseId && !medicationUseIds.has(problem.medicationUseId)) problemErrors[problem.id] = "Выбран неизвестный вариант применения препаратов.";
    if (new Set(problem.medicationIds).size !== problem.medicationIds.length || problem.medicationIds.some((id) => !medicationIds.has(id))) {
      problemErrors[problem.id] = "Проверьте выбранные препараты.";
    }
    if (problem.medicationDynamicsId && !dynamicsIds.has(problem.medicationDynamicsId)) problemErrors[problem.id] = "Выбрана неизвестная динамика.";
    if (problem.priorTherapyId === "problem.therapy.none"
      && (problem.medicationUseId || problem.medicationIds.length || problem.medicationName?.trim() || problem.medicationDynamicsId)) {
      problemErrors[problem.id] = "При отсутствии терапии данные о препаратах должны быть очищены.";
    }
    if (!problem.priorTherapyId
      && (problem.medicationUseId || problem.medicationIds.length || problem.medicationName?.trim() || problem.medicationDynamicsId)) {
      problemErrors[problem.id] = "Сначала укажите, что терапия до осмотра проводилась.";
    }
    if (problem.medicationUseId === "problem.medication.none"
      && (problem.medicationIds.length || problem.medicationName?.trim() || problem.medicationDynamicsId)) {
      problemErrors[problem.id] = "При отсутствии препаратов очистите виды, название препарата и динамику.";
    }
    if (problem.medicationUseId === "problem.medication.used" && (!problem.medicationIds.length || !problem.medicationDynamicsId)) {
      problemErrors[problem.id] = "Выберите применявшиеся препараты и динамику.";
    }
    if (!problem.medicationUseId && (problem.medicationIds.length || problem.medicationName?.trim() || problem.medicationDynamicsId)) {
      problemErrors[problem.id] = "Сначала укажите, применялись ли препараты.";
    }
  }
  if (Object.keys(problemErrors).length) {
    errors.problems = problemErrors;
    errors.tab = "disease";
  }

  const diseaseSelectionError = validateSelections(draft.diseaseAnamnesis.selectedIds, DISEASE_ANAMNESIS_CATEGORIES);
  if (!errors.tab && diseaseSelectionError) {
    errors.section = diseaseSelectionError;
    errors.tab = "disease";
  }
  const lifeSelectionError = validateSelections(draft.lifeAnamnesis.selectedIds, LIFE_ANAMNESIS_CATEGORIES);
  if (!errors.tab && lifeSelectionError) {
    errors.section = lifeSelectionError;
    errors.tab = "life";
  }
  const examinationSelectionError = validateSelections(draft.examination.selectedIds, EXAMINATION_CATEGORIES);
  if (!errors.tab && examinationSelectionError) {
    errors.section = examinationSelectionError;
    errors.tab = "examination";
  }

  const value: TherapeuticAppointmentSectionValue = {
    diseaseAnamnesis: {
      text: draft.diseaseAnamnesis.text.trim(),
      problems: populatedProblems.map(normalizeProblem),
      selectedIds: pruneTherapeuticSelections(draft.diseaseAnamnesis.selectedIds),
    },
    lifeAnamnesis: {
      text: draft.lifeAnamnesis.text.trim(),
      selectedIds: pruneTherapeuticSelections(draft.lifeAnamnesis.selectedIds),
      currentMedications: draft.lifeAnamnesis.currentMedications.trim(),
      allergies: draft.lifeAnamnesis.allergies.trim(),
    },
    examination: {
      text: draft.examination.text.trim(),
      selectedIds: pruneTherapeuticSelections(draft.examination.selectedIds),
    },
    recommendations: draft.recommendations.trim(),
    prescriptions: draft.prescriptions.trim(),
  };
  const hasContent = Boolean(
    value.diseaseAnamnesis.text || value.diseaseAnamnesis.problems.length || value.diseaseAnamnesis.selectedIds.length
    || value.lifeAnamnesis.text || value.lifeAnamnesis.selectedIds.length || value.lifeAnamnesis.currentMedications
    || value.lifeAnamnesis.allergies || value.examination.text || value.examination.selectedIds.length
    || value.recommendations || value.prescriptions,
  );
  if (!hasContent && !errors.section) {
    errors.section = "Заполните хотя бы один раздел терапевтического приёма.";
    errors.tab = "disease";
  }
  return Object.keys(errors).length ? { errors } : { value, errors };
}

function hasSectionShape(value: unknown): value is TherapeuticAppointmentSectionValue {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TherapeuticAppointmentSectionValue>;
  return Boolean(candidate.diseaseAnamnesis && candidate.lifeAnamnesis && candidate.examination
    && typeof candidate.recommendations === "string" && typeof candidate.prescriptions === "string"
    && typeof candidate.diseaseAnamnesis.text === "string" && Array.isArray(candidate.diseaseAnamnesis.problems)
    && Array.isArray(candidate.diseaseAnamnesis.selectedIds) && typeof candidate.lifeAnamnesis.text === "string"
    && Array.isArray(candidate.lifeAnamnesis.selectedIds) && typeof candidate.lifeAnamnesis.currentMedications === "string"
    && typeof candidate.lifeAnamnesis.allergies === "string" && typeof candidate.examination.text === "string"
    && Array.isArray(candidate.examination.selectedIds)
    && candidate.diseaseAnamnesis.selectedIds.every((id) => typeof id === "string")
    && candidate.lifeAnamnesis.selectedIds.every((id) => typeof id === "string")
    && candidate.examination.selectedIds.every((id) => typeof id === "string")
    && candidate.diseaseAnamnesis.problems.every((problem) => Boolean(problem && typeof problem === "object"
      && typeof problem.id === "string" && typeof problem.title === "string" && Array.isArray(problem.medicationIds)
      && problem.medicationIds.every((id: unknown) => typeof id === "string")
      && [problem.sourceWhatHappenedId, problem.onsetId, problem.frequencyId, problem.priorTherapyId,
        problem.medicationUseId, problem.medicationName, problem.medicationDynamicsId]
        .every((item) => item === undefined || typeof item === "string"))));
}

export function isTherapeuticAppointmentValue(value: unknown): value is TherapeuticAppointmentSectionValue {
  return hasSectionShape(value) && Boolean(parseTherapeuticAppointmentDraft(therapeuticAppointmentDraft(value)).value);
}

export function normalizeTherapeuticAppointmentValue(value: TherapeuticAppointmentSectionValue): TherapeuticAppointmentSectionValue {
  return parseTherapeuticAppointmentDraft(therapeuticAppointmentDraft(value)).value ?? value;
}

export function therapeuticSelectionDetails(
  selectedIds: readonly string[],
  categories: readonly TherapeuticCategoryDefinition[],
): TherapeuticSelectionDetail[] {
  return therapeuticSelectionGroups(selectedIds, categories).flatMap((group) =>
    group.details.map((detail) => ({
      ...detail,
      label: `${group.label}: ${detail.label}`,
    })));
}

export function therapeuticSelectionGroups(
  selectedIds: readonly string[],
  categories: readonly TherapeuticCategoryDefinition[],
): TherapeuticSelectionGroup[] {
  return categories.flatMap((category) => {
    const details = category.questions.flatMap((item) => {
      const selected = therapeuticQuestionSelections(item, selectedIds);
      return selected.length ? [{
        key: item.id,
        label: item.label,
        value: selected.map(therapeuticOptionLabel).join(", "),
      }] : [];
    });
    return details.length ? [{ key: category.id, label: category.label, details }] : [];
  });
}

export function therapeuticAppointmentSearchText(value: TherapeuticAppointmentSectionValue): string {
  const problems = value.diseaseAnamnesis.problems.flatMap((problem) => [
    problem.title,
    problem.onsetId ? therapeuticOptionLabel(problem.onsetId) : "",
    problem.frequencyId ? therapeuticOptionLabel(problem.frequencyId) : "",
    problem.priorTherapyId ? therapeuticOptionLabel(problem.priorTherapyId) : "",
    problem.medicationUseId ? therapeuticOptionLabel(problem.medicationUseId) : "",
    ...problem.medicationIds.map(therapeuticOptionLabel),
    problem.medicationName ?? "",
    problem.medicationDynamicsId ? therapeuticOptionLabel(problem.medicationDynamicsId) : "",
  ]);
  const selected = [
    ...value.diseaseAnamnesis.selectedIds,
    ...value.lifeAnamnesis.selectedIds,
    ...value.examination.selectedIds,
  ].map(therapeuticOptionLabel);
  return [value.diseaseAnamnesis.text, ...problems, value.lifeAnamnesis.text,
    value.lifeAnamnesis.currentMedications, value.lifeAnamnesis.allergies,
    value.examination.text, ...selected, value.recommendations, value.prescriptions]
    .filter(Boolean).join("; ");
}

export function therapeuticCatalogDiagnostics(): { questionIds: string[]; optionIds: string[]; dependencyIds: string[] } {
  return {
    questionIds: allQuestions.map((item) => item.id),
    optionIds: allQuestions.flatMap((item) => item.options.map((option) => option.id)),
    dependencyIds: allQuestions.flatMap((item) => [...(item.visibleWhenAny ?? [])]),
  };
}

export function questionForTherapeuticOption(id: string): TherapeuticQuestionDefinition | undefined {
  return questionByOption.get(id);
}
