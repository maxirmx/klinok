// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthClient, AuthClientError } from "../src/repositories/authClient";

afterEach(() => vi.unstubAllGlobals());

describe("v3 API client", () => {
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
});
