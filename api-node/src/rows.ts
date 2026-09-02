// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type {
  AccountProfile,
  MedicalRecordConfirmation,
  MedicalRecordDraft,
  PetAccessGrant,
  PetAccessRequest,
  PetProfile,
  PetTransferRequest,
  Role,
  RoleRequest,
} from "@klinok/contracts";

export function iso(value: Date | string): string { return new Date(value).toISOString(); }

export function dateOnly(value: Date | string): string {
  if (typeof value === "string") {
    const match = /^\d{4}-\d{2}-\d{2}/.exec(value);
    if (match) return match[0];
  }
  const date = value instanceof Date ? value : new Date(value);
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function profileFromRow(row: Record<string, unknown>): AccountProfile {
  return {
    accountId: String(row.account_id),
    revision: Number(row.revision),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    ...(row.patronymic ? { patronymic: String(row.patronymic) } : {}),
    updatedAt: iso(row.updated_at as Date | string),
  };
}

export function displayName(row: Record<string, unknown>): string {
  return [row.first_name, row.patronymic, row.last_name].filter(Boolean).join(" ");
}

export function roleFromRow(row: Record<string, unknown>): RoleRequest {
  return {
    requestId: String(row.request_id),
    accountId: String(row.account_id),
    role: row.role as Role,
    status: row.status as RoleRequest["status"],
    revision: Number(row.revision),
    profileRevision: Number(row.profile_revision),
    requestedAt: iso(row.requested_at as Date | string),
    ...(row.decided_at ? { decidedAt: iso(row.decided_at as Date | string) } : {}),
    ...(row.decided_by ? { decidedBy: String(row.decided_by) } : {}),
    ...(row.reason ? { reason: String(row.reason) } : {}),
  };
}

export function petFromRow(row: Record<string, unknown>): PetProfile {
  return {
    petId: String(row.pet_id),
    ownerAccountId: String(row.owner_account_id),
    revision: Number(row.revision),
    name: String(row.name),
    species: String(row.species),
    breed: String(row.breed),
    ...(row.sex ? { sex: row.sex as PetProfile["sex"] } : {}),
    ...(row.photo_data_url ? { photoDataUrl: String(row.photo_data_url) } : {}),
    ...(row.birth_date ? { birthDate: dateOnly(row.birth_date as Date | string) } : {}),
    ...(row.birth_year !== null && row.birth_year !== undefined ? { birthYear: Number(row.birth_year) } : {}),
    ...(row.color ? { color: String(row.color) } : {}),
    ...(row.chip ? { chip: String(row.chip) } : {}),
    ...(row.brand_mark ? { brandMark: String(row.brand_mark) } : {}),
    ...(row.latest_vaccination ? { latestVaccination: row.latest_vaccination as PetProfile["latestVaccination"] } : {}),
    ...(row.latest_confirmed_vaccination ? { latestConfirmedVaccination: row.latest_confirmed_vaccination as NonNullable<PetProfile["latestConfirmedVaccination"]> } : {}),
    ...(row.weight_kg !== null && row.weight_kg !== undefined ? { weightKg: Number(row.weight_kg) } : {}),
    ...(row.notes ? { notes: String(row.notes) } : {}),
    tombstoned: Boolean(row.deleted_at),
    updatedAt: iso(row.updated_at as Date | string),
  };
}

export function accessRequestFromRow(row: Record<string, unknown>): PetAccessRequest {
  return {
    requestId: String(row.request_id),
    petId: String(row.pet_id),
    ownerAccountId: String(row.owner_account_id),
    requesterAccountId: String(row.requester_account_id),
    ...(row.requester_display_name ? { requesterDisplayName: String(row.requester_display_name) } : {}),
    status: row.status as PetAccessRequest["status"],
    revision: Number(row.revision),
    requestedAt: iso(row.requested_at as Date | string),
    ...(row.decided_at ? { decidedAt: iso(row.decided_at as Date | string) } : {}),
    ...(row.decided_by ? { decidedBy: String(row.decided_by) } : {}),
  };
}

export function grantFromRow(row: Record<string, unknown>): PetAccessGrant {
  return {
    grantId: String(row.grant_id),
    petId: String(row.pet_id),
    grantorAccountId: String(row.grantor_account_id),
    granteeAccountId: String(row.grantee_account_id),
    ...(row.grantee_display_name ? { granteeDisplayName: String(row.grantee_display_name) } : {}),
    actions: row.actions as PetAccessGrant["actions"],
    ...(row.request_id ? { requestId: String(row.request_id) } : {}),
    ...(row.parent_grant_id ? { parentGrantId: String(row.parent_grant_id) } : {}),
    revision: Number(row.revision),
    status: row.status as PetAccessGrant["status"],
    createdAt: iso(row.created_at as Date | string),
    ...(row.revoked_at ? { revokedAt: iso(row.revoked_at as Date | string) } : {}),
  };
}

export function transferRequestFromRow(row: Record<string, unknown>): PetTransferRequest {
  return {
    transferRequestId: String(row.transfer_request_id),
    petId: String(row.pet_id),
    petRevision: Number(row.pet_revision),
    fromOwnerAccountId: String(row.from_owner_account_id),
    fromOwnerDisplayName: String(row.from_owner_display_name ?? ""),
    fromOwnerProfileRevision: Number(row.from_owner_profile_revision),
    toOwnerAccountId: String(row.to_owner_account_id),
    toOwnerDisplayName: String(row.to_owner_display_name ?? ""),
    toOwnerProfileRevision: Number(row.to_owner_profile_revision),
    initiatedByAccountId: String(row.initiated_by_account_id),
    petName: String(row.pet_name ?? row.name ?? ""),
    petSpecies: String(row.pet_species ?? row.species ?? ""),
    status: row.status as PetTransferRequest["status"],
    revision: Number(row.revision),
    createdAt: iso(row.created_at as Date | string),
    ...(row.decided_at ? { decidedAt: iso(row.decided_at as Date | string) } : {}),
    ...(row.decided_by ? { decidedBy: String(row.decided_by) } : {}),
  };
}

export function recordFromRow(row: Record<string, unknown>): MedicalRecordDraft {
  const sections = { ...(row.sections as MedicalRecordDraft["sections"]) };
  if (sections["laboratory-tests"]?.templateVersion === "free-text-v0") delete sections["laboratory-tests"];
  return {
    recordId: String(row.record_id),
    petId: String(row.pet_id),
    revision: Number(row.revision),
    authorAccountId: String(row.author_account_id),
    authorDisplayName: String(row.author_display_name),
    encounterDate: dateOnly(row.encounter_date as Date | string),
    title: String(row.title),
    text: String(row.text),
    sections,
    createdAt: iso(row.created_at as Date | string),
    updatedAt: iso(row.updated_at as Date | string),
  };
}

export function confirmationFromRow(row: Record<string, unknown>): MedicalRecordConfirmation {
  return {
    confirmationId: String(row.confirmation_id),
    petId: String(row.pet_id),
    recordId: String(row.record_id),
    recordRevision: Number(row.record_revision),
    ownerAccountId: String(row.owner_account_id),
    confirmedAt: iso(row.confirmed_at as Date | string),
    ...(row.applied_profile_weight_kg !== null && row.applied_profile_weight_kg !== undefined
      ? { appliedProfileWeightKg: Number(row.applied_profile_weight_kg) } : {}),
    ...(row.applied_profile_chip ? { appliedProfileChip: String(row.applied_profile_chip) } : {}),
    ...(row.applied_profile_latest_vaccination
      ? { appliedProfileLatestVaccination: row.applied_profile_latest_vaccination as NonNullable<MedicalRecordConfirmation["appliedProfileLatestVaccination"]> }
      : {}),
  };
}
