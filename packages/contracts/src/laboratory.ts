// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

export type LaboratoryStudyMode = "panel" | "narrative" | "infection";
export interface LaboratoryIndicatorCatalogItem { readonly id: string; readonly name: string; readonly unit: string }
export interface LaboratoryStudyTypeCatalogItem {
  readonly id: string; readonly name: string; readonly mode: LaboratoryStudyMode;
  readonly indicators: readonly LaboratoryIndicatorCatalogItem[];
}
interface LaboratoryStudyBase { id: string; date: string; typeId: string; typeName: string; laboratory: string; technician?: string; equipment?: string; comment?: string }
export interface LaboratoryPanelStudyValue extends LaboratoryStudyBase { mode: "panel"; results: readonly { indicatorId: string; indicatorName: string; unit: string; result: string; reference?: string }[] }
export interface LaboratoryNarrativeStudyValue extends LaboratoryStudyBase { mode: "narrative"; result: string }
export interface LaboratoryInfectionStudyValue extends LaboratoryStudyBase { mode: "infection"; infection: string; method: "ПЦР" | "ИФА" | "РМА" | "ELISA" | "ИХА"; result: "positive" | "negative" }
export type LaboratoryStudyValue = LaboratoryPanelStudyValue | LaboratoryNarrativeStudyValue | LaboratoryInfectionStudyValue;
export interface LaboratoryTestsSectionValue { studies: readonly LaboratoryStudyValue[] }

function indicators(prefix: string, rows: readonly (readonly [string, string])[]): LaboratoryIndicatorCatalogItem[] {
  return rows.map(([name, unit], index) => ({ id: `lab.indicator.${prefix}.${String(index + 1).padStart(3, "0")}`, name, unit }));
}
const cbc = indicators("cbc", [
  ["Гематокрит (Hct, PCV)", "%"], ["Гемоглобин (Hgb)", "г/л"], ["Эритроциты (RBC)", "×10¹²/л"], ["Лейкоциты (WBC)", "×10⁹/л"], ["Тромбоциты (Plt)", "×10⁹/л"], ["Количество тромбоцитов в п/зр.", "в п/зр (HPF)"], ["Ядерные эритроциты (нормобласты, nRBC)", "на 100 лейкоцитов"], ["Анизоцитоз эритроцитов (RDW-CV)", "%"], ["Ретикулоциты", "%"], ["Ретикулоциты", "×10⁹/л"], ["Ретикулоциты агрегатные", "%"], ["Ретикулоциты агрегатные", "×10⁹/л"], ["Ретикулоциты пунктатные", "%"], ["Ретикулоциты пунктатные", "×10⁹/л"], ["Средняя конц. Hb в эритроците (MCHC)", "г/дл"], ["Средний объем эритроцита (MCV)", "мкм³ (фл)"], ["Среднее содержание Hb в эритроците (MCH)", "пг"], ["Бластные клетки", "%"], ["Бластные клетки", "×10⁹/л"], ["Миелоциты", "%"], ["Миелоциты", "×10⁹/л"], ["Метамиелоциты", "%"], ["Метамиелоциты", "×10⁹/л"], ["Палочкоядерные нейтрофилы (Bands)", "%"], ["Палочкоядерные нейтрофилы ABS", "×10⁹/л"], ["Сегментоядерные нейтрофилы (Segs)", "%"], ["Сегментоядерные нейтрофилы ABS", "×10⁹/л"], ["Эозинофилы (Eos)", "%"], ["Эозинофилы ABS", "×10⁹/л"], ["Моноциты (Mono)", "%"], ["Моноциты ABS", "×10⁹/л"], ["Базофилы (Bas)", "%"], ["Базофилы ABS", "×10⁹/л"], ["Лимфоциты (Lym)", "%"], ["Лимфоциты ABS", "×10⁹/л"],
]);
const biochemistry = indicators("biochemistry", [
  ["Билирубин общий (TBil)", "мкмоль/л"], ["Билирубин прямой (DBil)", "мкмоль/л"], ["АСТ (GOT)", "Ед/л"], ["АЛТ (GPT)", "Ед/л"], ["Мочевина (Urea)", "ммоль/л"], ["Креатинин (Creat)", "мкмоль/л"], ["Общий белок (Prot, total)", "г/л"], ["Альбумин (Alb)", "г/л"], ["Глобулин (Glob)", "г/л"], ["Щелочная фосфатаза (ALP, IFCC)", "Ед/л"], ["Альфа-Амилаза, общая", "Ед/л"], ["Глюкоза (Glu)", "ммоль/л"], ["ЛДГ (LDH, IFCC)", "Ед/л"], ["ГГТ (γ-GT, IFCC)", "Ед/л"], ["Холестерин (Chol, total)", "ммоль/л"], ["Триглицериды (Trig)", "ммоль/л"], ["КФК (CK)", "Ед/л"], ["Калий (Potassium)", "ммоль/л"], ["Натрий (Sodium)", "ммоль/л"], ["Фосфор (Phosphate, inorg)", "ммоль/л"], ["Кальций общий (Ca, total)", "ммоль/л"], ["Кальций ионизированный (iCa)", "ммоль/л"], ["Железо (Fe)", "мкмоль/л"], ["Магний (Mg)", "ммоль/л"], ["Хлор (Chloride)", "ммоль/л"], ["Мочевая кислота (Uric Acid)", "мкмоль/л"], ["Кислая фосфатаза (ACP, total)", "Ед/л"], ["Холинэстераза (ChE, GSCC)", "Ед/л"], ["Липаза (Lip)", "Ед/л"], ["Альбумин/глобулин (A/G Ratio)", ""], ["Соотношение Ca/P", ""], ["Соотношение Na/K", ""], ["Соотношение Мочевина/Креатинин", ""], ["Кислотность (рН венозной крови)", "рН"], ["Аммиак", "мкмоль/л"], ["Желчные кислоты 1 проба", "мкмоль/л"], ["Желчные кислоты 2 проба", "мкмоль/л"], ["С-реактивный белок", "мг/л"], ["Сывороточный амилоид А кошек", "мкг/мл"], ["Специфическая панкреатическая липаза собак", "нг/мл"], ["Специфическая панкреатическая липаза кошек", "нг/мл"], ["Тропонин 1", "нг/мл"],
]);
const coagulation = indicators("coagulation", [["АЧТВ", "сек"], ["Протромбиновое время", "сек"], ["Тромбиновое время", "сек"], ["Фибриноген", "г/л"]]);
const urine = indicators("urine", [["Цвет", "визуально"], ["Прозрачность мочи", "визуально"], ["Относительная плотность по рефрактометру (ОП)", "г/см³"], ["рН", "ед. рН"], ["Креатинин мочи", "ммоль/л"], ["Белок мочи", "г/л"], ["Белок мочи", "мг/дл"], ["Белок мочи", "ммоль/л"], ["Соотношение Белок/Креатинин", ""], ["Глюкоза мочи", "ммоль/л"], ["Уробилиноген", "качественная реакция"], ["Билирубин", "качественная реакция"], ["Билирубин", "мкмоль/л"], ["Кетоны", "ммоль/л"], ["Кровь", "качественная реакция"], ["Гемоглобин", "качественная реакция"], ["Эритроциты", "в п/зр (HPF)"], ["Лейкоциты в моче", "в п/зр (HPF)"], ["Неорганизованный осадок", "в п/зр (LPF)"], ["Эпителий плоский", "в п/зр (HPF)"], ["Эпителий переходный", "в п/зр (HPF)"], ["Эпителий почечный", "в п/зр (HPF)"], ["Цилиндры гиалиновые", "в п/зр (LPF)"], ["Цилиндры патологические", "в п/зр (LPF)"], ["Неорганический осадок", "в п/зр (LPF)"], ["Слизь", "в п/зр (LPF)"], ["Бактерии в моче", "в п/зр (HPF)"]]);
const hormones = indicators("hormones", [["Т4 общий (тироксин, общий)", "нмоль/л"], ["ТТГ", ""], ["Прогестерон", ""], ["Инсулин", ""], ["Кортизол", ""], ["Эстрадиол", ""]]);
const narrative = ["Микроскопия мазка-отпечатка на эктопаразитов", "Микроскопия глубокого соскоба", "Микроскопия дерматофитов", "Микроскопия мазка крови", "Микроскопия кала", "Микроскопия мазка из НСП", "Микроскопия мочи", "Цитология мазка-отпечатка", "Цитология выпота", "Цитология мочи", "Цитология пунктата", "Цитология вагинального мазка", "Цитология новообразования", "Цитология ликвора", "Цитология синовиальной жидкости", "Цитология костного мозга", "Цитология окраски по Граму", "Цитология окраски по Циль-Нельсону", "Гистология мягкой ткани", "Гистология кости"];
export const LABORATORY_STUDY_CATALOG: readonly LaboratoryStudyTypeCatalogItem[] = [
  { id: "lab.study.cbc", name: "Общеклинический анализ крови", mode: "panel", indicators: cbc },
  { id: "lab.study.biochemistry", name: "Биохимический анализ крови", mode: "panel", indicators: biochemistry },
  { id: "lab.study.coagulation", name: "Коагулограмма крови", mode: "panel", indicators: coagulation },
  { id: "lab.study.urine", name: "Общеклинический анализ мочи", mode: "panel", indicators: urine },
  { id: "lab.study.hormones", name: "Исследования крови на гормоны", mode: "panel", indicators: hormones },
  ...narrative.map((name, index) => ({ id: `lab.study.narrative.${String(index + 1).padStart(3, "0")}`, name, mode: "narrative" as const, indicators: [] })),
  { id: "lab.study.infection", name: "Исследование на инфекцию", mode: "infection", indicators: [] },
];
export const LABORATORY_STUDY_OPTIONS = LABORATORY_STUDY_CATALOG.map(({ id, name }) => ({ id, label: name }));
const types = new Map(LABORATORY_STUDY_CATALOG.map((item) => [item.id, item]));
const indicatorsById = new Map(LABORATORY_STUDY_CATALOG.flatMap((study) => study.indicators.map((item) => [item.id, item] as const)));
export const laboratoryStudyTypeById = (id: string) => types.get(id);
export const laboratoryIndicatorById = (id: string) => indicatorsById.get(id);

export function normalizeLaboratoryTestsValue(value: unknown, today = new Date().toISOString().slice(0, 10)): LaboratoryTestsSectionValue {
  if (!value || typeof value !== "object" || !Array.isArray((value as { studies?: unknown }).studies) || !(value as { studies: unknown[] }).studies.length) throw new Error("Добавьте хотя бы одно лабораторное исследование.");
  const seen = new Set<string>();
  const studies = (value as { studies: unknown[] }).studies.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("Некорректное лабораторное исследование.");
    const input = raw as Record<string, unknown>; const id = String(input.id ?? ""); const date = String(input.date ?? ""); const type = types.get(String(input.typeId ?? ""));
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id) || seen.has(id)) throw new Error("Некорректный идентификатор исследования."); seen.add(id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) throw new Error("Укажите корректную дату исследования.");
    if (!type) throw new Error("Выберите исследование из справочника.");
    const laboratory = String(input.laboratory ?? "").trim(); if (!laboratory) throw new Error("Укажите лабораторию.");
    const base = { id, date, typeId: type.id, typeName: type.name, laboratory, ...optional(input, "technician", "equipment", "comment") };
    if (type.mode === "panel") {
      if (!Array.isArray(input.results) || !input.results.length) throw new Error("Выберите и заполните хотя бы один показатель.");
      const resultIds = new Set<string>(); const results = input.results.map((rawResult) => { const result = rawResult as Record<string, unknown>; const item = indicatorsById.get(String(result?.indicatorId ?? "")); const text = String(result?.result ?? "").trim(); if (!item || !type.indicators.some((candidate) => candidate.id === item.id) || resultIds.has(item.id) || !text) throw new Error("Некорректный результат показателя."); resultIds.add(item.id); return { indicatorId: item.id, indicatorName: item.name, unit: item.unit, result: text, ...optional(result, "reference") }; });
      return { ...base, mode: "panel" as const, results };
    }
    if (type.mode === "narrative") { const result = String(input.result ?? "").trim(); if (!result) throw new Error("Укажите результат исследования."); return { ...base, mode: "narrative" as const, result }; }
    const infection = String(input.infection ?? "").trim(); const method = String(input.method ?? ""); const result = String(input.result ?? ""); if (!infection || !["ПЦР", "ИФА", "РМА", "ELISA", "ИХА"].includes(method) || !["positive", "negative"].includes(result)) throw new Error("Заполните исследование на инфекцию.");
    return { ...base, mode: "infection" as const, infection, method, result } as LaboratoryInfectionStudyValue;
  });
  return { studies };
}
function optional(input: Record<string, unknown>, ...keys: string[]): Record<string, string> { return Object.fromEntries(keys.flatMap((key) => { const value = String(input[key] ?? "").trim(); return value ? [[key, value]] : []; })); }
