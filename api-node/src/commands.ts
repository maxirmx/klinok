// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { randomUUID } from "node:crypto";
import {
  PET_SEXES,
  MEDICAL_ENCOUNTER_SECTION_KINDS,
  isDiagnosisTaxonomyId,
  isOutcomeTaxonomyId,
  isWhatHappenedTaxonomyId,
  normalizeLaboratoryTestsValue,
  type ClientCommand,
  type CommandResult,
  type DiagnosisChoice,
  type DiagnosisSectionValue,
  type DiagnosisTaxonomyId,
  type MedicalEncounterInput,
  type MedicalRecordConfirmation,
  type MedicalRecordDraft,
  type PetGrantAction,
  type PetProfileInput,
  type Role,
} from "@klinok/contracts";
import type { PoolClient } from "pg";
import type { Database } from "./db.js";
import { ApiError, optionalText, requireText } from "./errors.js";
import { type AuditInput, Ledger } from "./ledger.js";
import { confirmationFromRow, displayName, grantFromRow, iso, petFromRow, recordFromRow, roleFromRow } from "./rows.js";

interface Actor { accountId: string }
interface Applied { value?: unknown; revision?: number; audit: Omit<AuditInput, "operationId" | "actorAccountId" | "activeRole"> }

const GRANT_ACTIONS = new Set<PetGrantAction>(["read", "write_unconfirmed", "delegate"]);
const MAX_DIAGNOSIS_TEXT_LENGTH = 10_000;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "VALIDATION_FAILED", "Expected an object.");
  return value as Record<string, unknown>;
}

function diagnosisChoice(value: unknown, required: boolean): DiagnosisChoice {
  const input = object(value);
  const selectedId = input.selectedId === undefined ? undefined : requireText(input.selectedId, "selectedId", 200);
  const customText = typeof input.customText === "string" ? input.customText.trim() : "";
  if (typeof input.customText !== "string" || customText.length > MAX_DIAGNOSIS_TEXT_LENGTH) {
    throw new ApiError(400, "VALIDATION_FAILED", "The diagnosis text is invalid.");
  }
  if (selectedId && !isDiagnosisTaxonomyId(selectedId)) {
    throw new ApiError(400, "VALIDATION_FAILED", "The diagnosis identifier is unknown.");
  }
  if (selectedId && customText) {
    throw new ApiError(400, "VALIDATION_FAILED", "A diagnosis must use either a catalog value or free text.");
  }
  if (required && !selectedId && !customText) {
    throw new ApiError(400, "VALIDATION_FAILED", "The confirmed diagnosis is required.");
  }
  return { ...(selectedId ? { selectedId: selectedId as DiagnosisTaxonomyId } : {}), customText };
}

function diagnosisSection(value: unknown): DiagnosisSectionValue {
  const input = object(value);
  const preliminary = diagnosisChoice(input.preliminary, false);
  const differentialInput = object(input.differential);
  if (!Array.isArray(differentialInput.selectedIds)) {
    throw new ApiError(400, "VALIDATION_FAILED", "The differential diagnoses are invalid.");
  }
  const selectedIds = differentialInput.selectedIds;
  const hasCustomTexts = "customTexts" in differentialInput;
  const hasLegacyCustomText = "customText" in differentialInput;
  if (hasCustomTexts === hasLegacyCustomText
    || (hasCustomTexts && !Array.isArray(differentialInput.customTexts))
    || (hasLegacyCustomText && typeof differentialInput.customText !== "string")) {
    throw new ApiError(400, "VALIDATION_FAILED", "The differential diagnoses are invalid.");
  }
  const customTexts = hasCustomTexts
    ? (differentialInput.customTexts as unknown[]).map((text) => typeof text === "string" ? text.trim() : text)
    : [(differentialInput.customText as string).trim()].filter(Boolean);
  if (selectedIds.some((id) => typeof id !== "string" || !isDiagnosisTaxonomyId(id))
    || new Set(selectedIds).size !== selectedIds.length
    || customTexts.some((text) => typeof text !== "string" || !text || text.length > MAX_DIAGNOSIS_TEXT_LENGTH)
    || new Set(customTexts).size !== customTexts.length) {
    throw new ApiError(400, "VALIDATION_FAILED", "The differential diagnoses are invalid.");
  }
  if (hasLegacyCustomText && selectedIds.length && customTexts.length) {
    throw new ApiError(400, "VALIDATION_FAILED", "Differential diagnoses must use either catalog values or free text.");
  }
  return {
    preliminary,
    differential: { selectedIds: selectedIds as DiagnosisTaxonomyId[], customTexts: customTexts as string[] },
    confirmed: diagnosisChoice(input.confirmed, true),
  };
}

function isNewerVaccination(candidate: { date: string; recordId?: string }, current: unknown): boolean {
  if (!current || typeof current !== "object" || Array.isArray(current)) return true;
  const currentValue = current as Record<string, unknown>;
  const currentDate = typeof currentValue.date === "string" ? currentValue.date : "";
  if (!currentDate || candidate.date !== currentDate) return candidate.date > currentDate;
  if (!candidate.recordId) return false;
  const currentRecordId = typeof currentValue.recordId === "string" ? currentValue.recordId : "";
  return candidate.recordId > currentRecordId;
}

function expected(command: ClientCommand, current: number): void {
  if (command.expectedRevision !== current) {
    throw new ApiError(409, "REVISION_CONFLICT", "The authoritative record changed before this operation was applied.");
  }
}

function actions(value: unknown, fallback: PetGrantAction[] = ["read", "write_unconfirmed"]): PetGrantAction[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value)) throw new ApiError(400, "VALIDATION_FAILED", "Grant actions must be an array.");
  const result = [...new Set(value.filter((candidate): candidate is PetGrantAction => typeof candidate === "string" && GRANT_ACTIONS.has(candidate as PetGrantAction)))];
  if (!result.includes("read")) result.unshift("read");
  if (result.length !== new Set(value).size) throw new ApiError(400, "VALIDATION_FAILED", "Grant actions are invalid.");
  return result;
}

function petInput(value: unknown): PetProfileInput {
  const input = object(value);
  const sex = requireText(input.sex, "sex", 80);
  if (!(PET_SEXES as readonly string[]).includes(sex)) throw new ApiError(400, "VALIDATION_FAILED", "Pet sex is invalid.");
  const weightKg = Number(input.weightKg);
  if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 500) throw new ApiError(400, "VALIDATION_FAILED", "Pet weight is invalid.");
  const birthDate = optionalText(input.birthDate, 10);
  const birthYear = input.birthYear === undefined ? undefined : Number(input.birthYear);
  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw new ApiError(400, "VALIDATION_FAILED", "Pet birth date is invalid.");
  if (birthYear !== undefined && (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > new Date().getFullYear())) {
    throw new ApiError(400, "VALIDATION_FAILED", "Pet birth year is invalid.");
  }
  return {
    name: requireText(input.name, "name", 120),
    species: requireText(input.species, "species", 80),
    breed: requireText(input.breed, "breed", 160),
    sex: sex as PetProfileInput["sex"],
    ...(optionalText(input.photoDataUrl, 1_500_000) ? { photoDataUrl: String(input.photoDataUrl) } : {}),
    ...(birthDate ? { birthDate } : {}),
    ...(birthYear !== undefined ? { birthYear } : {}),
    ...(optionalText(input.color, 160) ? { color: String(input.color).trim() } : {}),
    ...(optionalText(input.chip, 160) ? { chip: String(input.chip).trim() } : {}),
    ...(optionalText(input.brandMark, 160) ? { brandMark: String(input.brandMark).trim() } : {}),
    ...(input.latestVaccination && typeof input.latestVaccination === "object"
      ? { latestVaccination: input.latestVaccination as PetProfileInput["latestVaccination"] } : {}),
    weightKg,
    ...(optionalText(input.notes, 5_000) ? { notes: String(input.notes).trim() } : {}),
  };
}

export function validateMedicalEncounter(value: unknown): MedicalEncounterInput {
  const input = object(value);
  const encounterDate = requireText(input.encounterDate, "encounterDate", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(encounterDate) || encounterDate > new Date().toISOString().slice(0, 10)) {
    throw new ApiError(400, "VALIDATION_FAILED", "Encounter date is invalid.");
  }
  const sections = object(input.sections);
  const sectionKinds = new Set<string>(MEDICAL_ENCOUNTER_SECTION_KINDS);
  if (Object.keys(sections).some((kind) => !sectionKinds.has(kind)) || JSON.stringify(sections).length > 500_000) {
    throw new ApiError(400, "VALIDATION_FAILED", "Medical sections are invalid or too large.");
  }
  const what = object(sections["what-happened"]);
  const selectedIds = Array.isArray(what.selectedIds) ? what.selectedIds.filter((item): item is string => typeof item === "string") : [];
  const comment = typeof what.comment === "string" ? what.comment.trim() : "";
  if (selectedIds.length !== (Array.isArray(what.selectedIds) ? what.selectedIds.length : 0)
    || new Set(selectedIds).size !== selectedIds.length || selectedIds.some((id) => !isWhatHappenedTaxonomyId(id)) || comment.length > 10_000) {
    throw new ApiError(400, "VALIDATION_FAILED", "The what-happened section is invalid.");
  }
  if (!selectedIds.length && !comment) throw new ApiError(400, "VALIDATION_FAILED", "The what-happened section is empty.");
  const outcome = object(sections.outcome);
  if (!Array.isArray(outcome.selectedIds) || !outcome.selectedIds.length
    || !outcome.selectedIds.every((item) => typeof item === "string" && isOutcomeTaxonomyId(item))
    || new Set(outcome.selectedIds).size !== outcome.selectedIds.length
    || typeof outcome.comment !== "string" || outcome.comment.length > 10_000) {
    throw new ApiError(400, "VALIDATION_FAILED", "The outcome section is invalid.");
  }
  const outcomeIds = outcome.selectedIds as string[];
  if ((outcomeIds.includes("outcome.death") && outcomeIds.length > 1)
    || (outcomeIds.includes("outcome.no-observation") && (outcomeIds.includes("outcome.observation") || outcomeIds.includes("outcome.examination")))
    || (outcomeIds.includes("outcome.deterioration") && (outcomeIds.includes("outcome.improvement") || outcomeIds.includes("outcome.recovery")))) {
    throw new ApiError(400, "VALIDATION_FAILED", "The outcome section contains incompatible options.");
  }
  const diagnosis = sections.diagnosis === undefined ? undefined : diagnosisSection(sections.diagnosis);
  for (const [kind, sectionValue] of Object.entries(sections)) {
    if (kind === "what-happened" || kind === "outcome" || kind === "diagnosis") continue;
    const structured = object(sectionValue);
    if (["recommendations", "instrumental-tests", "procedures"].includes(kind)
      && (typeof structured.text !== "string" || !structured.text.trim() || structured.text.length > 50_000)) {
      throw new ApiError(400, "VALIDATION_FAILED", `The ${kind} section is invalid.`);
    }
  }
  const currentSections = Object.fromEntries(Object.entries(sections).filter(([kind, value]) =>
    kind !== "laboratory-tests" || !("text" in object(value))));
  return {
    petId: requireText(input.petId, "petId", 100),
    encounterDate,
    sections: {
      ...currentSections,
      ...(sections["laboratory-tests"] && !("text" in object(sections["laboratory-tests"]))
        ? { "laboratory-tests": laboratorySection(sections["laboratory-tests"]) } : {}),
      ...(diagnosis ? { diagnosis } : {}),
    } as unknown as MedicalEncounterInput["sections"],
    ...(input.recordId ? { recordId: requireText(input.recordId, "recordId", 100) } : {}),
  };
}

function medicalSections(input: MedicalEncounterInput, accountId: string, authorName: string, now: string): MedicalRecordDraft["sections"] {
  return Object.fromEntries(Object.entries(input.sections).map(([kind, value]) => [kind, {
    kind,
    templateVersion: kind === "what-happened" ? "what-happened-v1"
      : kind === "outcome" ? "outcome-v1"
        : kind === "diagnosis" ? "diagnosis-v2"
        : kind === "general-data" && !(value && typeof value === "object" && "text" in value) ? "general-data-v1"
          : kind === "vaccination" && !(value && typeof value === "object" && "text" in value) ? "vaccination-v1"
            : kind === "therapeutic-appointment" && !(value && typeof value === "object" && "text" in value) ? "therapeutic-appointment-v1"
              : kind === "laboratory-tests" && !(value && typeof value === "object" && "text" in value) ? "laboratory-tests-v1"
              : "free-text-v0",
    value,
    authorAccountId: accountId,
    authorDisplayName: authorName,
    updatedAt: now,
  }])) as MedicalRecordDraft["sections"];
}

function laboratorySection(value: unknown) {
  try { return normalizeLaboratoryTestsValue(value); }
  catch (reason) { throw new ApiError(400, "VALIDATION_FAILED", reason instanceof Error ? reason.message : "The laboratory section is invalid."); }
}

function medicalRecordAuditState(
  record: MedicalRecordDraft,
  status: "unconfirmed" | "confirmed" | "deleted",
  details: { confirmation?: MedicalRecordConfirmation; deletedAt?: string } = {},
): Record<string, unknown> {
  return {
    record,
    status,
    ...(details.confirmation ? { confirmation: details.confirmation } : {}),
    ...(details.deletedAt ? { deletedAt: details.deletedAt } : {}),
  };
}

async function approved(client: PoolClient, accountId: string, role: Role): Promise<boolean> {
  const result = await client.query("SELECT 1 FROM roles WHERE account_id = $1 AND role = $2 AND status = 'approved'", [accountId, role]);
  return Boolean(result.rowCount);
}

async function requireRole(client: PoolClient, actor: Actor, role: Role): Promise<void> {
  if (!(await approved(client, actor.accountId, role))) throw new ApiError(403, "ROLE_REQUIRED", "The active role is not approved.");
}

async function requireActiveRole(client: PoolClient, actor: Actor, command: ClientCommand, allowed: Role[]): Promise<void> {
  if (!allowed.includes(command.activeRole)) throw new ApiError(403, "ACTIVE_ROLE_MISMATCH", "This operation is unavailable for the active role.");
  await requireRole(client, actor, command.activeRole);
}

async function actorProfile(client: PoolClient, accountId: string): Promise<Record<string, unknown>> {
  const result = await client.query("SELECT * FROM profiles WHERE account_id = $1", [accountId]);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new ApiError(404, "PROFILE_NOT_FOUND", "Profile not found.");
  return row;
}

async function petRow(client: PoolClient, petId: string, lock = false): Promise<Record<string, unknown>> {
  const result = await client.query(`SELECT * FROM pets WHERE pet_id = $1${lock ? " FOR UPDATE" : ""}`, [petId]);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row || row.deleted_at) throw new ApiError(404, "PET_NOT_FOUND", "Pet not found.");
  return row;
}

async function activeGrant(client: PoolClient, petId: string, accountId: string): Promise<Record<string, unknown> | null> {
  const result = await client.query(
    "SELECT * FROM access_grants WHERE pet_id = $1 AND grantee_account_id = $2 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
    [petId, accountId],
  );
  return result.rows[0] as Record<string, unknown> | undefined ?? null;
}

async function requirePetWrite(client: PoolClient, actor: Actor, petId: string): Promise<Record<string, unknown>> {
  await requireRole(client, actor, "doctor");
  const grant = await activeGrant(client, petId, actor.accountId);
  if (!grant || !(grant.actions as string[]).includes("write_unconfirmed")) {
    throw new ApiError(403, "PET_GRANT_REQUIRED", "An active write grant is required.");
  }
  return grant;
}

async function enqueueEmail(client: PoolClient, recipient: string, subject: string, text: string): Promise<void> {
  await client.query(
    "INSERT INTO email_outbox(email_id, recipient, subject, text_body) VALUES ($1,$2,$3,$4)",
    [randomUUID(), recipient, subject, text],
  );
}

async function accountEmail(client: PoolClient, accountId: string): Promise<string | null> {
  const result = await client.query(
    "SELECT email FROM accounts WHERE account_id=$1 AND credential_status IN ('active','deleted') FOR SHARE",
    [accountId],
  );
  const email = result.rows[0]?.email;
  return typeof email === "string" && email ? email : null;
}

async function enqueueAccountEmail(client: PoolClient, accountId: string, subject: string, text: string): Promise<void> {
  const recipient = await accountEmail(client, accountId);
  if (recipient) await enqueueEmail(client, recipient, subject, text);
}

async function enqueueAdministratorRoleRequestEmails(
  client: PoolClient,
  requester: string,
  requesterAccountId: string,
  roleLabel: string,
): Promise<void> {
  const administrators = await client.query<{ email: string }>(
    `SELECT DISTINCT a.email
       FROM roles r JOIN accounts a USING(account_id)
       WHERE r.role='administrator' AND r.status='approved' AND a.credential_status='active'
       ORDER BY a.email`,
  );
  for (const administrator of administrators.rows) {
    await enqueueEmail(
      client,
      administrator.email,
      "Запрос роли в системе \"Клинок\"",
      `Пользователь ${requester} (${requesterAccountId}) запросил роль «${roleLabel}».`,
    );
  }
}

async function activePetGrantRecipientEmails(client: PoolClient, petId: string): Promise<string[]> {
  const result = await client.query<{ email: string }>(
    `SELECT DISTINCT a.email
       FROM access_grants g JOIN accounts a ON a.account_id=g.grantee_account_id
       WHERE g.pet_id=$1 AND g.status='active' AND a.credential_status IN ('active','deleted')
       ORDER BY a.email`,
    [petId],
  );
  return result.rows.map(({ email }) => email);
}

async function pendingPetAccessRequesterEmails(client: PoolClient, petId: string): Promise<string[]> {
  const result = await client.query<{ email: string }>(
    `SELECT DISTINCT a.email
       FROM access_requests r JOIN accounts a ON a.account_id=r.requester_account_id
       WHERE r.pet_id=$1 AND r.status='pending' AND a.credential_status IN ('active','deleted')
       ORDER BY a.email`,
    [petId],
  );
  return result.rows.map(({ email }) => email);
}

async function activeGrantBranchRecipientEmails(client: PoolClient, grantId: string): Promise<string[]> {
  const result = await client.query<{ email: string }>(
    `WITH RECURSIVE branch AS (
       SELECT grant_id FROM access_grants WHERE grant_id=$1
       UNION ALL SELECT child.grant_id FROM access_grants child JOIN branch parent ON child.parent_grant_id=parent.grant_id
     ) SELECT DISTINCT a.email
       FROM branch JOIN access_grants g USING(grant_id) JOIN accounts a ON a.account_id=g.grantee_account_id
       WHERE g.status='active' AND a.credential_status IN ('active','deleted') ORDER BY a.email`,
    [grantId],
  );
  return result.rows.map(({ email }) => email);
}

async function invalidGrantBranchRecipientEmails(client: PoolClient, grantId: string, nextActions: PetGrantAction[]): Promise<string[]> {
  const result = await client.query<{ email: string }>(
    `WITH RECURSIVE invalid_branch AS (
       SELECT child.grant_id FROM access_grants child
       WHERE child.parent_grant_id=$1 AND child.status='active'
         AND (NOT ('delegate'=ANY($2::text[])) OR NOT ($2::text[] @> child.actions))
       UNION ALL
       SELECT child.grant_id FROM access_grants child JOIN invalid_branch parent ON child.parent_grant_id=parent.grant_id
       WHERE child.status='active'
     ) SELECT DISTINCT a.email
       FROM invalid_branch JOIN access_grants g USING(grant_id) JOIN accounts a ON a.account_id=g.grantee_account_id
       WHERE a.credential_status IN ('active','deleted') ORDER BY a.email`,
    [grantId, nextActions],
  );
  return result.rows.map(({ email }) => email);
}

async function enqueueAccessStatusEmails(client: PoolClient, recipients: string[], petName: string, status: string): Promise<void> {
  for (const recipient of recipients) {
    await enqueueEmail(client, recipient, "Статус доступа к питомцу в системе \"Клинок\" изменён", `Доступ к питомцу «${petName}» ${status}.`);
  }
}

async function enqueueAccountAccessStatusEmail(
  client: PoolClient,
  accountId: string,
  petName: string,
  status: string,
): Promise<void> {
  const recipient = await accountEmail(client, accountId);
  await enqueueAccessStatusEmails(client, recipient ? [recipient] : [], petName, status);
}

async function handleRole(client: PoolClient, actor: Actor, command: ClientCommand): Promise<Applied> {
  const payload = object(command.payload);
  const role = requireText(payload.role, "role", 30) as Role;
  if (!(["administrator", "doctor", "owner"] as string[]).includes(role)) throw new ApiError(400, "VALIDATION_FAILED", "Role is invalid.");
  if (command.type === "role.decide") {
    await requireActiveRole(client, actor, command, ["administrator"]);
    const targetId = requireText(payload.accountId ?? command.entityId, "accountId", 100);
    const status = requireText(payload.status, "status", 30) as "approved" | "rejected" | "revoked";
    if (!(["approved", "rejected", "revoked"] as string[]).includes(status)) throw new ApiError(400, "VALIDATION_FAILED", "Role decision is invalid.");
    const found = await client.query("SELECT r.*, a.immutable_bootstrap FROM roles r JOIN accounts a USING(account_id) WHERE r.account_id = $1 AND r.role = $2 FOR UPDATE", [targetId, role]);
    const before = found.rows[0] as Record<string, unknown> | undefined;
    if (!before) throw new ApiError(404, "ROLE_REQUEST_NOT_FOUND", "Role request not found.");
    if (before.request_id !== command.entityId) throw new ApiError(409, "REVISION_CONFLICT", "The role request identifier changed.");
    if (before.immutable_bootstrap && role === "administrator") throw new ApiError(409, "BOOTSTRAP_ROLE_IMMUTABLE", "The bootstrap Administrator role is immutable.");
    expected(command, Number(before.revision));
    const restoring = status === "approved" && ["rejected", "revoked"].includes(String(before.status));
    const updated = await client.query(
      `UPDATE roles SET status = $3, revision = revision + 1, decided_at = now(), decided_by = $4, reason = $5
       WHERE account_id = $1 AND role = $2 RETURNING *`,
      [targetId, role, status, actor.accountId, optionalText(payload.reason, 1_000) ?? null],
    );
    const roleLabel = role === "doctor" ? "Ветеринар" : role === "administrator" ? "Администратор" : "Владелец";
    const statusLabel = status === "approved" ? "одобрена" : status === "rejected" ? "отклонена" : "отозвана";
    await enqueueAccountEmail(client, targetId, "Статус роли в системе \"Клинок\" изменён", `Роль «${roleLabel}» ${statusLabel}.`);
    const value = roleFromRow(updated.rows[0]);
    return { value, revision: value.revision, audit: {
      action: restoring ? "role.restored" : `role.${status}`,
      aggregateType: "role", aggregateId: value.requestId, relatedAccountId: targetId,
      metadata: { role, status, reason: value.reason ?? "" }, beforeState: roleFromRow(before), afterState: value,
    } };
  }

  if (command.entityId !== actor.accountId) throw new ApiError(403, "ACCOUNT_SCOPE_FORBIDDEN", "Only the current account may change its role request.");
  const existing = await client.query("SELECT * FROM roles WHERE account_id = $1 AND role = $2 FOR UPDATE", [actor.accountId, role]);
  const before = existing.rows[0] as Record<string, unknown> | undefined;
  if (command.type === "role.cancel") {
    if (!before || before.status !== "pending") throw new ApiError(409, "ROLE_NOT_PENDING", "Only a pending request can be cancelled.");
    expected(command, Number(before.revision));
    const updated = await client.query(
      "UPDATE roles SET status = 'not_requested', revision = revision + 1, decided_at = now(), decided_by = $1 WHERE account_id = $1 AND role = $2 RETURNING *",
      [actor.accountId, role],
    );
    const value = roleFromRow(updated.rows[0]);
    return { value, revision: value.revision, audit: {
      action: "role.cancelled", aggregateType: "role", aggregateId: value.requestId, relatedAccountId: actor.accountId,
      metadata: { role }, beforeState: roleFromRow(before), afterState: value,
    } };
  }

  const profile = await actorProfile(client, actor.accountId);
  if (before?.status === "approved" || before?.status === "pending") throw new ApiError(409, "ROLE_ALREADY_ACTIVE", "The role is already approved or pending.");
  if (before) expected(command, Number(before.revision));
  const autoApproved = role === "owner" || (role === "doctor" && await approved(client, actor.accountId, "administrator"));
  const requestId = before ? String(before.request_id) : randomUUID();
  const result = before
    ? await client.query(
      `UPDATE roles SET status = $3, revision = revision + 1, profile_revision = $4, requested_at = now(),
       decided_at = $5, decided_by = $6, reason = NULL WHERE account_id = $1 AND role = $2 RETURNING *`,
      [actor.accountId, role, autoApproved ? "approved" : "pending", Number(profile.revision), autoApproved ? new Date() : null, autoApproved ? actor.accountId : null],
    )
    : await client.query(
      `INSERT INTO roles(account_id, role, request_id, status, revision, profile_revision, requested_at, decided_at, decided_by)
       VALUES ($1,$2,$3,$4,1,$5,now(),$6,$7) RETURNING *`,
      [actor.accountId, role, requestId, autoApproved ? "approved" : "pending", Number(profile.revision), autoApproved ? new Date() : null, autoApproved ? actor.accountId : null],
    );
  const value = roleFromRow(result.rows[0]);
  if (role === "administrator" || role === "doctor") {
    const roleLabel = role === "doctor" ? "Ветеринар" : "Администратор";
    if (autoApproved) {
      await enqueueAccountEmail(client, actor.accountId, "Статус роли в системе \"Клинок\" изменён", `Роль «${roleLabel}» одобрена.`);
    } else {
      await enqueueAdministratorRoleRequestEmails(client, displayName(profile) || actor.accountId, actor.accountId, roleLabel);
    }
  }
  return { value, revision: value.revision, audit: {
    action: before ? "role.resubmitted" : "role.requested", aggregateType: "role", aggregateId: value.requestId,
    relatedAccountId: actor.accountId, metadata: { role, status: value.status }, beforeState: before ? roleFromRow(before) : undefined, afterState: value,
  } };
}

async function handlePet(client: PoolClient, actor: Actor, command: ClientCommand): Promise<Applied> {
  await requireActiveRole(client, actor, command, ["owner"]);
  if (command.type === "pet.create") {
    const input = petInput(command.payload);
    const now = new Date().toISOString();
    const result = await client.query(
      `INSERT INTO pets(pet_id, owner_account_id, revision, name, species, breed, sex, photo_data_url, birth_date,
        birth_year, color, chip, brand_mark, latest_vaccination, weight_kg, notes, created_at, updated_at)
       VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$16) RETURNING *`,
      [command.entityId, actor.accountId, input.name, input.species, input.breed, input.sex, input.photoDataUrl ?? null,
        input.birthDate ?? null, input.birthYear ?? null, input.color ?? null, input.chip ?? null, input.brandMark ?? null,
        JSON.stringify(input.latestVaccination ?? null), input.weightKg, input.notes ?? null, now],
    );
    const value = petFromRow(result.rows[0]);
    return { value, revision: 1, audit: {
      action: "pet.created", aggregateType: "pet", aggregateId: value.petId,
      metadata: { ownerAccountId: actor.accountId }, afterState: value,
    } };
  }

  const before = await petRow(client, command.entityId, true);
  if (before.owner_account_id !== actor.accountId) throw new ApiError(403, "OWNER_SCOPE_FORBIDDEN", "Only the pet Owner may perform this operation.");
  expected(command, Number(before.revision));
  if (command.type === "pet.delete") {
    const now = new Date();
    const rejectedRecipients = await pendingPetAccessRequesterEmails(client, command.entityId);
    const revokedRecipients = await activePetGrantRecipientEmails(client, command.entityId);
    await client.query("UPDATE pets SET revision = revision + 1, deleted_at = $2, updated_at = $2 WHERE pet_id = $1", [command.entityId, now]);
    await client.query("UPDATE access_requests SET status = 'rejected', revision = revision + 1, decided_at = $2, decided_by = $3 WHERE pet_id = $1 AND status = 'pending'", [command.entityId, now, actor.accountId]);
    await client.query("UPDATE access_grants SET status = 'revoked', revision = revision + 1, revoked_at = $2 WHERE pet_id = $1 AND status = 'active'", [command.entityId, now]);
    await enqueueAccessStatusEmails(client, rejectedRecipients, String(before.name), "отклонён");
    await enqueueAccessStatusEmails(client, revokedRecipients, String(before.name), "отозван");
    const value = { ...petFromRow(before), revision: Number(before.revision) + 1, tombstoned: true, updatedAt: now.toISOString() };
    return { value, revision: value.revision, audit: {
      action: "pet.deleted", aggregateType: "pet", aggregateId: command.entityId,
      metadata: { ownerAccountId: actor.accountId }, beforeState: petFromRow(before), afterState: value,
    } };
  }

  const payload = object(command.payload);
  const input = petInput(payload.input ?? payload);
  const result = await client.query(
    `UPDATE pets SET revision = revision + 1, name=$2, species=$3, breed=$4, sex=$5, photo_data_url=$6,
      birth_date=$7, birth_year=$8, color=$9, chip=$10, brand_mark=$11, latest_vaccination=$12::jsonb,
      weight_kg=$13, notes=$14, updated_at=now() WHERE pet_id=$1 RETURNING *`,
    [command.entityId, input.name, input.species, input.breed, input.sex, input.photoDataUrl ?? null,
      input.birthDate ?? null, input.birthYear ?? null, input.color ?? null, input.chip ?? null, input.brandMark ?? null,
      JSON.stringify(input.latestVaccination ?? null), input.weightKg, input.notes ?? null],
  );
  const value = petFromRow(result.rows[0]);
  return { value, revision: value.revision, audit: {
    action: "pet.updated", aggregateType: "pet", aggregateId: command.entityId,
    metadata: { ownerAccountId: actor.accountId }, beforeState: petFromRow(before), afterState: value,
  } };
}

async function cascadeGrantRevocation(client: PoolClient, grantId: string, status: "revoked" | "relinquished"): Promise<void> {
  await client.query(
    `WITH RECURSIVE branch AS (
       SELECT grant_id FROM access_grants WHERE grant_id = $1
       UNION ALL SELECT child.grant_id FROM access_grants child JOIN branch parent ON child.parent_grant_id = parent.grant_id
     ) UPDATE access_grants SET status = CASE WHEN grant_id = $1 THEN $2 ELSE 'revoked' END,
       revision = revision + 1, revoked_at = now() WHERE grant_id IN (SELECT grant_id FROM branch) AND status = 'active'`,
    [grantId, status],
  );
}

async function handleAccess(client: PoolClient, actor: Actor, command: ClientCommand): Promise<Applied> {
  const payload = object(command.payload);
  if (command.type === "access.request") {
    await requireActiveRole(client, actor, command, ["doctor"]);
    const pet = await petRow(client, command.entityId, true);
    if (payload.expectedOwnerAccountId !== undefined && payload.expectedOwnerAccountId !== pet.owner_account_id) {
      throw new ApiError(409, "REVISION_CONFLICT", "The pet owner changed before this request was applied.");
    }
    if (await activeGrant(client, command.entityId, actor.accountId)) throw new ApiError(409, "ACCESS_ALREADY_GRANTED", "Access is already granted.");
    const pending = await client.query("SELECT 1 FROM access_requests WHERE pet_id=$1 AND requester_account_id=$2 AND status='pending'", [command.entityId, actor.accountId]);
    if (pending.rowCount) throw new ApiError(409, "ACCESS_ALREADY_REQUESTED", "An access request is already pending.");
    const profile = await actorProfile(client, actor.accountId);
    const requestId = command.operationId === command.entityId ? randomUUID() : requireText(payload.requestId ?? randomUUID(), "requestId", 100);
    const selfApproval = pet.owner_account_id === actor.accountId && await approved(client, actor.accountId, "owner");
    const result = await client.query(
      `INSERT INTO access_requests(request_id, pet_id, owner_account_id, requester_account_id, requester_display_name,
       status, revision, requested_at, decided_at, decided_by) VALUES ($1,$2,$3,$4,$5,$6,1,now(),$7,$8) RETURNING *`,
      [requestId, command.entityId, pet.owner_account_id, actor.accountId, displayName(profile), selfApproval ? "approved" : "pending",
        selfApproval ? new Date() : null, selfApproval ? actor.accountId : null],
    );
    let grantId: string | undefined;
    if (selfApproval) {
      grantId = randomUUID();
      await client.query(
        `INSERT INTO access_grants(grant_id, pet_id, grantor_account_id, grantee_account_id, grantee_display_name,
         actions, request_id, revision, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,1,'active',now())`,
        [grantId, command.entityId, actor.accountId, actor.accountId, displayName(profile), ["read", "write_unconfirmed"], requestId],
      );
      await enqueueAccountAccessStatusEmail(client, actor.accountId, String(pet.name), "предоставлен");
    } else {
      await enqueueAccountEmail(
        client,
        String(pet.owner_account_id),
        "Запрос доступа к питомцу в системе \"Клинок\"",
        `Ветеринар ${displayName(profile) || actor.accountId} запросил доступ к питомцу «${String(pet.name)}».`,
      );
    }
    return { value: { requestId, ...(grantId ? { grantId } : {}) }, revision: 1, audit: {
      action: selfApproval ? "access.request.auto-approved" : "access.requested", aggregateType: "accessRequest", aggregateId: requestId,
      relatedAccountId: String(pet.owner_account_id), metadata: { petId: command.entityId }, afterState: result.rows[0],
    } };
  }

  if (["access.cancel", "access.reject"].includes(command.type)) {
    const found = await client.query("SELECT * FROM access_requests WHERE request_id=$1 FOR UPDATE", [command.entityId]);
    const before = found.rows[0] as Record<string, unknown> | undefined;
    if (!before || before.status !== "pending") throw new ApiError(409, "ACCESS_REQUEST_NOT_PENDING", "The access request is no longer pending.");
    expected(command, Number(before.revision));
    const cancelling = command.type === "access.cancel";
    if (cancelling && before.requester_account_id !== actor.accountId) throw new ApiError(403, "REQUESTER_REQUIRED", "Only the requester may cancel this request.");
    if (!cancelling && before.owner_account_id !== actor.accountId) throw new ApiError(403, "OWNER_SCOPE_FORBIDDEN", "Only the Owner may reject this request.");
    await requireActiveRole(client, actor, command, [cancelling ? "doctor" : "owner"]);
    const status = cancelling ? "cancelled" : "rejected";
    const updated = await client.query("UPDATE access_requests SET status=$2, revision=revision+1, decided_at=now(), decided_by=$3 WHERE request_id=$1 RETURNING *", [command.entityId, status, actor.accountId]);
    if (!cancelling) {
      const pet = await petRow(client, String(before.pet_id));
      await enqueueAccountAccessStatusEmail(client, String(before.requester_account_id), String(pet.name), "отклонён");
    }
    return { value: updated.rows[0], revision: Number(updated.rows[0].revision), audit: {
      action: `access.${status}`, aggregateType: "accessRequest", aggregateId: command.entityId,
      relatedAccountId: String(before.owner_account_id), metadata: { petId: before.pet_id }, beforeState: before, afterState: updated.rows[0],
    } };
  }

  if (["access.grant", "access.delegate"].includes(command.type)) {
    const petId = requireText(payload.petId, "petId", 100);
    const pet = await petRow(client, petId, true);
    const doctorAccountId = requireText(payload.doctorAccountId, "doctorAccountId", 100);
    if (!(await approved(client, doctorAccountId, "doctor"))) throw new ApiError(409, "DOCTOR_ROLE_REQUIRED", "The selected Doctor is no longer approved.");
    if (await activeGrant(client, petId, doctorAccountId)) throw new ApiError(409, "ACCESS_ALREADY_GRANTED", "The selected Doctor already has access.");
    const requestedActions = actions(payload.actions);
    let parentGrantId: string | null = null;
    let approvedRequest: Record<string, unknown> | undefined;
    if (command.type === "access.grant") {
      await requireActiveRole(client, actor, command, ["owner"]);
      if (pet.owner_account_id !== actor.accountId) throw new ApiError(403, "OWNER_SCOPE_FORBIDDEN", "Only the Owner may grant access.");
      if (payload.requestId) {
        const requestId = requireText(payload.requestId, "requestId", 100);
        const request = await client.query("SELECT * FROM access_requests WHERE request_id=$1 FOR UPDATE", [requestId]);
        approvedRequest = request.rows[0] as Record<string, unknown> | undefined;
        if (!approvedRequest || approvedRequest.status !== "pending" || approvedRequest.pet_id !== petId
          || approvedRequest.owner_account_id !== actor.accountId || approvedRequest.requester_account_id !== doctorAccountId) {
          throw new ApiError(409, "ACCESS_REQUEST_STALE", "The selected access request changed.");
        }
        const expectedRequestRevision = Number(payload.expectedRequestRevision);
        if (!Number.isInteger(expectedRequestRevision) || expectedRequestRevision !== Number(approvedRequest.revision)) {
          throw new ApiError(409, "REVISION_CONFLICT", "The access request changed before approval.");
        }
      }
    } else {
      await requireActiveRole(client, actor, command, ["doctor"]);
      const parentId = requireText(payload.parentGrantId, "parentGrantId", 100);
      const parentResult = await client.query("SELECT * FROM access_grants WHERE grant_id=$1 FOR UPDATE", [parentId]);
      const parent = parentResult.rows[0] as Record<string, unknown> | undefined;
      if (!parent || parent.status !== "active" || parent.grantee_account_id !== actor.accountId || !(parent.actions as string[]).includes("delegate")) {
        throw new ApiError(403, "GRANT_DELEGATION_FORBIDDEN", "The parent grant cannot be delegated.");
      }
      expected(command, Number(parent.revision));
      if (petId !== parent.pet_id || requestedActions.some((action) => !(parent.actions as string[]).includes(action))) {
        throw new ApiError(403, "GRANT_DELEGATION_FORBIDDEN", "Delegated actions must be a subset of the parent grant.");
      }
      parentGrantId = parentId;
    }
    const doctorProfile = await actorProfile(client, doctorAccountId);
    const grantId = command.entityId;
    const result = await client.query(
      `INSERT INTO access_grants(grant_id, pet_id, grantor_account_id, grantee_account_id, grantee_display_name,
       actions, request_id, parent_grant_id, revision, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,'active',now()) RETURNING *`,
      [grantId, petId, actor.accountId, doctorAccountId, displayName(doctorProfile), requestedActions,
        payload.requestId ?? null, parentGrantId],
    );
    if (approvedRequest) {
      const request = await client.query("UPDATE access_requests SET status='approved', revision=revision+1, decided_at=now(), decided_by=$2 WHERE request_id=$1 AND status='pending' AND revision=$3 RETURNING *", [approvedRequest.request_id, actor.accountId, approvedRequest.revision]);
      if (!request.rowCount) throw new ApiError(409, "ACCESS_REQUEST_STALE", "The selected access request changed.");
    }
    await enqueueAccountAccessStatusEmail(client, doctorAccountId, String(pet.name), "предоставлен");
    const value = grantFromRow(result.rows[0]);
    return { value, revision: 1, audit: {
      action: command.type === "access.grant" ? "access.granted" : "access.delegated", aggregateType: "grant", aggregateId: grantId,
      relatedAccountId: doctorAccountId, metadata: { petId, actions: requestedActions, ...(parentGrantId ? { parentGrantId } : {}) }, afterState: value,
    } };
  }

  const found = await client.query("SELECT * FROM access_grants WHERE grant_id=$1 FOR UPDATE", [command.entityId]);
  const before = found.rows[0] as Record<string, unknown> | undefined;
  if (!before || before.status !== "active") throw new ApiError(409, "GRANT_NOT_ACTIVE", "The grant is no longer active.");
  expected(command, Number(before.revision));
  const pet = await petRow(client, String(before.pet_id), true);
  await requireActiveRole(client, actor, command, ["owner", "doctor"]);
  if (command.type === "access.actions.update") {
    if (before.grantor_account_id !== actor.accountId && pet.owner_account_id !== actor.accountId) throw new ApiError(403, "GRANTOR_REQUIRED", "Only the grantor may change access actions.");
    const nextActions = actions(payload.actions);
    if (before.parent_grant_id) {
      const parentResult = await client.query("SELECT * FROM access_grants WHERE grant_id=$1 FOR UPDATE", [before.parent_grant_id]);
      const parent = parentResult.rows[0] as Record<string, unknown> | undefined;
      if (!parent || parent.status !== "active" || !(parent.actions as string[]).includes("delegate")
        || nextActions.some((action) => !(parent.actions as string[]).includes(action))) {
        throw new ApiError(409, "GRANT_DELEGATION_FORBIDDEN", "The updated actions exceed the active parent grant.");
      }
    }
    const revokedRecipients = await invalidGrantBranchRecipientEmails(client, command.entityId, nextActions);
    const updated = await client.query("UPDATE access_grants SET actions=$2, revision=revision+1 WHERE grant_id=$1 RETURNING *", [command.entityId, nextActions]);
    await client.query(
      `WITH RECURSIVE invalid_branch AS (
         SELECT child.grant_id FROM access_grants child
         WHERE child.parent_grant_id=$1 AND child.status='active'
           AND (NOT ('delegate'=ANY($2::text[])) OR NOT ($2::text[] @> child.actions))
         UNION ALL
         SELECT child.grant_id FROM access_grants child JOIN invalid_branch parent ON child.parent_grant_id=parent.grant_id
         WHERE child.status='active'
       ) UPDATE access_grants SET status='revoked', revision=revision+1, revoked_at=now()
         WHERE grant_id IN (SELECT grant_id FROM invalid_branch) AND status='active'`,
      [command.entityId, nextActions],
    );
    await enqueueAccessStatusEmails(client, revokedRecipients, String(pet.name), "отозван");
    const value = grantFromRow(updated.rows[0]);
    return { value, revision: value.revision, audit: {
      action: "access.actions.updated", aggregateType: "grant", aggregateId: command.entityId,
      relatedAccountId: value.granteeAccountId, metadata: { petId: value.petId, actions: value.actions }, beforeState: grantFromRow(before), afterState: value,
    } };
  }
  const relinquishing = command.type === "access.relinquish";
  if (relinquishing) {
    if (command.activeRole !== "doctor") throw new ApiError(403, "ACTIVE_ROLE_MISMATCH", "This operation is unavailable for the active role.");
    if (before.grantee_account_id !== actor.accountId) throw new ApiError(403, "GRANTEE_REQUIRED", "Only the grantee may relinquish access.");
  } else {
    if (before.grantor_account_id !== actor.accountId && pet.owner_account_id !== actor.accountId) throw new ApiError(403, "GRANTOR_REQUIRED", "Only the grantor may revoke access.");
  }
  const revokedRecipients = await activeGrantBranchRecipientEmails(client, command.entityId);
  await cascadeGrantRevocation(client, command.entityId, relinquishing ? "relinquished" : "revoked");
  await enqueueAccessStatusEmails(client, revokedRecipients, String(pet.name), "отозван");
  return { value: { grantId: command.entityId }, revision: Number(before.revision) + 1, audit: {
    action: relinquishing ? "access.relinquished" : "access.revoked", aggregateType: "grant", aggregateId: command.entityId,
    relatedAccountId: String(before.grantee_account_id), metadata: { petId: before.pet_id }, beforeState: grantFromRow(before),
    afterState: { ...grantFromRow(before), status: relinquishing ? "relinquished" : "revoked" },
  } };
}

async function handleRecord(client: PoolClient, actor: Actor, command: ClientCommand): Promise<Applied> {
  if (["record.create", "record.update"].includes(command.type)) {
    await requireActiveRole(client, actor, command, ["doctor"]);
    const input = validateMedicalEncounter(object(command.payload).input ?? command.payload);
    if (input.petId !== object(command.payload).petId && object(command.payload).petId !== undefined) throw new ApiError(400, "VALIDATION_FAILED", "Pet identifiers differ.");
    const pet = await petRow(client, input.petId, true);
    await requirePetWrite(client, actor, input.petId);
    const profile = await actorProfile(client, actor.accountId);
    const authorName = displayName(profile) || actor.accountId;
    const now = new Date().toISOString();
    const sections = medicalSections(input, actor.accountId, authorName, now);
    const what = input.sections["what-happened"];
    if (command.type === "record.create") {
      const result = await client.query(
        `INSERT INTO medical_records(record_id, pet_id, revision, author_account_id, author_display_name,
         encounter_date, title, text, sections, created_at, updated_at)
         VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8::jsonb,$9,$9) RETURNING *`,
        [command.entityId, input.petId, actor.accountId, authorName, input.encounterDate,
          optionalText(object(command.payload).title, 200) ?? "Что случилось", what.comment, JSON.stringify(sections), now],
      );
      const value = recordFromRow(result.rows[0]);
      await enqueueAccountEmail(
        client,
        String(pet.owner_account_id),
        "Медицинская запись в системе \"Клинок\" ожидает подтверждения",
        `Новая медицинская запись о питомце «${String(pet.name)}» ожидает Вашего подтверждения.`,
      );
      return { value, revision: 1, audit: {
        action: "record.created", aggregateType: "medicalRecord", aggregateId: command.entityId,
        metadata: { petId: input.petId, encounterDate: input.encounterDate },
        afterState: medicalRecordAuditState(value, "unconfirmed"),
      } };
    }
    const found = await client.query("SELECT * FROM medical_records WHERE record_id=$1 FOR UPDATE", [command.entityId]);
    const before = found.rows[0] as Record<string, unknown> | undefined;
    if (!before || before.deleted_at || before.pet_id !== input.petId) throw new ApiError(404, "RECORD_NOT_FOUND", "Medical record not found.");
    expected(command, Number(before.revision));
    const confirmed = await client.query("SELECT 1 FROM medical_record_confirmations WHERE record_id=$1", [command.entityId]);
    if (confirmed.rowCount) throw new ApiError(409, "CONFIRMED_RECORD_IMMUTABLE", "A confirmed record cannot be changed.");
    const updated = await client.query(
      `UPDATE medical_records SET revision=revision+1, encounter_date=$2, title=$3, text=$4,
       sections=$5::jsonb, updated_at=$6 WHERE record_id=$1 RETURNING *`,
      [command.entityId, input.encounterDate, optionalText(object(command.payload).title, 200) ?? before.title,
        what.comment, JSON.stringify(sections), now],
    );
    const value = recordFromRow(updated.rows[0]);
    return { value, revision: value.revision, audit: {
      action: "record.updated", aggregateType: "medicalRecord", aggregateId: command.entityId,
      metadata: { petId: input.petId, encounterDate: input.encounterDate },
      beforeState: medicalRecordAuditState(recordFromRow(before), "unconfirmed"),
      afterState: medicalRecordAuditState(value, "unconfirmed"),
    } };
  }

  const found = await client.query("SELECT * FROM medical_records WHERE record_id=$1 FOR UPDATE", [command.entityId]);
  const before = found.rows[0] as Record<string, unknown> | undefined;
  if (!before || before.deleted_at) throw new ApiError(404, "RECORD_NOT_FOUND", "Medical record not found.");
  expected(command, Number(before.revision));
  const pet = await petRow(client, String(before.pet_id), true);
  if (command.type === "record.delete") {
    if (command.activeRole !== "doctor") throw new ApiError(403, "ACTIVE_ROLE_MISMATCH", "This operation is unavailable for the active role.");
    await requirePetWrite(client, actor, String(before.pet_id));
    const confirmed = await client.query("SELECT 1 FROM medical_record_confirmations WHERE record_id=$1", [command.entityId]);
    if (confirmed.rowCount) throw new ApiError(409, "CONFIRMED_RECORD_IMMUTABLE", "A confirmed record cannot be deleted.");
    const deleted = await client.query(
      "UPDATE medical_records SET revision=revision+1, deleted_at=now(), updated_at=now() WHERE record_id=$1 RETURNING *",
      [command.entityId],
    );
    const deletedRecord = recordFromRow(deleted.rows[0]);
    return { value: { recordId: command.entityId }, revision: Number(before.revision) + 1, audit: {
      action: "record.deleted", aggregateType: "medicalRecord", aggregateId: command.entityId,
      metadata: { petId: before.pet_id },
      beforeState: medicalRecordAuditState(recordFromRow(before), "unconfirmed"),
      afterState: medicalRecordAuditState(deletedRecord, "deleted", { deletedAt: iso(deleted.rows[0].deleted_at as Date | string) }),
    } };
  }

  await requireActiveRole(client, actor, command, ["owner"]);
  if (pet.owner_account_id !== actor.accountId) throw new ApiError(403, "OWNER_SCOPE_FORBIDDEN", "Only the Owner may confirm this record.");
  const existing = await client.query("SELECT 1 FROM medical_record_confirmations WHERE record_id=$1", [command.entityId]);
  if (existing.rowCount) throw new ApiError(409, "RECORD_ALREADY_CONFIRMED", "The record is already confirmed.");
  const record = recordFromRow(before);
  const general = record.sections["general-data"]?.value as Record<string, unknown> | undefined;
  const vaccination = record.sections.vaccination?.value as Record<string, unknown> | undefined;
  const weight = typeof general?.weightKg === "number" ? general.weightKg : undefined;
  const chip = typeof vaccination?.chipNumber === "string" && vaccination.chipNumber.trim() ? vaccination.chipNumber.trim() : undefined;
  const currentVaccineName = typeof vaccination?.currentVaccineName === "string" && vaccination.currentVaccineName.trim()
    ? vaccination.currentVaccineName.trim() : undefined;
  const latestVaccination = currentVaccineName ? { date: record.encounterDate, name: currentVaccineName, recordId: record.recordId } : undefined;
  const confirmedVaccinationUpdate = latestVaccination && isNewerVaccination(latestVaccination, pet.latest_confirmed_vaccination)
    ? latestVaccination : undefined;
  const profileVaccination = latestVaccination ? { date: latestVaccination.date, name: latestVaccination.name } : undefined;
  const profileVaccinationUpdate = profileVaccination && isNewerVaccination(profileVaccination, pet.latest_vaccination)
    ? profileVaccination : undefined;
  const confirmationId = randomUUID();
  const insertedConfirmation = await client.query(
    `INSERT INTO medical_record_confirmations(confirmation_id, pet_id, record_id, record_revision, owner_account_id,
     confirmed_at, applied_profile_weight_kg, applied_profile_chip, applied_profile_latest_vaccination)
     VALUES ($1,$2,$3,$4,$5,now(),$6,$7,$8::jsonb) RETURNING *`,
    [confirmationId, record.petId, record.recordId, record.revision, actor.accountId, weight ?? null, chip ?? null,
      JSON.stringify(confirmedVaccinationUpdate ?? null)],
  );
  const confirmation = confirmationFromRow(insertedConfirmation.rows[0]);
  await client.query(
    `UPDATE pets SET revision=revision+1, weight_kg=COALESCE($2, weight_kg), chip=COALESCE($3, chip),
     latest_confirmed_vaccination=COALESCE($4::jsonb, latest_confirmed_vaccination),
     latest_vaccination=COALESCE($5::jsonb, latest_vaccination), updated_at=now() WHERE pet_id=$1`,
    [record.petId, weight ?? null, chip ?? null, JSON.stringify(confirmedVaccinationUpdate ?? null),
      JSON.stringify(profileVaccinationUpdate ?? null)],
  );
  await enqueueAccountEmail(
    client,
    record.authorAccountId,
    "Медицинская запись в системе \"Клинок\" подтверждена",
    `Медицинская запись о питомце «${String(pet.name)}» подтверждена владельцем.`,
  );
  return { value: { confirmationId }, revision: record.revision, audit: {
    action: "record.confirmed", aggregateType: "medicalRecord", aggregateId: command.entityId,
    metadata: { petId: record.petId, recordRevision: record.revision, updatesWeight: weight !== undefined,
      updatesChip: Boolean(chip), updatesVaccination: Boolean(confirmedVaccinationUpdate || profileVaccinationUpdate) },
    beforeState: medicalRecordAuditState(record, "unconfirmed"),
    afterState: medicalRecordAuditState(record, "confirmed", { confirmation }),
  } };
}

export class CommandService {
  constructor(private readonly db: Database, private readonly ledger: Ledger) {}

  async execute(actor: Actor, command: ClientCommand): Promise<CommandResult> {
    if (!this.ledger.isValid()) return { operationId: command.operationId, status: "rejected", error: { code: "LEDGER_INVALID", message: "The audit ledger is invalid." } };
    try {
      const committed = await this.db.transaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [command.operationId]);
        const receipt = await client.query<{ actor_account_id: string; command_type: string; result: CommandResult }>(
          "SELECT actor_account_id, command_type, result FROM operation_receipts WHERE operation_id=$1",
          [command.operationId],
        );
        if (receipt.rows[0]) {
          if (receipt.rows[0].actor_account_id !== actor.accountId || receipt.rows[0].command_type !== command.type) {
            throw new ApiError(409, "OPERATION_ID_REUSED", "The operation identifier was already used for another command.");
          }
          return { result: { ...receipt.rows[0].result, status: "duplicate" as const } };
        }
        const account = await client.query("SELECT credential_status FROM accounts WHERE account_id=$1 FOR SHARE", [actor.accountId]);
        if (account.rows[0]?.credential_status !== "active") throw new ApiError(401, "SESSION_INVALID", "The account is unavailable.");
        let applied: Applied;
        if (command.type.startsWith("role.")) applied = await handleRole(client, actor, command);
        else if (command.type.startsWith("pet.")) applied = await handlePet(client, actor, command);
        else if (command.type.startsWith("access.")) applied = await handleAccess(client, actor, command);
        else if (command.type.startsWith("record.")) applied = await handleRecord(client, actor, command);
        else throw new ApiError(400, "COMMAND_UNSUPPORTED", "The command type is unsupported.");
        const block = await this.ledger.append(client, {
          operationId: command.operationId,
          actorAccountId: actor.accountId,
          activeRole: command.activeRole,
          ...applied.audit,
        });
        const result: CommandResult = {
          operationId: command.operationId,
          status: "applied",
          ...(applied.revision !== undefined ? { revision: applied.revision } : {}),
          ...(applied.value !== undefined ? { value: applied.value } : {}),
        };
        await client.query(
          "INSERT INTO operation_receipts(operation_id, actor_account_id, command_type, result) VALUES ($1,$2,$3,$4::jsonb)",
          [command.operationId, actor.accountId, command.type, JSON.stringify({ ...result, ledgerHeight: block.height })],
        );
        return { result, block };
      });
      if (committed.block) this.ledger.noteCommitted(committed.block.height, committed.block.blockHash);
      return committed.result;
    } catch (reason) {
      if (reason instanceof ApiError) return {
        operationId: command.operationId,
        status: reason.status === 409 && reason.code === "REVISION_CONFLICT" ? "conflict" : "rejected",
        error: { code: reason.code, message: reason.message },
      };
      const code = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "";
      if (code === "23505") return { operationId: command.operationId, status: "rejected", error: { code: "DUPLICATE_RESOURCE", message: "The resource already exists." } };
      throw reason;
    }
  }
}
