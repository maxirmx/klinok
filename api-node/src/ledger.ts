// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type { LedgerStatusDto, Role } from "@klinok/contracts";
import type { DbClient } from "./db.js";
import { sha256, stableSerialize } from "./stable.js";

const ZERO_HASH = "0".repeat(64);

export interface AuditInput {
  operationId: string;
  action: string;
  actorAccountId: string;
  activeRole?: Role;
  aggregateType: string;
  aggregateId: string;
  relatedAccountId?: string;
  metadata?: Record<string, unknown>;
  beforeState?: unknown;
  afterState?: unknown;
  createdAt?: string;
}

interface AuditRow {
  height: string;
  ledger_version: number;
  operation_id: string;
  action: string;
  actor_account_id: string;
  active_role: Role | null;
  aggregate_type: string;
  aggregate_id: string;
  related_account_id: string | null;
  metadata: Record<string, unknown>;
  before_state: unknown;
  after_state: unknown;
  before_state_hash: string;
  after_state_hash: string;
  created_at: Date;
  previous_hash: string;
  block_hash: string;
}

function blockValue(row: Omit<AuditRow, "block_hash">): Record<string, unknown> {
  return {
    ledgerVersion: row.ledger_version,
    height: Number(row.height),
    operationId: row.operation_id,
    action: row.action,
    actorAccountId: row.actor_account_id,
    ...(row.active_role ? { activeRole: row.active_role } : {}),
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    ...(row.related_account_id ? { relatedAccountId: row.related_account_id } : {}),
    metadata: row.metadata,
    beforeStateHash: row.before_state_hash,
    afterStateHash: row.after_state_hash,
    createdAt: row.created_at.toISOString(),
    previousHash: row.previous_hash,
  };
}

export class Ledger {
  private status: LedgerStatusDto = { valid: true, height: 0, headHash: ZERO_HASH, verifiedAt: new Date(0).toISOString() };

  currentStatus(): LedgerStatusDto { return { ...this.status }; }
  isValid(): boolean { return this.status.valid; }
  noteCommitted(height: number, blockHash: string): void {
    if (height < this.status.height) return;
    this.status = { valid: true, height, headHash: blockHash, verifiedAt: new Date().toISOString() };
  }

  async append(client: DbClient, input: AuditInput): Promise<{ height: number; blockHash: string }> {
    const headResult = await client.query<{ height: string; block_hash: string }>(
      "SELECT height, block_hash FROM ledger_head WHERE singleton = true FOR UPDATE",
    );
    const head = headResult.rows[0];
    if (!head) throw new Error("Ledger head is missing.");
    const height = Number(head.height) + 1;
    const createdAt = new Date(input.createdAt ?? new Date().toISOString());
    const beforeStateJson = stableSerialize(input.beforeState ?? null);
    const afterStateJson = stableSerialize(input.afterState ?? null);
    const row: Omit<AuditRow, "block_hash"> = {
      height: String(height),
      ledger_version: 1,
      operation_id: input.operationId,
      action: input.action,
      actor_account_id: input.actorAccountId,
      active_role: input.activeRole ?? null,
      aggregate_type: input.aggregateType,
      aggregate_id: input.aggregateId,
      related_account_id: input.relatedAccountId ?? null,
      metadata: input.metadata ?? {},
      before_state: JSON.parse(beforeStateJson) as unknown,
      after_state: JSON.parse(afterStateJson) as unknown,
      before_state_hash: sha256(beforeStateJson),
      after_state_hash: sha256(afterStateJson),
      created_at: createdAt,
      previous_hash: head.block_hash,
    };
    const blockHash = sha256(stableSerialize(blockValue(row)));
    await client.query(
      `INSERT INTO audit_blocks(
        height, ledger_version, operation_id, action, actor_account_id, active_role,
        aggregate_type, aggregate_id, related_account_id, metadata, before_state, after_state,
        before_state_hash, after_state_hash, created_at, previous_hash, block_hash
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17)`,
      [height, row.ledger_version, row.operation_id, row.action, row.actor_account_id, row.active_role,
        row.aggregate_type, row.aggregate_id, row.related_account_id, JSON.stringify(row.metadata),
        beforeStateJson, afterStateJson, row.before_state_hash, row.after_state_hash, createdAt,
        row.previous_hash, blockHash],
    );
    await client.query("UPDATE ledger_head SET height = $1, block_hash = $2 WHERE singleton = true", [height, blockHash]);
    return { height, blockHash };
  }

  async verify(client: DbClient): Promise<LedgerStatusDto> {
    const result = await client.query<AuditRow>("SELECT * FROM audit_blocks ORDER BY height ASC");
    let previousHash = ZERO_HASH;
    let expectedHeight = 1;
    let valid = true;
    for (const row of result.rows) {
      const normalized = {
        ...row,
        created_at: new Date(row.created_at),
        metadata: row.metadata ?? {},
        before_state: row.before_state ?? null,
        after_state: row.after_state ?? null,
      };
      const statesValid = normalized.before_state_hash === sha256(stableSerialize(normalized.before_state))
        && normalized.after_state_hash === sha256(stableSerialize(normalized.after_state));
      const hash = sha256(stableSerialize(blockValue(normalized)));
      if (!statesValid || Number(row.height) !== expectedHeight || row.previous_hash !== previousHash || row.block_hash !== hash) {
        valid = false;
        break;
      }
      previousHash = row.block_hash;
      expectedHeight += 1;
    }
    const headResult = await client.query<{ height: string; block_hash: string }>("SELECT height, block_hash FROM ledger_head WHERE singleton = true");
    const head = headResult.rows[0];
    const height = expectedHeight - 1;
    valid = valid && head !== undefined && Number(head.height) === height && head.block_hash === previousHash;
    this.status = { valid, height, headHash: previousHash, verifiedAt: new Date().toISOString() };
    return this.currentStatus();
  }
}
