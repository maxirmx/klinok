// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type { DiagnosisSectionValue } from "./diagnosis.js";
import type { InstrumentalTestsSectionValue } from "./instrumental.js";
import type { LaboratoryTestsSectionValue } from "./laboratory.js";

export {
  INSTRUMENTAL_STUDY_CATALOG,
  INSTRUMENTAL_STUDY_OPTIONS,
  availableInstrumentalFindingCatalog,
  canonicalizeInstrumentalFindingValues,
  instrumentalFindingById,
  instrumentalStudyTypeById,
  normalizeInstrumentalTestsValue,
  replaceConflictingInstrumentalChoices,
  type InstrumentalConflictPair,
  type InstrumentalFindingCatalogItem,
  type InstrumentalFindingKind,
  type InstrumentalFindingValue,
  type InstrumentalSelectionMode,
  type InstrumentalSelectionSet,
  type InstrumentalNarrativeStudyValue,
  type InstrumentalStudyMode,
  type InstrumentalStudyTypeCatalogItem,
  type InstrumentalStudyValue,
  type InstrumentalTestsSectionValue,
  type InstrumentalTreeStudyValue,
} from "./instrumental.js";
export {
  DIAGNOSIS_CATALOG,
  DIAGNOSIS_CATALOG_OPTIONS,
  DIAGNOSIS_TOP_LEVEL_OPTIONS,
  isDiagnosisTaxonomyId,
  type DiagnosisCatalogGroup,
  type DiagnosisCatalogOption,
  type DiagnosisChoice,
  type DiagnosisDifferential,
  type LegacyDiagnosisDifferential,
  type DiagnosisSectionValue,
  type DiagnosisTaxonomyId,
} from "./diagnosis.js";
export {
  LABORATORY_STUDY_CATALOG,
  LABORATORY_STUDY_OPTIONS,
  laboratoryIndicatorById,
  laboratoryStudyTypeById,
  normalizeLaboratoryTestsValue,
  type LaboratoryIndicatorCatalogItem,
  type LaboratoryPanelStudyValue,
  type LaboratoryStudyValue,
  type LaboratoryTestsSectionValue,
  type LaboratoryStudyTypeCatalogItem,
} from "./laboratory.js";
export {
  WHAT_HAPPENED_LEAF_COUNT,
  WHAT_HAPPENED_TAXONOMY_IDS,
  WHAT_HAPPENED_TREE,
  canonicalWhatHappenedIds,
  isWhatHappenedTaxonomyId,
  whatHappenedLeafLabel,
  whatHappenedPath,
  type WhatHappenedOption,
} from "./whatHappened.js";

export const ROLES = ["administrator", "doctor", "owner"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_STATUSES = ["not_requested", "pending", "approved", "rejected", "revoked"] as const;
export type RoleStatus = (typeof ROLE_STATUSES)[number];
export type AccountStatus = "active" | "deleted";
export type CredentialStatus = "pending_verification" | "active" | "locked" | "deleted";

export interface AccountProfile {
  accountId: string;
  revision: number;
  firstName: string;
  lastName: string;
  patronymic?: string;
  updatedAt: string;
}

export interface ConsentReceipt {
  accountId: string;
  acceptedAt: string;
  ageConfirmed: true;
  personalDataConsentVersion: string;
  userAgreementVersion: string;
}

export interface RoleRequest {
  requestId: string;
  accountId: string;
  role: Role;
  status: RoleStatus;
  revision: number;
  profileRevision: number;
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
  reason?: string;
}

export interface RegistrationSetupDto {
  profile: Omit<AccountProfile, "accountId" | "revision" | "updatedAt">;
  requestedRoles: Role[];
  ageConfirmed: boolean;
  personalDataConsentVersion: string;
  userAgreementVersion: string;
}

export interface SessionDeviceDto {
  deviceId: string;
  deviceName: string;
  current: boolean;
  status: "active" | "revoked";
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export interface AuthSessionDto {
  authenticated: boolean;
  credentialStatus?: CredentialStatus;
  accountId?: string;
  email?: string;
  csrfToken?: string;
  device?: SessionDeviceDto;
  devices?: SessionDeviceDto[];
  setup?: RegistrationSetupDto;
}

export interface AuthErrorBody {
  error: { code: string; message: string };
}

export type PetGrantAction = "read" | "write_unconfirmed" | "delegate";

export const PET_SEXES = [
  "Интактный самец",
  "Интактная самка",
  "Кастрированный самец",
  "Кастрированная самка",
] as const;
export type PetSex = (typeof PET_SEXES)[number];

export type PetAccessRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface PetAccessRequest {
  requestId: string;
  petId: string;
  ownerAccountId: string;
  requesterAccountId: string;
  requesterDisplayName?: string;
  status: PetAccessRequestStatus;
  revision: number;
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

export interface PetAccessGrant {
  grantId: string;
  petId: string;
  grantorAccountId: string;
  granteeAccountId: string;
  granteeDisplayName?: string;
  actions: PetGrantAction[];
  requestId?: string;
  parentGrantId?: string;
  revision: number;
  status: "active" | "revoked" | "relinquished";
  createdAt: string;
  revokedAt?: string;
}

export interface DirectoryProfileDto {
  accountId: string;
  revision: number;
  firstName: string;
  lastName: string;
  patronymic?: string;
  displayName: string;
  updatedAt: string;
}

export interface DirectoryUserDto extends DirectoryProfileDto {
  roleStatuses: Record<Role, RoleStatus>;
  roleRequests: Partial<Record<Role, Pick<RoleRequest, "requestId" | "revision" | "role" | "status">>>;
}

export interface DirectoryPetDto {
  petId: string;
  ownerAccountId: string;
  ownerDisplayName: string;
  ownerProfileRevision: number;
  revision: number;
  species: string;
  name: string;
  updatedAt: string;
  permissions?: readonly PetGrantAction[];
  grantId?: string;
}

export interface DoctorPetAccessDto {
  petId: string;
  ownerAccountId: string;
  ownerDisplayName?: string;
  species?: string;
  name?: string;
  status: "granted" | "requested" | "revoked";
  permissions?: readonly PetGrantAction[];
  grantId?: string;
  requestId?: string;
}

export interface DirectoryPageDto<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  pendingCount?: number;
}

export interface PetProfile {
  petId: string;
  ownerAccountId: string;
  revision: number;
  name: string;
  species: string;
  breed: string;
  sex?: PetSex;
  photoDataUrl?: string;
  birthDate?: string;
  birthYear?: number;
  color?: string;
  chip?: string;
  brandMark?: string;
  latestVaccination?: { date: string; name: string };
  latestConfirmedVaccination?: { date: string; name: string; recordId: string };
  weightKg?: number;
  notes?: string;
  tombstoned: boolean;
  updatedAt: string;
}

export interface PetProfileInput {
  name: string;
  species: string;
  breed: string;
  sex: PetSex;
  photoDataUrl?: string;
  birthDate?: string;
  birthYear?: number;
  color?: string;
  chip?: string;
  brandMark?: string;
  latestVaccination?: { date: string; name: string };
  weightKg: number;
  notes?: string;
}

export const MEDICAL_ENCOUNTER_SECTION_KINDS = [
  "what-happened",
  "general-data",
  "therapeutic-appointment",
  "vaccination",
  "laboratory-tests",
  "instrumental-tests",
  "procedures",
  "recommendations",
  "diagnosis",
  "outcome",
] as const;
export type MedicalEncounterSectionKind = (typeof MEDICAL_ENCOUNTER_SECTION_KINDS)[number];

export const OUTCOME_TAXONOMY_IDS = [
  "outcome.no-observation",
  "outcome.observation",
  "outcome.examination",
  "outcome.recovery",
  "outcome.improvement",
  "outcome.deterioration",
  "outcome.death",
] as const;

export function isOutcomeTaxonomyId(value: string): value is (typeof OUTCOME_TAXONOMY_IDS)[number] {
  return (OUTCOME_TAXONOMY_IDS as readonly string[]).includes(value);
}

export interface WhatHappenedSectionValue { selectedIds: readonly string[]; comment: string }
export interface OutcomeSectionValue { selectedIds: readonly string[]; comment: string }
export interface FreeTextSectionValue { text: string }
export interface GeneralDataSectionValue {
  weightKg?: number;
  temperatureC?: number;
  heartRateBpm?: number;
  respiratoryRatePerMinute?: number;
  bloodPressure?: { systolicMmHg: number; diastolicMmHg: number; meanMmHg: number };
}
export interface VaccinationSectionValue {
  previousVaccinationDate?: string;
  previousVaccineName?: string;
  previousVaccinationComplications?: boolean;
  currentVaccineName?: string;
  currentVaccineBatch?: string;
  currentVaccineExpiresOn?: string;
  chipNumber?: string;
  administrationSite?: string;
  nextRevaccinationDate?: string;
}
export interface TherapeuticProblemValue {
  id: string;
  sourceWhatHappenedId?: string;
  title: string;
  onsetId?: string;
  frequencyId?: string;
  priorTherapyId?: string;
  medicationUseId?: string;
  medicationIds: readonly string[];
  medicationName?: string;
  medicationDynamicsId?: string;
}
export interface TherapeuticAppointmentSectionValue {
  diseaseAnamnesis: { text: string; problems: readonly TherapeuticProblemValue[]; selectedIds: readonly string[] };
  lifeAnamnesis: { text: string; selectedIds: readonly string[]; currentMedications: string; allergies: string };
  examination: { text: string; selectedIds: readonly string[] };
  recommendations: string;
  prescriptions: string;
}

export interface MedicalEncounterSection {
  kind: MedicalEncounterSectionKind;
  templateVersion: "what-happened-v1" | "outcome-v1" | "diagnosis-v1" | "diagnosis-v2" | "general-data-v1" | "vaccination-v1" | "therapeutic-appointment-v1" | "laboratory-tests-v1" | "instrumental-tests-v1" | "free-text-v0";
  value: WhatHappenedSectionValue | OutcomeSectionValue | DiagnosisSectionValue | GeneralDataSectionValue | VaccinationSectionValue | TherapeuticAppointmentSectionValue | LaboratoryTestsSectionValue | InstrumentalTestsSectionValue | FreeTextSectionValue;
  authorAccountId: string;
  authorDisplayName: string;
  updatedAt: string;
}
export type MedicalEncounterSectionInputValue = MedicalEncounterSection["value"];

export interface MedicalEncounterInput {
  petId: string;
  encounterDate: string;
  sections: {
    "what-happened": WhatHappenedSectionValue;
    outcome: OutcomeSectionValue;
  } & Partial<Record<Exclude<MedicalEncounterSectionKind, "what-happened" | "outcome">, MedicalEncounterSectionInputValue>>;
  recordId?: string;
}

export interface MedicalRecordDraft {
  recordId: string;
  petId: string;
  revision: number;
  authorAccountId: string;
  authorDisplayName: string;
  encounterDate: string;
  title: string;
  text: string;
  sections: Partial<Record<MedicalEncounterSectionKind, MedicalEncounterSection>>;
  createdAt: string;
  updatedAt: string;
}

export interface MedicalRecordConfirmation {
  confirmationId: string;
  petId: string;
  recordId: string;
  recordRevision: number;
  ownerAccountId: string;
  confirmedAt: string;
  appliedProfileWeightKg?: number;
  appliedProfileChip?: string;
  appliedProfileLatestVaccination?: { date: string; name: string; recordId: string };
}

export type PetTransferRequestStatus = "pending" | "completed" | "rejected" | "cancelled" | "invalidated";

export interface PetTransferRequest {
  transferRequestId: string;
  petId: string;
  petRevision: number;
  fromOwnerAccountId: string;
  fromOwnerDisplayName: string;
  fromOwnerProfileRevision: number;
  toOwnerAccountId: string;
  toOwnerDisplayName: string;
  toOwnerProfileRevision: number;
  initiatedByAccountId: string;
  retainDoctorAccess: boolean;
  petName: string;
  petSpecies: string;
  status: PetTransferRequestStatus;
  revision: number;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

export interface AuditRoleEntryDto {
  ledgerHeight: number;
  blockHash: string;
  operationId: string;
  createdAt: string;
  category: "request" | "approve" | "restore" | "reject" | "revoke" | "bootstrap";
  action: string;
  role: Role;
  targetAccountId: string;
  actorAccountId: string;
  reason: string;
}

export interface LedgerStatusDto {
  valid: boolean;
  height: number;
  headHash: string;
  verifiedAt: string;
}

export interface ControlSnapshot {
  profile: AccountProfile | null;
  profiles: AccountProfile[];
  roles: RoleRequest[];
  allRoles: RoleRequest[];
  pendingQueue: RoleRequest[];
  notifications: Array<{ id: string; title: string; message: string; createdAt: string }>;
  roleAudit: AuditRoleEntryDto[];
  ledger: LedgerStatusDto;
}

export interface MedicalSnapshot {
  pets: PetProfile[];
  grants: PetAccessGrant[];
  accessRequests: PetAccessRequest[];
  transferRequests: PetTransferRequest[];
  records: MedicalRecordDraft[];
  confirmations: MedicalRecordConfirmation[];
  confirmedRecordIds: string[];
}

export interface AppSnapshotDto {
  revision: number;
  role: Role;
  control: ControlSnapshot;
  medical: MedicalSnapshot;
}

export type ClientCommandType =
  | "role.request" | "role.cancel" | "role.decide"
  | "pet.create" | "pet.update" | "pet.delete"
  | "access.request" | "access.cancel" | "access.reject" | "access.grant"
  | "access.delegate" | "access.revoke" | "access.relinquish" | "access.actions.update"
  | "transfer.request" | "transfer.accept" | "transfer.reject" | "transfer.cancel"
  | "record.create" | "record.update" | "record.delete" | "record.confirm";

export interface ClientCommand<TPayload = Record<string, unknown>> {
  operationId: string;
  type: ClientCommandType;
  activeRole: Role;
  entityId: string;
  expectedRevision?: number;
  dependsOn?: string[];
  createdAt: string;
  payload: TPayload;
}

export interface CommandResult<T = unknown> {
  operationId: string;
  status: "applied" | "duplicate" | "conflict" | "rejected";
  revision?: number;
  value?: T;
  authoritativeEntity?: unknown;
  error?: { code: string; message: string };
}

export interface CommandBatchRequest { commands: ClientCommand[] }
export interface CommandBatchResponse { results: CommandResult[] }

export function normalizeRussianSearchText(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/\s+/g, " ");
}
