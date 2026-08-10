// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it } from "vitest";
import type { DbClient } from "./db.js";
import { Ledger } from "./ledger.js";

type StoredBlock = Record<string, unknown> & { height: string; block_hash: string; previous_hash: string };

class LedgerClient {
  head = { height: "0", block_hash: "0".repeat(64) };
  blocks: StoredBlock[] = [];

  readonly query: DbClient["query"] = (async (sql: string, values: unknown[] = []) => {
    if (sql.startsWith("SELECT height, block_hash FROM ledger_head")) return { rows: [{ ...this.head }], rowCount: 1 };
    if (sql.startsWith("SELECT * FROM audit_blocks")) return { rows: this.blocks.map((block) => ({ ...block })), rowCount: this.blocks.length };
    if (sql.startsWith("INSERT INTO audit_blocks")) {
      const [height, ledgerVersion, operationId, action, actorAccountId, activeRole, aggregateType, aggregateId,
        relatedAccountId, metadata, beforeState, afterState, beforeStateHash, afterStateHash, createdAt,
        previousHash, blockHash] = values;
      this.blocks.push({
        height: String(height), ledger_version: ledgerVersion, operation_id: operationId, action,
        actor_account_id: actorAccountId, active_role: activeRole, aggregate_type: aggregateType,
        aggregate_id: aggregateId, related_account_id: relatedAccountId, metadata: JSON.parse(String(metadata)),
        before_state: JSON.parse(String(beforeState)), after_state: JSON.parse(String(afterState)),
        before_state_hash: beforeStateHash, after_state_hash: afterStateHash, created_at: new Date(String(createdAt)),
        previous_hash: String(previousHash), block_hash: String(blockHash),
      });
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("UPDATE ledger_head")) {
      this.head = { height: String(values[0]), block_hash: String(values[1]) };
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }) as DbClient["query"];
}

describe("hash-chained ledger", () => {
  it("appends deterministic linked blocks and verifies the head", async () => {
    const client = new LedgerClient();
    const ledger = new Ledger();
    expect((await ledger.verify(client)).valid).toBe(true);

    const first = await ledger.append(client, {
      operationId: "op-1", action: "pet.created", actorAccountId: "owner-1", activeRole: "owner",
      aggregateType: "pet", aggregateId: "pet-1", metadata: { petId: "pet-1" }, afterState: { revision: 1 },
      createdAt: "2026-08-10T00:00:00.000Z",
    });
    ledger.noteCommitted(first.height, first.blockHash);
    const second = await ledger.append(client, {
      operationId: "op-2", action: "pet.updated", actorAccountId: "owner-1", activeRole: "owner",
      aggregateType: "pet", aggregateId: "pet-1", beforeState: { revision: 1 }, afterState: { revision: 2 },
      createdAt: "2026-08-10T00:01:00.000Z",
    });
    ledger.noteCommitted(second.height, second.blockHash);

    expect(client.blocks[1]!.previous_hash).toBe(first.blockHash);
    expect(client.blocks[0]!.before_state).toBeNull();
    expect(client.blocks[0]!.after_state).toEqual({ revision: 1 });
    expect(client.blocks[1]!.before_state).toEqual({ revision: 1 });
    expect(client.blocks[1]!.after_state).toEqual({ revision: 2 });
    expect(ledger.currentStatus()).toMatchObject({ valid: true, height: 2, headHash: second.blockHash });
    expect(await new Ledger().verify(client)).toMatchObject({ valid: true, height: 2, headHash: second.blockHash });
  });

  it("detects altered stored state snapshots", async () => {
    const client = new LedgerClient();
    const ledger = new Ledger();
    await ledger.verify(client);
    await ledger.append(client, {
      operationId: "op-1", action: "record.created", actorAccountId: "doctor-1", activeRole: "doctor",
      aggregateType: "medicalRecord", aggregateId: "record-1",
      afterState: { status: "unconfirmed", record: { revision: 1, sections: { diagnosis: { value: { text: "Initial" } } } } },
      createdAt: "2026-08-10T00:00:00.000Z",
    });

    const afterState = client.blocks[0]!.after_state as { record: { sections: { diagnosis: { value: { text: string } } } } };
    afterState.record.sections.diagnosis.value.text = "Altered";

    expect(await new Ledger().verify(client)).toMatchObject({ valid: false, height: 0 });
  });

  it("detects altered blocks and keeps uncommitted appends out of runtime status", async () => {
    const client = new LedgerClient();
    const ledger = new Ledger();
    await ledger.verify(client);
    await ledger.append(client, {
      operationId: "op-1", action: "role.approved", actorAccountId: "admin-1", activeRole: "administrator",
      aggregateType: "role", aggregateId: "role-1", createdAt: "2026-08-10T00:00:00.000Z",
    });
    expect(ledger.currentStatus().height).toBe(0);
    client.blocks[0]!.action = "role.revoked";
    expect(await ledger.verify(client)).toMatchObject({ valid: false, height: 0 });
  });

  it("keeps a valid sequence when transaction callers append concurrently", async () => {
    const client = new LedgerClient();
    const ledger = new Ledger();
    await ledger.verify(client);
    let transactionTail = Promise.resolve();
    const appendInTransaction = (operationId: string) => {
      const result = transactionTail.then(() => ledger.append(client, {
        operationId, action: "pet.updated", actorAccountId: "owner-1", activeRole: "owner",
        aggregateType: "pet", aggregateId: operationId, createdAt: `2026-08-10T00:00:0${operationId.slice(-1)}.000Z`,
      }));
      transactionTail = result.then(() => undefined);
      return result;
    };

    const blocks = await Promise.all([appendInTransaction("op-1"), appendInTransaction("op-2"), appendInTransaction("op-3")]);
    for (const block of blocks) ledger.noteCommitted(block.height, block.blockHash);
    expect(blocks.map((block) => block.height)).toEqual([1, 2, 3]);
    expect(await new Ledger().verify(client)).toMatchObject({ valid: true, height: 3, headHash: blocks[2]!.blockHash });
  });
});
