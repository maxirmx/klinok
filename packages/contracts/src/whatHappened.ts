// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

export interface WhatHappenedOption {
  readonly id: string;
  readonly label: string;
  readonly children?: readonly WhatHappenedOption[];
}

const leaf = (id: string, label: string): WhatHappenedOption => ({ id, label });

export const WHAT_HAPPENED_TREE: WhatHappenedOption = {
  id: "what-happened",
  label: "Что случилось",
  children: [
    {
      id: "well",
      label: "Всё хорошо, необходимо",
      children: [
        leaf("well.1", "Контрольный осмотр"),
        leaf("well.2", "Чипирование"),
        leaf("well.3", "Вакцинация"),
        leaf("well.4", "Стрижка"),
        leaf("well.5", "Манипуляции"),
        leaf("well.6", "Транспортировка"),
        leaf("well.7", "Повторный осмотр"),
        leaf("well.8", "Взятие анализов"),
        leaf("well.9", "Проведение исследования"),
      ],
    },
    {
      id: "problem",
      label: "Не всё хорошо с",
      children: [
        {
          id: "problem.general",
          label: "Общим состоянием",
          children: [
            leaf("problem.general.1", "Изменилось поведение"),
            leaf("problem.general.2", "Вялый"),
            leaf("problem.general.3", "Всё время спит"),
            leaf("problem.general.4", "Всё время лежит"),
            leaf("problem.general.5", "Стал агрессивный"),
            leaf("problem.general.6", "Стал жаловаться, выть, плакать"),
            leaf("problem.general.7", "Вокализирует при дотрагивании"),
            leaf("problem.general.8", "Возбуждённый"),
            leaf("problem.general.9", "Не играет"),
            leaf("problem.general.10", "Теряет вес"),
            leaf("problem.general.11", "Набирает вес"),
            leaf("problem.general.12", "Не набирает вес"),
            leaf("problem.general.13", "Нарушена ориентация в пространстве"),
            leaf("problem.general.14", "Натыкается на предметы"),
            leaf("problem.general.15", "Ходит кругами"),
            leaf("problem.general.16", "Заваливается на бок"),
            leaf("problem.general.17", "Шаткость походки"),
            leaf("problem.general.18", "Ездит на попе"),
          ],
        },
        {
          id: "problem.digestive",
          label: "Пищеварением",
          children: [
            leaf("problem.digestive.1", "Не ест"),
            leaf("problem.digestive.2", "Снижен аппетит"),
            leaf("problem.digestive.3", "Повышен аппетит"),
            leaf("problem.digestive.4", "Извращённый аппетит"),
            leaf("problem.digestive.5", "Жажда отсутствует"),
            leaf("problem.digestive.6", "Повышенная жажда"),
            leaf("problem.digestive.7", "Рвота"),
            leaf("problem.digestive.8", "Рвота розовым"),
            leaf("problem.digestive.9", "Диарея (понос)"),
            leaf("problem.digestive.10", "Запор"),
            leaf("problem.digestive.11", "Тужится"),
            leaf("problem.digestive.12", "Срыгивает"),
            leaf("problem.digestive.13", "Слюнотечение"),
            leaf("problem.digestive.14", "Запах из пасти"),
            leaf("problem.digestive.15", "Налёт или камень на зубах"),
            leaf("problem.digestive.16", "Кровоточивость или воспаление дёсен"),
            leaf("problem.digestive.17", "Что-то в пасти"),
            leaf("problem.digestive.18", "Что-то под хвостом"),
            leaf("problem.digestive.19", "Синий язык"),
            leaf("problem.digestive.20", "Красный или алый язык"),
            leaf("problem.digestive.21", "Что-то с языком"),
            leaf("problem.digestive.22", "Кал с кровью"),
            leaf("problem.digestive.23", "Кал со слизью"),
            leaf("problem.digestive.24", "Чёрный кал"),
            leaf("problem.digestive.25", "Гельминты в кале"),
          ],
        },
        {
          id: "problem.respiratory",
          label: "Дыханием",
          children: [
            leaf("problem.respiratory.1", "Чихает"),
            leaf("problem.respiratory.2", "Кашляет"),
            leaf("problem.respiratory.3", "Течёт из носа"),
            leaf("problem.respiratory.4", "Одышка"),
            leaf("problem.respiratory.5", "Задыхается"),
          ],
        },
        {
          id: "problem.skin",
          label: "Кожным покровом",
          children: [
            leaf("problem.skin.1", "Чрезмерно вылизывается"),
            leaf("problem.skin.2", "Чешется"),
            leaf("problem.skin.3", "Выгрызает"),
            leaf("problem.skin.4", "Лысеет"),
            leaf("problem.skin.5", "Жирный хвост"),
            leaf("problem.skin.6", "Корочки на коже"),
            leaf("problem.skin.7", "Жирные корочки или струп на коже"),
            leaf("problem.skin.8", "Пятна на коже"),
            leaf("problem.skin.9", "Сыпь на коже"),
            leaf("problem.skin.10", "Участки мокнущей кожи"),
            leaf("problem.skin.11", "Участки облысения"),
            leaf("problem.skin.12", "Трясёт ушами или ухом"),
            leaf("problem.skin.13", "Истечения из ушей или уха"),
            leaf("problem.skin.14", "Мокнет между пальцами"),
            leaf("problem.skin.15", "Уплотнения между пальцами"),
            leaf("problem.skin.16", "Опухание морды"),
            leaf("problem.skin.17", "Уплотнения на коже"),
            leaf("problem.skin.18", "Уплотнение под кожей"),
            leaf("problem.skin.19", "Язва на коже"),
            leaf("problem.skin.20", "Изменение цвета или качества шерсти"),
            leaf("problem.skin.21", "Изменение цвета носа"),
            leaf("problem.skin.22", "Рана"),
            leaf("problem.skin.23", "Ожог"),
            leaf("problem.skin.24", "Кровотечение"),
          ],
        },
        {
          id: "problem.urinary",
          label: "Мочеиспусканием и половой системой",
          children: [
            leaf("problem.urinary.1", "Не может пописать"),
            leaf("problem.urinary.2", "Писает не в положенном месте"),
            leaf("problem.urinary.3", "Частое мочеиспускание"),
            leaf("problem.urinary.4", "Мочеиспускание малыми порциями или по каплям"),
            leaf("problem.urinary.5", "Непроизвольное мочеиспускание или недержание"),
            leaf("problem.urinary.6", "Моча с кровью"),
            leaf("problem.urinary.7", "Моча изменила цвет"),
            leaf("problem.urinary.8", "Моча изменила запах"),
            leaf("problem.urinary.9", "Большой объём мочи"),
            leaf("problem.urinary.10", "Истечение из петли влагалища"),
            leaf("problem.urinary.11", "Кричит или вокализирует при мочеиспускании"),
            leaf("problem.urinary.12", "Кричит или вокализирует при вязке"),
            leaf("problem.urinary.13", "Уплотнение на молочных железах"),
          ],
        },
        {
          id: "problem.eyes",
          label: "Глазами",
          children: [
            leaf("problem.eyes.1", "Слезятся"),
            leaf("problem.eyes.12", "Мокрые дорожки около глаз"),
            leaf("problem.eyes.2", "Мутные истечения из глаз"),
            leaf("problem.eyes.3", "Щурится"),
            leaf("problem.eyes.4", "Глаз закрыт, не открывается"),
            leaf("problem.eyes.5", "Не может закрыть глаз"),
            leaf("problem.eyes.6", "Травма глаза"),
            leaf("problem.eyes.7", "Зрачок расширен"),
            leaf("problem.eyes.8", "Зрачки разного размера"),
            leaf("problem.eyes.9", "Зрачок сужен"),
            leaf("problem.eyes.10", "Ослеп; натыкается на предметы"),
          ],
        },
        {
          id: "problem.musculoskeletal",
          label: "Опорно-двигательной системой",
          children: [
            leaf("problem.musculoskeletal.1", "Не наступает на лапу"),
            leaf("problem.musculoskeletal.2", "Хромает"),
            leaf("problem.musculoskeletal.3", "Подволакивает конечность"),
            leaf("problem.musculoskeletal.4", "Заваливается зад"),
            leaf("problem.musculoskeletal.5", "Не может поднять хвост"),
            leaf("problem.musculoskeletal.6", "Не запрыгивает на возвышенности"),
            leaf("problem.musculoskeletal.7", "Вокализирует при дотрагивании"),
            leaf("problem.musculoskeletal.8", "Не встаёт на тазовые конечности"),
            leaf("problem.musculoskeletal.9", "Не может опираться на конечности"),
            leaf("problem.musculoskeletal.10", "Не поднимает шею"),
            leaf("problem.musculoskeletal.11", "Трясёт головой"),
            leaf("problem.musculoskeletal.12", "Голова наклонена на бок"),
            leaf("problem.musculoskeletal.13", "Подёргиваются мышцы"),
            leaf("problem.musculoskeletal.14", "Судороги"),
          ],
        },
        {
          id: "problem.laboratory",
          label: "Лабораторными анализами",
          children: [
            leaf("problem.laboratory.cbc.1", "Повышены лейкоциты"),
            leaf("problem.laboratory.cbc.2", "Понижены лейкоциты"),
            leaf("problem.laboratory.cbc.3", "Понижены гематокрит, эритроциты и гемоглобин"),
            leaf("problem.laboratory.cbc.4", "Повышены гематокрит, эритроциты и гемоглобин"),
            leaf("problem.laboratory.cbc.5", "Повышены эозинофилы"),
            leaf("problem.laboratory.cbc.6", "Понижены тромбоциты"),
            leaf("problem.laboratory.biochemistry.1", "Повышен креатинин"),
            leaf("problem.laboratory.biochemistry.2", "Повышена мочевина"),
            leaf("problem.laboratory.biochemistry.3", "Повышена АЛТ"),
            leaf("problem.laboratory.biochemistry.4", "Повышен билирубин"),
            leaf("problem.laboratory.biochemistry.5", "Повышена глюкоза в крови"),
            leaf("problem.laboratory.biochemistry.6", "Повышена ЩФ"),
            leaf("problem.laboratory.biochemistry.7", "Повышен общий белок в крови"),
            leaf("problem.laboratory.biochemistry.8", "Повышена ГГТ"),
            leaf("problem.laboratory.biochemistry.9", "Повышен калий"),
            leaf("problem.laboratory.biochemistry.10", "Повышен фосфор"),
            leaf("problem.laboratory.biochemistry.11", "Повышен кальций"),
            leaf("problem.laboratory.urine.1", "Повышен белок в моче"),
            leaf("problem.laboratory.urine.2", "Повышена глюкоза в моче"),
            leaf("problem.laboratory.urine.3", "Повышена плотность мочи"),
            leaf("problem.laboratory.urine.4", "Понижена плотность мочи"),
            leaf("problem.laboratory.urine.5", "Высокий pH (щелочной) мочи"),
            leaf("problem.laboratory.urine.6", "Низкий pH (кислый) мочи"),
            leaf("problem.laboratory.urine.7", "Есть эритроциты в моче"),
            leaf("problem.laboratory.urine.8", "Есть лейкоциты в моче"),
            leaf("problem.laboratory.urine.9", "Есть слизь в моче"),
            leaf("problem.laboratory.urine.10", "Есть кристаллы в моче"),
          ],
        },
        {
          id: "problem.research",
          label: "Результатами исследований",
          children: [
            leaf("problem.research.1", "Отклонения по УЗИ"),
            leaf("problem.research.2", "Отклонения по рентгену"),
            leaf("problem.research.3", "Отклонения по ЭХО сердца"),
            leaf("problem.research.4", "Отклонения по МРТ"),
            leaf("problem.research.5", "Отклонения по КТ"),
            leaf("problem.research.6", "Отклонения по ЭКГ/Холтеру"),
          ],
        },
      ],
    },
    {
      id: "critical",
      label: "Всё плохо",
      children: [
        leaf("critical.1", "Задыхается"),
        leaf("critical.2", "Обильное кровотечение"),
        leaf("critical.3", "Упало с высоты"),
        leaf("critical.4", "Автотравма или сбила машина"),
        leaf("critical.5", "Потерял сознание или обморок"),
        leaf("critical.6", "Необходима эвтаназия"),
        leaf("critical.7", "Необходима кремация"),
      ],
    },
  ],
};

const paths = new Map<string, string>();
const labels = new Map<string, string>();
const orderedIds: string[] = [];

function indexOptions(nodes: readonly WhatHappenedOption[], parents: readonly string[] = []) {
  for (const node of nodes) {
    const path = [...parents, node.label];
    if (node.children?.length) indexOptions(node.children, path);
    else {
      paths.set(node.id, path.join(" › "));
      labels.set(node.id, node.label);
      orderedIds.push(node.id);
    }
  }
}

indexOptions(WHAT_HAPPENED_TREE.children ?? []);

export const WHAT_HAPPENED_TAXONOMY_IDS: readonly string[] = orderedIds;
export const WHAT_HAPPENED_LEAF_COUNT = WHAT_HAPPENED_TAXONOMY_IDS.length;
const taxonomyIds = new Set(WHAT_HAPPENED_TAXONOMY_IDS);
const taxonomyOrder = new Map(WHAT_HAPPENED_TAXONOMY_IDS.map((id, index) => [id, index]));

export function isWhatHappenedTaxonomyId(value: string): boolean {
  return taxonomyIds.has(value);
}

export function whatHappenedPath(id: string): string {
  return paths.get(id) ?? id;
}

export function whatHappenedLeafLabel(id: string): string {
  return labels.get(id) ?? id;
}

export function canonicalWhatHappenedIds(ids: readonly string[]): string[] {
  return [...ids].sort((left, right) => (taxonomyOrder.get(left) ?? Number.MAX_SAFE_INTEGER)
    - (taxonomyOrder.get(right) ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right));
}
