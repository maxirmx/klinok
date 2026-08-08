// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ClassicLevel } from "classic-level";
import type {
  CredentialStatus,
  DeviceCertificate,
  DeviceEnrollmentDto,
  PendingOperationDto,
  RegistrationSetupDto,
  DirectoryPetDto,
  DirectoryProfileDto,
  PetAccessRequest,
  PetAccessGrant,
  Role,
  RoleStatus,
} from "@klinok/protocol";

export interface EncryptedUserKeySet {
  formatVersion: 1;
  algorithm: "AES-256-GCM";
  keyVersion: number;
  iv: string;
  ciphertext: string;
}

export interface AuthAccount {
  accountId: string;
  email: string;
  passwordHash: string;
  credentialStatus: CredentialStatus;
  verificationState: "pending" | "verified";
  createdAt: string;
  updatedAt: string;
  failureTimes: string[];
  lockedUntil?: string;
  setup?: RegistrationSetupDto;
  devices: DeviceCertificate[];
  enrollments: DeviceEnrollmentDto[];
  pendingOperations: PendingOperationDto[];
  sessionDigests: string[];
  immutableBootstrap?: boolean;
  encryptedUserKeySet?: EncryptedUserKeySet;
}

export interface AuthSessionRecord {
  digest: string;
  accountId: string;
  csrfToken: string;
  deviceId?: string;
  createdAt: string;
  lastSeenAt: string;
  absoluteExpiresAt: string;
}

export interface SingleUseTokenRecord {
  digest: string;
  accountId: string;
  kind: "verification" | "password_reset";
  expiresAt: string;
  usedAt?: string;
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "LEVEL_NOT_FOUND");
}

export class AuthStore {
  private readonly db: ClassicLevel<string, unknown>;
  private readonly directoryProfileMutations = new Map<string, Promise<void>>();
  private readonly directoryPetMutations = new Map<string, Promise<void>>();

  constructor(private readonly dataDir: string) {
    this.db = new ClassicLevel(join(dataDir, "leveldb"), { valueEncoding: "json" });
  }

  async open(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await this.db.open();
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  private async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.db.get(key) as T | undefined;
      return value ?? null;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  private async runDirectoryProfileMutation<T>(accountId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.directoryProfileMutations.get(accountId) ?? Promise.resolve();
    const operation = previous.then(task, task);
    const settled = operation.then(() => undefined, () => undefined);
    this.directoryProfileMutations.set(accountId, settled);
    try {
      return await operation;
    } finally {
      if (this.directoryProfileMutations.get(accountId) === settled) {
        this.directoryProfileMutations.delete(accountId);
      }
    }
  }

  private async runDirectoryPetMutation<T>(petId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.directoryPetMutations.get(petId) ?? Promise.resolve();
    const operation = previous.then(task, task);
    const settled = operation.then(() => undefined, () => undefined);
    this.directoryPetMutations.set(petId, settled);
    try {
      return await operation;
    } finally {
      if (this.directoryPetMutations.get(petId) === settled) this.directoryPetMutations.delete(petId);
    }
  }

  async getAccount(accountId: string): Promise<AuthAccount | null> {
    return this.get<AuthAccount>(`account:${accountId}`);
  }

  async getAccountByEmail(email: string): Promise<AuthAccount | null> {
    const accountId = await this.get<string>(`email:${email}`);
    return accountId ? this.getAccount(accountId) : null;
  }

  async createAccount(account: AuthAccount): Promise<void> {
    await this.db.batch()
      .put(`account:${account.accountId}`, account)
      .put(`email:${account.email}`, account.accountId)
      .write();
  }

  async putAccount(account: AuthAccount, previousEmail?: string): Promise<void> {
    const batch = this.db.batch().put(`account:${account.accountId}`, account).put(`email:${account.email}`, account.accountId);
    if (previousEmail && previousEmail !== account.email) batch.del(`email:${previousEmail}`);
    await batch.write();
  }

  async releaseEmail(email: string): Promise<void> {
    await this.db.del(`email:${email}`);
  }

  async putToken(token: SingleUseTokenRecord): Promise<void> {
    await this.db.put(`token:${token.kind}:${token.digest}`, token);
  }

  async getToken(kind: SingleUseTokenRecord["kind"], digest: string): Promise<SingleUseTokenRecord | null> {
    return this.get<SingleUseTokenRecord>(`token:${kind}:${digest}`);
  }

  async rollbackPendingRegistration(accountId: string, email: string, verificationTokenDigest: string): Promise<boolean> {
    const account = await this.getAccount(accountId);
    const emailOwner = await this.get<string>(`email:${email}`);
    const token = await this.getToken("verification", verificationTokenDigest);
    const isUnmodifiedPendingRegistration = account?.accountId === accountId &&
      account.email === email &&
      account.credentialStatus === "pending_verification" &&
      account.verificationState === "pending" &&
      !account.immutableBootstrap &&
      account.devices.length === 0 &&
      account.enrollments.length === 0 &&
      account.pendingOperations.length === 0 &&
      account.sessionDigests.length === 0 &&
      emailOwner === accountId &&
      token?.accountId === accountId &&
      token.kind === "verification" &&
      !token.usedAt;
    if (!isUnmodifiedPendingRegistration) return false;

    await this.db.batch()
      .del(`token:verification:${verificationTokenDigest}`)
      .del(`email:${email}`)
      .del(`account:${accountId}`)
      .write();
    return true;
  }

  async useToken(token: SingleUseTokenRecord, usedAt: string): Promise<void> {
    await this.db.put(`token:${token.kind}:${token.digest}`, { ...token, usedAt });
  }

  async putSession(session: AuthSessionRecord): Promise<void> {
    await this.db.put(`session:${session.digest}`, session);
  }

  async putSessionForAccount(session: AuthSessionRecord, account: AuthAccount): Promise<void> {
    const updated = {
      ...account,
      sessionDigests: [...new Set([...account.sessionDigests, session.digest])],
      updatedAt: session.lastSeenAt,
    };
    await this.db.batch()
      .put(`session:${session.digest}`, session)
      .put(`account:${account.accountId}`, updated)
      .write();
  }

  async replaceSessionForAccount(previousDigest: string, session: AuthSessionRecord, account: AuthAccount): Promise<AuthAccount> {
    const updated = {
      ...account,
      sessionDigests: [...new Set(account.sessionDigests.filter((digest) => digest !== previousDigest).concat(session.digest))],
      updatedAt: session.lastSeenAt,
    };
    await this.db.batch()
      .del(`session:${previousDigest}`)
      .put(`session:${session.digest}`, session)
      .put(`account:${account.accountId}`, updated)
      .write();
    return updated;
  }

  async getSession(digest: string): Promise<AuthSessionRecord | null> {
    return this.get<AuthSessionRecord>(`session:${digest}`);
  }

  async deleteSession(digest: string): Promise<void> {
    await this.db.del(`session:${digest}`);
  }

  async deleteSessionForAccount(digest: string, account: AuthAccount): Promise<AuthAccount> {
    const updated = { ...account, sessionDigests: account.sessionDigests.filter((value) => value !== digest) };
    await this.db.batch().del(`session:${digest}`).put(`account:${account.accountId}`, updated).write();
    return updated;
  }

  async revokeAccountSessions(account: AuthAccount): Promise<AuthAccount> {
    const batch = this.db.batch();
    for (const digest of account.sessionDigests) batch.del(`session:${digest}`);
    const updated = { ...account, sessionDigests: [], updatedAt: new Date().toISOString() };
    batch.put(`account:${account.accountId}`, updated);
    await batch.write();
    return updated;
  }

  async applyObservedDeviceRevocation(accountId: string, deviceId: string): Promise<AuthAccount | null> {
    return this.runDirectoryProfileMutation(accountId, async () => {
      const account = await this.getAccount(accountId);
      if (!account) return null;
      if (!account.devices.some((device) => device.deviceId === deviceId && device.status === "active")) return account;
      return this.revokeAccountSessions({
        ...account,
        devices: account.devices.map((device) =>
          device.deviceId === deviceId ? { ...device, status: "revoked" as const } : device),
        enrollments: account.enrollments.map((enrollment) =>
          enrollment.deviceId === deviceId ? { ...enrollment, status: "revoked" as const } : enrollment),
      });
    });
  }

  async replaceAllSessionsForAccount(session: AuthSessionRecord, account: AuthAccount): Promise<AuthAccount> {
    const updated = {
      ...account,
      sessionDigests: [session.digest],
      updatedAt: session.lastSeenAt,
    };
    const batch = this.db.batch();
    for (const digest of account.sessionDigests) batch.del(`session:${digest}`);
    await batch
      .put(`session:${session.digest}`, session)
      .put(`account:${account.accountId}`, updated)
      .write();
    return updated;
  }

  async deleteCredentialAccount(account: AuthAccount): Promise<AuthAccount> {
    return this.runDirectoryProfileMutation(account.accountId, async () => {
      const current = await this.getAccount(account.accountId) ?? account;
      const directoryPets = (await this.listDirectoryPets())
        .filter((pet) => pet.ownerAccountId === current.accountId);
      const updated: AuthAccount = {
        ...current,
        credentialStatus: "deleted",
        setup: undefined,
        encryptedUserKeySet: undefined,
        pendingOperations: [],
        sessionDigests: [],
        updatedAt: new Date().toISOString(),
      };
      const batch = this.db.batch()
        .del(`email:${current.email}`)
        .del(`directory:profile:${current.accountId}`)
        .put(`account:${current.accountId}`, updated);
      for (const digest of current.sessionDigests) batch.del(`session:${digest}`);
      for (const pet of directoryPets) batch.del(`directory:pet:${pet.petId}`);
      await batch.write();
      return updated;
    });
  }

  async hasMarker(id: string): Promise<boolean> {
    return (await this.get<{ id: string }>(`marker:${id}`)) != null;
  }

  async putMarker(id: string): Promise<void> {
    await this.db.put(`marker:${id}`, { id, createdAt: new Date().toISOString() });
  }

  async putDirectoryProfile(profile: DirectoryProfileDto): Promise<void> {
    await this.runDirectoryProfileMutation(profile.accountId, () =>
      this.db.put(`directory:profile:${profile.accountId}`, profile));
  }

  async createDirectoryProfile(profile: DirectoryProfileDto): Promise<DirectoryProfileDto> {
    return this.runDirectoryProfileMutation(profile.accountId, async () => {
      const account = await this.getAccount(profile.accountId);
      if (!account || account.credentialStatus === "deleted") {
        throw Object.assign(new Error("The directory account is unavailable."), { code: "ACCOUNT_DELETED" });
      }
      const existing = await this.getDirectoryProfile(profile.accountId);
      if (existing) return existing;
      await this.db.put(`directory:profile:${profile.accountId}`, profile);
      return profile;
    });
  }

  async putAccountAndDirectoryProfile(account: AuthAccount, profile: DirectoryProfileDto): Promise<void> {
    await this.runDirectoryProfileMutation(profile.accountId, async () => {
      const current = await this.getAccount(account.accountId);
      if (current?.credentialStatus === "deleted") {
        throw Object.assign(new Error("The directory account is unavailable."), { code: "ACCOUNT_DELETED" });
      }
      await this.db.batch()
        .put(`account:${account.accountId}`, account)
        .put(`directory:profile:${profile.accountId}`, profile)
        .write();
    });
  }

  async applyObservedAccountProgress(
    accountId: string,
    operationId: string,
    setupComplete: boolean,
  ): Promise<AuthAccount | null> {
    return this.runDirectoryProfileMutation(accountId, async () => {
      const account = await this.getAccount(accountId);
      if (!account) return null;
      const pendingOperations = account.pendingOperations
        .filter((operation) => operation.operationId !== operationId);
      if (pendingOperations.length === account.pendingOperations.length && !(setupComplete && account.setup)) {
        return account;
      }

      const updatedAt = new Date().toISOString();
      const updated: AuthAccount = {
        ...account,
        pendingOperations,
        ...(setupComplete ? { setup: undefined } : {}),
        updatedAt,
      };
      const batch = this.db.batch().put(`account:${accountId}`, updated);
      if (setupComplete && account.setup && !await this.getDirectoryProfile(accountId)) {
        const { firstName, lastName, patronymic } = account.setup.profile;
        batch.put(`directory:profile:${accountId}`, {
          accountId,
          firstName,
          lastName,
          ...(patronymic ? { patronymic } : {}),
          displayName: [firstName, patronymic, lastName].filter(Boolean).join(" "),
          updatedAt,
        } satisfies DirectoryProfileDto);
      }
      await batch.write();
      return updated;
    });
  }

  async getDirectoryProfile(accountId: string): Promise<DirectoryProfileDto | null> {
    return this.get<DirectoryProfileDto>(`directory:profile:${accountId}`);
  }

  async listDirectoryProfiles(): Promise<DirectoryProfileDto[]> {
    const profiles: DirectoryProfileDto[] = [];
    for await (const [, value] of this.db.iterator({ gte: "directory:profile:", lt: "directory:profile;" })) {
      profiles.push(value as DirectoryProfileDto);
    }
    return profiles;
  }

  async putDirectoryPet(pet: DirectoryPetDto): Promise<boolean> {
    return this.runDirectoryProfileMutation(pet.ownerAccountId, async () => {
      const account = await this.getAccount(pet.ownerAccountId);
      if (account?.credentialStatus === "deleted") return false;
      return this.runDirectoryPetMutation(pet.petId, async () => {
        if (await this.isObservedPetTombstoned(pet.petId)) return false;
        await this.db.put(`directory:pet:${pet.petId}`, pet);
        return true;
      });
    });
  }

  async getDirectoryPet(petId: string): Promise<DirectoryPetDto | null> {
    const pet = await this.get<DirectoryPetDto>(`directory:pet:${petId}`);
    if (!pet) return null;
    const profile = await this.getDirectoryProfile(pet.ownerAccountId);
    return profile ? { ...pet, ownerDisplayName: profile.displayName } : pet;
  }

  async deleteDirectoryPet(petId: string): Promise<void> {
    await this.runDirectoryPetMutation(petId, () => this.db.del(`directory:pet:${petId}`));
  }

  async listDirectoryPets(): Promise<DirectoryPetDto[]> {
    const pets: DirectoryPetDto[] = [];
    for await (const [, value] of this.db.iterator({ gte: "directory:pet:", lt: "directory:pet;" })) {
      pets.push(value as DirectoryPetDto);
    }
    const displayNames = new Map((await this.listDirectoryProfiles())
      .map((profile) => [profile.accountId, profile.displayName]));
    return pets.map((pet) => displayNames.has(pet.ownerAccountId)
      ? { ...pet, ownerDisplayName: displayNames.get(pet.ownerAccountId)! }
      : pet);
  }

  async putObservedRole(accountId: string, role: Role, status: RoleStatus): Promise<void> {
    await this.db.put(`projection:role:${accountId}:${role}`, status);
  }

  async getObservedRole(accountId: string, role: Role): Promise<RoleStatus | null> {
    return this.get<RoleStatus>(`projection:role:${accountId}:${role}`);
  }

  async listObservedRoles(): Promise<Array<{ accountId: string; role: Role; status: RoleStatus }>> {
    const roles: Array<{ accountId: string; role: Role; status: RoleStatus }> = [];
    const prefix = "projection:role:";
    for await (const [key, value] of this.db.iterator({ gte: prefix, lt: "projection:role;" })) {
      const separator = key.lastIndexOf(":");
      const accountId = key.slice(prefix.length, separator);
      const role = key.slice(separator + 1) as Role;
      roles.push({ accountId, role, status: value as RoleStatus });
    }
    return roles;
  }

  async putObservedPetOwner(petId: string, ownerAccountId: string): Promise<void> {
    await this.runDirectoryPetMutation(petId, async () => {
      if (await this.isObservedPetTombstoned(petId)) return;
      await this.db.put(`projection:pet-owner:${petId}`, ownerAccountId);
    });
  }

  async deleteObservedPetOwner(petId: string): Promise<void> {
    await this.runDirectoryPetMutation(petId, () => this.db.batch()
      .del(`directory:pet:${petId}`)
      .del(`projection:pet-owner:${petId}`)
      .put(`projection:pet-tombstone:${petId}`, true)
      .write());
  }

  async isObservedPetTombstoned(petId: string): Promise<boolean> {
    return await this.get<boolean>(`projection:pet-tombstone:${petId}`) === true;
  }

  async getObservedPetOwner(petId: string): Promise<string | null> {
    return this.get<string>(`projection:pet-owner:${petId}`);
  }

  async listObservedPetOwners(): Promise<Array<{ petId: string; ownerAccountId: string }>> {
    const owners: Array<{ petId: string; ownerAccountId: string }> = [];
    for await (const [key, value] of this.db.iterator({ gte: "projection:pet-owner:", lt: "projection:pet-owner;" })) {
      owners.push({ petId: key.slice("projection:pet-owner:".length), ownerAccountId: value as string });
    }
    return owners;
  }

  async putObservedGrant(grant: PetAccessGrant): Promise<void> {
    await this.db.put(`projection:grant:${grant.grantId}`, grant);
  }

  async listObservedGrants(): Promise<PetAccessGrant[]> {
    const grants: PetAccessGrant[] = [];
    for await (const [, value] of this.db.iterator({ gte: "projection:grant:", lt: "projection:grant;" })) {
      grants.push(value as PetAccessGrant);
    }
    return grants;
  }

  async putObservedAccessRequest(request: PetAccessRequest): Promise<void> {
    await this.db.put(`projection:grant-request:${request.requestId}`, request);
  }

  async listObservedAccessRequests(): Promise<PetAccessRequest[]> {
    const requests: PetAccessRequest[] = [];
    for await (const [, value] of this.db.iterator({ gte: "projection:grant-request:", lt: "projection:grant-request;" })) {
      requests.push(value as PetAccessRequest);
    }
    return requests;
  }
}
