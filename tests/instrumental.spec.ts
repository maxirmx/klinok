// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it } from "vitest";
import {
  INSTRUMENTAL_STUDY_CATALOG,
  canonicalizeInstrumentalFindingValues,
  instrumentalFindingById,
  normalizeInstrumentalTestsValue,
  replaceConflictingInstrumentalChoices,
  type InstrumentalFindingCatalogItem,
  type InstrumentalFindingValue,
} from "../packages/contracts/src/instrumental";

const base = { id: "123e4567-e89b-12d3-a456-426614174000", date: "2026-08-15" };
const prefix = "instrumental.finding.ultrasound-abdomen";
const id = (code: string) => `${prefix}.${code}`;
const xrayPrefix = "instrumental.finding.xray-thorax";
const xrayId = (code: string) => `${xrayPrefix}.${code}`;
const value = (id: string, children: InstrumentalFindingValue[] = [], text?: string): InstrumentalFindingValue => ({
  findingId: id,
  findingName: "forged",
  ...(text === undefined ? {} : { value: text }),
  children,
});

describe("instrumental study contracts", () => {
  it("contains the structured study catalogs and globally unique finding IDs", () => {
    expect(INSTRUMENTAL_STUDY_CATALOG.map((study) => [study.name, study.mode])).toEqual([
      ["УЗИ органов брюшной полости", "tree"],
      ["Рентгенография грудной полости", "tree"],
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
    INSTRUMENTAL_STUDY_CATALOG.forEach((study) => visit(study.findings));
    expect(new Set(ids).size).toBe(ids.length);
    expect(integers.map((item) => item.id.replace("instrumental.finding.ultrasound-abdomen.", ""))).toEqual([
      "1.12", "2.8", "3.1", "4.5", "5.2", "5.3", "5.4", "5.8.4", "6.2", "6.3", "6.4", "6.8.4",
      "9.2.1", "9.3.5.2.3", "10.0", "10.5", "11.3.7", "11.4", "16.1.3", "16.2.3", "16.3.3",
    ]);
    expect(integers.every((item) => item.unit === "мм" && !item.name.includes("мм"))).toBe(true);
  });

  it("defines the complete thoracic X-ray hierarchy, selection modes, conflicts, and required continuations", () => {
    const xray = INSTRUMENTAL_STUDY_CATALOG.find((study) => study.id === "instrumental.study.xray-thorax")!;
    expect(xray.findings).toHaveLength(20);
    expect(xray.findings.map((item) => item.id.replace(`${xrayPrefix}.`, ""))).toEqual([
      "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
      "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
    ]);
    expect(["3.0.1", "3.0.2", "3.0.3"].map((code) => instrumentalFindingById(xrayId(code))?.name)).toEqual([
      "Удовлетворительный", "Недостаточный (засветка)", "Избыточный (затемнено)",
    ]);
    const multiple: InstrumentalFindingCatalogItem[] = [];
    const visit = (items: readonly InstrumentalFindingCatalogItem[]) => items.forEach((item) => {
      if (item.selectionMode === "multiple") multiple.push(item);
      visit(item.children);
    });
    visit(xray.findings);
    expect(multiple.map((item) => item.id)).toEqual([
      xrayId("1.0"), xrayId("12.2"), xrayId("17.3"), xrayId("17.3.13"),
    ]);
    expect(instrumentalFindingById(xrayId("10.0"))).toMatchObject({ required: true });
    expect(instrumentalFindingById(xrayId("10.0"))?.selectionSets).toEqual([{
      key: "regularity",
      name: "Ровность купола",
      choiceIds: [xrayId("10.0.1"), xrayId("10.0.2")],
      required: true,
    }, {
      key: "definition",
      name: "Чёткость купола",
      choiceIds: [xrayId("10.0.3"), xrayId("10.0.4")],
      required: true,
    }, {
      key: "projection",
      name: "Проекция",
      choiceIds: [xrayId("10.0.5"), xrayId("10.0.6")],
      required: true,
    }]);
    expect(instrumentalFindingById(xrayId("10.0"))?.conflictPairs).toBeUndefined();
    expect(instrumentalFindingById(xrayId("12.2"))?.selectionSets).toEqual([{
      key: "regularity",
      name: "Ровность границ",
      choiceIds: [xrayId("12.2.3"), xrayId("12.2.4")],
    }, {
      key: "definition",
      name: "Чёткость границ",
      choiceIds: [xrayId("12.2.1"), xrayId("12.2.2")],
    }]);
    expect(instrumentalFindingById(xrayId("12.2"))?.conflictPairs).toBeUndefined();
    expect(instrumentalFindingById(xrayId("17.3"))?.selectionSets).toEqual([{
      key: "negative",
      name: "Отсутствие признаков",
      choiceIds: [xrayId("17.3.1"), xrayId("17.3.2"), xrayId("17.3.3"), xrayId("17.3.4")],
      selectionMode: "multiple",
      showName: false,
    }, {
      key: "positive",
      name: "Выявленные изменения",
      choiceIds: [
        xrayId("17.3.5"), xrayId("17.3.6"), xrayId("17.3.7"), xrayId("17.3.8"),
        xrayId("17.3.9"), xrayId("17.3.10"), xrayId("17.3.11"), xrayId("17.3.12"),
      ],
      selectionMode: "multiple",
    }]);
    expect(instrumentalFindingById(xrayId("17.3"))?.conflictPairs).toHaveLength(5);
    expect(instrumentalFindingById(xrayId("17.3.8"))?.children).toEqual([]);
    expect(instrumentalFindingById(xrayId("17.3.10"))?.children).toEqual([]);
    expect(instrumentalFindingById(xrayId("17.3.11"))?.name).toBe("Имеет картину заворота");
    expect(instrumentalFindingById(xrayId("17.3.13"))).toMatchObject({
      name: "Изменения отмечаются в",
      selectionMode: "multiple",
      hiddenWhenAllChoiceIdsSelected: [
        xrayId("17.3.1"), xrayId("17.3.2"), xrayId("17.3.3"), xrayId("17.3.4"),
      ],
    });
    expect(instrumentalFindingById(xrayId("17.3.13"))?.children.map((item) => item.name))
      .toEqual(["Краниальных долях лёгкого", "Каудальных долях лёгкого"]);
    expect(instrumentalFindingById(xrayId("17.5"))?.children.map((item) => item.id)).toEqual([
      xrayId("17.5.0.1"), xrayId("17.5.0.2"), xrayId("17.5.1"), xrayId("17.5.2"),
    ]);
    expect(instrumentalFindingById(xrayId("17.5.0.2"))?.children).toEqual([]);
    for (const item of multiple) {
      const choiceIds = new Set(item.children.filter((child) => child.kind === "choice").map((child) => child.id));
      expect(item.conflictPairs?.every(([left, right]) => left !== right && choiceIds.has(left) && choiceIds.has(right)) ?? true)
        .toBe(true);
    }
    expect(instrumentalFindingById(xrayId("10.0.5.intercostal"))).toMatchObject({ kind: "short-text", required: true });
    expect(instrumentalFindingById(xrayId("14.1"))?.terminalChoiceIds).toEqual([xrayId("14.1.3")]);
    expect(instrumentalFindingById(xrayId("18.3.1.3"))?.name).toBe("Значительное");
    expect(instrumentalFindingById(xrayId("12.5"))?.kind).toBe("short-text");
  });

  it("replaces only conflicting instrumental checkbox choices", () => {
    const conflicts = instrumentalFindingById(xrayId("17.3"))!.conflictPairs!;
    expect(replaceConflictingInstrumentalChoices(
      [xrayId("17.3.1"), xrayId("17.3.2"), xrayId("17.3.3")],
      xrayId("17.3.5"),
      conflicts,
    )).toEqual([xrayId("17.3.2"), xrayId("17.3.3"), xrayId("17.3.5")]);
    expect(replaceConflictingInstrumentalChoices(
      [xrayId("17.3.5"), xrayId("17.3.6"), xrayId("17.3.10")],
      xrayId("17.3.4"),
      conflicts,
    )).toEqual([xrayId("17.3.5"), xrayId("17.3.6"), xrayId("17.3.10"), xrayId("17.3.4")]);
    expect(replaceConflictingInstrumentalChoices(
      [xrayId("17.3.3"), xrayId("17.3.10"), xrayId("17.3.11")],
      xrayId("17.3.9"),
      conflicts,
    )).toEqual([xrayId("17.3.10"), xrayId("17.3.11"), xrayId("17.3.9")]);
  });

  it("preserves legacy partial heart-boundary selections", () => {
    const normalized = normalizeInstrumentalTestsValue({ studies: [{
      ...base,
      typeId: "instrumental.study.xray-thorax",
      findings: [value(xrayId("12"), [
        value(xrayId("12.2"), [value(xrayId("12.2.1"))]),
      ])],
    }] }, "2026-08-15").studies[0]!;
    if (normalized.mode !== "tree") throw new Error("Expected tree study");
    expect(normalized.findings[0]?.children[0]?.children).toEqual([
      expect.objectContaining({ findingId: xrayId("12.2.1"), findingName: "Чёткие" }),
    ]);
  });

  it("discards caudal vena cava details when it is not visualized", () => {
    const normalized = normalizeInstrumentalTestsValue({ studies: [{
      ...base,
      typeId: "instrumental.study.xray-thorax",
      findings: [value(xrayId("14"), [
        value(xrayId("14.1"), [value(xrayId("14.1.3"))]),
        value(xrayId("14.2"), [value(xrayId("14.2.1"))]),
        value(xrayId("14.3"), [value(xrayId("14.3.2"), [value(xrayId("14.3.2.2"))])]),
        value(xrayId("14.4"), [], " "),
      ])],
    }] }, "2026-08-15").studies[0]!;
    if (normalized.mode !== "tree") throw new Error("Expected tree study");
    expect(normalized.findings[0]?.children).toEqual([expect.objectContaining({
      findingId: xrayId("14.1"),
      children: [expect.objectContaining({ findingId: xrayId("14.1.3") })],
    })]);
  });

  it("normalizes independent pulmonary findings and multiple locations", () => {
    const normalized = normalizeInstrumentalTestsValue({ studies: [{
      ...base,
      typeId: "instrumental.study.xray-thorax",
      findings: [value(xrayId("17"), [value(xrayId("17.3"), [
        value(xrayId("17.3.2")),
        value(xrayId("17.3.5")),
        value(xrayId("17.3.6")),
        value(xrayId("17.3.8")),
        value(xrayId("17.3.10")),
        value(xrayId("17.3.11")),
        value(xrayId("17.3.12")),
        value(xrayId("17.3.13"), [value(xrayId("17.3.13.1")), value(xrayId("17.3.13.2"))]),
      ])])],
    }] }, "2026-08-15").studies[0]!;
    if (normalized.mode !== "tree") throw new Error("Expected tree study");
    const lungPattern = normalized.findings[0]!.children[0]!;
    expect(lungPattern.children.map((item) => item.findingId)).toEqual([
      xrayId("17.3.2"),
      xrayId("17.3.5"),
      xrayId("17.3.6"),
      xrayId("17.3.8"),
      xrayId("17.3.10"),
      xrayId("17.3.11"),
      xrayId("17.3.12"),
      xrayId("17.3.13"),
    ]);
    expect(lungPattern.children[1]?.children).toEqual([]);
    expect(lungPattern.children.at(-1)?.children.map((item) => item.findingId))
      .toEqual([xrayId("17.3.13.1"), xrayId("17.3.13.2")]);
  });

  it("migrates legacy pulmonary controls and sibling localization", () => {
    const normalized = normalizeInstrumentalTestsValue({ studies: [{
      ...base,
      typeId: "instrumental.study.xray-thorax",
      findings: [value(xrayId("17"), [
        value(xrayId("17.3"), [
          value(xrayId("17.3.status.2")),
          value(xrayId("17.3.5"), [value(xrayId("17.3.5.distribution.3"))]),
          value(xrayId("17.3.9.multiple")),
        ]),
        value(xrayId("17.3.13"), [value(xrayId("17.3.13.1"))]),
      ])],
    }] }, "2026-08-15").studies[0]!;
    if (normalized.mode !== "tree") throw new Error("Expected tree study");
    const lungPattern = normalized.findings[0]?.children[0];
    expect(lungPattern?.children.map((item) => item.findingId)).toEqual([
      xrayId("17.3.5"), xrayId("17.3.13"),
    ]);
    expect(lungPattern?.children[0]?.children).toEqual([]);
    expect(lungPattern?.children[1]?.children[0]?.findingId).toBe(xrayId("17.3.13.1"));
  });

  it("creates the pulmonary-pattern parent while migrating a legacy localization-only record", () => {
    const normalized = normalizeInstrumentalTestsValue({ studies: [{
      ...base,
      typeId: "instrumental.study.xray-thorax",
      findings: [value(xrayId("17"), [
        value(xrayId("17.3.13"), [value(xrayId("17.3.13.2"))]),
      ])],
    }] }, "2026-08-15").studies[0]!;
    if (normalized.mode !== "tree") throw new Error("Expected tree study");
    expect(normalized.findings[0]?.children[0]).toMatchObject({
      findingId: xrayId("17.3"),
      children: [expect.objectContaining({
        findingId: xrayId("17.3.13"),
        children: [expect.objectContaining({ findingId: xrayId("17.3.13.2") })],
      })],
    });
  });

  it("drops pulmonary locations when all absence findings are selected", () => {
    const normalized = normalizeInstrumentalTestsValue({ studies: [{
      ...base,
      typeId: "instrumental.study.xray-thorax",
      findings: [value(xrayId("17"), [
        value(xrayId("17.3"), [
          ...["17.3.1", "17.3.2", "17.3.3", "17.3.4"].map((code) => value(xrayId(code))),
        ]),
        value(xrayId("17.3.13"), [value(xrayId("17.3.13.2"))]),
      ])],
    }] }, "2026-08-15").studies[0]!;
    if (normalized.mode !== "tree") throw new Error("Expected tree study");
    expect(normalized.findings[0]?.children[0]?.children.map((item) => item.findingId)).toEqual([
      xrayId("17.3.1"), xrayId("17.3.2"), xrayId("17.3.3"), xrayId("17.3.4"),
    ]);
  });

  it("lifts legacy large-bronchi lumen and position values into their always-available level", () => {
    const normalized = normalizeInstrumentalTestsValue({ studies: [{
      ...base,
      typeId: "instrumental.study.xray-thorax",
      findings: [value(xrayId("17"), [value(xrayId("17.5"), [
        value(xrayId("17.5.0.2"), [
          value(xrayId("17.5.1"), [value(xrayId("17.5.1.2"))]),
          value(xrayId("17.5.2"), [value(xrayId("17.5.2.1"))]),
        ]),
      ])])],
    }] }, "2026-08-15").studies[0]!;
    if (normalized.mode !== "tree") throw new Error("Expected tree study");
    const largeBronchi = normalized.findings[0]?.children[0];
    expect(largeBronchi?.children.map((item) => item.findingId)).toEqual([
      xrayId("17.5.0.2"), xrayId("17.5.1"), xrayId("17.5.2"),
    ]);
    expect(largeBronchi?.children[0]?.children).toEqual([]);
    expect(largeBronchi?.children[1]?.children[0]?.findingId).toBe(xrayId("17.5.1.2"));
    expect(largeBronchi?.children[2]?.children[0]?.findingId).toBe(xrayId("17.5.2.1"));
  });

  it("nests conditional liver, gallbladder, and spleen findings while preserving stable IDs", () => {
    const liver = instrumentalFindingById(id("1"))!;
    const liverVisible = instrumentalFindingById(id("1.10.2"))!;
    expect(liver.children.map((item) => item.id)).not.toContain(id("1.11"));
    expect(liver.children.map((item) => item.id)).not.toContain(id("1.12"));
    expect(liverVisible.children.map((item) => item.id)).toEqual([
      id("1.10.2.1"), id("1.10.2.2"), id("1.11"), id("1.12"),
    ]);

    const gallbladder = instrumentalFindingById(id("2"))!;
    const sedimentVisible = instrumentalFindingById(id("2.5.2"))!;
    expect(gallbladder.children.map((item) => item.id)).not.toContain(id("2.6"));
    expect(sedimentVisible.children.at(-1)).toMatchObject({ id: id("2.6"), selectionMode: "multiple" });

    const spleen = instrumentalFindingById(id("4"))!;
    expect(spleen.children.map((item) => item.id)).toContain(id("4.6"));
    expect(spleen.children.map((item) => item.id)).not.toContain(id("4.5"));
    expect(instrumentalFindingById(id("4.4.2"))!.children.map((item) => item.id)).toEqual([
      id("4.4.2.1"), id("4.4.2.2"), id("4.5"),
    ]);
  });

  it("describes prostate contours as two required independent selection sets", () => {
    expect(instrumentalFindingById(id("10.1"))?.selectionSets).toEqual([{
      key: "regularity",
      name: "Ровность контуров",
      choiceIds: [id("10.1.1"), id("10.1.2")],
      required: true,
    }, {
      key: "definition",
      name: "Чёткость контуров",
      choiceIds: [id("10.1.3"), id("10.1.4")],
      required: true,
    }]);
  });

  it("normalizes names, text, and recursive sibling order", () => {
    const section = normalizeInstrumentalTestsValue({ studies: [{
      ...base,
      typeId: "instrumental.study.ultrasound-abdomen",
      typeName: "forged",
      mode: "tree",
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

  it("normalizes structured X-ray choices, required conditional text, and catalog order", () => {
    const study = normalizeInstrumentalTestsValue({ studies: [{
      ...base,
      typeId: "instrumental.study.xray-thorax",
      typeName: "old",
      mode: "tree",
      findings: [value(xrayId("10"), [value(xrayId("10.0"), [
        value(xrayId("10.0.5"), [value(xrayId("10.0.5.intercostal"), [], " 7 ")]),
        value(xrayId("10.0.1")),
        value(xrayId("10.0.3")),
      ])]), value(xrayId("20"), [], "  Без патологии  ")],
      comment: " ",
    }] }).studies[0]!;
    expect(study).toMatchObject({ typeId: "instrumental.study.xray-thorax", typeName: "Рентгенография грудной полости", mode: "tree" });
    if (study.mode !== "tree") throw new Error("Expected tree study");
    expect(study.findings[0]?.children[0]?.children.map((item) => item.findingId)).toEqual([
      xrayId("10.0.1"), xrayId("10.0.3"), xrayId("10.0.5"),
    ]);
    expect(study.findings[0]?.children[0]?.children[2]?.children[0]).toMatchObject({
      findingName: "Межреберье на LL-проекции", value: "7",
    });
    expect(study.findings[1]).toMatchObject({ findingName: "Заключение", value: "Без патологии" });
  });

  it("normalizes whole-number measurements and preserves their unit snapshot", () => {
    const section = normalizeInstrumentalTestsValue({ studies: [{
      ...base,
      typeId: "instrumental.study.ultrasound-abdomen",
      findings: [value("instrumental.finding.ultrasound-abdomen.1", [
        value(id("1.10"), [value(id("1.10.2"), [
          { ...value(id("1.12"), [], " 12 "), unit: "forged" },
        ])]),
      ])],
    }] });
    expect(section.studies[0]).toMatchObject({ mode: "tree", findings: [{ children: [{ children: [{ children: [{
      findingName: "Размер",
      value: "12",
      unit: "мм",
    }] }] }] }] });
  });

  it("canonicalizes legacy conditional siblings and drops them for inactive branches", () => {
    const unchanged = [value(id("19"), [], "Без патологии")];
    expect(canonicalizeInstrumentalFindingValues(unchanged)).toBe(unchanged);
    const section = normalizeInstrumentalTestsValue({ studies: [{
      ...base,
      typeId: "instrumental.study.ultrasound-abdomen",
      findings: [
        value(id("1"), [
          value(id("1.10"), [value(id("1.10.2"), [value(id("1.10.2.2"))])]),
          value(id("1.11"), [value(id("1.11.3"))]),
          value(id("1.12"), [], "8"),
        ]),
        value(id("2"), [
          value(id("2.5"), [value(id("2.5.2"), [value(id("2.5.2.1"))])]),
          value(id("2.6"), [value(id("2.6.7"))]),
        ]),
        value(id("4"), [
          value(id("4.4"), [value(id("4.4.2"), [value(id("4.4.2.1"))])]),
          value(id("4.5"), [], "6"),
          value(id("4.6"), [], "Независимый комментарий"),
        ]),
      ],
    }] });
    const study = section.studies[0]!;
    if (study.mode !== "tree") throw new Error("Expected tree study");
    const activeChildren = (rootId: string, selectorId: string) => study.findings.find((item) => item.findingId === rootId)!
      .children.find((item) => item.findingId === selectorId)!.children[0]!.children;
    expect(activeChildren(id("1"), id("1.10")).map((item) => item.findingId)).toEqual([
      id("1.10.2.2"), id("1.11"), id("1.12"),
    ]);
    expect(activeChildren(id("2"), id("2.5"))[1]).toMatchObject({
      findingId: id("2.6"),
      children: [{ findingId: id("2.6.7") }],
    });
    expect(activeChildren(id("4"), id("4.4"))[1]).toMatchObject({ findingId: id("4.5"), value: "6" });
    expect(study.findings[2]!.children.at(-1)).toMatchObject({ findingId: id("4.6"), value: "Независимый комментарий" });

    const inactive = normalizeInstrumentalTestsValue({ studies: [{
      ...base,
      typeId: "instrumental.study.ultrasound-abdomen",
      findings: [
        value(id("1"), [value(id("1.10"), [value(id("1.10.1"))]), value(id("1.12"), [], "8")]),
        value(id("2"), [value(id("2.5"), [value(id("2.5.1"))]), value(id("2.6"), [value(id("2.6.1"))])]),
        value(id("4"), [value(id("4.4"), [value(id("4.4.1"))]), value(id("4.5"), [], "6"), value(id("4.6"), [], "Комментарий")]),
      ],
    }] }).studies[0]!;
    if (inactive.mode !== "tree") throw new Error("Expected tree study");
    expect(inactive.findings[0]!.children).toHaveLength(1);
    expect(inactive.findings[1]!.children).toHaveLength(1);
    expect(inactive.findings[2]!.children.map((item) => item.findingId)).toEqual([id("4.4"), id("4.6")]);
  });

  it("normalizes optional multi-select choices in catalog order and omits an empty container", () => {
    const studyFor = (sedimentCharacter: InstrumentalFindingValue) => ({ studies: [{
      ...base,
      typeId: "instrumental.study.ultrasound-abdomen",
      findings: [value(id("2"), [value(id("2.5"), [value(id("2.5.2"), [sedimentCharacter])])])],
    }] });
    const normalized = normalizeInstrumentalTestsValue(studyFor(value(id("2.6"), [
      value(id("2.6.7")), value(id("2.6.1")), value(id("2.6.4")),
    ]))).studies[0]!;
    if (normalized.mode !== "tree") throw new Error("Expected tree study");
    expect(normalized.findings[0]!.children[0]!.children[0]!.children[0]!.children.map((item) => item.findingId)).toEqual([
      id("2.6.1"), id("2.6.4"), id("2.6.7"),
    ]);
    const empty = normalizeInstrumentalTestsValue(studyFor(value(id("2.6")))).studies[0]!;
    if (empty.mode !== "tree") throw new Error("Expected tree study");
    expect(empty.findings[0]!.children[0]!.children[0]!.children).toEqual([]);
  });

  it("normalizes one prostate contour choice from each required set in catalog order", () => {
    const normalized = normalizeInstrumentalTestsValue({ studies: [{
      ...base,
      typeId: "instrumental.study.ultrasound-abdomen",
      findings: [value(id("10"), [value(id("10.1"), [value(id("10.1.4")), value(id("10.1.1"))])])],
    }] }).studies[0]!;
    if (normalized.mode !== "tree") throw new Error("Expected tree study");
    expect(normalized.findings[0]!.children[0]!.children.map((item) => item.findingId)).toEqual([
      id("10.1.1"), id("10.1.4"),
    ]);
  });

  it.each([
    ["empty section", { studies: [] }, "Добавьте хотя бы одно"],
    ["bad UUID", { studies: [{ ...base, id: "bad", typeId: "instrumental.study.xray-thorax", findings: [value(xrayId("20"), [], "ok")] }] }, "идентификатор"],
    ["future date", { studies: [{ ...base, date: "2026-08-16", typeId: "instrumental.study.xray-thorax", findings: [value(xrayId("20"), [], "ok")] }] }, "дату"],
    ["invalid calendar date", { studies: [{ ...base, date: "2026-02-31", typeId: "instrumental.study.xray-thorax", findings: [value(xrayId("20"), [], "ok")] }] }, "дату"],
    ["unknown type", { studies: [{ ...base, typeId: "unknown", findings: [] }] }, "справочника"],
    ["old narrative type", { studies: [{ ...base, typeId: "instrumental.study.xray-thorax-abdomen", mode: "narrative", result: "ok" }] }, "справочника"],
    ["narrative mode", { studies: [{ ...base, typeId: "instrumental.study.xray-thorax", mode: "narrative", result: "ok" }] }, "не поддерживается"],
    ["empty tree", { studies: [{ ...base, typeId: "instrumental.study.ultrasound-abdomen", findings: [] }] }, "Добавьте результаты"],
    ["empty group", { studies: [{ ...base, typeId: "instrumental.study.ultrasound-abdomen", findings: [value("instrumental.finding.ultrasound-abdomen.1")] }] }, "Печень"],
    ["empty text", { studies: [{ ...base, typeId: "instrumental.study.ultrasound-abdomen", findings: [value("instrumental.finding.ultrasound-abdomen.19", [], " ")] }] }, "Заключение"],
    ["fractional measurement", { studies: [{ ...base, typeId: "instrumental.study.ultrasound-abdomen", findings: [value(id("1"), [value(id("1.10"), [value(id("1.10.2"), [value(id("1.12"), [], "4.2")])])])] }] }, "целое число"],
    ["negative measurement", { studies: [{ ...base, typeId: "instrumental.study.ultrasound-abdomen", findings: [value(id("1"), [value(id("1.10"), [value(id("1.10.2"), [value(id("1.12"), [], "-4")])])])] }] }, "целое число"],
    ["misplaced child", { studies: [{ ...base, typeId: "instrumental.study.ultrasound-abdomen", findings: [value("instrumental.finding.ultrasound-abdomen.1", [value("instrumental.finding.ultrasound-abdomen.2.1", [])])] }] }, "структура"],
    ["multiple values", { studies: [{ ...base, typeId: "instrumental.study.ultrasound-abdomen", findings: [value("instrumental.finding.ultrasound-abdomen.1", [value("instrumental.finding.ultrasound-abdomen.1.3", [value("instrumental.finding.ultrasound-abdomen.1.3.1"), value("instrumental.finding.ultrasound-abdomen.1.3.2")])])] }] }, "не более одного"],
    ["incomplete contour sets", { studies: [{ ...base, typeId: "instrumental.study.ultrasound-abdomen", findings: [value(id("10"), [value(id("10.1"), [value(id("10.1.1"))])])] }] }, "Чёткость контуров"],
    ["conflicting contour values", { studies: [{ ...base, typeId: "instrumental.study.ultrasound-abdomen", findings: [value(id("10"), [value(id("10.1"), [value(id("10.1.1")), value(id("10.1.2")), value(id("10.1.3"))])])] }] }, "Ровность контуров"],
    ["conflicting focal lung findings", { studies: [{ ...base, typeId: "instrumental.study.xray-thorax", findings: [value(xrayId("17"), [value(xrayId("17.3"), [value(xrayId("17.3.3")), value(xrayId("17.3.9"))])])] }] }, "несовместимые"],
    ["absence of enhancement with enhancement", { studies: [{ ...base, typeId: "instrumental.study.xray-thorax", findings: [value(xrayId("17"), [value(xrayId("17.3"), [value(xrayId("17.3.1")), value(xrayId("17.3.5"))])])] }] }, "несовместимые"],
    ["conflicting diaphragm projection values", { studies: [{ ...base, typeId: "instrumental.study.xray-thorax", findings: [value(xrayId("10"), [value(xrayId("10.0"), [
      value(xrayId("10.0.1")), value(xrayId("10.0.3")),
      value(xrayId("10.0.5"), [value(xrayId("10.0.5.intercostal"), [], "7")]),
      value(xrayId("10.0.6"), [value(xrayId("10.0.6.intercostal"), [], "8")]),
    ])])] }] }, "Проекция"],
    ["duplicate multi-select value", { studies: [{ ...base, typeId: "instrumental.study.ultrasound-abdomen", findings: [value(id("2"), [value(id("2.5"), [value(id("2.5.2"), [value(id("2.6"), [value(id("2.6.1")), value(id("2.6.1"))])])])])] }] }, "структура"],
    ["unknown multi-select value", { studies: [{ ...base, typeId: "instrumental.study.ultrasound-abdomen", findings: [value(id("2"), [value(id("2.5"), [value(id("2.5.2"), [value(id("2.6"), [value(id("2.6.99"))])])])])] }] }, "структура"],
    ["conflicting X-ray boundary values", { studies: [{ ...base, typeId: "instrumental.study.xray-thorax", findings: [value(xrayId("12"), [value(xrayId("12.2"), [value(xrayId("12.2.1")), value(xrayId("12.2.2"))])])] }] }, "Чёткость границ"],
    ["missing required X-ray continuation", { studies: [{ ...base, typeId: "instrumental.study.xray-thorax", findings: [value(xrayId("10"), [value(xrayId("10.0"), [value(xrayId("10.0.5"))])])] }] }, "Межреберье"],
    ["text children", { studies: [{ ...base, typeId: "instrumental.study.ultrasound-abdomen", findings: [value("instrumental.finding.ultrasound-abdomen.19", [value("instrumental.finding.ultrasound-abdomen.1")], "text")] }] }, "вложенные"],
  ])("rejects %s", (_name, input, message) => {
    expect(() => normalizeInstrumentalTestsValue(input, "2026-08-15")).toThrow(message as string);
  });

  it("rejects duplicate study and finding IDs", () => {
    const xray = { ...base, typeId: "instrumental.study.xray-thorax", findings: [value(xrayId("20"), [], "ok")] };
    expect(() => normalizeInstrumentalTestsValue({ studies: [xray, xray] })).toThrow("идентификатор");
    const duplicate = value("instrumental.finding.ultrasound-abdomen.19", [], "ok");
    expect(() => normalizeInstrumentalTestsValue({ studies: [{ ...base, typeId: "instrumental.study.ultrasound-abdomen", findings: [duplicate, duplicate] }] })).toThrow("структура");
  });
});
