// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type { AppSnapshotDto, AuditRoleEntryDto, Role } from "@klinok/contracts";
import type { PoolClient } from "pg";
import type { Database } from "./db.js";
import type { Ledger } from "./ledger.js";
import {
  accessRequestFromRow,
  confirmationFromRow,
  grantFromRow,
  petFromRow,
  profileFromRow,
  recordFromRow,
  roleFromRow,
  transferRequestFromRow,
  displayName,
} from "./rows.js";

function auditCategory(action: string): AuditRoleEntryDto["category"] | null {
  if (["role.requested", "role.resubmitted"].includes(action)) return "request";
  if (action === "role.approved") return "approve";
  if (action === "role.restored") return "restore";
  if (action === "role.rejected") return "reject";
  if (["role.cancelled", "role.revoked"].includes(action)) return "revoke";
  if (action === "account.bootstrap") return "bootstrap";
  return null;
}

function auditAction(action: string): string {
  return {
    "role.requested": "Роль запрошена",
    "role.resubmitted": "Роль запрошена повторно",
    "role.approved": "Роль одобрена",
    "role.restored": "Роль восстановлена",
    "role.rejected": "В запросе отказано",
    "role.cancelled": "Запрос отозван пользователем",
    "role.revoked": "Роль отозвана",
    "account.bootstrap": "Роль назначена при инициализации",
  }[action] ?? action;
}

export async function auditRows(client: PoolClient, limit = 1_000, offset = 0): Promise<AuditRoleEntryDto[]> {
  const result = await client.query<{
    height: string; block_hash: string; operation_id: string; created_at: Date; action: string;
    actor_account_id: string; related_account_id: string | null; aggregate_id: string; metadata: Record<string, unknown>;
  }>(`SELECT height, block_hash, operation_id, created_at, action, actor_account_id, related_account_id, aggregate_id, metadata
      FROM audit_blocks WHERE (action LIKE 'role.%' OR action='account.bootstrap')
      AND COALESCE(metadata->>'role','administrator') IN ('doctor','administrator')
      ORDER BY height DESC LIMIT $1 OFFSET $2`, [limit, offset]);
  return result.rows.flatMap((row) => {
    const category = auditCategory(row.action);
    const role = String(row.metadata.role ?? "administrator") as Role;
    if (!category || !["doctor", "administrator"].includes(role)) return [];
    return [{
      ledgerHeight: Number(row.height),
      blockHash: row.block_hash,
      operationId: row.operation_id,
      createdAt: new Date(row.created_at).toISOString(),
      category,
      action: auditAction(row.action),
      role,
      targetAccountId: row.related_account_id ?? row.aggregate_id,
      actorAccountId: row.actor_account_id,
      reason: String(row.metadata.reason ?? ""),
    }];
  });
}

export class SnapshotService {
  constructor(private readonly db: Database, private readonly ledger: Ledger) {}

  async load(accountId: string, role: Role): Promise<AppSnapshotDto> {
    return this.db.transaction(async (client) => {
      await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const roleCheck = await client.query("SELECT 1 FROM roles WHERE account_id=$1 AND role=$2 AND status='approved'", [accountId, role]);
      const roleApproved = Boolean(roleCheck.rowCount);

      const profileResult = await client.query("SELECT * FROM profiles WHERE account_id=$1", [accountId]);
      const ownRoles = await client.query("SELECT * FROM roles WHERE account_id=$1 ORDER BY role", [accountId]);
      const allRoles = roleApproved && role === "administrator"
        ? await client.query("SELECT * FROM roles ORDER BY requested_at, account_id, role")
        : ownRoles;

      let petRows: Record<string, unknown>[] = [];
      if (roleApproved && role === "owner") {
        petRows = (await client.query("SELECT * FROM pets WHERE owner_account_id=$1 AND deleted_at IS NULL ORDER BY updated_at DESC", [accountId])).rows;
      } else if (roleApproved && role === "doctor") {
        petRows = (await client.query(
          `SELECT DISTINCT p.* FROM pets p JOIN access_grants g ON g.pet_id=p.pet_id
           WHERE g.grantee_account_id=$1 AND g.status='active' AND p.deleted_at IS NULL ORDER BY p.updated_at DESC`,
          [accountId],
        )).rows;
      }
      const petIds = petRows.map((row) => String(row.pet_id));
      const grants = petIds.length
        ? (await client.query("SELECT * FROM access_grants WHERE pet_id = ANY($1::text[]) ORDER BY created_at", [petIds])).rows
        : [];
      const accessRequests = roleApproved && role === "owner"
        ? (await client.query("SELECT * FROM access_requests WHERE owner_account_id=$1 ORDER BY requested_at", [accountId])).rows
        : roleApproved && role === "doctor"
          ? (await client.query("SELECT * FROM access_requests WHERE requester_account_id=$1 ORDER BY requested_at", [accountId])).rows
          : [];
      const transferRequests = roleApproved && role === "owner"
        ? (await client.query(
          `SELECT t.*,p.name AS pet_name,p.species AS pet_species,
             concat_ws(' ',from_profile.first_name,from_profile.patronymic,from_profile.last_name) AS from_owner_display_name,
             concat_ws(' ',to_profile.first_name,to_profile.patronymic,to_profile.last_name) AS to_owner_display_name
           FROM pet_ownership_transfers t
           JOIN pets p ON p.pet_id=t.pet_id
           JOIN profiles from_profile ON from_profile.account_id=t.from_owner_account_id
           JOIN profiles to_profile ON to_profile.account_id=t.to_owner_account_id
           WHERE t.from_owner_account_id=$1 OR t.to_owner_account_id=$1
           ORDER BY t.created_at DESC,t.transfer_request_id`,
          [accountId],
        )).rows
        : [];
      const records = petIds.length
        ? (await client.query("SELECT * FROM medical_records WHERE pet_id = ANY($1::text[]) AND deleted_at IS NULL ORDER BY encounter_date DESC, updated_at DESC", [petIds])).rows
        : [];
      const confirmations = petIds.length
        ? (await client.query("SELECT * FROM medical_record_confirmations WHERE pet_id = ANY($1::text[]) ORDER BY confirmed_at", [petIds])).rows
        : [];

      const profileIds = new Set<string>([accountId]);
      for (const pet of petRows) profileIds.add(String(pet.owner_account_id));
      for (const grant of grants) {
        profileIds.add(String(grant.grantor_account_id));
        profileIds.add(String(grant.grantee_account_id));
      }
      for (const request of accessRequests) {
        profileIds.add(String(request.owner_account_id));
        profileIds.add(String(request.requester_account_id));
      }
      for (const request of transferRequests) {
        profileIds.add(String(request.from_owner_account_id));
        profileIds.add(String(request.to_owner_account_id));
      }
      if (role === "administrator") {
        for (const item of allRoles.rows) profileIds.add(String(item.account_id));
      }
      const profiles = (await client.query("SELECT * FROM profiles WHERE account_id = ANY($1::text[]) ORDER BY account_id", [[...profileIds]])).rows;
      const currentNames = new Map(profiles.map((profile) => [String(profile.account_id), displayName(profile)]));
      const ledger = this.ledger.currentStatus();
      const roleAudit = roleApproved && role === "administrator" ? await auditRows(client) : [];

      return {
        revision: ledger.height,
        role,
        control: {
          profile: profileResult.rows[0] ? profileFromRow(profileResult.rows[0]) : null,
          profiles: profiles.map(profileFromRow),
          roles: ownRoles.rows.map(roleFromRow),
          allRoles: allRoles.rows.map(roleFromRow),
          pendingQueue: allRoles.rows.filter((row) => row.status === "pending").map(roleFromRow),
          notifications: [],
          roleAudit,
          ledger,
        },
        medical: {
          pets: petRows.map(petFromRow),
          grants: grants.map((row) => {
            const grant = grantFromRow(row);
            return { ...grant, granteeDisplayName: currentNames.get(grant.granteeAccountId) ?? grant.granteeDisplayName };
          }),
          accessRequests: accessRequests.map((row) => {
            const request = accessRequestFromRow(row);
            return { ...request, requesterDisplayName: currentNames.get(request.requesterAccountId) ?? request.requesterDisplayName };
          }),
          transferRequests: transferRequests.map(transferRequestFromRow),
          records: records.map(recordFromRow),
          confirmations: confirmations.map(confirmationFromRow),
          confirmedRecordIds: confirmations.map((row) => String(row.record_id)),
        },
      };
    });
  }
}
