// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import {
  availableInstrumentalFindingCatalog,
  canonicalizeInstrumentalFindingValues,
  instrumentalStudyTypeById,
  normalizeInstrumentalTestsValue,
} from "./repositories/types";
import type {
  InstrumentalFindingCatalogItem,
  InstrumentalFindingValue,
  InstrumentalTestsSectionValue,
} from "@klinok/contracts";

export interface InstrumentalStudyDraftErrors {
  section?: string;
  date?: string;
  result?: string;
  findings?: Record<string, string>;
}

export interface InstrumentalTestsDraftErrors {
  section?: string;
  studies: InstrumentalStudyDraftErrors[];
}

function validateFindings(
  values: readonly InstrumentalFindingValue[],
  catalog: readonly InstrumentalFindingCatalogItem[],
  errors: Record<string, string>,
) {
  const availableCatalog = availableInstrumentalFindingCatalog(catalog, values);
  const catalogById = new Map(availableCatalog.map((item) => [item.id, item]));
  const presentIds = new Set(values.map((value) => value.findingId));
  for (const value of values) {
    const item = catalogById.get(value.findingId);
    if (!item) continue;
    if (item.selectionSets?.length) {
      const selectedIds = new Set(value.children.map((child) => child.findingId));
      for (const set of item.selectionSets) {
        const selectedCount = set.choiceIds.filter((id) => selectedIds.has(id)).length;
        if (set.selectionMode !== "multiple" && selectedCount > 1) {
          errors[`${item.id}:${set.key}`] = `Для характеристики «${set.name}» можно выбрать не более одного значения.`;
        } else if (set.required && selectedCount === 0) {
          errors[`${item.id}:${set.key}`] = `Заполните характеристику «${set.name}».`;
        }
      }
    } else if (item.kind === "group" && !value.children.length && item.selectionMode !== "multiple") {
      errors[item.id] = `Заполните показатель «${item.name}».`;
    }
    if (item.selectionMode === "multiple") {
      const selectedIds = new Set(value.children.map((child) => child.findingId));
      if (item.conflictPairs?.some(([left, right]) => selectedIds.has(left) && selectedIds.has(right))) {
        errors[item.id] = `Для показателя «${item.name}» выбраны несовместимые варианты.`;
      }
    }
    if (item.kind === "integer" || item.kind === "short-text" || item.kind === "long-text") {
      const text = value.value?.trim() ?? "";
      if (!text) errors[item.id] = `Заполните поле «${item.name}».`;
      else if (item.kind === "integer" && !/^\d+$/.test(text)) {
        errors[item.id] = `Укажите целое число для поля «${item.name}».`;
      }
    }
    validateFindings(value.children, item.children, errors);
  }
  for (const item of availableCatalog) {
    if (item.required && !presentIds.has(item.id)) errors[item.id] = `Заполните поле «${item.name}».`;
  }
}

function hasErrors(errors: InstrumentalStudyDraftErrors): boolean {
  return Object.values(errors).some((value) => typeof value === "string" || Object.keys(value ?? {}).length > 0);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseInstrumentalTestsDraft(
  draft: InstrumentalTestsSectionValue,
  today = new Date().toISOString().slice(0, 10),
): { value?: InstrumentalTestsSectionValue; errors: InstrumentalTestsDraftErrors } {
  if (!draft.studies.length) return { errors: { section: "Добавьте хотя бы одно инструментальное исследование.", studies: [] } };
  const studies = draft.studies.map((study): InstrumentalStudyDraftErrors => {
    const errors: InstrumentalStudyDraftErrors = {};
    const type = instrumentalStudyTypeById(study.typeId);
    if (!validDate(study.date) || study.date > today) errors.date = "Укажите корректную дату исследования.";
    if (!type) errors.section = "Выберите инструментальное исследование из справочника.";
    else if (study.mode === "narrative") {
      if (!study.result.trim()) errors.result = "Укажите результат исследования.";
    } else {
      errors.findings = {};
      if (!study.findings.length) errors.section = "Добавьте результаты инструментального исследования.";
      validateFindings(canonicalizeInstrumentalFindingValues(study.findings), type.findings, errors.findings);
    }
    return errors;
  });
  const errors: InstrumentalTestsDraftErrors = { studies };
  if (studies.some(hasErrors)) return { errors };
  try {
    return { value: normalizeInstrumentalTestsValue(draft, today), errors };
  } catch (reason) {
    return { errors: { ...errors, section: reason instanceof Error ? reason.message : "Проверьте инструментальные исследования." } };
  }
}
