// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it, vi } from "vitest";
import { buildApi, enqueuePendingRoleRequestEmails } from "../src/app.js";
import type { Database } from "../src/db.js";
import { Ledger } from "../src/ledger.js";

describe("API rate limiting", () => {
  it("applies the global limit and returns a structured 429 response", async () => {
    const zeroHash = "0".repeat(64);
    const pool = { query: vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM audit_blocks")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("SELECT height, block_hash FROM ledger_head")) {
        return { rows: [{ height: "0", block_hash: zeroHash }], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }) };
    const database = {
      migrate: vi.fn().mockResolvedValue(undefined),
      pool,
    } as unknown as Database;
    const app = await buildApi({
      host: "127.0.0.1",
      port: 8090,
      databaseUrl: "postgres://unused",
      publicOrigin: "http://localhost:8080",
      cookieSecure: false,
      enforceOrigin: true,
      trustProxy: false,
      sessionDays: 30,
      bootstrapAccountId: "bootstrap-administrator",
      legal: { personalDataConsentVersion: "test", userAgreementVersion: "test" },
      smtp: { host: "127.0.0.1", port: 1025, secure: false, from: "test@example.invalid" },
    }, { db: database, ledger: new Ledger() });
    app.log.level = "silent";

    try {
      let response;
      for (let request = 0; request <= 300; request += 1) {
        response = await app.inject({ method: "GET", url: "/healthz", remoteAddress: "192.0.2.1" });
      }

      expect(response?.statusCode).toBe(429);
      expect(response?.headers["retry-after"]).toBe("60");
      expect(response?.json()).toEqual({
        error: { code: "RATE_LIMITED", message: "Rate limit exceeded, retry in 1 minute." },
      });
    } finally {
      await app.close();
    }
  });
});

describe("registration role notifications", () => {
  it("queues the initial pending Doctor request for every active Administrator after verification", async () => {
    const query = vi.fn(async (sql: string, _params: unknown[] = []) => {
      void _params;
      if (sql.startsWith("SELECT r.role")) return {
        rows: [{ role: "doctor", first_name: "Алёна", last_name: "Врач", patronymic: null }], rowCount: 1,
      };
      if (sql.startsWith("SELECT a.email")) return {
        rows: [{ email: "admin-1@example.ru" }, { email: "admin-2@example.ru" }], rowCount: 2,
      };
      if (sql.startsWith("INSERT INTO email_outbox")) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    await enqueuePendingRoleRequestEmails({ query } as never, "doctor-1");

    const emails = query.mock.calls.filter(([sql]) => sql.startsWith("INSERT INTO email_outbox"));
    expect(emails.map(([, params]) => params?.slice(1))).toEqual([
      ["admin-1@example.ru", "Запрос роли в системе \"Клинок\"", "Пользователь Алёна Врач (doctor-1) запросил роль «Ветеринар»."],
      ["admin-2@example.ru", "Запрос роли в системе \"Клинок\"", "Пользователь Алёна Врач (doctor-1) запросил роль «Ветеринар»."],
    ]);
  });
});

describe("Owner transfer directory", () => {
  it("enforces the Owner role and returns only paged minimal identities without caching", async () => {
    let approved = true;
    const now = new Date("2026-09-02T10:00:00.000Z");
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("FROM sessions s JOIN accounts")) return { rows: [{
        session_id: "session-1", account_id: "owner-1", device_id: "device-1", device_name: "Browser",
        csrf_digest: "unused", expires_at: new Date("2027-09-02T10:00:00.000Z"), credential_status: "active",
      }], rowCount: 1 };
      if (sql.startsWith("SELECT p.* FROM profiles p JOIN roles")) return { rows: [{
        account_id: "owner-2", revision: 3, first_name: "Алёна", last_name: "Ёлкина", patronymic: null, updated_at: now,
        email: "must-not-leak@example.ru",
      }], rowCount: 1 };
      if (sql.startsWith("SELECT p.*,pr.revision AS owner_profile_revision")) {
        expect(params.slice(0, 5)).toEqual(["", "%%", "Еж", "%Еж%", "owner-2"]);
        expect(sql).toContain("owner_role.role='owner'");
        expect(sql).toContain("owner_role.status='approved'");
        expect(sql).toContain("NOT EXISTS (");
        expect(sql).toContain("FROM pet_ownership_transfers pending_transfer");
        return { rows: [{
          pet_id: "pet-1", owner_account_id: "owner-2", owner_profile_revision: 3, revision: 4,
          first_name: "Алёна", last_name: "Ёлкина", patronymic: null, species: "Кошка", name: "Ёжик", updated_at: now,
          breed: "must-not-leak", notes: "must-not-leak", photo_data_url: "data:must-not-leak",
        }], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const one = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.startsWith("SELECT 1 FROM roles")) return approved ? {} : null;
      if (sql.startsWith("SELECT count(*) FROM profiles")) {
        expect(sql).toContain("translate(concat_ws");
        expect(params).toEqual(["Алена", "%Алена%", "owner-1"]);
        return { count: "1" };
      }
      if (sql.startsWith("SELECT count(*) FROM pets")) {
        expect(sql).toContain("($5='' OR p.owner_account_id=$5)");
        expect(sql).toContain("($1<>'' OR $5<>'' OR p.pet_id=$3)");
        expect(sql).toContain("owner_role.role='owner'");
        expect(sql).toContain("owner_role.status='approved'");
        expect(sql).toContain("NOT EXISTS (");
        expect(sql).toContain("FROM pet_ownership_transfers pending_transfer");
        return { count: "1" };
      }
      throw new Error(`Unexpected one SQL: ${sql}`);
    });
    const database = { migrate: vi.fn(), pool: { query }, one } as unknown as Database;
    const ledger = {
      verify: vi.fn(), isValid: vi.fn(() => true), currentStatus: vi.fn(() => ({
        valid: true, height: 0, headHash: "0".repeat(64), verifiedAt: now.toISOString(),
      })),
    } as unknown as Ledger;
    const app = await buildApi({
      host: "127.0.0.1", port: 8090, databaseUrl: "postgres://unused", publicOrigin: "http://localhost:8080",
      cookieSecure: false, enforceOrigin: true, trustProxy: false, sessionDays: 30,
      bootstrapAccountId: "bootstrap-administrator", legal: { personalDataConsentVersion: "test", userAgreementVersion: "test" },
      smtp: { host: "127.0.0.1", port: 1025, secure: false, from: "test@example.invalid" },
    }, { db: database, ledger });
    app.log.level = "silent";

    try {
      const owners = await app.inject({
        method: "GET", url: "/api/directory/owners?query=%D0%90%D0%BB%D0%B5%D0%BD%D0%B0&page=2&pageSize=10",
        headers: { cookie: "klinok_session_v3=token" },
      });
      expect(owners.statusCode).toBe(200);
      expect(owners.headers["cache-control"]).toBe("no-store");
      expect(owners.json()).toEqual({
        items: [{ accountId: "owner-2", revision: 3, firstName: "Алёна", lastName: "Ёлкина", displayName: "Алёна Ёлкина", updatedAt: now.toISOString() }],
        total: 1, page: 2, pageSize: 10, pageCount: 1,
      });
      expect(JSON.stringify(owners.json())).not.toContain("email");

      const pets = await app.inject({
        method: "GET", url: "/api/directory/pets?owner=&pet=%D0%95%D0%B6&ownerAccountId=owner-2&page=1&pageSize=10&sort=pet&transferableOnly=true",
        headers: { cookie: "klinok_session_v3=token" },
      });
      expect(pets.statusCode).toBe(200);
      expect(pets.headers["cache-control"]).toBe("no-store");
      expect(pets.json().items).toEqual([{
        petId: "pet-1", ownerAccountId: "owner-2", ownerDisplayName: "Алёна Ёлкина", ownerProfileRevision: 3,
        revision: 4, species: "Кошка", name: "Ёжик", updatedAt: now.toISOString(),
      }]);
      expect(JSON.stringify(pets.json())).not.toMatch(/breed|notes|photo/i);

      approved = false;
      const forbidden = await app.inject({
        method: "GET", url: "/api/directory/owners?query=owner-2", headers: { cookie: "klinok_session_v3=token" },
      });
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json()).toMatchObject({ error: { code: "OWNER_ROLE_REQUIRED" } });
    } finally {
      await app.close();
    }
  });
});
