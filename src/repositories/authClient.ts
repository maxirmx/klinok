// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type {
  AppSnapshotDto,
  AuthErrorBody,
  AuthSessionDto,
  ClientCommand,
  CommandBatchResponse,
  DirectoryPageDto,
  DirectoryPetDto,
  DirectoryProfileDto,
  DirectoryUserDto,
  DoctorPetAccessDto,
  Role,
} from "@klinok/contracts";
import { authErrorText } from "../russianMessages";

export interface RegisterInput {
  firstName: string;
  lastName: string;
  patronymic?: string;
  email: string;
  password: string;
  ageConfirmed: boolean;
  personalDataConsentVersion: string;
  userAgreementVersion: string;
  requestedRoles: Role[];
}

export class AuthClientError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}

export class AuthClient {
  private csrfToken = "";
  private accountId = "";
  private readonly snapshots = new Map<Role, { etag: string; value: AppSnapshotDto }>();
  constructor(private readonly baseUrl = "") {}

  setCsrfToken(value: string | undefined): void { this.csrfToken = value ?? ""; }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body) headers.set("Content-Type", "application/json");
    if (this.csrfToken && init.method && init.method !== "GET") headers.set("X-CSRF-Token", this.csrfToken);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { ...init, headers, credentials: "include" });
    } catch (reason) {
      throw Object.assign(new AuthClientError("NETWORK_UNAVAILABLE", "Сервер недоступен.", 0), { cause: reason });
    }
    const body = response.status === 204 || response.status === 304
      ? undefined : await response.json().catch(() => undefined) as T | AuthErrorBody | undefined;
    if (!response.ok) {
      const apiError = body && typeof body === "object" && "error" in body ? (body as AuthErrorBody).error : undefined;
      const code = apiError?.code ?? "REQUEST_FAILED";
      throw new AuthClientError(code, authErrorText(code), response.status);
    }
    return body as T;
  }

  async session(): Promise<AuthSessionDto> {
    const session = await this.request<AuthSessionDto>("/api/auth/session");
    if ((session.accountId ?? "") !== this.accountId) this.snapshots.clear();
    this.accountId = session.accountId ?? "";
    this.setCsrfToken(session.csrfToken);
    return session;
  }

  register(input: RegisterInput) { return this.request<{ accepted: true }>("/api/auth/register", { method: "POST", body: JSON.stringify(input) }); }
  verifyEmail(token: string) { return this.request<{ verified: true }>("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }); }
  async login(email: string, password: string, deviceId: string, deviceName: string) {
    const result = await this.request<{ authenticated: true; accountId: string; csrfToken: string }>("/api/auth/login", {
      method: "POST", body: JSON.stringify({ email, password, deviceId, deviceName }),
    });
    if (this.accountId !== result.accountId) this.snapshots.clear();
    this.accountId = result.accountId;
    this.csrfToken = result.csrfToken;
    return result;
  }
  async logout() {
    try { return await this.request<{ loggedOut: true }>("/api/auth/logout", { method: "POST" }); }
    finally { this.accountId = ""; this.snapshots.clear(); }
  }
  async logoutAll() { const result = await this.request<{ loggedOut: true }>("/api/auth/logout-all", { method: "POST" }); this.accountId = ""; this.snapshots.clear(); return result; }
  forgotPassword(email: string) { return this.request<{ accepted: true }>("/api/auth/password/forgot", { method: "POST", body: JSON.stringify({ email }) }); }
  resetPassword(token: string, password: string) { return this.request<{ reset: true }>("/api/auth/password/reset", { method: "POST", body: JSON.stringify({ token, password }) }); }
  updateProfile(profile: Pick<DirectoryProfileDto, "firstName" | "lastName" | "patronymic"> & { expectedRevision: number }) {
    return this.request<{ operationId: string; profile: DirectoryProfileDto }>("/api/auth/profile", { method: "PATCH", body: JSON.stringify(profile) });
  }
  updateCredentials(input: { email?: string; password?: string }) {
    return this.request<{ updated: true; email: string }>("/api/auth/credentials", { method: "PATCH", body: JSON.stringify(input) });
  }
  deleteAccount() { return this.request<{ operationId: string }>("/api/auth/account", { method: "DELETE" }); }
  renameDevice(id: string, deviceName: string) {
    return this.request<{ operationId: string; deviceId: string; deviceName: string }>(`/api/auth/devices/${encodeURIComponent(id)}`, {
      method: "PATCH", body: JSON.stringify({ deviceName }),
    });
  }
  revokeDevice(id: string) { return this.request<{ revoked: true }>(`/api/auth/devices/${encodeURIComponent(id)}`, { method: "DELETE" }); }

  async state(role: Role): Promise<AppSnapshotDto> {
    const cached = this.snapshots.get(role);
    const headers = new Headers();
    if (cached?.etag) headers.set("If-None-Match", cached.etag);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/state?role=${encodeURIComponent(role)}`, { headers, credentials: "include" });
    } catch (reason) {
      throw Object.assign(new AuthClientError("NETWORK_UNAVAILABLE", "Сервер недоступен.", 0), { cause: reason });
    }
    if (response.status === 304 && cached) return cached.value;
    const payload = await response.json().catch(() => undefined) as AppSnapshotDto | AuthErrorBody | undefined;
    if (!response.ok) {
      const apiError = payload && typeof payload === "object" && "error" in payload ? (payload as AuthErrorBody).error : undefined;
      const code = apiError?.code ?? "REQUEST_FAILED";
      throw new AuthClientError(code, authErrorText(code), response.status);
    }
    const value = payload as AppSnapshotDto;
    const latest = this.snapshots.get(role);
    if (latest && value.revision < latest.value.revision) return latest.value;
    this.snapshots.set(role, { etag: response.headers.get("ETag") ?? "", value });
    return value;
  }
  execute(commands: ClientCommand[]) {
    return this.request<CommandBatchResponse>("/api/commands", { method: "POST", body: JSON.stringify({ commands }) });
  }

  searchDoctors(query = "", page = 1, pageSize = 20, sort = "name") {
    const params = new URLSearchParams({ query, page: String(page), pageSize: String(pageSize), sort });
    return this.request<DirectoryPageDto<DirectoryProfileDto>>(`/api/directory/doctors?${params}`);
  }
  searchOwners(query = "", page = 1, pageSize = 20) {
    const params = new URLSearchParams({ query, page: String(page), pageSize: String(pageSize) });
    return this.request<DirectoryPageDto<DirectoryProfileDto>>(`/api/directory/owners?${params}`);
  }
  searchUsers(query = "", pendingOnly = false, page = 1, pageSize = 20, sort = "name", direction = "asc") {
    const params = new URLSearchParams({ query, pendingOnly: String(pendingOnly), page: String(page), pageSize: String(pageSize), sort, direction });
    return this.request<DirectoryPageDto<DirectoryUserDto>>(`/api/directory/users?${params}`);
  }
  lookupDirectoryProfiles(accountIds: string[]) {
    return this.request<{ profiles: DirectoryProfileDto[] }>("/api/directory/profiles/lookup", { method: "POST", body: JSON.stringify({ accountIds }) });
  }
  updateDirectoryUserProfile(accountId: string, profile: Pick<DirectoryProfileDto, "firstName" | "lastName" | "patronymic"> & { expectedRevision: number }) {
    return this.request<{ operationId: string; profile: DirectoryProfileDto }>(`/api/directory/users/${encodeURIComponent(accountId)}/profile`, {
      method: "PATCH", body: JSON.stringify(profile),
    });
  }
  lookupDirectoryPet(petId: string) { return this.request<DirectoryPetDto>(`/api/directory/pets/${encodeURIComponent(petId)}`); }
  searchDirectoryPets(owner = "", pet = "", page = 1, pageSize = 20, sort = "owner", ownerAccountId = "", transferableOnly = false) {
    const params = new URLSearchParams({ owner, pet, page: String(page), pageSize: String(pageSize), sort, direction: "asc" });
    if (ownerAccountId) params.set("ownerAccountId", ownerAccountId);
    if (transferableOnly) params.set("transferableOnly", "true");
    return this.request<DirectoryPageDto<DirectoryPetDto>>(`/api/directory/pets?${params}`);
  }
  getMyDirectoryPets(query = "", page = 1, pageSize = 20, sort = "owner", direction = "asc") {
    const params = new URLSearchParams({ query, page: String(page), pageSize: String(pageSize), sort, direction });
    return this.request<DirectoryPageDto<DirectoryPetDto>>(`/api/directory/my-pets?${params}`);
  }
  getMyPetAccesses(query = "", status: DoctorPetAccessDto["status"] | "all" = "all", page = 1, pageSize = 20, sort = "owner", direction = "asc") {
    const params = new URLSearchParams({ query, status, page: String(page), pageSize: String(pageSize), sort, direction });
    return this.request<DirectoryPageDto<DoctorPetAccessDto>>(`/api/directory/my-pet-accesses?${params}`);
  }
}
