// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type {
  InstrumentalConflictPair,
  InstrumentalFindingCatalogItem,
  InstrumentalFindingKind,
  InstrumentalSelectionSet,
} from "./instrumental.js";

const prefix = "instrumental.finding.xray-thorax";
const id = (code: string) => `${prefix}.${code}`;
const node = (
  code: string,
  name: string,
  kind: InstrumentalFindingKind,
  children: readonly InstrumentalFindingCatalogItem[] = [],
): InstrumentalFindingCatalogItem => ({ id: id(code), name, kind, children });
const group = (code: string, name: string, children: readonly InstrumentalFindingCatalogItem[]) =>
  node(code, name, "group", children);
const choice = (code: string, name: string, children: readonly InstrumentalFindingCatalogItem[] = []) =>
  node(code, name, "choice", children);
const shortText = (code: string, name: string) => node(code, name, "short-text");
const longText = (code: string, name: string) => node(code, name, "long-text");
const requiredShortText = (code: string, name: string): InstrumentalFindingCatalogItem => ({
  ...shortText(code, name),
  required: true,
});
const requiredLongText = (code: string, name: string): InstrumentalFindingCatalogItem => ({
  ...longText(code, name),
  required: true,
});
const conflictPairs = (pairs: readonly (readonly [string, string])[]): readonly InstrumentalConflictPair[] =>
  pairs.map(([left, right]) => [id(left), id(right)] as const);
const multipleGroup = (
  code: string,
  name: string,
  children: readonly InstrumentalFindingCatalogItem[],
  conflicts: readonly InstrumentalConflictPair[] = [],
): InstrumentalFindingCatalogItem => ({
  ...group(code, name, children),
  selectionMode: "multiple",
  ...(conflicts.length ? { conflictPairs: conflicts } : {}),
});
const requiredSelectionSetGroup = (
  code: string,
  name: string,
  children: readonly InstrumentalFindingCatalogItem[],
  selectionSets: readonly InstrumentalSelectionSet[],
): InstrumentalFindingCatalogItem => ({
  ...group(code, name, children),
  selectionSets,
  required: true,
});
const inlineSelectionSetGroup = (
  code: string,
  name: string,
  children: readonly InstrumentalFindingCatalogItem[],
  selectionSets: readonly InstrumentalSelectionSet[],
  conflicts: readonly InstrumentalConflictPair[] = [],
): InstrumentalFindingCatalogItem => ({
  ...group(code, name, children),
  selectionMode: "multiple",
  selectionSets,
  ...(conflicts.length ? { conflictPairs: conflicts } : {}),
});
const lungPatternConflictPairs = conflictPairs([
  ["17.3.1", "17.3.5"], ["17.3.1", "17.3.6"], ["17.3.1", "17.3.7"], ["17.3.1", "17.3.8"],
  ["17.3.3", "17.3.9"],
]);

export const XRAY_THORAX_FINDINGS: readonly InstrumentalFindingCatalogItem[] = [
  group("1", "Выполненные проекции", [
    multipleGroup("1.0", "Проекции", [
      choice("1.0.1", "Левая латеролатеральная"),
      choice("1.0.2", "Правая латеролатеральная"),
      choice("1.0.3", "Вентродорсальная"),
      choice("1.0.4", "Дорсовентральная"),
    ]),
  ]),
  group("2", "Качество рентгенограмм", [
    choice("2.0.1", "Высокое"), choice("2.0.2", "Среднее"), choice("2.0.3", "Низкое"),
  ]),
  group("3", "Режим экспозиции", [
    choice("3.0.1", "Удовлетворительный"),
    choice("3.0.2", "Недостаточный (засветка)"),
    choice("3.0.3", "Избыточный (затемнено)"),
  ]),
  group("4", "Респираторная фаза", [
    choice("4.0.1", "Вдох"), choice("4.0.2", "Выдох"), choice("4.0.3", "Неглубокий вдох"),
  ]),
  shortText("5", "Область интересов"),
  group("6", "Охват области интересов", [choice("6.0.1", "Полный"), choice("6.0.2", "Неполный")]),
  group("7", "Мягкие ткани", [
    choice("7.0.1", "Не изменены"),
    choice("7.0.2", "Имеют изменения", [
      choice("7.0.2.1", "Мягкотканные образования"),
      choice("7.0.2.2", "Подкожная эмфизема"),
      choice("7.0.2.3", "Другое", [requiredLongText("7.0.2.3.text", "Описание изменений")]),
    ]),
  ]),
  group("8", "Упитанность", [
    choice("8.0.1", "Средняя"), choice("8.0.2", "Снижена"), choice("8.0.3", "Повышена"),
  ]),
  group("9", "Костно-суставной аппарат", [
    choice("9.0.1", "Соответствует породе и возрасту"),
    choice("9.0.2", "Патологий не имеет"),
    choice("9.0.3", "Имеет признаки патологий", [
      choice("9.0.3.1", "Остеофиты"),
      choice("9.0.3.2", "Перелом", [requiredLongText("9.0.3.2.text", "Описание перелома")]),
      choice("9.0.3.3", "Деформации тел грудных позвонков"),
      choice("9.0.3.4", "Атипичные позвонки"),
      choice("9.0.3.5", "Другое", [requiredLongText("9.0.3.5.text", "Описание патологии")]),
    ]),
  ]),
  group("10", "Купол диафрагмы", [
    requiredSelectionSetGroup("10.0", "Характеристики купола", [
      choice("10.0.1", "Ровный"), choice("10.0.2", "Неровный"),
      choice("10.0.3", "Чёткий"), choice("10.0.4", "Нечёткий"),
      choice("10.0.5", "На LL-проекции в области межреберья", [
        requiredShortText("10.0.5.intercostal", "Межреберье на LL-проекции"),
      ]),
      choice("10.0.6", "На VD-проекции в области межреберья", [
        requiredShortText("10.0.6.intercostal", "Межреберье на VD-проекции"),
      ]),
    ], [{
      key: "regularity",
      name: "Ровность купола",
      choiceIds: [id("10.0.1"), id("10.0.2")],
      required: true,
    }, {
      key: "definition",
      name: "Чёткость купола",
      choiceIds: [id("10.0.3"), id("10.0.4")],
      required: true,
    }, {
      key: "projection",
      name: "Проекция",
      choiceIds: [id("10.0.5"), id("10.0.6")],
      required: true,
    }]),
    group("10.1", "Ножки диафрагмы", [
      choice("10.1.1", "Визуализируются", [
        requiredShortText("10.1.1.vertebra", "Уровень грудного позвонка"),
      ]),
      choice("10.1.2", "Не визуализируются"),
    ]),
  ]),
  group("11", "Тень трахеи", [
    group("11.1", "Воздушный столб на всём протяжении", [
      choice("11.1.1", "Одинакового диаметра"),
      choice("11.1.2", "Различного диаметра"),
      choice("11.1.3", "Имеет сужение", [
        choice("11.1.3.1", "В верхней трети"),
        choice("11.1.3.2", "В средней трети"),
        choice("11.1.3.3", "В нижней трети"),
      ]),
    ]),
    group("11.2", "Патологические изгибы", [choice("11.2.1", "Не выявлены"), choice("11.2.2", "Выявлены")]),
    group("11.3", "Положение", [
      choice("11.3.1", "Правильное"),
      choice("11.3.2", "Неправильное", [
        choice("11.3.3", "Смещено дорсально"), choice("11.3.4", "Смещено вентрально"),
      ]),
    ]),
    group("11.4", "Отмечается", [
      choice("11.4.1", "Минерализация полуколец"), choice("11.4.2", "Инородное тело"),
      choice("11.4.3", "Трахеальный тубус"),
      choice("11.4.4", "Прочее", [requiredLongText("11.4.4.text", "Описание")]),
    ]),
  ]),
  group("12", "Сердечный силуэт", [
    group("12.1", "Форма", [choice("12.1.1", "Овальная"), choice("12.1.2", "Округлая")]),
    inlineSelectionSetGroup("12.2", "Границы", [
      choice("12.2.1", "Чёткие"), choice("12.2.2", "Нечёткие"),
      choice("12.2.3", "Ровные"), choice("12.2.4", "Неровные"),
    ], [{
      key: "regularity",
      name: "Ровность границ",
      choiceIds: [id("12.2.3"), id("12.2.4")],
    }, {
      key: "definition",
      name: "Чёткость границ",
      choiceIds: [id("12.2.1"), id("12.2.2")],
    }]),
    group("12.3", "Ось", [
      choice("12.3.1", "Вертикальная"), choice("12.3.2", "Отклонена"), choice("12.3.3", "Завалена на грудину"),
    ]),
    group("12.4", "Признаки расширения камер", [
      choice("12.4.1", "Не выявлены"),
      choice("12.4.2", "Выявлены", [
        choice("12.4.2.1", "Увеличение тени правого предсердия"),
        choice("12.4.2.2", "Увеличение тени левых отделов"),
      ]),
    ]),
    shortText("12.5", "VHS"),
  ]),
  group("13", "Аорта", [
    group("13.1", "Выявляется", [
      choice("13.1.1", "Чётко"), choice("13.1.2", "Нечётко"), choice("13.1.3", "Не визуализируется"),
    ]),
    group("13.2", "Положение", [
      choice("13.2.1", "Не изменено"),
      choice("13.2.2", "Изменено", [
        choice("13.2.2.1", "Смещена дорсально"), choice("13.2.2.2", "Смещена вентрально"),
      ]),
    ]),
    group("13.3", "Диаметр", [
      choice("13.3.1", "Не изменён"),
      choice("13.3.2", "Изменён", [
        choice("13.3.2.1", "Уменьшен/сужен"), choice("13.3.2.2", "Увеличен/расширен"),
      ]),
    ]),
    longText("13.4", "Выявлено"),
  ]),
  group("14", "Каудальная полая вена", [
    {
      ...group("14.1", "Выявляется", [
        choice("14.1.1", "Чётко"), choice("14.1.2", "Нечётко"), choice("14.1.3", "Не визуализируется"),
      ]),
      terminalChoiceIds: [id("14.1.3")],
    },
    group("14.2", "Положение", [
      choice("14.2.1", "Не изменено"),
      choice("14.2.2", "Изменено", [
        choice("14.2.2.1", "Смещена дорсально"), choice("14.2.2.2", "Смещена вентрально"),
      ]),
    ]),
    group("14.3", "Диаметр", [
      choice("14.3.1", "Не изменён"),
      choice("14.3.2", "Изменён", [
        choice("14.3.2.1", "Уменьшен/сужен"), choice("14.3.2.2", "Увеличен/расширен"),
      ]),
    ]),
    longText("14.4", "Выявлено"),
  ]),
  group("15", "Средостение", [
    group("15.1", "Краниальное средостение", [
      group("15.1.1", "Патологические изменения", [
        choice("15.1.1.1", "Не выявлены"), choice("15.1.1.2", "Расширено/затемнено"),
        choice("15.1.1.3", "Не расширено"),
        choice("15.1.1.4", "Выявлены, другое", [requiredLongText("15.1.1.4.text", "Описание изменений")]),
      ]),
    ]),
    group("15.2", "Пищевод", [
      choice("15.2.1", "Не визуализируется"),
      choice("15.2.2", "Визуализируется", [
        choice("15.2.2.1", "Расширение газом"), choice("15.2.2.2", "Пищевой ком"),
        choice("15.2.2.3", "Инородный предмет"), choice("15.2.2.4", "Пищевой зонд"),
        choice("15.2.2.5", "Прочее", [requiredLongText("15.2.2.5.text", "Описание")]),
      ]),
    ]),
    group("15.3", "Каудальное средостение", [
      group("15.3.1", "Патологические изменения", [
        choice("15.3.1.1", "Не выявлены"),
        choice("15.3.1.2", "Выявлены", [requiredLongText("15.3.1.2.text", "Описание изменений")]),
      ]),
    ]),
  ]),
  group("16", "Лимфатические узлы", [
    choice("16.0.1", "Не визуализируются"), choice("16.0.2", "Визуализируются"),
    choice("16.0.3", "Увеличение тени стернальных лимфоузлов"),
    choice("16.0.4", "Увеличение тени трахеальных лимфоузлов"),
    longText("16.1", "Прочее"),
  ]),
  group("17", "Лёгочные поля", [
    group("17.1", "Прозрачность", [
      choice("17.1.1", "Сохранена"), choice("17.1.2", "Снижена"),
      choice("17.1.3", "Повышена"), choice("17.1.4", "Отсутствует"),
    ]),
    group("17.2", "Размер", [
      choice("17.2.1", "Сохранён"), choice("17.2.2", "Увеличен"), choice("17.2.3", "Уменьшен"),
    ]),
    inlineSelectionSetGroup("17.3", "Лёгочный рисунок", [
      choice("17.3.1", "Без признаков усиления"),
      choice("17.3.2", "Без признаков деформации"),
      choice("17.3.3", "Без признаков очаговых изменений"),
      choice("17.3.4", "Без признаков диффузных изменений"),
      choice("17.3.5", "Имеет усиление бронхиального рисунка"),
      choice("17.3.6", "Имеет усиление интерстициального неструктурированного рисунка"),
      choice("17.3.7", "Имеет усиление интерстициального структурированного рисунка"),
      choice("17.3.8", "Имеет усиление альвеолярного рисунка"),
      choice("17.3.9", "Имеет картину очаговых единичных поражений"),
      choice("17.3.10", "Имеет картину альвеолярных поражений"),
      choice("17.3.11", "Имеет картину заворота"),
      choice("17.3.12", "Имеет картину ателектаза"),
      {
        ...multipleGroup("17.3.13", "Изменения отмечаются в", [
          choice("17.3.13.1", "Краниальных долях лёгкого"),
          choice("17.3.13.2", "Каудальных долях лёгкого"),
        ]),
        hiddenWhenAllChoiceIdsSelected: [
          id("17.3.1"), id("17.3.2"), id("17.3.3"), id("17.3.4"),
        ],
      },
    ], [{
      key: "negative",
      name: "Отсутствие признаков",
      choiceIds: [id("17.3.1"), id("17.3.2"), id("17.3.3"), id("17.3.4")],
      selectionMode: "multiple",
      showName: false,
    }, {
      key: "positive",
      name: "Выявленные изменения",
      choiceIds: [
        id("17.3.5"), id("17.3.6"), id("17.3.7"), id("17.3.8"),
        id("17.3.9"), id("17.3.10"), id("17.3.11"), id("17.3.12"),
      ],
      selectionMode: "multiple",
    }], lungPatternConflictPairs),
    group("17.4", "Сосудистый рисунок", [
      choice("17.4.1", "Не изменён"), choice("17.4.2", "Изменён"), choice("17.4.3", "Оценка затруднена"),
    ]),
    group("17.5", "Крупные бронхи", [
      choice("17.5.0.1", "Не изменены"),
      choice("17.5.0.2", "Изменены"),
      group("17.5.1", "Просвет", [
        choice("17.5.1.1", "Не изменён"), choice("17.5.1.2", "Сужен"), choice("17.5.1.3", "Расширен"),
      ]),
      group("17.5.2", "Положение", [
        choice("17.5.2.1", "Правильное"), choice("17.5.2.2", "Неправильное"),
        choice("17.5.2.3", "Имеется расхождение", [
          choice("17.5.2.3.1", "Каудальных"), choice("17.5.2.3.2", "Краниальных"),
        ]),
      ]),
    ]),
    longText("17.6", "Прочее"),
  ]),
  group("18", "Плевральная полость", [
    group("18.1", "Патологические изменения", [
      choice("18.1.1", "Не выявлены"),
      choice("18.1.2", "Выявлены", [
        choice("18.1.2.1", "Плевральные вырезки"),
        choice("18.1.2.2", "Другое", [requiredLongText("18.1.2.2.text", "Описание изменений")]),
      ]),
    ]),
    group("18.2", "Свободный газ", [
      choice("18.2.0.1", "Не визуализируется"),
      choice("18.2.0.2", "Визуализируется", [
        group("18.2.1", "Количество", [
          choice("18.2.1.1", "Незначительное"), choice("18.2.1.2", "Умеренное"), choice("18.2.1.3", "Значительное"),
        ]),
      ]),
    ]),
    group("18.3", "Свободная жидкость", [
      choice("18.3.0.1", "Не визуализируется"),
      choice("18.3.0.2", "Визуализируется", [
        group("18.3.1", "Количество", [
          choice("18.3.1.1", "Незначительное"), choice("18.3.1.2", "Умеренное"), choice("18.3.1.3", "Значительное"),
        ]),
      ]),
    ]),
  ]),
  longText("19", "Комментарии"),
  longText("20", "Заключение"),
];
