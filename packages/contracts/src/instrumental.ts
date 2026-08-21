// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

export type InstrumentalStudyMode = "tree" | "narrative";
export type InstrumentalFindingKind = "group" | "choice" | "integer" | "short-text" | "long-text";

export interface InstrumentalFindingCatalogItem {
  readonly id: string;
  readonly name: string;
  readonly kind: InstrumentalFindingKind;
  readonly unit?: string;
  readonly children: readonly InstrumentalFindingCatalogItem[];
}

export interface InstrumentalStudyTypeCatalogItem {
  readonly id: string;
  readonly name: string;
  readonly mode: InstrumentalStudyMode;
  readonly findings: readonly InstrumentalFindingCatalogItem[];
}

export interface InstrumentalFindingValue {
  findingId: string;
  findingName: string;
  value?: string;
  unit?: string;
  children: readonly InstrumentalFindingValue[];
}

interface InstrumentalStudyBase {
  id: string;
  date: string;
  typeId: string;
  typeName: string;
  comment?: string;
}

export interface InstrumentalTreeStudyValue extends InstrumentalStudyBase {
  mode: "tree";
  findings: readonly InstrumentalFindingValue[];
}

export interface InstrumentalNarrativeStudyValue extends InstrumentalStudyBase {
  mode: "narrative";
  result: string;
}

export type InstrumentalStudyValue = InstrumentalTreeStudyValue | InstrumentalNarrativeStudyValue;
export interface InstrumentalTestsSectionValue { studies: readonly InstrumentalStudyValue[] }

const prefix = "instrumental.finding.ultrasound-abdomen";
const node = (
  code: string,
  name: string,
  kind: InstrumentalFindingKind,
  children: readonly InstrumentalFindingCatalogItem[] = [],
): InstrumentalFindingCatalogItem => ({ id: `${prefix}.${code}`, name, kind, children });
const group = (code: string, name: string, children: readonly InstrumentalFindingCatalogItem[]) => node(code, name, "group", children);
const choice = (code: string, name: string, children: readonly InstrumentalFindingCatalogItem[] = []) => node(code, name, "choice", children);
const integer = (code: string, name: string, unit: string) => ({ ...node(code, name, "integer"), unit });
const longText = (code: string, name: string) => node(code, name, "long-text");

const ultrasoundAbdomen: readonly InstrumentalFindingCatalogItem[] = [
  group("1", "Печень", [
    group("1.1", "Размер", [
      choice("1.1.1", "В пределах нормы"), choice("1.1.2", "Уменьшен"), choice("1.1.3", "Увеличен"),
      choice("1.1.4", "Значимо уменьшен"), choice("1.1.5", "Значимо увеличен"),
    ]),
    group("1.2", "Расположение вентрального края", [
      choice("1.2.1", "На уровне рёберной дуги"), choice("1.2.2", "Незначительно выходит за пределы рёберной дуги"),
      choice("1.2.3", "Не доходит до края рёберной дуги"), choice("1.2.4", "Значимо выходит за край рёберной дуги"),
    ]),
    group("1.3", "Край", [choice("1.3.1", "Острый"), choice("1.3.2", "Тупой")]),
    group("1.4", "Контуры", [choice("1.4.1", "Ровные"), choice("1.4.2", "Неровные")]),
    group("1.5", "Эхогенность", [
      choice("1.5.1", "Не изменена"), choice("1.5.2", "Слабо повышена"),
      choice("1.5.3", "Повышена относительно жира серповидной связки"),
      choice("1.5.4", "Понижена относительно жира серповидной связки"), choice("1.5.5", "Смешанная"),
    ]),
    group("1.6", "V. Porta", [choice("1.6.1", "Не изменена"), choice("1.6.2", "Расширена"), choice("1.6.3", "Сужена")]),
    group("1.7", "V. Cava", [choice("1.7.1", "Не изменена"), choice("1.7.2", "Расширена"), choice("1.7.3", "Сужена")]),
    group("1.8", "Общий желчный проток", [choice("1.8.1", "Не изменён"), choice("1.8.2", "Расширен"), choice("1.8.3", "Сужен")]),
    group("1.9", "Внутрипечёночные протоки", [choice("1.9.1", "Не расширены"), choice("1.9.2", "Расширены")]),
    group("1.10", "Очаговые образования", [
      choice("1.10.1", "Не визуализируются"),
      choice("1.10.2", "Визуализируются", [choice("1.10.2.1", "Единичные"), choice("1.10.2.2", "Множественные")]),
    ]),
    group("1.11", "Эхогенность", [
      choice("1.11.1", "Средняя"), choice("1.11.2", "Гиперэхогенные"), choice("1.11.3", "Гипоэхогенные"), choice("1.11.4", "Анэхогенные"),
    ]),
    integer("1.12", "Размер", "мм"),
  ]),
  group("2", "Желчный пузырь", [
    group("2.1", "Наполнение", [
      choice("2.1.1", "Визуализация затруднена"), choice("2.1.2", "Выраженно наполнен"), choice("2.1.3", "Слабо наполнен"),
      choice("2.1.4", "Умеренно наполнен"), choice("2.1.5", "Переполнен"),
    ]),
    group("2.2", "Форма", [choice("2.2.1", "Грушевидная"), choice("2.2.2", "Округлая"), choice("2.2.3", "В виде сердца")]),
    group("2.3", "Стенка", [
      choice("2.3.1", "Не утолщена"), choice("2.3.2", "Утолщена до 2 мм"), choice("2.3.3", "Утолщена более 2 мм"), choice("2.3.4", "Повышенной эхогенности"),
    ]),
    group("2.4", "Содержимое", [choice("2.4.1", "Гипоэхогенное"), choice("2.4.2", "Гетерогенное"), choice("2.4.3", "Гиперэхогенное"), choice("2.4.4", "Анэхогенное")]),
    group("2.5", "Осадок", [
      choice("2.5.1", "Не визуализируется"),
      choice("2.5.2", "Визуализируется", [
        choice("2.5.2.1", "В незначительном количестве"), choice("2.5.2.2", "В умеренном количестве"), choice("2.5.2.3", "В значимом количестве"),
      ]),
    ]),
    group("2.6", "Характер осадка", [
      choice("2.6.1", "Смешанный"), choice("2.6.2", "Сгусток"), choice("2.6.3", "Минеральный осадок"), choice("2.6.4", "Конкременты"),
      choice("2.6.5", "Пристеночный"), choice("2.6.6", "Неподвижный"), choice("2.6.7", "Подвижный"),
    ]),
    group("2.7", "Структурные деформации", [
      choice("2.7.1", "Не визуализируются"), choice("2.7.2", "Визуализируются", [
        choice("2.7.2.1", "Удвоение"), choice("2.7.2.2", "Перетяжка"), choice("2.7.2.3", "Дополнительное колено"), choice("2.7.2.4", "Физиологический изгиб"),
      ]),
    ]),
    integer("2.8", "Размер", "мм"),
  ]),
  group("3", "Поджелудочная железа", [
    choice("3.0.1", "Визуализируется"), choice("3.0.2", "Не визуализируется"), choice("3.0.3", "Визуализируется фрагментарно"), choice("3.0.4", "Визуализация затруднена"),
    integer("3.1", "Размер", "мм"),
    group("3.2", "Паренхима", [choice("3.2.1", "Эхогенная"), choice("3.2.2", "Гиперэхогенная"), choice("3.2.3", "Гипоэхогенная"), choice("3.2.4", "Смешанной эхогенности")]),
    group("3.3", "Структура", [
      choice("3.3.1", "Однородная"), choice("3.3.2", "Неоднородная", [choice("3.3.2.1", "Слабо выраженно"), choice("3.3.2.2", "Выраженно")]), choice("3.3.3", "Дольчатая"),
    ]),
    longText("3.4", "Комментарии"),
  ]),
  group("4", "Селезёнка", [
    choice("4.0.1", "Не изменена"), choice("4.0.2", "Уменьшена"), choice("4.0.3", "Умеренно увеличена"), choice("4.0.4", "Значимо увеличена"), choice("4.0.5", "Не визуализируется"),
    group("4.1", "Расположение", [choice("4.1.1", "Типичное"), choice("4.1.2", "Атипичное")]),
    group("4.2", "Структура", [
      choice("4.2.1", "Однородная"), choice("4.2.2", "Неоднородная", [
        choice("4.2.2.1", "Слабо выраженно"), choice("4.2.2.2", "Сильно выраженно"), choice("4.2.2.3", "Со множеством участков сниженной эхогенности"),
      ]),
    ]),
    group("4.3", "Сосуды", [choice("4.3.1", "Расширены"), choice("4.3.2", "Не расширены"), choice("4.3.3", "Со стенками повышенной эхогенности")]),
    group("4.4", "Объёмные образования", [
      choice("4.4.1", "Не визуализируются"), choice("4.4.2", "Визуализируются", [choice("4.4.2.1", "Единичные"), choice("4.4.2.2", "Множественные")]),
    ]),
    integer("4.5", "Размер образований", "мм"), longText("4.6", "Комментарии"),
  ]),
  group("5", "Почка левая", [
    choice("5.0.1", "Не визуализируется"), choice("5.0.2", "Визуализируется"),
    group("5.1", "Размер", [choice("5.1.1", "Соответствует физиологической норме"), choice("5.1.2", "Увеличен"), choice("5.1.3", "Уменьшен")]),
    integer("5.2", "Длина", "мм"), integer("5.3", "Ширина", "мм"), integer("5.4", "Высота", "мм"),
    group("5.5", "Контуры", [choice("5.5.1", "Ровные"), choice("5.5.2", "Неровные")]),
    group("5.6", "Кортико-медуллярная дифференциация", [
      choice("5.6.1", "Выражена"), choice("5.6.2", "Сглажена"), choice("5.6.3", "Умеренно выражена"), choice("5.6.4", "Отсутствует"), choice("5.6.5", "Усилена"),
    ]),
    group("5.7", "Корковый слой", [
      choice("5.7.1", "Не изменён"), choice("5.7.2", "Истончён"), choice("5.7.3", "Утолщён"), choice("5.7.4", "Не определяется"),
      group("5.7.5", "Эхогенность", [
        choice("5.7.5.1", "Снижена"), choice("5.7.5.2", "Повышена"), choice("5.7.5.3", "С выраженной зернистостью"),
        choice("5.7.5.4", "Сопоставима с эхогенностью паренхимы печени"), choice("5.7.5.5", "Ниже эхогенности паренхимы печени"),
        choice("5.7.5.6", "Выше эхогенности паренхимы печени"), choice("5.7.5.7", "Сопоставима с эхогенностью паренхимы селезёнки"),
        choice("5.7.5.8", "Ниже эхогенности паренхимы селезёнки"), choice("5.7.5.9", "Выше эхогенности паренхимы селезёнки"),
      ]),
    ]),
    group("5.8", "Лоханка", [
      choice("5.8.1", "Не расширена"), choice("5.8.2", "Расширена"), choice("5.8.3", "Щелевидно расширена"), integer("5.8.4", "Ширина", "мм"),
      group("5.8.5", "Эхогенность", [choice("5.8.5.1", "Не изменена"), choice("5.8.5.2", "Повышена"), choice("5.8.5.3", "Имеет признаки минерализации")]),
    ]),
    longText("5.9", "Комментарии"),
  ]),
  group("6", "Почка правая", [
    choice("6.0.1", "Не визуализируется"), choice("6.0.2", "Визуализируется"),
    group("6.1", "Размер", [choice("6.1.1", "Соответствует физиологической норме"), choice("6.1.2", "Увеличен"), choice("6.1.3", "Уменьшен")]),
    integer("6.2", "Длина", "мм"), integer("6.3", "Ширина", "мм"), integer("6.4", "Высота", "мм"),
    group("6.5", "Контуры", [choice("6.5.1", "Ровные"), choice("6.5.2", "Неровные")]),
    group("6.6", "Кортико-медуллярная дифференциация", [
      choice("6.6.1", "Выражена"), choice("6.6.2", "Сглажена"), choice("6.6.3", "Умеренно выражена"), choice("6.6.4", "Отсутствует"), choice("6.6.5", "Усилена"),
    ]),
    group("6.7", "Корковый слой", [
      choice("6.7.1", "Не изменён"), choice("6.7.2", "Истончён"), choice("6.7.3", "Утолщён"), choice("6.7.4", "Не определяется"),
      group("6.7.5", "Эхогенность", [
        choice("6.7.5.1", "Снижена"), choice("6.7.5.2", "Повышена"), choice("6.7.5.3", "С выраженной зернистостью"),
        choice("6.7.5.4", "Сопоставима с эхогенностью паренхимы печени"), choice("6.7.5.5", "Ниже эхогенности паренхимы печени"),
        choice("6.7.5.6", "Выше эхогенности паренхимы печени"), choice("6.7.5.7", "Сопоставима с эхогенностью паренхимы селезёнки"),
        choice("6.7.5.8", "Ниже эхогенности паренхимы селезёнки"), choice("6.7.5.9", "Выше эхогенности паренхимы селезёнки"),
      ]),
    ]),
    group("6.8", "Лоханка", [
      choice("6.8.1", "Не расширена"), choice("6.8.2", "Расширена"), choice("6.8.3", "Щелевидно расширена"), integer("6.8.4", "Ширина", "мм"),
      group("6.8.5", "Эхогенность", [choice("6.8.5.1", "Не изменена"), choice("6.8.5.2", "Повышена"), choice("6.8.5.3", "Имеет признаки минерализации")]),
    ]),
    longText("6.9", "Комментарии"),
  ]),
  group("7", "Мочеточник левый", [
    choice("7.0.1", "Визуализируется"), choice("7.0.2", "Не визуализируется"), choice("7.0.3", "Расширен"), choice("7.0.4", "Не расширен"),
  ]),
  group("8", "Мочеточник правый", [
    choice("8.0.1", "Визуализируется"), choice("8.0.2", "Не визуализируется"), choice("8.0.3", "Расширен"), choice("8.0.4", "Не расширен"),
  ]),
  group("9", "Мочевой пузырь", [
    group("9.1", "Степень наполнения", [
      choice("9.1.1", "Слабо наполнен"), choice("9.1.2", "Умеренно наполнен"), choice("9.1.3", "Выраженно наполнен"), choice("9.1.4", "Переполнен"), choice("9.1.5", "Спавшийся"),
    ]),
    group("9.2", "Стенка", [
      integer("9.2.1", "Толщина", "мм"),
      group("9.2.2", "Слизистый слой", [
        choice("9.2.2.1", "Ровный"), choice("9.2.2.2", "Неровный"), choice("9.2.2.3", "Значимо неровный"), choice("9.2.2.4", "Отслоен частично"), choice("9.2.2.5", "Отслоен тотально"),
      ]),
    ]),
    group("9.3", "Содержимое", [
      choice("9.3.1", "Не визуализируется"), choice("9.3.2", "Гетерогенное"), choice("9.3.3", "Анэхогенное"),
      choice("9.3.5", "Визуализируется", [
        longText("9.3.5.1", "Взвесь/осадок"),
        group("9.3.5.2", "Конкременты", [choice("9.3.5.2.1", "Единичные"), choice("9.3.5.2.2", "Множественные"), integer("9.3.5.2.3", "Размер", "мм")]),
      ]),
    ]),
    longText("9.4", "Комментарии"),
  ]),
  group("10", "Предстательная железа", [
    integer("10.0", "Размер", "мм"),
    group("10.1", "Контуры", [choice("10.1.1", "Ровные"), choice("10.1.2", "Неровные"), choice("10.1.3", "Чёткие"), choice("10.1.4", "Нечёткие")]),
    group("10.2", "Структура", [choice("10.2.1", "Однородная"), choice("10.2.2", "Слабо неоднородная"), choice("10.2.3", "Неоднородная"), choice("10.2.4", "С очаговыми образованиями")]),
    group("10.3", "Эхогенность паренхимы", [choice("10.3.1", "Не изменена"), choice("10.3.2", "Гипоэхогенная"), choice("10.3.3", "Гиперэхогенная"), choice("10.3.4", "Смешанная")]),
    group("10.4", "Объёмные образования", [
      choice("10.4.1", "Не визуализируются"), choice("10.4.2", "Визуализируются", [choice("10.4.2.1", "Единичные"), choice("10.4.2.2", "Множественные")]),
    ]),
    integer("10.5", "Размер", "мм"), longText("10.6", "Комментарии"),
  ]),
  group("11", "Матка", [
    choice("11.0.1", "Визуализируется"), choice("11.0.2", "Не визуализируется"),
    group("11.1", "Полость", [choice("11.1.1", "Не расширена"), choice("11.1.2", "Расширена"), choice("11.1.3", "Незначительно расширена")]),
    group("11.2", "Содержимое", [
      choice("11.2.1", "Не визуализируется"), choice("11.2.2", "Анэхогенное"), choice("11.2.3", "Анэхогенное с эхогенными включениями"),
      choice("11.2.4", "Эхогенное однородное"), choice("11.2.5", "Эхогенное неоднородное"), choice("11.2.6", "Гипоэхогенное"), choice("11.2.7", "Гиперэхогенное"),
    ]),
    group("11.3", "Стенка", [
      choice("11.3.1", "Не утолщена"), choice("11.3.2", "Утолщена"), choice("11.3.3", "Неравномерно утолщена"), choice("11.3.4", "Слабо утолщена"),
      choice("11.3.5", "Неоднородная"), choice("11.3.6", "Однородная"), integer("11.3.7", "Толщина", "мм"),
    ]),
    integer("11.4", "Тело, размер", "мм"),
    group("11.5", "Рога", [
      choice("11.5.1", "Не визуализируются"), choice("11.5.2", "Визуализируются"), choice("11.5.3", "Визуализируются фрагментарно"), longText("11.5.4", "Комментарии"),
    ]),
    group("11.6", "Беременность", [choice("11.6.1", "Не выявлена"), choice("11.6.2", "Выявлена")]),
    longText("11.7", "Комментарии"),
  ]),
  longText("12", "Правый яичник"), longText("13", "Левый яичник"),
  longText("14", "Правый надпочечник"), longText("15", "Левый надпочечник"),
  group("16", "ЖКТ", [
    group("16.1", "ДПК", [choice("16.1.1", "Визуализируется"), choice("16.1.2", "Не визуализируется"), integer("16.1.3", "Стенка толщиной", "мм"), longText("16.1.4", "Прочее")]),
    group("16.2", "Тощий кишечник", [choice("16.2.1", "Визуализируется"), choice("16.2.2", "Не визуализируется"), integer("16.2.3", "Стенка толщиной", "мм"), longText("16.2.4", "Прочее")]),
    group("16.3", "Толстый кишечник", [choice("16.3.1", "Визуализируется"), choice("16.3.2", "Не визуализируется"), integer("16.3.3", "Стенка толщиной", "мм"), longText("16.3.4", "Прочее")]),
    longText("16.4", "Лимфоузлы"),
  ]),
  group("17", "Свободная жидкость в брюшной полости", [
    choice("17.0.1", "Не визуализируется"), choice("17.0.2", "Визуализируется"), longText("17.1", "Прочее"),
  ]),
  longText("18", "Комментарии"), longText("19", "Заключение"),
];

export const INSTRUMENTAL_STUDY_CATALOG: readonly InstrumentalStudyTypeCatalogItem[] = [
  { id: "instrumental.study.ultrasound-abdomen", name: "УЗИ органов брюшной полости", mode: "tree", findings: ultrasoundAbdomen },
  { id: "instrumental.study.xray-thorax-abdomen", name: "Рентген грудной и брюшной полости", mode: "narrative", findings: [] },
];

export const INSTRUMENTAL_STUDY_OPTIONS = INSTRUMENTAL_STUDY_CATALOG.map(({ id, name }) => ({ id, label: name }));
const types = new Map(INSTRUMENTAL_STUDY_CATALOG.map((item) => [item.id, item]));
const findings = new Map<string, InstrumentalFindingCatalogItem>();
function indexFindings(items: readonly InstrumentalFindingCatalogItem[]) {
  for (const item of items) { findings.set(item.id, item); indexFindings(item.children); }
}
for (const study of INSTRUMENTAL_STUDY_CATALOG) indexFindings(study.findings);

export const instrumentalStudyTypeById = (id: string) => types.get(id);
export const instrumentalFindingById = (id: string) => findings.get(id);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Некорректное инструментальное исследование.");
  return value as Record<string, unknown>;
}

function normalizeFindings(
  value: unknown,
  catalog: readonly InstrumentalFindingCatalogItem[],
): InstrumentalFindingValue[] {
  if (!Array.isArray(value)) throw new Error("Некорректные результаты инструментального исследования.");
  const catalogById = new Map(catalog.map((item) => [item.id, item]));
  const catalogOrder = new Map(catalog.map((item, index) => [item.id, index]));
  const seen = new Set<string>();
  let selectedChoice = false;
  const normalized = value.map((raw) => {
    const input = object(raw);
    const item = catalogById.get(String(input.findingId ?? ""));
    if (!item || seen.has(item.id)) throw new Error("Некорректная структура результатов инструментального исследования.");
    seen.add(item.id);
    if (item.kind === "choice") {
      if (selectedChoice) throw new Error("Для показателя можно выбрать не более одного значения.");
      selectedChoice = true;
    }
    const rawChildren = input.children ?? [];
    if (!Array.isArray(rawChildren)) throw new Error("Некорректная структура результатов инструментального исследования.");
    if ((item.kind === "integer" || item.kind === "short-text" || item.kind === "long-text") && rawChildren.length) {
      throw new Error("Поле свободного ввода не может содержать вложенные результаты.");
    }
    const children = normalizeFindings(rawChildren, item.children);
    if (item.kind === "group" && !children.length) throw new Error(`Заполните показатель «${item.name}».`);
    if (item.kind === "integer" || item.kind === "short-text" || item.kind === "long-text") {
      const text = String(input.value ?? "").trim();
      if (!text) throw new Error(`Заполните поле «${item.name}».`);
      if (item.kind === "integer" && !/^\d+$/.test(text)) {
        throw new Error(`Укажите целое число для поля «${item.name}».`);
      }
      return {
        findingId: item.id,
        findingName: item.name,
        value: text,
        ...(item.unit ? { unit: item.unit } : {}),
        children,
      };
    }
    return { findingId: item.id, findingName: item.name, children };
  });
  return normalized.sort((left, right) => (catalogOrder.get(left.findingId) ?? 0) - (catalogOrder.get(right.findingId) ?? 0));
}

export function normalizeInstrumentalTestsValue(
  value: unknown,
  today = new Date().toISOString().slice(0, 10),
): InstrumentalTestsSectionValue {
  const section = object(value);
  if (!Array.isArray(section.studies) || !section.studies.length) throw new Error("Добавьте хотя бы одно инструментальное исследование.");
  const seen = new Set<string>();
  const studies = section.studies.map((raw): InstrumentalStudyValue => {
    const input = object(raw);
    const id = String(input.id ?? "");
    const date = String(input.date ?? "");
    const type = types.get(String(input.typeId ?? ""));
    if (!UUID.test(id) || seen.has(id)) throw new Error("Некорректный идентификатор исследования.");
    seen.add(id);
    if (!validDate(date) || date > today) throw new Error("Укажите корректную дату исследования.");
    if (!type) throw new Error("Выберите инструментальное исследование из справочника.");
    const comment = String(input.comment ?? "").trim();
    const base = { id, date, typeId: type.id, typeName: type.name, ...(comment ? { comment } : {}) };
    if (type.mode === "narrative") {
      const result = String(input.result ?? "").trim();
      if (!result) throw new Error("Укажите результат исследования.");
      return { ...base, mode: "narrative", result };
    }
    if (!Array.isArray(input.findings) || !input.findings.length) throw new Error("Добавьте результаты инструментального исследования.");
    return { ...base, mode: "tree", findings: normalizeFindings(input.findings, type.findings) };
  });
  return { studies };
}
