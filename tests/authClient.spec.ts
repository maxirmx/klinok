// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshotDto } from "@klinok/contracts";
import { AuthClient, AuthClientError } from "../src/repositories/authClient";

afterEach(() => vi.unstubAllGlobals());

describe("v3 API client", () => {
  const snapshot = (revision: number): AppSnapshotDto => ({
    revision,
    role: "owner",
    control: {
      profile: null,
      profiles: [],
      roles: [],
      allRoles: [],
      pendingQueue: [],
      notifications: [],
      roleAudit: [],
      ledger: { valid: true, height: revision, headHash: "a".repeat(64), verifiedAt: "2026-08-10T00:00:00.000Z" },
    },
    medical: { pets: [], grants: [], accessRequests: [], records: [], confirmations: [], confirmedRecordIds: [] },
  });

  it("uses same-origin credentials and forwards the session CSRF token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: true, accountId: "a1", csrfToken: "csrf" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ loggedOut: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new AuthClient();
    await client.session();
    await client.logout();
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ credentials: "include" });
    expect((fetchMock.mock.calls[1]![1].headers as Headers).get("X-CSRF-Token")).toBe("csrf");
  });

  it("maps stable API error codes to typed errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "LOGIN_FAILED" } }), { status: 401 })));
    await expect(new AuthClient().login("a@b.ru", "password", "device-1", "Ноутбук"))
      .rejects.toMatchObject<AuthClientError>({ code: "LOGIN_FAILED", status: 401 });
  });

  it("encodes directory search and pagination parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], page: 1, pageSize: 50, total: 0, pageCount: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new AuthClient();
    await client.searchDirectoryPets("Иванов Иван", "Барс", 1, 50);
    await client.searchUsers("Иван", true, 2, 10, "owner", "desc");
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/directory/pets?owner=%D0%98%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2+%D0%98%D0%B2%D0%B0%D0%BD&pet=%D0%91%D0%B0%D1%80%D1%81&page=1&pageSize=50&sort=owner&direction=asc");
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/directory/users?query=%D0%98%D0%B2%D0%B0%D0%BD&pendingOnly=true&page=2&pageSize=10&sort=owner&direction=desc");
  });

  it("edits a directory profile through an encoded CSRF-protected PATCH", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: true, csrfToken: "csrf" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ operationId: "profile-operation", profile: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new AuthClient();
    await client.session();
    await client.updateDirectoryUserProfile("user/1", { firstName: "Анна", lastName: "Иванова" });
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/directory/users/user%2F1/profile");
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ method: "PATCH", credentials: "include" });
    expect((fetchMock.mock.calls[1]![1].headers as Headers).get("X-CSRF-Token")).toBe("csrf");
  });

  it("sends commands in one sequential batch with CSRF protection", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: true, csrfToken: "csrf" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ operationId: "op-1", status: "applied" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new AuthClient();
    await client.session();
    await client.execute([{
      operationId: "op-1", type: "pet.create", activeRole: "owner", entityId: "pet-1",
      createdAt: "2026-08-10T00:00:00.000Z", payload: { input: { name: "Барс", species: "Кошка" } },
    }]);
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/commands");
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body as string).commands[0].operationId).toBe("op-1");
    expect((fetchMock.mock.calls[1]![1].headers as Headers).get("X-CSRF-Token")).toBe("csrf");
  });

  it("revokes named sessions without key material", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: true, csrfToken: "csrf" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ revoked: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new AuthClient();
    await client.session();
    await client.revokeDevice("old/device");
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/auth/devices/old%2Fdevice");
    expect(fetchMock.mock.calls[1]![1].body).toBeUndefined();
  });

  it("wraps network failures for regular and snapshot requests", async () => {
    const failure = new Error("offline");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(failure));

    await expect(new AuthClient().register({
      firstName: "Анна",
      lastName: "Иванова",
      email: "anna@example.ru",
      password: "password",
      ageConfirmed: true,
      personalDataConsentVersion: "v1",
      userAgreementVersion: "v1",
      requestedRoles: ["owner"],
    })).rejects.toMatchObject<AuthClientError>({ code: "NETWORK_UNAVAILABLE", status: 0, cause: failure });
    await expect(new AuthClient().state("owner"))
      .rejects.toMatchObject<AuthClientError>({ code: "NETWORK_UNAVAILABLE", status: 0, cause: failure });
  });

  it("caches role snapshots by ETag and maps snapshot API errors", async () => {
    const owner = snapshot(3);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(owner), { status: 200, headers: { ETag: '"owner-3"' } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "ROLE_REQUIRED" } }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new AuthClient("/backend");

    await expect(client.state("owner")).resolves.toEqual(owner);
    await expect(client.state("owner")).resolves.toEqual(owner);
    expect((fetchMock.mock.calls[1]![1].headers as Headers).get("If-None-Match")).toBe('"owner-3"');
    await expect(client.state("doctor")).rejects.toMatchObject<AuthClientError>({ code: "ROLE_REQUIRED", status: 403 });
  });

  it("covers the complete authentication and directory request surface", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/auth/login")) {
        return new Response(JSON.stringify({ authenticated: true, accountId: "account-1", csrfToken: "csrf" }), { status: 200 });
      }
      if (url.endsWith("/api/auth/credentials")) {
        return new Response(JSON.stringify({ updated: true, email: "new@example.ru" }), { status: 200 });
      }
      return new Response(JSON.stringify({ accepted: true, verified: true, loggedOut: true, reset: true, items: [], profiles: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new AuthClient("/backend");
    client.setCsrfToken(undefined);

    await client.register({
      firstName: "Анна", lastName: "Иванова", email: "anna@example.ru", password: "password",
      ageConfirmed: true, personalDataConsentVersion: "v1", userAgreementVersion: "v1", requestedRoles: ["owner"],
    });
    await client.verifyEmail("verification/token");
    await client.login("anna@example.ru", "password", "device-1", "Ноутбук");
    await client.logoutAll();
    await client.forgotPassword("anna@example.ru");
    await client.resetPassword("reset/token", "new-password");
    await client.updateProfile({ firstName: "Анна", lastName: "Иванова", expectedRevision: 1 });
    await expect(client.updateCredentials({ email: "new@example.ru" })).resolves.toMatchObject({ email: "new@example.ru" });
    await client.deleteAccount();
    await client.searchDoctors("Анна", 2, 10, "name");
    await client.lookupDirectoryProfiles(["account-1"]);
    await client.lookupDirectoryPet("pet/1");
    await client.getMyDirectoryPets("Барс", 2, 10, "pet", "desc");
    await client.getMyPetAccesses("Барс", "granted", 2, 10, "pet", "desc");

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(expect.arrayContaining([
      "/backend/api/auth/register",
      "/backend/api/auth/verify-email",
      "/backend/api/auth/login",
      "/backend/api/auth/logout-all",
      "/backend/api/auth/password/forgot",
      "/backend/api/auth/password/reset",
      "/backend/api/auth/profile",
      "/backend/api/auth/credentials",
      "/backend/api/auth/account",
      "/backend/api/directory/doctors?query=%D0%90%D0%BD%D0%BD%D0%B0&page=2&pageSize=10&sort=name",
      "/backend/api/directory/profiles/lookup",
      "/backend/api/directory/pets/pet%2F1",
      "/backend/api/directory/my-pets?query=%D0%91%D0%B0%D1%80%D1%81&page=2&pageSize=10&sort=pet&direction=desc",
      "/backend/api/directory/my-pet-accesses?query=%D0%91%D0%B0%D1%80%D1%81&status=granted&page=2&pageSize=10&sort=pet&direction=desc",
    ]));
  });
});
