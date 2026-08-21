// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it } from "vitest";
import type { InstrumentalTestsSectionValue } from "@klinok/contracts";
import { parseInstrumentalTestsDraft } from "../src/instrumentalTests";

const base = { id: "123e4567-e89b-12d3-a456-426614174000", date: "2026-08-15" };

describe("instrumental draft validation", () => {
  it("places section, date, narrative, group, and text errors beside their fields", () => {
    expect(parseInstrumentalTestsDraft({ studies: [] }).errors.section).toContain("Добавьте");
    const draft: InstrumentalTestsSectionValue = { studies: [{
      ...base,
      date: "2026-08-16",
      typeId: "instrumental.study.xray-thorax-abdomen",
      typeName: "Рентген грудной и брюшной полости",
      mode: "narrative",
      result: "",
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
    expect(parsed.errors.studies[0]).toMatchObject({ date: "Укажите корректную дату исследования.", result: "Укажите результат исследования." });
    expect(parsed.errors.studies[1]?.findings).toEqual({
      "instrumental.finding.ultrasound-abdomen.1": "Заполните показатель «Печень».",
      "instrumental.finding.ultrasound-abdomen.2.8": "Укажите целое число для поля «Размер».",
      "instrumental.finding.ultrasound-abdomen.19": "Заполните поле «Заключение».",
    });
  });

  it("returns the normalized value and surfaces structural normalizer failures", () => {
    const draft: InstrumentalTestsSectionValue = { studies: [{
      ...base,
      typeId: "instrumental.study.xray-thorax-abdomen",
      typeName: "forged",
      mode: "narrative",
      result: " result ",
    }] };
    expect(parseInstrumentalTestsDraft(draft).value?.studies[0]).toMatchObject({ typeName: "Рентген грудной и брюшной полости", result: "result" });
    expect(parseInstrumentalTestsDraft({ studies: [{ ...draft.studies[0]!, id: "bad" }] }).errors.section).toContain("идентификатор");
  });
});
