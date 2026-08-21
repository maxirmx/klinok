// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it } from "vitest";
import {
  INSTRUMENTAL_STUDY_CATALOG,
  instrumentalFindingById,
  normalizeInstrumentalTestsValue,
  type InstrumentalFindingCatalogItem,
  type InstrumentalFindingValue,
} from "@klinok/contracts";

const base = { id: "123e4567-e89b-12d3-a456-426614174000", date: "2026-08-15" };
const value = (id: string, children: InstrumentalFindingValue[] = [], text?: string): InstrumentalFindingValue => ({
  findingId: id,
  findingName: "forged",
  ...(text === undefined ? {} : { value: text }),
  children,
});

describe("instrumental study contracts", () => {
  it("contains both study modes and the complete numbered ultrasound root catalog", () => {
    expect(INSTRUMENTAL_STUDY_CATALOG.map((study) => [study.name, study.mode])).toEqual([
      ["УЗИ органов брюшной полости", "tree"],
      ["Рентген грудной и брюшной полости", "narrative"],
    ]);
    const roots = INSTRUMENTAL_STUDY_CATALOG[0]!.findings;
    expect(roots).toHaveLength(19);
    expect(roots.map((item) => item.id.split(".").at(-1))).toEqual([
      "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19",
    ]);
    expect(instrumentalFindingById("instrumental.finding.ultrasound-abdomen.9.3.5.2.3")).toMatchObject({ name: "Размер", kind: "integer", unit: "мм" });
    expect(instrumentalFindingById("instrumental.finding.ultrasound-abdomen.19")).toMatchObject({ name: "Заключение", kind: "long-text" });
    const ids: string[] = [];
    const integers: InstrumentalFindingCatalogItem[] = [];
    const visit = (items: readonly InstrumentalFindingCatalogItem[]) => items.forEach((item) => {
      ids.push(item.id);
      if (item.kind === "integer") integers.push(item);
      visit(item.children);
    });
    visit(roots);
    expect(new Set(ids).size).toBe(ids.length);
    expect(integers.map((item) => item.id.replace("instrumental.finding.ultrasound-abdomen.", ""))).toEqual([
      "1.12", "2.8", "3.1", "4.5", "5.2", "5.3", "5.4", "5.8.4", "6.2", "6.3", "6.4", "6.8.4",
      "9.2.1", "9.3.5.2.3", "10.0", "10.5", "11.3.7", "11.4", "16.1.3", "16.2.3", "16.3.3",
    ]);
    expect(integers.every((item) => item.unit === "мм" && !item.name.includes("мм"))).toBe(true);
  });

  it("normalizes names, text, and recursive sibling order", () => {
    const section = normalizeInstrumentalTestsValue({ studies: [{
      ...base,
      typeId: "instrumental.study.ultrasound-abdomen",
      typeName: "forged",
      mode: "narrative",
      comment: "  контроль  ",
      findings: [
        value("instrumental.finding.ultrasound-abdomen.19", [], "  Без патологии  "),
        value("instrumental.finding.ultrasound-abdomen.1", [
          value("instrumental.finding.ultrasound-abdomen.1.10", [
            value("instrumental.finding.ultrasound-abdomen.1.10.2", [
              value("instrumental.finding.ultrasound-abdomen.1.10.2.1"),
            ]),
          ]),
        ]),
      ],
    }] }, "2026-08-15");
    const study = section.studies[0]!;
    expect(study).toMatchObject({ typeName: "УЗИ органов брюшной полости", mode: "tree", comment: "контроль" });
    if (study.mode !== "tree") throw new Error("Expected tree study");
    expect(study.findings.map((finding) => finding.findingId)).toEqual([
      "instrumental.finding.ultrasound-abdomen.1",
      "instrumental.finding.ultrasound-abdomen.19",
    ]);
    expect(study.findings[0]!.children[0]!.children[0]!.children.map((finding) => finding.findingName)).toEqual(["Единичные"]);
    expect(study.findings[1]).toMatchObject({ findingName: "Заключение", value: "Без патологии" });
  });

  it("normalizes the narrative X-ray result", () => {
    expect(normalizeInstrumentalTestsValue({ studies: [{
      ...base,
      typeId: "instrumental.study.xray-thorax-abdomen",
      typeName: "old",
      mode: "tree",
      result: "  Очаговых изменений нет  ",
      comment: " ",
    }] }).studies[0]).toEqual({
      ...base,
      typeId: "instrumental.study.xray-thorax-abdomen",
      typeName: "Рентген грудной и брюшной полости",
      mode: "narrative",
      result: "Очаговых изменений нет",
    });
  });

  it("normalizes whole-number measurements and preserves their unit snapshot", () => {
    const section = normalizeInstrumentalTestsValue({ studies: [{
      ...base,
      typeId: "instrumental.study.ultrasound-abdomen",
      findings: [value("instrumental.finding.ultrasound-abdomen.1", [
        { ...value("instrumental.finding.ultrasound-abdomen.1.12", [], " 12 "), unit: "forged" },
      ])],
    }] });
    expect(section.studies[0]).toMatchObject({ mode: "tree", findings: [{ children: [{
      findingName: "Размер",
      value: "12",
      unit: "мм",
    }] }] });
  });

  it.each([
    ["empty section", { studies: [] }, "Добавьте хотя бы одно"],
    ["bad UUID", { studies: [{ ...base, id: "bad", typeId: "instrumental.study.xray-thorax-abdomen", result: "ok" }] }, "идентификатор"],
    ["future date", { studies: [{ ...base, date: "2026-08-16", typeId: "instrumental.study.xray-thorax-abdomen", result: "ok" }] }, "дату"],
    ["invalid calendar date", { studies: [{ ...base, date: "2026-02-31", typeId: "instrumental.study.xray-thorax-abdomen", result: "ok" }] }, "дату"],
    ["unknown type", { studies: [{ ...base, typeId: "unknown", result: "ok" }] }, "справочника"],
    ["empty narrative", { studies: [{ ...base, typeId: "instrumental.study.xray-thorax-abdomen", result: " " }] }, "результат"],
    ["empty tree", { studies: [{ ...base, typeId: "instrumental.study.ultrasound-abdomen", findings: [] }] }, "Добавьте результаты"],
    ["empty group", { studies: [{ ...base, typeId: "instrumental.study.ultrasound-abdomen", findings: [value("instrumental.finding.ultrasound-abdomen.1")] }] }, "Печень"],
    ["empty text", { studies: [{ ...base, typeId: "instrumental.study.ultrasound-abdomen", findings: [value("instrumental.finding.ultrasound-abdomen.19", [], " ")] }] }, "Заключение"],
    ["fractional measurement", { studies: [{ ...base, typeId: "instrumental.study.ultrasound-abdomen", findings: [value("instrumental.finding.ultrasound-abdomen.1", [value("instrumental.finding.ultrasound-abdomen.1.12", [], "4.2")])] }] }, "целое число"],
    ["negative measurement", { studies: [{ ...base, typeId: "instrumental.study.ultrasound-abdomen", findings: [value("instrumental.finding.ultrasound-abdomen.1", [value("instrumental.finding.ultrasound-abdomen.1.12", [], "-4")])] }] }, "целое число"],
    ["misplaced child", { studies: [{ ...base, typeId: "instrumental.study.ultrasound-abdomen", findings: [value("instrumental.finding.ultrasound-abdomen.1", [value("instrumental.finding.ultrasound-abdomen.2.1", [])])] }] }, "структура"],
    ["multiple values", { studies: [{ ...base, typeId: "instrumental.study.ultrasound-abdomen", findings: [value("instrumental.finding.ultrasound-abdomen.1", [value("instrumental.finding.ultrasound-abdomen.1.3", [value("instrumental.finding.ultrasound-abdomen.1.3.1"), value("instrumental.finding.ultrasound-abdomen.1.3.2")])])] }] }, "не более одного"],
    ["text children", { studies: [{ ...base, typeId: "instrumental.study.ultrasound-abdomen", findings: [value("instrumental.finding.ultrasound-abdomen.19", [value("instrumental.finding.ultrasound-abdomen.1")], "text")] }] }, "вложенные"],
  ])("rejects %s", (_name, input, message) => {
    expect(() => normalizeInstrumentalTestsValue(input, "2026-08-15")).toThrow(message as string);
  });

  it("rejects duplicate study and finding IDs", () => {
    const narrative = { ...base, typeId: "instrumental.study.xray-thorax-abdomen", result: "ok" };
    expect(() => normalizeInstrumentalTestsValue({ studies: [narrative, narrative] })).toThrow("идентификатор");
    const duplicate = value("instrumental.finding.ultrasound-abdomen.19", [], "ok");
    expect(() => normalizeInstrumentalTestsValue({ studies: [{ ...base, typeId: "instrumental.study.ultrasound-abdomen", findings: [duplicate, duplicate] }] })).toThrow("структура");
  });
});
