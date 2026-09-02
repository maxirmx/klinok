// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { WHAT_HAPPENED_TAXONOMY_IDS } from "@klinok/contracts";
import { Database } from "./db.js";

function migrationClient(applied: readonly string[] = []) {
  return {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql === "SELECT 1 FROM schema_migrations WHERE version = $1") {
        return { rows: [], rowCount: applied.includes(String(values?.[0])) ? 1 : 0 };
      }
      if (sql.includes("CREATE TABLE accounts")) return [{ rows: [], rowCount: 0 }];
      if (sql.includes("WITH catalog(id, sort_order)")) {
        return { rows: [{ scanned_records: "3", changed_records: "2", partially_cleaned_records: "1" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
}

describe("PostgreSQL migrations", () => {
  it("defines ownership transfers with one pending request per pet and indexed party queues", async () => {
    const sql = await readFile(new URL("../migrations/003_pet_ownership_transfers.sql", import.meta.url), "utf8");

    expect(sql).toContain("CREATE TABLE pet_ownership_transfers");
    expect(sql).toContain("CHECK (from_owner_account_id <> to_owner_account_id)");
    expect(sql).toContain("initiated_by_account_id IN (from_owner_account_id, to_owner_account_id)");
    expect(sql).toContain("pet_ownership_transfers_one_pending_idx");
    expect(sql).toContain("WHERE status = 'pending'");
    expect(sql).toContain("pet_ownership_transfers_from_owner_pending_idx");
    expect(sql).toContain("pet_ownership_transfers_to_owner_pending_idx");
  });

  it("keeps the database catalogue migration synchronized with the shared catalogue", async () => {
    const sql = await readFile(new URL("../migrations/002_what_happened_catalog.sql", import.meta.url), "utf8");
    const array = /FROM unnest\(ARRAY\[([\s\S]*?)\]::text\[\]\)/.exec(sql)?.[1] ?? "";
    const ids = [...array.matchAll(/'([^']+)'/g)].map((match) => match[1]);

    expect(ids).toEqual(WHAT_HAPPENED_TAXONOMY_IDS);
    expect(sql).toContain("WHEN old_id.value = 'problem.eyes.11' THEN 'problem.eyes.10'");
    expect(sql).toContain("WHERE old_id.value = 'problem.eyes.1'");
    expect(sql).not.toContain("UPDATE audit_blocks");
  });

  it("applies every missing migration in order and records each version", async () => {
    const client = migrationClient();
    const database = new Database("postgres://unused");
    Object.defineProperty(database, "pool", { value: { connect: vi.fn().mockResolvedValue(client) } });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await database.migrate();

    const calls = client.query.mock.calls;
    expect(calls.filter(([sql]) => sql === "BEGIN")).toHaveLength(3);
    expect(calls.filter(([sql]) => sql === "COMMIT")).toHaveLength(3);
    expect(calls.filter(([sql]) => sql === "INSERT INTO schema_migrations(version) VALUES ($1)")
      .map(([, values]) => values)).toEqual([["001_initial"], ["002_what_happened_catalog"], ["003_pet_ownership_transfers"]]);
    expect(calls.find(([sql]) => String(sql).includes("WITH catalog(id, sort_order)"))).toBeDefined();
    expect(info).toHaveBeenCalledWith(
      'Migration 002_what_happened_catalog: {"scanned_records":"3","changed_records":"2","partially_cleaned_records":"1"}',
    );
    info.mockRestore();
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("skips migrations that are already registered", async () => {
    const client = migrationClient(["001_initial", "002_what_happened_catalog", "003_pet_ownership_transfers"]);
    const database = new Database("postgres://unused");
    Object.defineProperty(database, "pool", { value: { connect: vi.fn().mockResolvedValue(client) } });

    await database.migrate();

    expect(client.query).not.toHaveBeenCalledWith("BEGIN");
    expect(client.query).not.toHaveBeenCalledWith("INSERT INTO schema_migrations(version) VALUES ($1)", expect.anything());
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back a failed migration and does not record it", async () => {
    const client = migrationClient(["001_initial"]);
    client.query.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql === "SELECT 1 FROM schema_migrations WHERE version = $1") {
        return { rows: [], rowCount: values?.[0] === "001_initial" ? 1 : 0 };
      }
      if (sql.includes("WITH catalog(id, sort_order)")) throw new Error("migration failed");
      return { rows: [], rowCount: 0 };
    });
    const database = new Database("postgres://unused");
    Object.defineProperty(database, "pool", { value: { connect: vi.fn().mockResolvedValue(client) } });

    await expect(database.migrate()).rejects.toThrow("migration failed");

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.query).not.toHaveBeenCalledWith(
      "INSERT INTO schema_migrations(version) VALUES ($1)",
      ["002_what_happened_catalog"],
    );
    expect(client.release).toHaveBeenCalledOnce();
  });
});

describe("PostgreSQL transactions", () => {
  it("commits successful work and releases the client", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }), release: vi.fn() };
    const database = new Database("postgres://unused");
    Object.defineProperty(database, "pool", { value: { connect: vi.fn().mockResolvedValue(client) } });

    await expect(database.transaction(async (transaction) => {
      await transaction.query("SELECT mutation()");
      return "done";
    })).resolves.toBe("done");
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "SELECT mutation()", "COMMIT"]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back failed work and releases the client", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }), release: vi.fn() };
    const database = new Database("postgres://unused");
    Object.defineProperty(database, "pool", { value: { connect: vi.fn().mockResolvedValue(client) } });

    await expect(database.transaction(async () => { throw new Error("mutation failed"); })).rejects.toThrow("mutation failed");
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "ROLLBACK"]);
    expect(client.release).toHaveBeenCalledOnce();
  });
});
