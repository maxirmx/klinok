// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it, vi } from "vitest";
import { CommandService } from "./commands.js";
import { Ledger } from "./ledger.js";

describe("command boundary", () => {
  it("rejects every mutation while startup ledger verification is invalid", async () => {
    const ledger = new Ledger();
    await ledger.verify({ query: vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ height: "1", block_hash: "bad" }], rowCount: 1 }) });
    const database = { transaction: vi.fn() };
    const service = new CommandService(database as never, ledger);

    await expect(service.execute({ accountId: "owner-1" }, {
      operationId: "op-1", type: "pet.create", activeRole: "owner", entityId: "pet-1",
      createdAt: "2026-08-10T00:00:00.000Z", payload: {},
    })).resolves.toMatchObject({ status: "rejected", error: { code: "LEDGER_INVALID" } });
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it("returns a stored result for an idempotent replay without appending another block", async () => {
    const client = { query: vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [], rowCount: 1 };
      if (sql.startsWith("SELECT actor_account_id")) return {
        rows: [{ actor_account_id: "owner-1", command_type: "pet.create", result: { operationId: "op-1", status: "applied", revision: 1 } }],
        rowCount: 1,
      };
      throw new Error(`Unexpected SQL: ${sql}`);
    }) };
    const database = { transaction: vi.fn(async (work: (value: typeof client) => Promise<unknown>) => work(client)) };
    const service = new CommandService(database as never, new Ledger());
    const command = { operationId: "op-1", type: "pet.create" as const, activeRole: "owner" as const, entityId: "pet-1", createdAt: "2026-08-10T00:00:00.000Z", payload: {} };

    await expect(service.execute({ accountId: "owner-1" }, command)).resolves.toMatchObject({ operationId: "op-1", status: "duplicate", revision: 1 });
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it("rejects reuse of an operation identifier by a different command", async () => {
    const client = { query: vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [], rowCount: 1 };
      return { rows: [{ actor_account_id: "owner-1", command_type: "pet.update", result: {} }], rowCount: 1 };
    }) };
    const database = { transaction: vi.fn(async (work: (value: typeof client) => Promise<unknown>) => work(client)) };
    const service = new CommandService(database as never, new Ledger());

    await expect(service.execute({ accountId: "owner-1" }, {
      operationId: "op-1", type: "pet.create", activeRole: "owner", entityId: "pet-1",
      createdAt: "2026-08-10T00:00:00.000Z", payload: {},
    })).resolves.toMatchObject({ status: "rejected", error: { code: "OPERATION_ID_REUSED" } });
  });
});
