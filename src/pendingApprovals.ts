// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

interface AdministratorPendingSource {
  readonly allRoles?: readonly {
    readonly role: "administrator" | "doctor" | "owner";
    readonly status: string;
  }[];
}

interface OwnerPendingSource {
  readonly pets?: readonly { readonly petId: string }[];
  readonly accessRequests?: readonly {
    readonly petId: string;
    readonly requesterAccountId: string;
    readonly status: string;
  }[];
  readonly records?: readonly { readonly petId: string; readonly recordId: string }[];
  readonly confirmedRecordIds?: readonly string[];
}

interface OwnerTransferPendingSource {
  readonly transferRequests?: readonly {
    readonly transferRequestId: string;
    readonly initiatedByAccountId: string;
    readonly status: string;
  }[];
}

export interface OwnerPetPendingApprovals {
  accessRequests: number;
  medicalRecords: number;
  total: number;
}

export interface OwnerPendingApprovals extends OwnerPetPendingApprovals {
  byPet: Record<string, OwnerPetPendingApprovals>;
}

export function administratorPendingRequestCount(control: AdministratorPendingSource): number {
  return (control.allRoles ?? []).filter((request) =>
    request.status === "pending" && (request.role === "doctor" || request.role === "administrator")).length;
}

export function ownerPendingApprovals(medical: OwnerPendingSource): OwnerPendingApprovals {
  const petIds = new Set((medical.pets ?? []).map((pet) => pet.petId));
  const byPet: Record<string, OwnerPetPendingApprovals> = {};
  const accessKeys = new Set<string>();
  const recordKeys = new Set<string>();

  const ensurePet = (petId: string) => {
    byPet[petId] ??= { accessRequests: 0, medicalRecords: 0, total: 0 };
    return byPet[petId];
  };

  for (const request of medical.accessRequests ?? []) {
    if (request.status !== "pending" || !petIds.has(request.petId)) continue;
    const key = `${request.petId}\u0000${request.requesterAccountId}`;
    if (accessKeys.has(key)) continue;
    accessKeys.add(key);
    const counts = ensurePet(request.petId);
    counts.accessRequests += 1;
    counts.total += 1;
  }

  const confirmedRecordIds = new Set(medical.confirmedRecordIds ?? []);
  for (const record of medical.records ?? []) {
    if (!petIds.has(record.petId) || confirmedRecordIds.has(record.recordId)) continue;
    const key = `${record.petId}\u0000${record.recordId}`;
    if (recordKeys.has(key)) continue;
    recordKeys.add(key);
    const counts = ensurePet(record.petId);
    counts.medicalRecords += 1;
    counts.total += 1;
  }

  return {
    accessRequests: accessKeys.size,
    medicalRecords: recordKeys.size,
    total: accessKeys.size + recordKeys.size,
    byPet,
  };
}

export function ownerPendingTransferCount(medical: OwnerTransferPendingSource, accountId: string): number {
  const ids = new Set<string>();
  for (const request of medical.transferRequests ?? []) {
    if (request.status !== "pending" || request.initiatedByAccountId === accountId || ids.has(request.transferRequestId)) continue;
    ids.add(request.transferRequestId);
  }
  return ids.size;
}
