// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { loadApiConfig } from "./config.js";
import { Database } from "./db.js";
import { Ledger } from "./ledger.js";
import { normalizeEmail } from "./stable.js";

const config = loadApiConfig();
const email = normalizeEmail(process.env.KLINOK_BOOTSTRAP_EMAIL ?? "");
const password = process.env.KLINOK_BOOTSTRAP_PASSWORD ?? "";
const firstName = process.env.KLINOK_BOOTSTRAP_FIRST_NAME?.trim() || "Администратор";
const lastName = process.env.KLINOK_BOOTSTRAP_LAST_NAME?.trim() || "Клинка";

if (!email.includes("@")) throw new Error("KLINOK_BOOTSTRAP_EMAIL must be a valid email address.");
if (password.length < 12 || password.length > 128) throw new Error("KLINOK_BOOTSTRAP_PASSWORD must contain between 12 and 128 characters.");

const db = new Database(config.databaseUrl);
try {
  await db.migrate();
  const ledger = new Ledger();
  const status = await ledger.verify(db.pool);
  if (!status.valid) throw new Error("The audit ledger is invalid; provisioning is disabled.");
  const existing = await db.one<{ account_id: string }>("SELECT account_id FROM accounts WHERE immutable_bootstrap=true");
  if (existing) {
    if (existing.account_id !== config.bootstrapAccountId) throw new Error("A different bootstrap account already exists.");
    process.stdout.write(`${JSON.stringify({ accountId: existing.account_id, email, reused: true })}\n`);
  } else {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const block = await db.transaction(async (client) => {
      await client.query(
        `INSERT INTO accounts(account_id,email,email_normalized,password_hash,credential_status,immutable_bootstrap)
         VALUES ($1,$2,$2,$3,'active',true)`, [config.bootstrapAccountId, email, passwordHash],
      );
      await client.query("INSERT INTO profiles(account_id,first_name,last_name) VALUES ($1,$2,$3)", [config.bootstrapAccountId, firstName, lastName]);
      await client.query(
        `INSERT INTO consent_receipts(account_id,accepted_at,age_confirmed,personal_data_consent_version,user_agreement_version)
         VALUES ($1,now(),true,$2,$3)`, [config.bootstrapAccountId, config.legal.personalDataConsentVersion, config.legal.userAgreementVersion],
      );
      for (const role of ["administrator", "owner"] as const) {
        await client.query(
          `INSERT INTO roles(account_id,role,request_id,status,profile_revision,requested_at,decided_at,decided_by)
           VALUES ($1,$2,$3,'approved',1,now(),now(),$1)`, [config.bootstrapAccountId, role, randomUUID()],
        );
      }
      const operationId = `bootstrap:${config.bootstrapAccountId}`;
      const appended = await ledger.append(client, {
        operationId,
        action: "account.bootstrap",
        actorAccountId: config.bootstrapAccountId,
        activeRole: "administrator",
        aggregateType: "account",
        aggregateId: config.bootstrapAccountId,
        relatedAccountId: config.bootstrapAccountId,
        metadata: { role: "administrator" },
        afterState: { accountId: config.bootstrapAccountId, roles: ["administrator", "owner"] },
      });
      await client.query(
        "INSERT INTO operation_receipts(operation_id,actor_account_id,command_type,result) VALUES ($1,$2,$3,$4::jsonb)",
        [operationId, config.bootstrapAccountId, "account.bootstrap", JSON.stringify({ operationId, status: "applied", ledgerHeight: appended.height })],
      );
      return appended;
    });
    ledger.noteCommitted(block.height, block.blockHash);
    process.stdout.write(`${JSON.stringify({ accountId: config.bootstrapAccountId, email, reused: false })}\n`);
  }
} finally {
  await db.close();
}
