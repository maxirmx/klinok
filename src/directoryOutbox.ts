// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type { DirectoryPetDto, DirectoryProfileDto } from "@klinok/protocol";

export type DirectoryProfileInput = Pick<DirectoryProfileDto, "firstName" | "lastName" | "patronymic">;
export type DirectoryPetInput = Pick<DirectoryPetDto, "petId" | "species" | "name">;

export type DirectoryOutboxOperation =
  | { operationId: string; kind: "profile.upsert"; profile: DirectoryProfileInput; createdAt: string }
  | { operationId: string; kind: "pet.upsert"; pet: DirectoryPetInput; createdAt: string }
  | { operationId: string; kind: "pet.delete"; petId: string; createdAt: string };

export interface DirectoryOutboxFailure {
  operation: DirectoryOutboxOperation;
  reason: unknown;
}

interface FlushDirectoryOutboxOptions {
  accountId: string;
  syncProfile: (profile: DirectoryProfileInput) => Promise<unknown>;
  syncPet: (pet: DirectoryPetInput) => Promise<unknown>;
  deletePet: (petId: string) => Promise<unknown>;
  shouldContinue?: () => boolean;
  isPermanentFailure?: (failure: DirectoryOutboxFailure) => boolean;
  onFailure?: (failure: DirectoryOutboxFailure) => void;
}

const memoryOutbox = new Map<string, DirectoryOutboxOperation[]>();

function storageKey(accountId: string): string {
  return `klinok:directory-outbox:${accountId}`;
}

function browserStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function isOperation(value: unknown): value is DirectoryOutboxOperation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DirectoryOutboxOperation>;
  if (typeof candidate.operationId !== "string" || !candidate.operationId ||
    typeof candidate.createdAt !== "string" || !candidate.createdAt) return false;
  if (candidate.kind === "profile.upsert") {
    return Boolean(candidate.profile && typeof candidate.profile.firstName === "string" &&
      typeof candidate.profile.lastName === "string" &&
      (candidate.profile.patronymic === undefined || typeof candidate.profile.patronymic === "string"));
  }
  if (candidate.kind === "pet.upsert") {
    return Boolean(candidate.pet && typeof candidate.pet.petId === "string" &&
      typeof candidate.pet.species === "string" && typeof candidate.pet.name === "string");
  }
  return candidate.kind === "pet.delete" && typeof candidate.petId === "string";
}

function readOperations(accountId: string): DirectoryOutboxOperation[] {
  const memory = memoryOutbox.get(accountId);
  if (memory) return [...memory];
  const storage = browserStorage();
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(storageKey(accountId)) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter(isOperation) : [];
  } catch {
    return [];
  }
}

function writeOperations(accountId: string, operations: DirectoryOutboxOperation[]): void {
  const storage = browserStorage();
  if (storage) {
    try {
      if (operations.length) storage.setItem(storageKey(accountId), JSON.stringify(operations));
      else storage.removeItem(storageKey(accountId));
      memoryOutbox.delete(accountId);
      return;
    } catch {
      // Keep an in-memory retry queue if browser storage is unavailable or full.
    }
  }
  if (operations.length) memoryOutbox.set(accountId, [...operations]);
  else memoryOutbox.delete(accountId);
}

function replaceOperation(
  accountId: string,
  operation: DirectoryOutboxOperation,
  sameTarget: (candidate: DirectoryOutboxOperation) => boolean,
): DirectoryOutboxOperation {
  writeOperations(accountId, [...readOperations(accountId).filter((candidate) => !sameTarget(candidate)), operation]);
  return operation;
}

export function enqueueDirectoryProfile(accountId: string, profile: DirectoryProfileInput): DirectoryOutboxOperation {
  return replaceOperation(accountId, {
    operationId: crypto.randomUUID(),
    kind: "profile.upsert",
    profile,
    createdAt: new Date().toISOString(),
  }, (candidate) => candidate.kind === "profile.upsert");
}

export function enqueueDirectoryPet(accountId: string, pet: DirectoryPetInput): DirectoryOutboxOperation {
  return replaceOperation(accountId, {
    operationId: crypto.randomUUID(),
    kind: "pet.upsert",
    pet,
    createdAt: new Date().toISOString(),
  }, (candidate) => candidate.kind !== "profile.upsert" &&
    (candidate.kind === "pet.delete" ? candidate.petId : candidate.pet.petId) === pet.petId);
}

export function enqueueDirectoryPetDeletion(accountId: string, petId: string): DirectoryOutboxOperation {
  return replaceOperation(accountId, {
    operationId: crypto.randomUUID(),
    kind: "pet.delete",
    petId,
    createdAt: new Date().toISOString(),
  }, (candidate) => candidate.kind !== "profile.upsert" &&
    (candidate.kind === "pet.delete" ? candidate.petId : candidate.pet.petId) === petId);
}

export function listDirectoryOutbox(accountId: string): DirectoryOutboxOperation[] {
  return readOperations(accountId);
}

export function discardDirectoryProfileOperation(accountId: string): void {
  writeOperations(accountId, readOperations(accountId).filter((operation) => operation.kind !== "profile.upsert"));
}

function removeOperation(accountId: string, operationId: string): void {
  writeOperations(accountId, readOperations(accountId).filter((candidate) => candidate.operationId !== operationId));
}

export async function flushDirectoryOutbox(options: FlushDirectoryOutboxOptions): Promise<DirectoryOutboxFailure[]> {
  const failures: DirectoryOutboxFailure[] = [];
  const operations = readOperations(options.accountId);
  const ordered = [
    ...operations.filter((operation) => operation.kind === "pet.delete"),
    ...operations.filter((operation) => operation.kind === "profile.upsert"),
    ...operations.filter((operation) => operation.kind === "pet.upsert"),
  ];
  let profileFailed = false;
  for (const operation of ordered) {
    if (options.shouldContinue && !options.shouldContinue()) break;
    if (profileFailed && operation.kind === "pet.upsert") continue;
    try {
      if (operation.kind === "profile.upsert") await options.syncProfile(operation.profile);
      else if (operation.kind === "pet.upsert") await options.syncPet(operation.pet);
      else await options.deletePet(operation.petId);
      removeOperation(options.accountId, operation.operationId);
    } catch (reason) {
      if (operation.kind === "profile.upsert") profileFailed = true;
      const failure = { operation, reason };
      failures.push(failure);
      if (options.isPermanentFailure?.(failure)) removeOperation(options.accountId, operation.operationId);
      options.onFailure?.(failure);
    }
  }
  return failures;
}
