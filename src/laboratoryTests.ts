// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import {
  laboratoryStudyTypeById,
  normalizeLaboratoryTestsValue,
  type LaboratoryTestsSectionValue,
} from "./repositories/types";

export interface LaboratoryStudyDraftErrors {
  section?: string;
  date?: string;
  laboratory?: string;
  result?: string;
  infection?: string;
  method?: string;
  infectionResult?: string;
  indicators?: Record<string, string>;
}

export interface LaboratoryTestsDraftErrors {
  section?: string;
  studies: LaboratoryStudyDraftErrors[];
}

function hasErrors(errors: LaboratoryStudyDraftErrors): boolean {
  return Object.values(errors).some((value) => typeof value === "string" || Object.keys(value ?? {}).length > 0);
}

export function parseLaboratoryTestsDraft(
  draft: LaboratoryTestsSectionValue,
  today = new Date().toISOString().slice(0, 10),
): { value?: LaboratoryTestsSectionValue; errors: LaboratoryTestsDraftErrors } {
  if (!draft.studies.length) return { errors: { section: "Добавьте хотя бы одно лабораторное исследование.", studies: [] } };
  const studyErrors = draft.studies.map((study): LaboratoryStudyDraftErrors => {
    const errors: LaboratoryStudyDraftErrors = {};
    const type = laboratoryStudyTypeById(study.typeId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(study.date) || study.date > today) errors.date = "Укажите корректную дату исследования.";
    if (!study.laboratory.trim()) errors.laboratory = "Укажите лабораторию.";
    if (!type) errors.section = "Выберите исследование из справочника.";
    else if (study.mode === "panel") {
      errors.indicators = Object.fromEntries(study.results.flatMap((result) => result.result.trim()
        ? []
        : [[result.indicatorId, "Укажите результат."]]));
      if (!study.results.length) errors.section = "Добавьте показатели исследования.";
    } else if (study.mode === "narrative") {
      if (!study.result.trim()) errors.result = "Укажите результат исследования.";
    } else {
      if (!study.infection.trim()) errors.infection = "Укажите инфекцию.";
      if (!["ПЦР", "ИФА", "РМА", "ELISA", "ИХА"].includes(study.method)) errors.method = "Выберите метод исследования.";
      if (!["positive", "negative"].includes(study.result)) errors.infectionResult = "Выберите результат исследования.";
    }
    return errors;
  });
  const errors: LaboratoryTestsDraftErrors = { studies: studyErrors };
  if (studyErrors.some(hasErrors)) return { errors };
  try {
    return { value: normalizeLaboratoryTestsValue(draft, today), errors };
  } catch (reason) {
    return { errors: { ...errors, section: reason instanceof Error ? reason.message : "Проверьте лабораторные исследования." } };
  }
}
