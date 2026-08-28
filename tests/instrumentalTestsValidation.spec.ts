// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it } from "vitest";
import type { InstrumentalFindingValue, InstrumentalTestsSectionValue } from "@klinok/contracts";
import { parseInstrumentalTestsDraft } from "../src/instrumentalTests";

const base = { id: "123e4567-e89b-12d3-a456-426614174000", date: "2026-08-15" };
const prefix = "instrumental.finding.ultrasound-abdomen";
const id = (code: string) => `${prefix}.${code}`;
const xrayPrefix = "instrumental.finding.xray-thorax";
const xrayId = (code: string) => `${xrayPrefix}.${code}`;
const finding = (code: string, children: InstrumentalFindingValue[] = [], value?: string): InstrumentalFindingValue => ({
  findingId: id(code),
  findingName: "forged",
  ...(value === undefined ? {} : { value }),
  children,
});

describe("instrumental draft validation", () => {
  it("places section, date, group, and text errors beside their fields", () => {
    expect(parseInstrumentalTestsDraft({ studies: [] }).errors.section).toContain("Добавьте");
    const draft: InstrumentalTestsSectionValue = { studies: [{
      ...base,
      date: "2026-08-16",
      typeId: "instrumental.study.xray-thorax",
      typeName: "Рентгенография грудной полости",
      mode: "tree",
      findings: [{ findingId: xrayId("20"), findingName: "Заключение", value: "", children: [] }],
    }, {
      ...base,
      id: "223e4567-e89b-12d3-a456-426614174000",
      typeId: "instrumental.study.ultrasound-abdomen",
      typeName: "УЗИ органов брюшной полости",
      mode: "tree",
      findings: [{
        findingId: "instrumental.finding.ultrasound-abdomen.1",
        findingName: "Печень",
        children: [],
      }, {
        findingId: "instrumental.finding.ultrasound-abdomen.2",
        findingName: "Желчный пузырь",
        children: [{
          findingId: "instrumental.finding.ultrasound-abdomen.2.8",
          findingName: "Размер",
          value: "4.2",
          unit: "мм",
          children: [],
        }],
      }, {
        findingId: "instrumental.finding.ultrasound-abdomen.19",
        findingName: "Заключение",
        value: " ",
        children: [],
      }],
    }] };
    const parsed = parseInstrumentalTestsDraft(draft, "2026-08-15");
    expect(parsed.errors.studies[0]).toMatchObject({
      date: "Укажите корректную дату исследования.",
      findings: { [xrayId("20")]: "Заполните поле «Заключение»." },
    });
    expect(parsed.errors.studies[1]?.findings).toEqual({
      "instrumental.finding.ultrasound-abdomen.1": "Заполните показатель «Печень».",
      "instrumental.finding.ultrasound-abdomen.2.8": "Укажите целое число для поля «Размер».",
      "instrumental.finding.ultrasound-abdomen.19": "Заполните поле «Заключение».",
    });
  });

  it("returns the normalized value and surfaces structural normalizer failures", () => {
    const draft: InstrumentalTestsSectionValue = { studies: [{
      ...base,
      typeId: "instrumental.study.xray-thorax",
      typeName: "forged",
      mode: "tree",
      findings: [{ findingId: xrayId("20"), findingName: "forged", value: " result ", children: [] }],
    }] };
    expect(parseInstrumentalTestsDraft(draft).value?.studies[0]).toMatchObject({
      typeName: "Рентгенография грудной полости",
      findings: [{ findingName: "Заключение", value: "result" }],
    });
    expect(parseInstrumentalTestsDraft({ studies: [{ ...draft.studies[0]!, id: "bad" }] }).errors.section).toContain("идентификатор");
  });

  it("places X-ray selection-set and required continuation errors beside their controls", () => {
    const draft: InstrumentalTestsSectionValue = { studies: [{
      ...base,
      typeId: "instrumental.study.xray-thorax",
      typeName: "Рентгенография грудной полости",
      mode: "tree",
      findings: [{
        findingId: xrayId("10"), findingName: "Купол диафрагмы", children: [{
          findingId: xrayId("10.0"), findingName: "Характеристики купола", children: [
            { findingId: xrayId("10.0.1"), findingName: "Ровный", children: [] },
            { findingId: xrayId("10.0.2"), findingName: "Неровный", children: [] },
            { findingId: xrayId("10.0.5"), findingName: "LL", children: [] },
          ],
        }],
      }],
    }] };
    expect(parseInstrumentalTestsDraft(draft, "2026-08-15").errors.studies[0]?.findings).toEqual({
      [`${xrayId("10.0")}:regularity`]: "Для характеристики «Ровность купола» можно выбрать не более одного значения.",
      [`${xrayId("10.0")}:definition`]: "Заполните характеристику «Чёткость купола».",
      [xrayId("10.0.5.intercostal")]: "Заполните поле «Межреберье на LL-проекции».",
    });
  });

  it("accepts independent pulmonary findings and reports only explicit conflicts", () => {
    const lungDraft = (children: InstrumentalFindingValue[]): InstrumentalTestsSectionValue => ({ studies: [{
      ...base,
      typeId: "instrumental.study.xray-thorax",
      typeName: "Рентгенография грудной полости",
      mode: "tree",
      findings: [{ findingId: xrayId("17"), findingName: "Лёгочные поля", children: [{
        findingId: xrayId("17.3"), findingName: "Лёгочный рисунок", children,
      }] }],
    }] });
    const changedPatterns = ["17.3.2", "17.3.4", "17.3.5", "17.3.6", "17.3.10", "17.3.11"].map((code) => ({
      findingId: xrayId(code), findingName: "forged", children: [],
    }));
    expect(parseInstrumentalTestsDraft(lungDraft(changedPatterns), "2026-08-15").errors.studies[0]?.findings)
      .toEqual({});
    const normalWithPattern = ["17.3.1", "17.3.5"].map((code) => ({
      findingId: xrayId(code), findingName: "forged", children: [],
    }));
    expect(parseInstrumentalTestsDraft(lungDraft(normalWithPattern), "2026-08-15").errors.studies[0]?.findings)
      .toEqual({ [xrayId("17.3")]: "Для показателя «Лёгочный рисунок» выбраны несовместимые варианты." });
  });

  it("places a separate inline error beside each missing prostate contour characteristic", () => {
    const draft = (children: InstrumentalFindingValue[]): InstrumentalTestsSectionValue => ({ studies: [{
      ...base,
      typeId: "instrumental.study.ultrasound-abdomen",
      typeName: "УЗИ органов брюшной полости",
      mode: "tree",
      findings: [finding("10", [finding("10.1", children)])],
    }] });
    expect(parseInstrumentalTestsDraft(draft([]), "2026-08-15").errors.studies[0]?.findings).toEqual({
      [`${id("10.1")}:regularity`]: "Заполните характеристику «Ровность контуров».",
      [`${id("10.1")}:definition`]: "Заполните характеристику «Чёткость контуров».",
    });
    expect(parseInstrumentalTestsDraft(draft([finding("10.1.2")]), "2026-08-15").errors.studies[0]?.findings).toEqual({
      [`${id("10.1")}:definition`]: "Заполните характеристику «Чёткость контуров».",
    });
  });

  it("accepts zero sediment characteristics but surfaces unknown and duplicate choices", () => {
    const draft = (choices: InstrumentalFindingValue[]): InstrumentalTestsSectionValue => ({ studies: [{
      ...base,
      typeId: "instrumental.study.ultrasound-abdomen",
      typeName: "УЗИ органов брюшной полости",
      mode: "tree",
      findings: [finding("2", [finding("2.5", [finding("2.5.2", [finding("2.6", choices)])])])],
    }] });
    const empty = parseInstrumentalTestsDraft(draft([]), "2026-08-15");
    expect(empty.errors.studies[0]?.findings).toEqual({});
    expect(empty.value?.studies[0]?.mode === "tree"
      ? empty.value.studies[0].findings[0]?.children[0]?.children[0]?.children
      : undefined).toEqual([]);
    expect(parseInstrumentalTestsDraft(draft([finding("2.6.99")]), "2026-08-15").errors.section).toContain("структура");
    expect(parseInstrumentalTestsDraft(draft([finding("2.6.1"), finding("2.6.1")]), "2026-08-15").errors.section)
      .toContain("структура");
  });

  it("validates a legacy conditional measurement after reparenting and discards it for an inactive branch", () => {
    const draft = (active: boolean): InstrumentalTestsSectionValue => ({ studies: [{
      ...base,
      typeId: "instrumental.study.ultrasound-abdomen",
      typeName: "УЗИ органов брюшной полости",
      mode: "tree",
      findings: [finding("4", [
        finding("4.4", [finding(active ? "4.4.2" : "4.4.1")]),
        finding("4.5", [], "4.2"),
      ])],
    }] });
    expect(parseInstrumentalTestsDraft(draft(true), "2026-08-15").errors.studies[0]?.findings).toEqual({
      [id("4.5")]: "Укажите целое число для поля «Размер образований».",
    });
    const inactive = parseInstrumentalTestsDraft(draft(false), "2026-08-15");
    expect(inactive.errors.studies[0]?.findings).toEqual({});
    expect(inactive.value?.studies[0]?.mode === "tree" ? inactive.value.studies[0].findings[0]?.children : undefined)
      .toEqual([expect.objectContaining({ findingId: id("4.4") })]);
  });
});
