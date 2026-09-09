// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

export interface TherapeuticProblemValue {
  id: string;
  sourceWhatHappenedId?: string;
  title: string;
  description: string;
  onsetId?: string;
  frequencyId?: string;
  priorTherapyId?: string;
  medicationUseId?: string;
  medicationIds: readonly string[];
  medicationName?: string;
  medicationDynamicsId?: string;
}

export interface TherapeuticAppointmentSectionValue {
  schemaVersion: 2;
  diseaseAnamnesis: {
    text: string;
    problems: readonly TherapeuticProblemValue[];
    selectedIds: readonly string[];
  };
  lifeAnamnesis: {
    text: string;
    selectedIds: readonly string[];
    ectoparasiteName: string;
    dewormingName: string;
    naturalDietProducts: string;
    commercialFoodName: string;
    diseaseName: string;
    currentMedications: string;
    allergies: string;
  };
  examination: {
    text: string;
    selectedIds: readonly string[];
    coatComment: string;
    locomotionComment: string;
  };
  recommendations: string;
  prescriptions: string;
  migrationNotes: readonly string[];
}

export interface TherapeuticMigrationOptions {
  knownOptionIds?: ReadonlySet<string>;
  isKnownOptionId?: (id: string) => boolean;
  optionLabel?: (id: string) => string;
}

export const THERAPEUTIC_V2_QUESTION_IDS = [
  ...`disease.activity.state,disease.activity.baseline,disease.activity.change,disease.appetite.state,disease.appetite.baseline,disease.appetite.change,disease.water.state,disease.water.baseline,disease.water.change,disease.defecation.state,disease.defecation.baseline,disease.defecation.change,disease.stool.form,disease.stool.formed-detail,disease.stool.unformed-detail,disease.stool.findings,disease.urination.state,disease.urination.baseline,disease.urination.change,disease.urine.state,disease.urine.volume,disease.urine.quality,disease.vomiting.state,disease.vomiting.frequency,disease.vomiting.rare-count,disease.vomiting.often-count,disease.vomiting.feeding,disease.vomiting.contents,disease.regurgitation.state,disease.regurgitation.frequency,disease.eye-discharge.state,disease.eye-discharge.type,disease.sneezing.state,disease.sneezing.frequency,disease.nasal-discharge.state,disease.nasal-discharge.type,disease.cough.state,disease.cough.frequency,disease.cough.rare-count,disease.cough.often-count,disease.cough.features,disease.pain.state,disease.pain.location`.split(","),
  ...`life.origin.source,life.housing.place,life.housing.apartment-walk,life.housing.house-walk,life.housing.arrangement,life.housing.group-size,life.housing.group-vaccination,life.travel.places,life.travel.dacha-walk,life.travel.apartment-frequency,life.travel.region-frequency,life.ectoparasites.state,life.ectoparasites.none-reason,life.ectoparasites.regularity,life.ectoparasites.interval,life.ectoparasites.last,life.ectoparasites.method,life.deworming.state,life.deworming.none-reason,life.deworming.regularity,life.deworming.interval,life.deworming.last,life.deworming.method,life.vaccination.state,life.vaccination.none-reason,life.vaccination.regularity,life.vaccination.last,life.vaccination.coverage,life.diet.type,life.diet.natural,life.diet.commercial-purpose,life.diet.commercial-form,life.diseases.types,life.diseases.infectious-outcome`.split(","),
  ...`exam.general.state,exam.posture.type,exam.posture.natural,exam.posture.forced,exam.mucosa.color,exam.mucosa.moisture,exam.crt.value,exam.oral.state,exam.oral.findings,exam.oral.lesions,exam.oral.locations,exam.oral.calculus,exam.oral.calculus-grade,exam.oral.gingivitis,exam.oral.gingivitis-grade,exam.eyes.state,exam.eyes.side,exam.eyes.size-state,exam.eyes.size,exam.eyes.discharge-state,exam.eyes.discharge,exam.eyes.eyelids-state,exam.eyes.eyelids,exam.eyes.conjunctiva,exam.eyes.cornea,exam.eyes.anterior-chamber,exam.eyes.pupil,exam.ear.changes,exam.ear.skin,exam.ear.secretion,exam.ear.filling,exam.ear.tympanum,exam.ear.canal,exam.lymph.state,exam.lymph.grade,exam.lymph.location,exam.turgor.state,exam.turgor.dehydration,exam.condition.score,exam.coat.quality,exam.coat.changes,exam.coat.hypotrichosis.distribution,exam.coat.hypotrichosis.number,exam.coat.alopecia.distribution,exam.coat.alopecia.number,exam.coat.shape,exam.skin.state,exam.skin.findings,exam.mass.count,exam.mass.location,exam.mass.growth,exam.mass.consistency,exam.mass.ulceration,exam.mass.mobility,exam.mass.size,exam.abdomen.visual,exam.abdomen.bulging,exam.abdomen.palpation,exam.abdomen.pain,exam.abdomen.pain-location,exam.abdomen.findings,exam.abdomen.bladder,exam.abdomen.feces,exam.abdomen.induration,exam.abdomen.kidney-size,exam.abdomen.kidney-side,exam.abdomen.fetus,exam.abdomen.peristalsis,exam.abdomen.fetal-heartbeat,exam.chest.breathing,exam.chest.dyspnea,exam.chest.wall,exam.chest.heart-tones,exam.chest.heart-rhythm,exam.chest.arrhythmia,exam.chest.murmur,exam.chest.murmur-grade,exam.chest.lung-breathing,exam.chest.lung-noises,exam.locomotion.state,exam.locomotion.lameness,exam.locomotion.findings,exam.locomotion.ataxia,exam.locomotion.seizures,exam.completeness.state,exam.completeness.partial-reason,exam.completeness.none-reason`.split(","),
] as const;

export const THERAPEUTIC_V2_MULTIPLE_QUESTION_IDS = `disease.stool.findings,disease.urination.change,disease.urine.quality,disease.vomiting.contents,disease.eye-discharge.type,disease.nasal-discharge.type,disease.cough.features,disease.pain.location,life.travel.places,life.ectoparasites.method,life.deworming.method,life.diseases.types,exam.oral.findings,exam.oral.locations,exam.eyes.discharge,exam.eyes.eyelids,exam.eyes.conjunctiva,exam.eyes.cornea,exam.eyes.anterior-chamber,exam.eyes.pupil,exam.ear.changes,exam.ear.skin,exam.ear.canal,exam.lymph.location,exam.coat.quality,exam.coat.changes,exam.skin.findings,exam.abdomen.pain-location,exam.abdomen.findings,exam.chest.arrhythmia,exam.chest.lung-breathing,exam.chest.lung-noises,exam.locomotion.findings,exam.locomotion.seizures`.split(",");

const therapeuticQuestionIds = new Set<string>(THERAPEUTIC_V2_QUESTION_IDS);
const multipleQuestionIds = new Set(THERAPEUTIC_V2_MULTIPLE_QUESTION_IDS);
const problemQuestionIds = new Set([
  "problem.onset", "problem.frequency", "problem.therapy", "problem.medication", "problem.medication.type", "problem.dynamics",
]);
const exclusiveMultipleOptionIds = new Set([
  "life.travel.places.nowhere",
  "exam.eyes.conjunctiva.normal",
  "exam.eyes.cornea.normal",
  "exam.eyes.anterior-chamber.normal",
  "exam.eyes.pupil.normal",
  "exam.ear.changes.none",
  "exam.ear.skin.clean",
  "exam.coat.quality.shiny",
]);
const mutuallyExclusiveOptionGroups: readonly (readonly string[])[] = [
  ["disease.vomiting.contents.foamy", "disease.vomiting.contents.not-foamy"],
  [
    "disease.urination.change.absent",
    "disease.urination.change.absent-day",
    "disease.urination.change.absent-days-2",
  ],
];
const questionDependencies: Readonly<Record<string, readonly string[]>> = {
  "disease.activity.baseline": ["disease.activity.state.unchanged"],
  "disease.activity.change": ["disease.activity.state.changed"],
  "disease.appetite.baseline": ["disease.appetite.state.unchanged"],
  "disease.appetite.change": ["disease.appetite.state.changed"],
  "disease.water.baseline": ["disease.water.state.unchanged"],
  "disease.water.change": ["disease.water.state.changed"],
  "disease.defecation.baseline": ["disease.defecation.state.unchanged"],
  "disease.defecation.change": ["disease.defecation.state.changed"],
  "disease.stool.formed-detail": ["disease.stool.form.formed"],
  "disease.stool.unformed-detail": ["disease.stool.form.unformed"],
  "disease.urination.baseline": ["disease.urination.state.unchanged"],
  "disease.urination.change": ["disease.urination.state.changed"],
  "disease.urine.volume": ["disease.urine.state.changed"],
  "disease.urine.quality": ["disease.urine.state.changed"],
  "disease.vomiting.frequency": ["disease.vomiting.state.present"],
  "disease.vomiting.rare-count": ["disease.vomiting.frequency.rare"],
  "disease.vomiting.often-count": ["disease.vomiting.frequency.often"],
  "disease.vomiting.feeding": ["disease.vomiting.state.present"],
  "disease.vomiting.contents": ["disease.vomiting.state.present"],
  "disease.regurgitation.frequency": ["disease.regurgitation.state.present"],
  "disease.eye-discharge.type": ["disease.eye-discharge.state.present"],
  "disease.sneezing.frequency": ["disease.sneezing.state.present"],
  "disease.nasal-discharge.type": ["disease.nasal-discharge.state.present"],
  "disease.cough.frequency": ["disease.cough.state.present"],
  "disease.cough.rare-count": ["disease.cough.frequency.rare"],
  "disease.cough.often-count": ["disease.cough.frequency.often"],
  "disease.cough.features": ["disease.cough.state.present"],
  "disease.pain.location": ["disease.pain.state.localized"],
  "life.housing.apartment-walk": ["life.housing.place.apartment"],
  "life.housing.house-walk": ["life.housing.place.house"],
  "life.housing.group-size": ["life.housing.arrangement.group"],
  "life.housing.group-vaccination": ["life.housing.group-size.one-two", "life.housing.group-size.over-three"],
  "life.travel.dacha-walk": ["life.travel.places.dacha"],
  "life.travel.apartment-frequency": ["life.travel.places.other-apartment"],
  "life.travel.region-frequency": ["life.travel.places.other-region"],
  "life.ectoparasites.none-reason": ["life.ectoparasites.state.none"],
  "life.ectoparasites.regularity": ["life.ectoparasites.state.yes"],
  "life.ectoparasites.interval": ["life.ectoparasites.regularity.regular"],
  "life.ectoparasites.last": ["life.ectoparasites.state.yes"],
  "life.ectoparasites.method": ["life.ectoparasites.state.yes"],
  "life.deworming.none-reason": ["life.deworming.state.none"],
  "life.deworming.regularity": ["life.deworming.state.yes"],
  "life.deworming.interval": ["life.deworming.regularity.regular"],
  "life.deworming.last": ["life.deworming.state.yes"],
  "life.deworming.method": ["life.deworming.state.yes"],
  "life.vaccination.none-reason": ["life.vaccination.state.none"],
  "life.vaccination.regularity": ["life.vaccination.state.yes"],
  "life.vaccination.last": ["life.vaccination.state.yes"],
  "life.vaccination.coverage": ["life.vaccination.state.yes"],
  "life.diet.natural": ["life.diet.type.natural"],
  "life.diet.commercial-purpose": ["life.diet.type.commercial"],
  "life.diet.commercial-form": ["life.diet.commercial-purpose.daily", "life.diet.commercial-purpose.dietary"],
  "life.diseases.infectious-outcome": ["life.diseases.types.infectious"],
  "exam.posture.natural": ["exam.posture.type.natural"],
  "exam.posture.forced": ["exam.posture.type.forced"],
  "exam.oral.findings": ["exam.oral.state.changed"],
  "exam.oral.locations": ["exam.oral.lesions.present"],
  "exam.oral.calculus-grade": ["exam.oral.calculus.present"],
  "exam.oral.gingivitis-grade": ["exam.oral.gingivitis.present"],
  "exam.eyes.side": ["exam.eyes.state.present"],
  "exam.eyes.size": ["exam.eyes.size-state.changed"],
  "exam.eyes.discharge": ["exam.eyes.discharge-state.present"],
  "exam.eyes.eyelids": ["exam.eyes.eyelids-state.changed"],
  "exam.ear.filling": ["exam.ear.secretion.significant"],
  "exam.lymph.grade": ["exam.lymph.state.enlarged"],
  "exam.lymph.location": ["exam.lymph.state.enlarged"],
  "exam.turgor.dehydration": ["exam.turgor.state.dehydration"],
  "exam.coat.hypotrichosis.distribution": ["exam.coat.changes.hypotrichosis"],
  "exam.coat.hypotrichosis.number": ["exam.coat.hypotrichosis.distribution.local"],
  "exam.coat.alopecia.distribution": ["exam.coat.changes.alopecia"],
  "exam.coat.alopecia.number": ["exam.coat.alopecia.distribution.local"],
  "exam.coat.shape": ["exam.coat.hypotrichosis.distribution.local", "exam.coat.alopecia.distribution.local"],
  "exam.skin.findings": ["exam.skin.state.changed"],
  "exam.mass.location": ["exam.mass.count.single", "exam.mass.count.several", "exam.mass.count.multiple"],
  "exam.mass.growth": ["exam.mass.location.intradermal"],
  "exam.mass.consistency": ["exam.mass.count.single", "exam.mass.count.several", "exam.mass.count.multiple"],
  "exam.mass.ulceration": ["exam.mass.count.single", "exam.mass.count.several", "exam.mass.count.multiple"],
  "exam.mass.mobility": ["exam.mass.count.single", "exam.mass.count.several", "exam.mass.count.multiple"],
  "exam.mass.size": ["exam.mass.count.single", "exam.mass.count.several", "exam.mass.count.multiple"],
  "exam.abdomen.pain-location": ["exam.abdomen.pain.present"],
  "exam.abdomen.bladder": ["exam.abdomen.findings.bladder"],
  "exam.abdomen.feces": ["exam.abdomen.findings.feces"],
  "exam.abdomen.induration": ["exam.abdomen.findings.induration"],
  "exam.abdomen.kidney-size": ["exam.abdomen.findings.kidney"],
  "exam.abdomen.kidney-side": ["exam.abdomen.kidney-size.enlarged", "exam.abdomen.kidney-size.reduced"],
  "exam.abdomen.fetus": ["exam.abdomen.findings.fetus"],
  "exam.abdomen.fetal-heartbeat": ["exam.abdomen.findings.fetus"],
  "exam.chest.dyspnea": ["exam.chest.breathing.dyspnea"],
  "exam.chest.heart-rhythm": ["exam.chest.heart-tones.clear", "exam.chest.heart-tones.muffled", "exam.chest.heart-tones.dull"],
  "exam.chest.murmur-grade": ["exam.chest.murmur.systolic", "exam.chest.murmur.diastolic", "exam.chest.murmur.machinery"],
  "exam.locomotion.lameness": ["exam.locomotion.state.lameness"],
  "exam.locomotion.ataxia": ["exam.locomotion.findings.ataxia"],
  "exam.locomotion.seizures": ["exam.locomotion.findings.seizures"],
  "exam.completeness.partial-reason": ["exam.completeness.state.partial"],
  "exam.completeness.none-reason": ["exam.completeness.state.none"],
};

function questionIdForOption(id: string): string {
  return id.slice(0, id.lastIndexOf("."));
}

export function isKnownTherapeuticV2OptionId(id: string): boolean {
  const questionId = questionIdForOption(id);
  return therapeuticQuestionIds.has(questionId) || problemQuestionIds.has(questionId);
}

function optionIsKnown(id: string, options: TherapeuticMigrationOptions): boolean {
  if (options.knownOptionIds) return options.knownOptionIds.has(id);
  return (options.isKnownOptionId ?? isKnownTherapeuticV2OptionId)(id);
}

const legacyFoamIds = new Map([
  ["disease.vomiting.foam.foamy", "disease.vomiting.contents.foamy"],
  ["disease.vomiting.foam.not-foamy", "disease.vomiting.contents.not-foamy"],
]);
const legacyCoatDistributionIds = new Map([
  ["exam.coat.distribution.local", "local"],
  ["exam.coat.distribution.diffuse", "diffuse"],
]);
const legacyCoatNumberIds = new Map([
  ["exam.coat.number.single", "single"],
  ["exam.coat.number.multiple", "multiple"],
]);

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string"))] : [];
}

function migrateProblemOption(
  value: unknown,
  problemLabel: string,
  notes: string[],
  options: TherapeuticMigrationOptions,
): string | undefined {
  const id = optionalString(value);
  if (!id || optionIsKnown(id, options)) return id;
  notes.push(`${problemLabel}: ${options.optionLabel?.(id) ?? id}`);
  return undefined;
}

function migrateProblem(
  value: unknown,
  index: number,
  notes: string[],
  options: TherapeuticMigrationOptions,
): TherapeuticProblemValue {
  const problem = object(value);
  const problemLabel = `Проблема ${index + 1}`;
  const onsetId = migrateProblemOption(problem.onsetId, problemLabel, notes, options);
  const frequencyId = migrateProblemOption(problem.frequencyId, problemLabel, notes, options);
  const priorTherapyId = migrateProblemOption(problem.priorTherapyId, problemLabel, notes, options);
  const medicationUseId = migrateProblemOption(problem.medicationUseId, problemLabel, notes, options);
  const medicationDynamicsId = migrateProblemOption(problem.medicationDynamicsId, problemLabel, notes, options);
  const medicationIds = strings(problem.medicationIds).filter((id) => {
    if (optionIsKnown(id, options)) return true;
    notes.push(`${problemLabel}: ${options.optionLabel?.(id) ?? id}`);
    return false;
  });
  return {
    id: string(problem.id),
    ...(optionalString(problem.sourceWhatHappenedId) ? { sourceWhatHappenedId: String(problem.sourceWhatHappenedId) } : {}),
    title: string(problem.title),
    description: string(problem.description),
    ...(onsetId ? { onsetId } : {}),
    ...(frequencyId ? { frequencyId } : {}),
    ...(priorTherapyId ? { priorTherapyId } : {}),
    ...(medicationUseId ? { medicationUseId } : {}),
    medicationIds,
    ...(optionalString(problem.medicationName) ? { medicationName: String(problem.medicationName) } : {}),
    ...(medicationDynamicsId ? { medicationDynamicsId } : {}),
  };
}

function migrateSelections(
  value: unknown,
  section: string,
  notes: string[],
  options: TherapeuticMigrationOptions,
): string[] {
  const migrated = strings(value).flatMap((id) => {
    if (id === "exam.lymph.state.multifocal") {
      notes.push("ПЛУ: Увеличены мультифокально");
      return [];
    }
    if (id === "exam.locomotion.state.changed") return [];
    return [legacyFoamIds.get(id) ?? id];
  });
  return [...new Set(migrated.flatMap((id) => {
    if (optionIsKnown(id, options)) return [id];
    const label = options.optionLabel?.(id) ?? id;
    notes.push(`${section}: ${label}`);
    return [];
  }))];
}

function filterKnownSelections(
  selectedIds: string[],
  section: string,
  notes: string[],
  options: TherapeuticMigrationOptions,
): string[] {
  return selectedIds.flatMap((id) => {
    if (optionIsKnown(id, options)) return [id];
    notes.push(`${section}: ${options.optionLabel?.(id) ?? id}`);
    return [];
  });
}

function migrateCoatSelections(selectedIds: string[], notes: string[]): string[] {
  const distribution = selectedIds.find((id) => legacyCoatDistributionIds.has(id));
  const number = selectedIds.find((id) => legacyCoatNumberIds.has(id));
  if (!distribution && !number) return selectedIds;
  const next = selectedIds.filter((id) => !legacyCoatDistributionIds.has(id) && !legacyCoatNumberIds.has(id));
  const branches = [
    ...(selectedIds.includes("exam.coat.changes.hypotrichosis") ? ["hypotrichosis"] : []),
    ...(selectedIds.includes("exam.coat.changes.alopecia") ? ["alopecia"] : []),
  ];
  if (branches.length === 1) {
    const branch = branches[0]!;
    const distributionValue = distribution ? legacyCoatDistributionIds.get(distribution) : undefined;
    const numberValue = number ? legacyCoatNumberIds.get(number) : undefined;
    if (distributionValue) next.push(`exam.coat.${branch}.distribution.${distributionValue}`);
    if (numberValue) next.push(`exam.coat.${branch}.number.${numberValue}`);
  } else {
    const values = [distribution, number].filter((item): item is string => Boolean(item));
    notes.push(`Шерсть (ветвь не определена): ${values.join(", ")}`);
  }
  return [...new Set(next)];
}

function emptyTherapeuticAppointmentValue(): TherapeuticAppointmentSectionValue {
  return {
    schemaVersion: 2,
    diseaseAnamnesis: { text: "", problems: [], selectedIds: [] },
    lifeAnamnesis: {
      text: "",
      selectedIds: [],
      ectoparasiteName: "",
      dewormingName: "",
      naturalDietProducts: "",
      commercialFoodName: "",
      diseaseName: "",
      currentMedications: "",
      allergies: "",
    },
    examination: { text: "", selectedIds: [], coatComment: "", locomotionComment: "" },
    recommendations: "",
    prescriptions: "",
    migrationNotes: [],
  };
}

function hasMeaningfulPayload(value: unknown, key = ""): boolean {
  if (key === "schemaVersion") return false;
  if (typeof value === "string") return Boolean(value.trim());
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some((item) => hasMeaningfulPayload(item));
  return Object.entries(object(value)).some(([entryKey, entryValue]) => hasMeaningfulPayload(entryValue, entryKey));
}

function migrationFailureNote(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return `Ошибка миграции: исходные данные не распознаны${serialized ? ` (${serialized})` : ""}`;
  } catch {
    return "Ошибка миграции: исходные данные не распознаны";
  }
}

export function migrateTherapeuticAppointmentValue(
  value: unknown,
  options: TherapeuticMigrationOptions = {},
): TherapeuticAppointmentSectionValue {
  const source = object(value);
  const result = emptyTherapeuticAppointmentValue();
  if (typeof source.text === "string" && !source.diseaseAnamnesis) {
    result.diseaseAnamnesis.text = source.text;
    return result;
  }
  const disease = object(source.diseaseAnamnesis);
  const life = object(source.lifeAnamnesis);
  const examination = object(source.examination);
  const notes = strings(source.migrationNotes);
  result.diseaseAnamnesis = {
    text: string(disease.text),
    problems: Array.isArray(disease.problems)
      ? disease.problems.map((problem, index) => migrateProblem(problem, index, notes, options))
      : [],
    selectedIds: migrateSelections(disease.selectedIds, "Анамнез болезни", notes, options),
  };
  result.lifeAnamnesis = {
    text: string(life.text),
    selectedIds: migrateSelections(life.selectedIds, "Анамнез жизни", notes, options),
    ectoparasiteName: string(life.ectoparasiteName),
    dewormingName: string(life.dewormingName),
    naturalDietProducts: string(life.naturalDietProducts),
    commercialFoodName: string(life.commercialFoodName),
    diseaseName: string(life.diseaseName),
    currentMedications: string(life.currentMedications),
    allergies: string(life.allergies),
  };
  result.examination = {
    text: string(examination.text),
    selectedIds: filterKnownSelections(migrateCoatSelections(
      migrateSelections(examination.selectedIds, "Осмотр", notes, { isKnownOptionId: () => true }), notes,
    ), "Осмотр", notes, options),
    coatComment: string(examination.coatComment),
    locomotionComment: string(examination.locomotionComment),
  };
  result.recommendations = string(source.recommendations);
  result.prescriptions = string(source.prescriptions);
  if (hasMeaningfulPayload(value) && !hasMeaningfulPayload(result) && !notes.length) notes.push(migrationFailureNote(value));
  result.migrationNotes = [...new Set(notes)];
  return result;
}

function selectionsAreValid(value: unknown, sectionPrefix: "disease" | "life" | "exam"): value is string[] {
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string") || new Set(value).size !== value.length) return false;
  const counts = new Map<string, number>();
  for (const id of value) {
    const questionId = questionIdForOption(id);
    if (!id.startsWith(`${sectionPrefix}.`) || !isKnownTherapeuticV2OptionId(id)) return false;
    counts.set(questionId, (counts.get(questionId) ?? 0) + 1);
  }
  if ([...counts].some(([questionId, count]) => count > 1 && !multipleQuestionIds.has(questionId))) return false;
  if (value.some((id) => {
    const dependencies = questionDependencies[questionIdForOption(id)];
    return dependencies?.length && !dependencies.some((parentId) => value.includes(parentId));
  })) return false;
  if (value.some((id) => exclusiveMultipleOptionIds.has(id)
    && value.some((other) => other !== id && questionIdForOption(other) === questionIdForOption(id)))) return false;
  if (mutuallyExclusiveOptionGroups.some((group) => group.filter((id) => value.includes(id)).length > 1)) return false;
  if (value.includes("exam.locomotion.state.normal")
    && value.some((id) => id.startsWith("exam.locomotion.findings."))) return false;
  return true;
}

function optionalStringsAreValid(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => value[key] === undefined || typeof value[key] === "string");
}

function problemIsValid(problemValue: unknown): boolean {
  const problem = object(problemValue);
  if (typeof problem.id !== "string" || typeof problem.title !== "string" || typeof problem.description !== "string"
    || !Array.isArray(problem.medicationIds) || new Set(problem.medicationIds).size !== problem.medicationIds.length
    || problem.medicationIds.some((id) => typeof id !== "string" || questionIdForOption(id) !== "problem.medication.type")
    || !optionalStringsAreValid(problem, ["sourceWhatHappenedId", "onsetId", "frequencyId", "priorTherapyId",
      "medicationUseId", "medicationName", "medicationDynamicsId"])) return false;
  for (const [key, questionId] of [
    ["onsetId", "problem.onset"],
    ["frequencyId", "problem.frequency"],
    ["priorTherapyId", "problem.therapy"],
    ["medicationUseId", "problem.medication"],
    ["medicationDynamicsId", "problem.dynamics"],
  ] as const) {
    const id = problem[key];
    if (typeof id === "string" && questionIdForOption(id) !== questionId) return false;
  }
  const hasMedicationDetails = Boolean((problem.medicationIds as unknown[]).length
    || (typeof problem.medicationName === "string" && problem.medicationName.trim()) || problem.medicationDynamicsId);
  if (problem.priorTherapyId === "problem.therapy.none" && (problem.medicationUseId || hasMedicationDetails)) return false;
  if (!problem.priorTherapyId && (problem.medicationUseId || hasMedicationDetails)) return false;
  if (problem.medicationUseId === "problem.medication.none" && hasMedicationDetails) return false;
  if (!problem.medicationUseId && hasMedicationDetails) return false;
  return true;
}

function problemHasContentValue(problem: TherapeuticProblemValue): boolean {
  return Boolean(problem.title.trim() || problem.description.trim() || problem.sourceWhatHappenedId || problem.onsetId
    || problem.frequencyId || problem.priorTherapyId || problem.medicationUseId || problem.medicationIds.length
    || problem.medicationName?.trim() || problem.medicationDynamicsId);
}

function problemIdsAreValid(problems: readonly TherapeuticProblemValue[]): boolean {
  const populated = problems.filter(problemHasContentValue);
  return populated.every((problem) => Boolean(problem.id.trim()))
    && new Set(populated.map((problem) => problem.id)).size === populated.length;
}

function therapeuticValueHasContent(value: TherapeuticAppointmentSectionValue): boolean {
  const problemHasContent = value.diseaseAnamnesis.problems.some(problemHasContentValue);
  return Boolean(value.diseaseAnamnesis.text.trim() || problemHasContent || value.diseaseAnamnesis.selectedIds.length
    || value.lifeAnamnesis.text.trim() || value.lifeAnamnesis.selectedIds.length || value.lifeAnamnesis.ectoparasiteName.trim()
    || value.lifeAnamnesis.dewormingName.trim() || value.lifeAnamnesis.naturalDietProducts.trim()
    || value.lifeAnamnesis.commercialFoodName.trim() || value.lifeAnamnesis.diseaseName.trim()
    || value.lifeAnamnesis.currentMedications.trim() || value.lifeAnamnesis.allergies.trim()
    || value.examination.text.trim() || value.examination.selectedIds.length || value.examination.coatComment.trim()
    || value.examination.locomotionComment.trim() || value.recommendations.trim() || value.prescriptions.trim()
    || value.migrationNotes.length);
}

export function isTherapeuticAppointmentV2Value(value: unknown): value is TherapeuticAppointmentSectionValue {
  const source = object(value);
  const disease = object(source.diseaseAnamnesis);
  const life = object(source.lifeAnamnesis);
  const examination = object(source.examination);
  return source.schemaVersion === 2
    && typeof disease.text === "string" && Array.isArray(disease.problems)
    && selectionsAreValid(disease.selectedIds, "disease")
    && disease.problems.every(problemIsValid)
    && problemIdsAreValid(disease.problems as TherapeuticProblemValue[])
    && typeof life.text === "string" && selectionsAreValid(life.selectedIds, "life")
    && [life.ectoparasiteName, life.dewormingName, life.naturalDietProducts, life.commercialFoodName,
      life.diseaseName, life.currentMedications, life.allergies].every((item) => typeof item === "string")
    && typeof examination.text === "string" && selectionsAreValid(examination.selectedIds, "exam")
    && typeof examination.coatComment === "string" && typeof examination.locomotionComment === "string"
    && typeof source.recommendations === "string" && typeof source.prescriptions === "string"
    && Array.isArray(source.migrationNotes) && source.migrationNotes.every((item) => typeof item === "string")
    && therapeuticValueHasContent(source as unknown as TherapeuticAppointmentSectionValue);
}
