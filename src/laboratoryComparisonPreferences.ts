// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

export type LaboratoryComparisonRole = "doctor" | "owner";

export interface LaboratoryComparisonScope {
  accountId: string;
  role: LaboratoryComparisonRole;
  petId: string;
}

interface LaboratoryComparisonPreference {
  version: 1;
  indicatorIds: string[];
}

type PreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function laboratoryComparisonPreferenceKey(scope: LaboratoryComparisonScope): string {
  return `klinok:v3:${scope.accountId}:${scope.role}:${scope.petId}:laboratory-comparison`;
}

function browserStorage(storage?: PreferenceStorage): PreferenceStorage | undefined {
  if (storage) return storage;
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function validScope(scope: LaboratoryComparisonScope): boolean {
  return typeof scope.accountId === "string" && scope.accountId.length > 0
    && (scope.role === "doctor" || scope.role === "owner")
    && typeof scope.petId === "string" && scope.petId.length > 0;
}

function uniqueIndicatorIds(indicatorIds: readonly string[]): string[] {
  return [...new Set(indicatorIds.map((id) => id.trim()).filter(Boolean))];
}

export function readLaboratoryComparisonPreference(
  scope: LaboratoryComparisonScope,
  storage?: PreferenceStorage,
): string[] {
  try {
    if (!validScope(scope)) return [];
    const value = browserStorage(storage)?.getItem(laboratoryComparisonPreferenceKey(scope));
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return [];
    const preference = parsed as Partial<LaboratoryComparisonPreference>;
    if (preference.version !== 1 || !Array.isArray(preference.indicatorIds)
      || !preference.indicatorIds.every((id) => typeof id === "string" && id.trim().length > 0)) return [];
    return uniqueIndicatorIds(preference.indicatorIds);
  } catch {
    return [];
  }
}

export function writeLaboratoryComparisonPreference(
  scope: LaboratoryComparisonScope,
  indicatorIds: readonly string[],
  storage?: PreferenceStorage,
): void {
  try {
    if (!validScope(scope)) return;
    const target = browserStorage(storage);
    if (!target) return;
    const key = laboratoryComparisonPreferenceKey(scope);
    const normalized = uniqueIndicatorIds(indicatorIds);
    if (!normalized.length) {
      target.removeItem(key);
      return;
    }
    target.setItem(key, JSON.stringify({ version: 1, indicatorIds: normalized } satisfies LaboratoryComparisonPreference));
  } catch {
    // Browser storage is optional; comparison remains available in component memory.
  }
}
