// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it, vi } from "vitest";
import { Database } from "./db.js";

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
