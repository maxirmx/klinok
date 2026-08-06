// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type {
  AccountProfile,
  DeviceCertificate,
  MedicalRecordConfirmation,
  PetAccessRequest,
  PetAccessGrant,
  PetSex,
  Role,
  RoleRequest,
  SignedEvent,
} from "@klinok/protocol";

export interface PetProfile {
  petId: string;
  ownerAccountId: string;
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
  keyVersion: number;
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

export const MEDICAL_ENCOUNTER_SECTION_KINDS = [
  "what-happened",
  "general-data",
  "therapeutic-appointment",
  "diagnosis",
  "vaccination",
  "recommendations",
  "laboratory-tests",
  "instrumental-tests",
  "procedures",
  "outcome",
] as const;

export type MedicalEncounterSectionKind = (typeof MEDICAL_ENCOUNTER_SECTION_KINDS)[number];

export interface WhatHappenedSectionValue {
  selectedIds: readonly string[];
  comment: string;
}

export interface OutcomeSectionValue {
  selectedIds: readonly string[];
  comment: string;
}

export interface FreeTextSectionValue {
  text: string;
}

export interface GeneralDataSectionValue {
  weightKg?: number;
  temperatureC?: number;
  heartRateBpm?: number;
  respiratoryRatePerMinute?: number;
  bloodPressure?: {
    systolicMmHg: number;
    diastolicMmHg: number;
    meanMmHg: number;
  };
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

export interface MedicalEncounterSection {
  kind: MedicalEncounterSectionKind;
  templateVersion: "what-happened-v1" | "outcome-v1" | "general-data-v1" | "vaccination-v1" | "free-text-v0";
  value: WhatHappenedSectionValue | OutcomeSectionValue | GeneralDataSectionValue | VaccinationSectionValue | FreeTextSectionValue;
  authorAccountId: string;
  authorDisplayName: string;
  updatedAt: string;
}

export type MedicalEncounterSectionInputValue = WhatHappenedSectionValue | OutcomeSectionValue | GeneralDataSectionValue | VaccinationSectionValue | FreeTextSectionValue;

export interface MedicalEncounterInput {
  petId: string;
  encounterDate: string;
  sections: {
    "what-happened": WhatHappenedSectionValue;
    outcome: OutcomeSectionValue;
  } & Partial<Record<Exclude<MedicalEncounterSectionKind, "what-happened" | "outcome">, MedicalEncounterSectionInputValue>>;
  recordId?: string;
}

export interface ControlSnapshot {
  profile: AccountProfile | null;
  profiles: AccountProfile[];
  roles: RoleRequest[];
  allRoles: RoleRequest[];
  devices: DeviceCertificate[];
  pendingQueue: RoleRequest[];
  notifications: Array<{ id: string; title: string; message: string; createdAt: string }>;
  events: SignedEvent[];
}

export interface MedicalSnapshot {
  pets: PetProfile[];
  grants: PetAccessGrant[];
  accessRequests: PetAccessRequest[];
  records: MedicalRecordDraft[];
  confirmations: MedicalRecordConfirmation[];
  confirmedRecordIds: string[];
  events: SignedEvent[];
}

export interface RoleDecisionInput {
  accountId: string;
  role: Role;
  status: "approved" | "rejected" | "revoked";
  reason?: string;
}
