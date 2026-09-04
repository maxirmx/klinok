// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type {
  InstrumentalFindingCatalogItem,
  InstrumentalFindingKind,
  InstrumentalSelectionSet,
} from "./instrumental.js";

const prefix = "instrumental.finding.xray-abdomen";
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
const multipleGroup = (
  code: string,
  name: string,
  children: readonly InstrumentalFindingCatalogItem[],
): InstrumentalFindingCatalogItem => ({
  ...group(code, name, children),
  selectionMode: "multiple",
});
const selectionSetGroup = (
  code: string,
  name: string,
  children: readonly InstrumentalFindingCatalogItem[],
  selectionSets: readonly InstrumentalSelectionSet[],
): InstrumentalFindingCatalogItem => ({
  ...group(code, name, children),
  selectionSets,
});
const inlineSelectionSetGroup = (
  code: string,
  name: string,
  children: readonly InstrumentalFindingCatalogItem[],
  selectionSets: readonly InstrumentalSelectionSet[],
): InstrumentalFindingCatalogItem => ({
  ...selectionSetGroup(code, name, children, selectionSets),
  selectionMode: "multiple",
});

export const XRAY_ABDOMEN_FINDINGS: readonly InstrumentalFindingCatalogItem[] = [
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
  shortText("4", "Область интересов"),
  group("5", "Охват области интересов", [choice("5.0.1", "Полный"), choice("5.0.2", "Неполный")]),
  group("6", "Мягкие ткани", [
    choice("6.0.1", "Не изменены"),
    choice("6.0.2", "Имеют изменения", [
      choice("6.0.2.1", "Мягкотканные образования"),
      choice("6.0.2.2", "Подкожная эмфизема"),
      choice("6.0.2.3", "Инородное тело", [
        choice("6.0.2.3.1", "Капсула чипа"),
        choice("6.0.2.3.2", "Пуля"),
        choice("6.0.2.3.3", "Другое", [requiredLongText("6.0.2.3.3.text", "Описание инородного тела")]),
      ]),
      choice("6.0.2.4", "Другое", [requiredLongText("6.0.2.4.text", "Описание изменений")]),
    ]),
  ]),
  group("7", "Упитанность", [
    choice("7.0.1", "Средняя"), choice("7.0.2", "Снижена"), choice("7.0.3", "Повышена"),
  ]),
  group("8", "Костно-суставной аппарат", [
    choice("8.0.1", "Соответствует породе и возрасту"),
    choice("8.0.2", "Патологий не имеет"),
    choice("8.0.3", "Имеет признаки патологий", [
      multipleGroup("8.0.3.findings", "Признаки патологий", [
        choice("8.0.3.1", "Остеофиты"),
        choice("8.0.3.2", "Перелом", [requiredLongText("8.0.3.2.text", "Описание перелома")]),
        choice("8.0.3.3", "Деформации тел грудных позвонков"),
        choice("8.0.3.4", "Деформация тел поясничных позвонков"),
        choice("8.0.3.5", "Другое", [requiredLongText("8.0.3.5.text", "Описание патологии")]),
      ]),
    ]),
  ]),
  group("9", "Купол диафрагмы", [
    selectionSetGroup("9.0", "Характеристики купола", [
      choice("9.0.1", "Ровный"), choice("9.0.2", "Неровный"),
      choice("9.0.3", "Чёткий"), choice("9.0.4", "Нечёткий"),
      choice("9.0.5", "На LL-проекции в области межреберья", [
        requiredShortText("9.0.5.intercostal", "Межреберье на LL-проекции"),
      ]),
      choice("9.0.6", "На VD-проекции в области межреберья", [
        requiredShortText("9.0.6.intercostal", "Межреберье на VD-проекции"),
      ]),
    ], [{
      key: "regularity",
      name: "Ровность купола",
      choiceIds: [id("9.0.1"), id("9.0.2")],
    }, {
      key: "definition",
      name: "Чёткость купола",
      choiceIds: [id("9.0.3"), id("9.0.4")],
    }, {
      key: "projection",
      name: "Проекция измерения",
      choiceIds: [id("9.0.5"), id("9.0.6")],
    }]),
    group("9.1", "Ножки диафрагмы", [
      choice("9.1.1", "Визуализируются", [
        requiredShortText("9.1.1.vertebra", "Уровень грудного позвонка"),
      ]),
      choice("9.1.2", "Не визуализируются"),
    ]),
  ]),
  group("10", "Серозная дифференциация", [
    choice("10.0.1", "Сохранена"), choice("10.0.2", "Отсутствует"),
  ]),
  group("11", "Брюшная стенка", [
    selectionSetGroup("11.0", "Характеристики брюшной стенки", [
      choice("11.0.1", "Ровная"), choice("11.0.2", "Неровная"),
      choice("11.0.3", "Чёткая"), choice("11.0.4", "Нечёткая"),
    ], [{
      key: "regularity",
      name: "Ровность стенки",
      choiceIds: [id("11.0.1"), id("11.0.2")],
    }, {
      key: "definition",
      name: "Чёткость стенки",
      choiceIds: [id("11.0.3"), id("11.0.4")],
    }]),
    group("11.1", "Патологии", [
      choice("11.1.1", "Не выявлены"),
      choice("11.1.2", "Выявлены", [requiredLongText("11.1.2.text", "Описание патологий")]),
    ]),
  ]),
  group("12", "Печень", [
    group("12.1", "Тень", [choice("12.1.1", "Однородная"), choice("12.1.2", "Неоднородная")]),
    group("12.2", "Плотность", [
      choice("12.2.1", "Средняя"), choice("12.2.2", "Высокая"), choice("12.2.3", "Низкая"),
    ]),
    selectionSetGroup("12.3", "Границы", [
      choice("12.3.1", "Чёткие"), choice("12.3.2", "Нечёткие"),
      choice("12.3.3", "Не доходят до границ рёберной дуги"),
      choice("12.3.4", "Вровень с рёберной дугой"),
      choice("12.3.5", "Незначительно выходят за рёберную дугу"),
      choice("12.3.6", "Значительно выходят за рёберную дугу"),
    ], [{
      key: "definition",
      name: "Чёткость границ",
      choiceIds: [id("12.3.1"), id("12.3.2")],
    }, {
      key: "rib-arch-position",
      name: "Положение относительно рёберной дуги",
      choiceIds: [id("12.3.3"), id("12.3.4"), id("12.3.5"), id("12.3.6")],
    }]),
    group("12.4", "Патологии", [
      choice("12.4.1", "Не выявлены"),
      choice("12.4.2", "Выявлены", [requiredLongText("12.4.2.text", "Описание патологий")]),
    ]),
  ]),
  group("13", "Селезёнка", [
    selectionSetGroup("13.1", "Тень", [
      choice("13.1.1", "Увеличена"), choice("13.1.2", "Не увеличена"),
      choice("13.1.3", "Однородная"), choice("13.1.4", "Неоднородная"),
    ], [{
      key: "size",
      name: "Размер тени",
      choiceIds: [id("13.1.1"), id("13.1.2")],
    }, {
      key: "homogeneity",
      name: "Однородность тени",
      choiceIds: [id("13.1.3"), id("13.1.4")],
    }]),
    group("13.2", "Плотность", [
      choice("13.2.1", "Средняя"), choice("13.2.2", "Высокая"), choice("13.2.3", "Низкая"),
    ]),
    group("13.3", "Положение", [choice("13.3.1", "Правильное"), choice("13.3.2", "Неправильное")]),
    group("13.4", "Границы", [choice("13.4.1", "Чёткие"), choice("13.4.2", "Нечёткие")]),
    group("13.5", "Патологии", [
      choice("13.5.1", "Не выявлены"),
      choice("13.5.2", "Выявлены", [requiredLongText("13.5.2.text", "Описание патологий")]),
    ]),
  ]),
  group("14", "Область поджелудочной железы", [
    group("14.1", "Патологии", [
      choice("14.1.1", "Не выявлены"),
      choice("14.1.2", "Выявлены", [requiredLongText("14.1.2.text", "Описание патологий")]),
    ]),
  ]),
  group("15", "Почки", [
    group("15.1", "Положение", [
      choice("15.1.1", "Правильное"),
      choice("15.1.2", "Атипичное", [requiredLongText("15.1.2.text", "Описание положения")]),
    ]),
    group("15.2", "Форма", [
      choice("15.2.1", "Правильная"), choice("15.2.2", "Неправильная"),
      choice("15.2.3", "Бобовидная"), choice("15.2.4", "Округлая"),
    ]),
    group("15.3", "Границы", [choice("15.3.1", "Чёткие"), choice("15.3.2", "Нечёткие")]),
    group("15.4", "Плотность", [
      choice("15.4.1", "Средняя"), choice("15.4.2", "Высокая"), choice("15.4.3", "Низкая"),
    ]),
    group("15.5", "Структура", [
      choice("15.5.1", "Однородная"),
      choice("15.5.2", "Неоднородная", [
        choice("15.5.2.1", "С участками затемнения"),
        choice("15.5.2.2", "С участками минерализации"),
        choice("15.5.2.3", "Другое", [requiredLongText("15.5.2.3.text", "Описание структуры")]),
      ]),
    ]),
    group("15.6", "Патологии", [
      choice("15.6.1", "Не выявлены"),
      choice("15.6.2", "Выявлены", [
        choice("15.6.2.1", "Минерализация лоханки"),
        choice("15.6.2.2", "Нефролит"),
        choice("15.6.2.3", "Другое", [requiredLongText("15.6.2.3.text", "Описание патологий")]),
      ]),
    ]),
  ]),
  group("16", "Мочеточники", [
    choice("16.0.1", "Визуализируются"), choice("16.0.2", "Не визуализируются"),
  ]),
  group("17", "Мочевой пузырь", [
    group("17.1", "Наполнение", [
      choice("17.1.1", "Умеренное"), choice("17.1.2", "Слабое"), choice("17.1.3", "Чрезмерное"),
    ]),
    group("17.2", "Форма", [
      choice("17.2.1", "Округлая"), choice("17.2.2", "Овальная"), choice("17.2.3", "Неправильная"),
    ]),
    group("17.3", "Плотность", [
      choice("17.3.1", "Средняя"), choice("17.3.2", "Высокая"), choice("17.3.3", "Низкая"),
    ]),
    group("17.4", "Структура", [choice("17.4.1", "Однородная"), choice("17.4.2", "Неоднородная")]),
    group("17.5", "Положение", [
      choice("17.5.1", "Типичное"),
      choice("17.5.2", "Выявлена дислокация", [requiredLongText("17.5.2.text", "Описание дислокации")]),
    ]),
    group("17.6", "Патологии", [
      choice("17.6.1", "Не выявлены"),
      choice("17.6.2", "Выявлены", [
        choice("17.6.2.1", "Единичный уролит"),
        choice("17.6.2.2", "Множественные уролиты"),
        choice("17.6.2.3", "Конгломерат уролитов"),
        choice("17.6.2.4", "Другое", [requiredLongText("17.6.2.4.text", "Описание патологий")]),
      ]),
    ]),
  ]),
  group("18", "Уретра", [
    choice("18.0.1", "Не визуализируется"), choice("18.0.2", "Визуализируется"),
    longText("18.1", "Другое"),
  ]),
  group("19", "Ретроперитонеальное пространство", [
    group("19.1", "Патологии", [
      choice("19.1.1", "Не выявлены"),
      choice("19.1.2", "Выявлены", [requiredLongText("19.1.2.text", "Описание патологий")]),
    ]),
  ]),
  group("20", "Желудок", [
    group("20.1", "Наполнение", [
      choice("20.1.1", "Не наполнен"), choice("20.1.2", "Умеренно наполнен"),
      choice("20.1.3", "Значимо наполнен"), choice("20.1.4", "Раздут"),
    ]),
    group("20.2", "Положение", [
      choice("20.2.1", "Правильное"), choice("20.2.2", "Неправильное"),
      choice("20.2.3", "Выявлена дислокация", [requiredLongText("20.2.3.1", "Описание дислокации")]),
    ]),
    group("20.3", "Ось", [
      choice("20.3.1", "Сохранена"), choice("20.3.2", "Отсутствует"), choice("20.3.3", "Отклонена"),
    ]),
    group("20.4", "Патологии", [
      choice("20.4.1", "Не выявлены"),
      choice("20.4.2", "Выявлены", [requiredLongText("20.4.2.text", "Описание патологий")]),
    ]),
  ]),
  group("21", "Тонкий отдел кишечника", [
    group("21.1", "Положение", [
      choice("21.1.1", "Правильное"), choice("21.1.2", "Неправильное"),
      choice("21.1.3", "Выявлена дислокация", [requiredLongText("21.1.3.1", "Описание дислокации")]),
    ]),
    group("21.2", "Просвет", [
      choice("21.2.1", "Не расширен"), choice("21.2.2", "Расширен на всём протяжении"),
      choice("21.2.3", "Расширен локально"),
    ]),
    group("21.3", "Содержимое", [
      choice("21.3.1", "Не визуализируется"),
      choice("21.3.2", "Визуализируется", [
        multipleGroup("21.3.2.contents", "Содержимое тонкого кишечника", [
          choice("21.3.2.1", "Жидкость"), choice("21.3.2.2", "Газ"),
          choice("21.3.2.3", "Контрастное вещество"), choice("21.3.2.4", "Линейный инородный предмет"),
          choice("21.3.2.5", "Инородный предмет"),
          choice("21.3.2.6", "Другое", [requiredLongText("21.3.2.6.text", "Описание содержимого")]),
        ]),
      ]),
    ]),
    group("21.4", "Патологии", [
      choice("21.4.1", "Не выявлены"),
      choice("21.4.2", "Выявлены", [requiredLongText("21.4.2.text", "Описание патологий")]),
    ]),
  ]),
  group("22", "Толстый отдел кишечника", [
    group("22.1", "Положение", [
      choice("22.1.1", "Правильное"), choice("22.1.2", "Неправильное"),
      choice("22.1.3", "Выявлена дислокация", [requiredLongText("22.1.3.1", "Описание дислокации")]),
    ]),
    group("22.2", "Просвет", [
      choice("22.2.1", "Не расширен"), choice("22.2.2", "Расширен на всём протяжении"),
      choice("22.2.3", "Расширен локально"), choice("22.2.4", "Значимо расширен каловыми массами"),
    ]),
    group("22.3", "Содержимое", [
      choice("22.3.1", "Не визуализируется"),
      choice("22.3.2", "Визуализируется", [
        multipleGroup("22.3.2.contents", "Содержимое толстого кишечника", [
          choice("22.3.2.1", "Жидкость"), choice("22.3.2.2", "Газ"),
          choice("22.3.2.3", "Каловые массы"), choice("22.3.2.4", "Контрастное вещество"),
          choice("22.3.2.5", "Линейный инородный предмет"), choice("22.3.2.6", "Инородный предмет"),
          choice("22.3.2.7", "Другое", [requiredLongText("22.3.2.7.text", "Описание содержимого")]),
        ]),
      ]),
    ]),
    group("22.4", "Патологии", [
      choice("22.4.1", "Не выявлены"),
      choice("22.4.2", "Выявлены", [requiredLongText("22.4.2.text", "Описание патологий")]),
    ]),
  ]),
  group("23", "Репродуктивная система", [
    group("23.1", "Матка", [
      choice("23.1.0.1", "Визуализируется", [
        group("23.1.1", "Просвет", [choice("23.1.1.1", "Расширен"), choice("23.1.1.2", "Не расширен")]),
      ]),
      choice("23.1.0.2", "Не визуализируется"),
    ]),
    group("23.2", "Предстательная железа", [
      choice("23.2.1", "Визуализируется"), choice("23.2.2", "Не визуализируется"),
    ]),
    group("23.3", "Половой член", [
      group("23.3.1", "Os penis", [
        choice("23.3.1.1", "Не визуализируется"),
        choice("23.3.1.2", "Визуализируется", [
          inlineSelectionSetGroup("23.3.1.2.characteristics", "Характеристики Os penis", [
            choice("23.3.1.3", "Чётко"), choice("23.3.1.4", "Нечётко"), choice("23.3.1.5", "Имеет перелом"),
          ], [{
            key: "definition",
            name: "Чёткость",
            choiceIds: [id("23.3.1.3"), id("23.3.1.4")],
          }, {
            key: "fracture",
            name: "Перелом",
            choiceIds: [id("23.3.1.5")],
            selectionMode: "multiple",
          }]),
        ]),
      ]),
      group("23.3.2", "Мягкие ткани", [
        choice("23.3.2.1", "Без патологий"),
        choice("23.3.2.2", "Имеют патологии", [requiredLongText("23.3.2.2.1", "Описание патологий")]),
      ]),
    ]),
    longText("23.4", "Дополнительно"),
  ]),
  group("24", "Перитонеальная полость", [
    group("24.1", "Жидкость", [
      choice("24.1.1", "Не визуализируется"),
      choice("24.1.2", "Визуализируется", [
        choice("24.1.2.1", "Незначительно"), choice("24.1.2.2", "Значительно"),
      ]),
    ]),
    group("24.2", "Газ", [
      choice("24.2.1", "Не визуализируется"),
      choice("24.2.2", "Визуализируется", [
        choice("24.2.2.1", "Незначительно"), choice("24.2.2.2", "Значительно"),
      ]),
    ]),
    longText("24.3", "Другое"),
  ]),
  longText("25", "Комментарии"),
  longText("26", "Заключение"),
];
