// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import {
  ROLES,
  type AuthSessionDto,
  type ClientCommand,
  type CommandBatchRequest,
  type DirectoryPageDto,
  type DirectoryPetDto,
  type DirectoryProfileDto,
  type DirectoryUserDto,
  type DoctorPetAccessDto,
  type Role,
  type RoleStatus,
  type SessionDeviceDto,
} from "@klinok/contracts";
import argon2 from "argon2";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import type { ApiConfig } from "./config.js";
import { CommandService } from "./commands.js";
import { Database } from "./db.js";
import { ApiError, optionalText, requireText } from "./errors.js";
import { Ledger } from "./ledger.js";
import { displayName, iso } from "./rows.js";
import { auditRows, SnapshotService } from "./snapshots.js";
import { normalizeEmail, randomToken, sha256 } from "./stable.js";

const SESSION_COOKIE = "klinok_session_v3";
const CSRF_COOKIE = "klinok_csrf_v3";

interface SessionContext {
  sessionId: string;
  accountId: string;
  deviceId: string;
  deviceName: string;
  csrfToken: string;
  expiresAt: Date;
}

function body(request: FastifyRequest): Record<string, unknown> {
  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) throw new ApiError(400, "VALIDATION_FAILED", "Expected an object body.");
  return request.body as Record<string, unknown>;
}

function requireDeviceName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new ApiError(400, "DEVICE_INVALID", "Device name is required.");
  const normalized = value.trim();
  if (normalized.length > 80) throw new ApiError(400, "DEVICE_NAME_INVALID", "Device name is too long.");
  return normalized;
}

function cookieOptions(config: ApiConfig, httpOnly: boolean) {
  return { path: "/", httpOnly, secure: config.cookieSecure, sameSite: "lax" as const };
}

function setSessionCookies(reply: FastifyReply, config: ApiConfig, token: string, csrfToken: string, expiresAt: Date): void {
  reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions(config, true), expires: expiresAt });
  reply.setCookie(CSRF_COOKIE, csrfToken, { ...cookieOptions(config, false), expires: expiresAt });
}

function clearSessionCookies(reply: FastifyReply, config: ApiConfig): void {
  reply.clearCookie(SESSION_COOKIE, cookieOptions(config, true));
  reply.clearCookie(CSRF_COOKIE, cookieOptions(config, false));
}

function pageInput(query: Record<string, unknown>): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, Math.floor(Number(query.page ?? 1)) || 1);
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(query.pageSize ?? 20)) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function paged<T>(items: T[], total: number, page: number, pageSize: number, pendingCount?: number): DirectoryPageDto<T> {
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)), ...(pendingCount !== undefined ? { pendingCount } : {}) };
}

function profileDto(row: Record<string, unknown>): DirectoryProfileDto {
  return {
    accountId: String(row.account_id), revision: Number(row.revision), firstName: String(row.first_name), lastName: String(row.last_name),
    ...(row.patronymic ? { patronymic: String(row.patronymic) } : {}), displayName: displayName(row),
    updatedAt: iso(row.updated_at as Date | string),
  };
}

async function sessionContext(db: Database, request: FastifyRequest, requireCsrf = false): Promise<SessionContext> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) throw new ApiError(401, "AUTH_REQUIRED", "Authentication is required.");
  const result = await db.pool.query<{
    session_id: string; account_id: string; device_id: string; device_name: string; csrf_digest: string; expires_at: Date;
    credential_status: string;
  }>(`SELECT s.session_id, s.account_id, s.device_id, s.device_name, s.csrf_digest, s.expires_at, a.credential_status
      FROM sessions s JOIN accounts a USING(account_id)
      WHERE s.session_digest=$1 AND s.revoked_at IS NULL AND s.expires_at > now()`, [sha256(token)]);
  const row = result.rows[0];
  if (!row || row.credential_status !== "active") throw new ApiError(401, "SESSION_INVALID", "The session is no longer active.");
  const csrfToken = request.cookies[CSRF_COOKIE] ?? "";
  if (requireCsrf) {
    const header = request.headers["x-csrf-token"];
    if (!csrfToken || typeof header !== "string" || header !== csrfToken || sha256(csrfToken) !== row.csrf_digest) {
      throw new ApiError(403, "CSRF_INVALID", "The CSRF token is invalid.");
    }
  }
  return { sessionId: row.session_id, accountId: row.account_id, deviceId: row.device_id, deviceName: row.device_name, csrfToken, expiresAt: new Date(row.expires_at) };
}

async function sessionDto(db: Database, context: SessionContext): Promise<AuthSessionDto> {
  const accountResult = await db.pool.query<{ email: string; credential_status: AuthSessionDto["credentialStatus"] }>("SELECT email, credential_status FROM accounts WHERE account_id=$1", [context.accountId]);
  const devicesResult = await db.pool.query<{
    device_id: string; device_name: string; created_at: Date; last_seen_at: Date; expires_at: Date;
  }>(`SELECT DISTINCT ON (device_id) device_id, device_name, created_at, last_seen_at, expires_at
      FROM sessions WHERE account_id=$1 AND revoked_at IS NULL AND expires_at > now()
      ORDER BY device_id, last_seen_at DESC`, [context.accountId]);
  const devices: SessionDeviceDto[] = devicesResult.rows.map((row) => ({
    deviceId: row.device_id, deviceName: row.device_name, current: row.device_id === context.deviceId,
    status: "active", createdAt: row.created_at.toISOString(), lastSeenAt: row.last_seen_at.toISOString(), expiresAt: row.expires_at.toISOString(),
  }));
  const current = devices.find((candidate) => candidate.current) ?? {
    deviceId: context.deviceId, deviceName: context.deviceName, current: true, status: "active" as const,
    createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), expiresAt: context.expiresAt.toISOString(),
  };
  return {
    authenticated: true, credentialStatus: accountResult.rows[0]?.credential_status, accountId: context.accountId,
    email: accountResult.rows[0]?.email, csrfToken: context.csrfToken, device: current, devices,
  };
}

async function auditMutation(
  db: Database,
  ledger: Ledger,
  input: Parameters<Ledger["append"]>[1],
  work: (client: PoolClient) => Promise<void>,
): Promise<void> {
  if (!ledger.isValid()) throw new ApiError(503, "LEDGER_INVALID", "The audit ledger is invalid.");
  const block = await db.transaction(async (client) => {
    await work(client);
    const appended = await ledger.append(client, input);
    await client.query(
      "INSERT INTO operation_receipts(operation_id,actor_account_id,command_type,result) VALUES ($1,$2,$3,$4::jsonb)",
      [input.operationId, input.actorAccountId, input.action, JSON.stringify({ operationId: input.operationId, status: "applied", ledgerHeight: appended.height })],
    );
    return appended;
  });
  ledger.noteCommitted(block.height, block.blockHash);
}

function emailBody(config: ApiConfig, route: string, token: string, purpose: string): string {
  return `${purpose}\n\n${config.publicOrigin}${route}?token=${encodeURIComponent(token)}\n`;
}

export async function enqueuePendingRoleRequestEmails(client: PoolClient, accountId: string): Promise<void> {
  const pendingRoles = await client.query<Record<string, unknown>>(
    `SELECT r.role, p.first_name, p.last_name, p.patronymic
       FROM roles r JOIN profiles p USING(account_id)
       WHERE r.account_id=$1 AND r.status='pending' AND r.role IN ('administrator','doctor')
       ORDER BY r.role FOR SHARE OF r, p`,
    [accountId],
  );
  if (!pendingRoles.rowCount) return;
  const administrators = await client.query<{ email: string }>(
    `SELECT a.email
       FROM roles r JOIN accounts a USING(account_id)
       WHERE r.role='administrator' AND r.status='approved' AND a.credential_status='active'
       ORDER BY a.email FOR SHARE OF r, a`,
  );
  for (const pendingRole of pendingRoles.rows) {
    const roleLabel = pendingRole.role === "doctor" ? "Ветеринар" : "Администратор";
    const requester = displayName(pendingRole) || accountId;
    for (const administrator of administrators.rows) {
      await client.query(
        "INSERT INTO email_outbox(email_id,recipient,subject,text_body) VALUES ($1,$2,$3,$4)",
        [randomUUID(), administrator.email, "Запрос роли в системе \"Клинок\"", `Пользователь ${requester} (${accountId}) запросил роль «${roleLabel}».`],
      );
    }
  }
}

export async function buildApi(config: ApiConfig, provided?: { db?: Database; ledger?: Ledger }): Promise<FastifyInstance> {
  const db = provided?.db ?? new Database(config.databaseUrl);
  await db.migrate();
  const ledger = provided?.ledger ?? new Ledger();
  await ledger.verify(db.pool);
  const commands = new CommandService(db, ledger);
  const snapshots = new SnapshotService(db, ledger);
  const app = Fastify({ logger: true, trustProxy: config.trustProxy, bodyLimit: 2_000_000 });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    errorResponseBuilder: (_request, context) => new ApiError(
      context.statusCode,
      "RATE_LIMITED",
      `Rate limit exceeded, retry in ${context.after}.`,
    ),
  });

  app.decorate("klinok", { db, ledger });
  app.addHook("onRequest", async (request) => {
    if (!config.enforceOrigin || ["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
    const origin = request.headers.origin;
    if (origin && origin !== config.publicOrigin) throw new ApiError(403, "ORIGIN_INVALID", "The request origin is not allowed.");
  });
  app.setErrorHandler((reason, _request, reply) => {
    const error = reason instanceof ApiError ? reason : new ApiError(500, "INTERNAL_ERROR", "The operation failed.");
    if (!(reason instanceof ApiError)) app.log.error(reason);
    void reply.status(error.status).send({ error: { code: error.code, message: error.message } });
  });

  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/readyz", async (_request, reply) => {
    try { await db.pool.query("SELECT 1"); } catch { return reply.status(503).send({ status: "not-ready", database: false }); }
    return ledger.isValid() ? { status: "ready", ledger: ledger.currentStatus() }
      : reply.status(503).send({ status: "not-ready", ledger: ledger.currentStatus() });
  });
  app.get("/metrics", async () => ({ dataGeneration: "v3", ledger: ledger.currentStatus() }));

  app.post("/api/auth/register", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (request, reply) => {
    const input = body(request);
    const firstName = requireText(input.firstName, "firstName", 100);
    const lastName = requireText(input.lastName, "lastName", 100);
    const patronymic = optionalText(input.patronymic, 100);
    const email = normalizeEmail(requireText(input.email, "email", 320));
    if (!email.includes("@")) throw new ApiError(400, "EMAIL_INVALID", "Email is invalid.");
    const password = requireText(input.password, "password", 128);
    if (password.length < 6) throw new ApiError(400, "PASSWORD_INVALID", "Password must contain at least six characters.");
    if (input.ageConfirmed !== true) throw new ApiError(400, "CONSENT_REQUIRED", "Age confirmation is required.");
    if (input.personalDataConsentVersion !== config.legal.personalDataConsentVersion || input.userAgreementVersion !== config.legal.userAgreementVersion) {
      throw new ApiError(400, "LEGAL_VERSION_MISMATCH", "Legal document versions changed.");
    }
    const requestedRoles = Array.isArray(input.requestedRoles)
      ? [...new Set(input.requestedRoles.filter((role): role is Role => role === "owner" || role === "doctor"))] : [];
    if (!requestedRoles.length) throw new ApiError(400, "ROLE_REQUIRED", "Select an initial role.");
    const accountId = randomUUID();
    const token = randomToken();
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    try {
      await auditMutation(db, ledger, {
        operationId: `register:${accountId}`, action: "account.registered", actorAccountId: accountId,
        aggregateType: "account", aggregateId: accountId, metadata: { requestedRoles },
        afterState: { accountId, firstName, lastName, patronymic, requestedRoles },
      }, async (client) => {
        await client.query(
          `INSERT INTO accounts(account_id,email,email_normalized,password_hash,credential_status)
           VALUES ($1,$2,$2,$3,'pending_verification')`, [accountId, email, passwordHash],
        );
        await client.query("INSERT INTO profiles(account_id,first_name,last_name,patronymic) VALUES ($1,$2,$3,$4)", [accountId, firstName, lastName, patronymic ?? null]);
        await client.query(
          `INSERT INTO consent_receipts(account_id,accepted_at,age_confirmed,personal_data_consent_version,user_agreement_version)
           VALUES ($1,now(),true,$2,$3)`, [accountId, config.legal.personalDataConsentVersion, config.legal.userAgreementVersion],
        );
        for (const role of requestedRoles) {
          const approved = role === "owner";
          await client.query(
            `INSERT INTO roles(account_id,role,request_id,status,profile_revision,requested_at,decided_at,decided_by)
             VALUES ($1,$2,$3,$4,1,now(),$5,$6)`, [accountId, role, randomUUID(), approved ? "approved" : "pending", approved ? new Date() : null, approved ? accountId : null],
          );
        }
        await client.query("INSERT INTO auth_tokens(token_digest,kind,account_id,created_at,expires_at) VALUES ($1,'verification',$2,now(),now()+interval '24 hours')", [sha256(token), accountId]);
        await client.query("INSERT INTO email_outbox(email_id,recipient,subject,text_body) VALUES ($1,$2,$3,$4)", [randomUUID(), email, "Подтвердите адрес электронной почты", emailBody(config, "/auth/verify-email", token, "Подтвердите адрес электронной почты:")]);
      });
    } catch (reason) {
      if (reason && typeof reason === "object" && "code" in reason && reason.code === "23505") throw new ApiError(409, "EMAIL_ALREADY_REGISTERED", "Email is already registered.");
      throw reason;
    }
    return reply.status(202).send({ accepted: true });
  });

  app.post("/api/auth/verify-email", async (request) => {
    const token = requireText(body(request).token, "token", 500);
    const found = await db.one<{ account_id: string }>("SELECT account_id FROM auth_tokens WHERE token_digest=$1 AND kind='verification' AND used_at IS NULL AND expires_at>now()", [sha256(token)]);
    if (!found) throw new ApiError(400, "TOKEN_INVALID", "Verification token is invalid or expired.");
    await auditMutation(db, ledger, {
      operationId: `verify:${sha256(token)}`, action: "account.verified", actorAccountId: found.account_id,
      aggregateType: "account", aggregateId: found.account_id, metadata: {},
    }, async (client) => {
      const used = await client.query("UPDATE auth_tokens SET used_at=now() WHERE token_digest=$1 AND used_at IS NULL AND expires_at>now() RETURNING account_id", [sha256(token)]);
      if (!used.rowCount) throw new ApiError(400, "TOKEN_INVALID", "Verification token is invalid or expired.");
      await client.query("UPDATE accounts SET credential_status='active', updated_at=now() WHERE account_id=$1", [found.account_id]);
      await enqueuePendingRoleRequestEmails(client, found.account_id);
    });
    return { verified: true };
  });

  app.post("/api/auth/login", { config: { rateLimit: { max: 30, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const input = body(request);
    const email = normalizeEmail(requireText(input.email, "email", 320));
    const password = requireText(input.password, "password", 128);
    const account = await db.one<{ account_id: string; password_hash: string; credential_status: string }>("SELECT account_id,password_hash,credential_status FROM accounts WHERE email_normalized=$1", [email]);
    if (!account || account.credential_status !== "active" || !(await argon2.verify(account.password_hash, password))) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }
    const sessionToken = randomToken();
    const csrfToken = randomToken();
    const sessionId = randomUUID();
    const deviceId = optionalText(input.deviceId, 200) ?? randomUUID();
    const deviceName = input.deviceName === undefined ? "Браузер" : requireDeviceName(input.deviceName);
    const expiresAt = new Date(Date.now() + config.sessionDays * 86_400_000);
    await auditMutation(db, ledger, {
      operationId: `login:${sessionId}`, action: "session.created", actorAccountId: account.account_id,
      aggregateType: "session", aggregateId: sessionId, metadata: { deviceId, deviceName },
    }, async (client) => {
      await client.query(
        `INSERT INTO sessions(session_id,session_digest,csrf_digest,account_id,device_id,device_name,created_at,last_seen_at,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,now(),now(),$7)`,
        [sessionId, sha256(sessionToken), sha256(csrfToken), account.account_id, deviceId, deviceName, expiresAt],
      );
    });
    setSessionCookies(reply, config, sessionToken, csrfToken, expiresAt);
    return { authenticated: true, accountId: account.account_id, csrfToken };
  });

  app.get("/api/auth/session", async (request, reply) => {
    try {
      let context = await sessionContext(db, request);
      let csrfToken = context.csrfToken;
      if (!csrfToken || sha256(csrfToken) !== (await db.one<{ csrf_digest: string }>("SELECT csrf_digest FROM sessions WHERE session_id=$1", [context.sessionId]))?.csrf_digest) {
        csrfToken = randomToken();
        await db.pool.query("UPDATE sessions SET csrf_digest=$2 WHERE session_id=$1", [context.sessionId, sha256(csrfToken)]);
        reply.setCookie(CSRF_COOKIE, csrfToken, { ...cookieOptions(config, false), expires: context.expiresAt });
        context = { ...context, csrfToken };
      }
      await db.pool.query("UPDATE sessions SET last_seen_at=now() WHERE session_id=$1", [context.sessionId]);
      return sessionDto(db, context);
    } catch (reason) {
      if (reason instanceof ApiError && ["AUTH_REQUIRED", "SESSION_INVALID"].includes(reason.code)) {
        clearSessionCookies(reply, config);
        return { authenticated: false } satisfies AuthSessionDto;
      }
      throw reason;
    }
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const context = await sessionContext(db, request, true);
    await auditMutation(db, ledger, {
      operationId: `logout:${context.sessionId}`, action: "session.revoked", actorAccountId: context.accountId,
      aggregateType: "session", aggregateId: context.sessionId, metadata: { deviceId: context.deviceId },
    }, (client) => client.query("UPDATE sessions SET revoked_at=now() WHERE session_id=$1", [context.sessionId]).then(() => undefined));
    clearSessionCookies(reply, config);
    return { loggedOut: true };
  });

  app.post("/api/auth/logout-all", async (request, reply) => {
    const context = await sessionContext(db, request, true);
    await auditMutation(db, ledger, {
      operationId: `logout-all:${randomUUID()}`, action: "session.all-revoked", actorAccountId: context.accountId,
      aggregateType: "account", aggregateId: context.accountId, metadata: {},
    }, (client) => client.query("UPDATE sessions SET revoked_at=now() WHERE account_id=$1 AND revoked_at IS NULL", [context.accountId]).then(() => undefined));
    clearSessionCookies(reply, config);
    return { loggedOut: true };
  });

  app.post("/api/auth/password/forgot", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (request, reply) => {
    const email = normalizeEmail(requireText(body(request).email, "email", 320));
    const account = await db.one<{ account_id: string; email: string }>("SELECT account_id,email FROM accounts WHERE email_normalized=$1 AND credential_status='active'", [email]);
    if (account) {
      const token = randomToken();
      await auditMutation(db, ledger, {
        operationId: `recovery-request:${randomUUID()}`, action: "credentials.recovery-requested", actorAccountId: account.account_id,
        aggregateType: "account", aggregateId: account.account_id, metadata: {},
      }, async (client) => {
        await client.query("INSERT INTO auth_tokens(token_digest,kind,account_id,created_at,expires_at) VALUES ($1,'recovery',$2,now(),now()+interval '1 hour')", [sha256(token), account.account_id]);
        await client.query("INSERT INTO email_outbox(email_id,recipient,subject,text_body) VALUES ($1,$2,$3,$4)", [randomUUID(), account.email, "Восстановление доступа к системе \"Клинок\"", emailBody(config, "/auth/reset-password", token, "Установите новый пароль:")]);
      });
    }
    return reply.status(202).send({ accepted: true });
  });

  app.post("/api/auth/password/reset", async (request) => {
    const input = body(request);
    const token = requireText(input.token, "token", 500);
    const password = requireText(input.password, "password", 128);
    if (password.length < 6) throw new ApiError(400, "PASSWORD_INVALID", "Password must contain at least six characters.");
    const found = await db.one<{ account_id: string }>("SELECT account_id FROM auth_tokens WHERE token_digest=$1 AND kind='recovery' AND used_at IS NULL AND expires_at>now()", [sha256(token)]);
    if (!found) throw new ApiError(400, "TOKEN_INVALID", "Recovery token is invalid or expired.");
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await auditMutation(db, ledger, {
      operationId: `password-reset:${sha256(token)}`, action: "credentials.password-reset", actorAccountId: found.account_id,
      aggregateType: "account", aggregateId: found.account_id, metadata: {},
    }, async (client) => {
      const used = await client.query("UPDATE auth_tokens SET used_at=now() WHERE token_digest=$1 AND used_at IS NULL AND expires_at>now() RETURNING account_id", [sha256(token)]);
      if (!used.rowCount) throw new ApiError(400, "TOKEN_INVALID", "Recovery token is invalid or expired.");
      await client.query("UPDATE accounts SET password_hash=$2, updated_at=now() WHERE account_id=$1", [found.account_id, passwordHash]);
      await client.query("UPDATE sessions SET revoked_at=now() WHERE account_id=$1 AND revoked_at IS NULL", [found.account_id]);
    });
    return { reset: true };
  });

  app.patch("/api/auth/profile", async (request) => {
    const context = await sessionContext(db, request, true);
    const input = body(request);
    const firstName = requireText(input.firstName, "firstName", 100);
    const lastName = requireText(input.lastName, "lastName", 100);
    const patronymic = optionalText(input.patronymic, 100);
    const expectedRevision = Number(input.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new ApiError(400, "VALIDATION_FAILED", "expectedRevision is required.");
    const operationId = `profile:${randomUUID()}`;
    const invalidatedTransferRequestIds: string[] = [];
    let result!: DirectoryProfileDto;
    await auditMutation(db, ledger, {
      operationId, action: "profile.updated", actorAccountId: context.accountId,
      aggregateType: "profile", aggregateId: context.accountId, metadata: { invalidatedTransferRequestIds },
    }, async (client) => {
      const updated = await client.query(
        "UPDATE profiles SET revision=revision+1,first_name=$2,last_name=$3,patronymic=$4,updated_at=now() WHERE account_id=$1 AND revision=$5 RETURNING *",
        [context.accountId, firstName, lastName, patronymic ?? null, expectedRevision],
      );
      if (!updated.rowCount) throw new ApiError(409, "REVISION_CONFLICT", "The profile changed before this update.");
      const invalidated = await client.query(
        "UPDATE pet_ownership_transfers SET status='invalidated',revision=revision+1,decided_at=now(),decided_by=$1 WHERE status='pending' AND (from_owner_account_id=$1 OR to_owner_account_id=$1) RETURNING transfer_request_id",
        [context.accountId],
      );
      invalidatedTransferRequestIds.push(...invalidated.rows.map((row) => String(row.transfer_request_id)));
      result = profileDto(updated.rows[0]);
    });
    return { operationId, profile: result };
  });

  app.patch("/api/auth/credentials", async (request) => {
    const context = await sessionContext(db, request, true);
    const input = body(request);
    const email = input.email === undefined ? undefined : normalizeEmail(requireText(input.email, "email", 320));
    const password = input.password === undefined ? undefined : requireText(input.password, "password", 128);
    if (!email && !password) throw new ApiError(400, "VALIDATION_FAILED", "No credential change was supplied.");
    if (email && !email.includes("@")) throw new ApiError(400, "EMAIL_INVALID", "Email is invalid.");
    if (password && password.length < 6) throw new ApiError(400, "PASSWORD_INVALID", "Password must contain at least six characters.");
    const passwordHash = password ? await argon2.hash(password, { type: argon2.argon2id }) : undefined;
    try {
      await auditMutation(db, ledger, {
        operationId: `credentials:${randomUUID()}`, action: "credentials.updated", actorAccountId: context.accountId,
        aggregateType: "account", aggregateId: context.accountId, metadata: { emailChanged: Boolean(email), passwordChanged: Boolean(password) },
      }, async (client) => {
        await client.query(
          "UPDATE accounts SET email=COALESCE($2,email),email_normalized=COALESCE($2,email_normalized),password_hash=COALESCE($3,password_hash),updated_at=now() WHERE account_id=$1",
          [context.accountId, email ?? null, passwordHash ?? null],
        );
      });
    } catch (reason) {
      if (reason && typeof reason === "object" && "code" in reason && reason.code === "23505") throw new ApiError(409, "EMAIL_ALREADY_REGISTERED", "Email is already registered.");
      throw reason;
    }
    return { updated: true, email: email ?? (await db.one<{ email: string }>("SELECT email FROM accounts WHERE account_id=$1", [context.accountId]))!.email };
  });

  app.delete("/api/auth/account", async (request, reply) => {
    const context = await sessionContext(db, request, true);
    const account = await db.one<{ immutable_bootstrap: boolean }>("SELECT immutable_bootstrap FROM accounts WHERE account_id=$1", [context.accountId]);
    if (account?.immutable_bootstrap) throw new ApiError(409, "BOOTSTRAP_ACCOUNT_IMMUTABLE", "The bootstrap account cannot be deleted.");
    const operationId = randomUUID();
    const invalidatedTransferRequestIds: string[] = [];
    await auditMutation(db, ledger, {
      operationId, action: "account.deleted", actorAccountId: context.accountId,
      aggregateType: "account", aggregateId: context.accountId, metadata: { invalidatedTransferRequestIds },
    }, async (client) => {
      await client.query("UPDATE accounts SET credential_status='deleted',deleted_at=now(),updated_at=now(),email_normalized='deleted:'||account_id WHERE account_id=$1", [context.accountId]);
      await client.query("UPDATE sessions SET revoked_at=now() WHERE account_id=$1 AND revoked_at IS NULL", [context.accountId]);
      await client.query("UPDATE pets SET deleted_at=now(),updated_at=now(),revision=revision+1 WHERE owner_account_id=$1 AND deleted_at IS NULL", [context.accountId]);
      await client.query(`UPDATE access_requests SET status='rejected',revision=revision+1,decided_at=now(),decided_by=$1
        WHERE status='pending' AND (owner_account_id=$1 OR requester_account_id=$1 OR pet_id IN (SELECT pet_id FROM pets WHERE owner_account_id=$1))`, [context.accountId]);
      await client.query(`UPDATE access_grants SET status='revoked',revoked_at=now(),revision=revision+1
        WHERE status='active' AND (grantor_account_id=$1 OR grantee_account_id=$1 OR pet_id IN (SELECT pet_id FROM pets WHERE owner_account_id=$1))`, [context.accountId]);
      const invalidated = await client.query(`UPDATE pet_ownership_transfers SET status='invalidated',revision=revision+1,decided_at=now(),decided_by=$1
        WHERE status='pending' AND (from_owner_account_id=$1 OR to_owner_account_id=$1 OR pet_id IN (SELECT pet_id FROM pets WHERE owner_account_id=$1))
        RETURNING transfer_request_id`, [context.accountId]);
      invalidatedTransferRequestIds.push(...invalidated.rows.map((row) => String(row.transfer_request_id)));
    });
    clearSessionCookies(reply, config);
    return { operationId };
  });

  app.delete<{ Params: { id: string } }>("/api/auth/devices/:id", async (request, reply) => {
    const context = await sessionContext(db, request, true);
    const deviceId = request.params.id;
    await auditMutation(db, ledger, {
      operationId: `session-revoke:${randomUUID()}`, action: "session.browser-revoked", actorAccountId: context.accountId,
      aggregateType: "browserSession", aggregateId: deviceId, metadata: {},
    }, async (client) => {
      const revoked = await client.query("UPDATE sessions SET revoked_at=now() WHERE account_id=$1 AND device_id=$2 AND revoked_at IS NULL RETURNING session_id", [context.accountId, deviceId]);
      if (!revoked.rowCount) throw new ApiError(404, "DEVICE_NOT_FOUND", "Browser session not found.");
    });
    if (deviceId === context.deviceId) clearSessionCookies(reply, config);
    return { revoked: true };
  });

  app.patch<{ Params: { id: string } }>("/api/auth/devices/:id", async (request) => {
    const context = await sessionContext(db, request, true);
    const deviceId = request.params.id;
    const deviceName = requireDeviceName(body(request).deviceName);
    const operationId = `session-rename:${randomUUID()}`;
    await auditMutation(db, ledger, {
      operationId, action: "session.browser-renamed", actorAccountId: context.accountId,
      aggregateType: "browserSession", aggregateId: deviceId, metadata: { deviceName },
    }, async (client) => {
      const updated = await client.query(
        "UPDATE sessions SET device_name=$3 WHERE account_id=$1 AND device_id=$2 AND revoked_at IS NULL AND expires_at>now() RETURNING session_id",
        [context.accountId, deviceId, deviceName],
      );
      if (!updated.rowCount) throw new ApiError(404, "DEVICE_NOT_FOUND", "Browser session not found.");
    });
    return { operationId, deviceId, deviceName };
  });

  app.post("/api/commands", async (request) => {
    const context = await sessionContext(db, request, true);
    const input = body(request) as unknown as CommandBatchRequest;
    if (!Array.isArray(input.commands) || input.commands.length < 1 || input.commands.length > 50) throw new ApiError(400, "VALIDATION_FAILED", "Supply between one and fifty commands.");
    const results = [];
    const batchResults = new Map<string, "applied" | "duplicate" | "conflict" | "rejected">();
    for (const candidate of input.commands) {
      const command = candidate as ClientCommand;
      if (!command || typeof command.operationId !== "string" || typeof command.type !== "string" || typeof command.entityId !== "string"
        || !command.operationId || !command.entityId || !ROLES.includes(command.activeRole)) {
        throw new ApiError(400, "VALIDATION_FAILED", "Command envelope is invalid.");
      }
      if (command.dependsOn?.length) {
        let dependencyRejected = false;
        for (const dependencyId of command.dependsOn) {
          const localStatus = batchResults.get(dependencyId);
          const stored = localStatus === undefined
            ? await db.one<{ actor_account_id: string }>("SELECT actor_account_id FROM operation_receipts WHERE operation_id=$1", [dependencyId])
            : null;
          if ((localStatus !== undefined && localStatus !== "applied" && localStatus !== "duplicate")
            || (localStatus === undefined && stored?.actor_account_id !== context.accountId)) dependencyRejected = true;
        }
        if (dependencyRejected) {
          const rejected = { operationId: command.operationId, status: "rejected" as const, error: { code: "DEPENDENCY_REJECTED", message: "A required earlier command was not applied." } };
          results.push(rejected);
          batchResults.set(command.operationId, rejected.status);
          continue;
        }
      }
      const result = await commands.execute({ accountId: context.accountId }, command);
      results.push(result);
      batchResults.set(command.operationId, result.status);
    }
    return { results };
  });

  app.get<{ Querystring: { role?: string } }>("/api/state", async (request, reply) => {
    const context = await sessionContext(db, request);
    const role = request.query.role as Role;
    if (!ROLES.includes(role)) throw new ApiError(400, "ROLE_INVALID", "Role is invalid.");
    const snapshot = await snapshots.load(context.accountId, role);
    const etag = `"${snapshot.revision}:${role}:${sha256(context.accountId).slice(0, 16)}"`;
    reply.header("ETag", etag).header("Cache-Control", "no-store");
    if (request.headers["if-none-match"] === etag) return reply.status(304).send();
    return snapshot;
  });

  app.get("/api/admin/ledger", async (request) => {
    const context = await sessionContext(db, request);
    const admin = await db.one("SELECT 1 FROM roles WHERE account_id=$1 AND role='administrator' AND status='approved'", [context.accountId]);
    if (!admin) throw new ApiError(403, "ADMINISTRATOR_REQUIRED", "Administrator access is required.");
    return ledger.currentStatus();
  });

  app.get("/api/admin/email-outbox/status", async (request) => {
    const context = await sessionContext(db, request);
    const admin = await db.one("SELECT 1 FROM roles WHERE account_id=$1 AND role='administrator' AND status='approved'", [context.accountId]);
    if (!admin) throw new ApiError(403, "ADMINISTRATOR_REQUIRED", "Administrator access is required.");
    const row = await db.one<{ pending: string; terminal_failures: string }>(`SELECT
      count(*) FILTER (WHERE sent_at IS NULL AND terminal_error IS NULL) AS pending,
      count(*) FILTER (WHERE terminal_error IS NOT NULL) AS terminal_failures
      FROM email_outbox`);
    return { pending: Number(row?.pending ?? 0), terminalFailures: Number(row?.terminal_failures ?? 0) };
  });

  app.get<{ Querystring: Record<string, string> }>("/api/admin/audit", async (request) => {
    const context = await sessionContext(db, request);
    const admin = await db.one("SELECT 1 FROM roles WHERE account_id=$1 AND role='administrator' AND status='approved'", [context.accountId]);
    if (!admin) throw new ApiError(403, "ADMINISTRATOR_REQUIRED", "Administrator access is required.");
    const { page, pageSize, offset } = pageInput(request.query);
    const total = Number((await db.one<{ count: string }>(`SELECT count(*) FROM audit_blocks
      WHERE (action LIKE 'role.%' OR action='account.bootstrap')
      AND COALESCE(metadata->>'role','administrator') IN ('doctor','administrator')`))!.count);
    return paged(await db.transaction((client) => auditRows(client, pageSize, offset)), total, page, pageSize);
  });

  app.get<{ Querystring: Record<string, string> }>("/api/directory/doctors", async (request) => {
    await sessionContext(db, request);
    const { page, pageSize, offset } = pageInput(request.query);
    const query = String(request.query.query ?? "").trim();
    const pattern = `%${query}%`;
    const total = Number((await db.one<{ count: string }>(
      `SELECT count(*) FROM profiles p JOIN roles r USING(account_id) JOIN accounts a USING(account_id)
       WHERE r.role='doctor' AND r.status='approved' AND a.credential_status='active'
       AND ($1='' OR translate(concat_ws(' ',p.first_name,p.patronymic,p.last_name),'Ёё','Ее') ILIKE translate($2,'Ёё','Ее') OR p.account_id ILIKE $2)`, [query, pattern]))!.count);
    const rows = await db.pool.query(
      `SELECT p.* FROM profiles p JOIN roles r USING(account_id) JOIN accounts a USING(account_id)
       WHERE r.role='doctor' AND r.status='approved' AND a.credential_status='active'
       AND ($1='' OR translate(concat_ws(' ',p.first_name,p.patronymic,p.last_name),'Ёё','Ее') ILIKE translate($2,'Ёё','Ее') OR p.account_id ILIKE $2)
       ORDER BY p.last_name,p.first_name,p.account_id LIMIT $3 OFFSET $4`, [query, pattern, pageSize, offset]);
    return paged(rows.rows.map(profileDto), total, page, pageSize);
  });

  app.get<{ Querystring: Record<string, string> }>("/api/directory/owners", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const context = await sessionContext(db, request);
    const ownerRole = await db.one(
      "SELECT 1 FROM roles WHERE account_id=$1 AND role='owner' AND status='approved'",
      [context.accountId],
    );
    if (!ownerRole) throw new ApiError(403, "OWNER_ROLE_REQUIRED", "An approved Owner role is required.");
    const { page, pageSize, offset } = pageInput(request.query);
    const query = String(request.query.query ?? "").trim();
    const pattern = `%${query}%`;
    const condition = `r.role='owner' AND r.status='approved' AND a.credential_status='active' AND p.account_id<>$3
      AND ($1='' OR translate(concat_ws(' ',p.first_name,p.patronymic,p.last_name),'Ёё','Ее') ILIKE translate($2,'Ёё','Ее') OR p.account_id ILIKE $2)`;
    const values = [query, pattern, context.accountId];
    const total = Number((await db.one<{ count: string }>(
      `SELECT count(*) FROM profiles p JOIN roles r USING(account_id) JOIN accounts a USING(account_id) WHERE ${condition}`,
      values,
    ))!.count);
    const rows = await db.pool.query(
      `SELECT p.* FROM profiles p JOIN roles r USING(account_id) JOIN accounts a USING(account_id)
       WHERE ${condition} ORDER BY (p.account_id=$1) DESC,p.last_name,p.first_name,p.account_id LIMIT $4 OFFSET $5`,
      [...values, pageSize, offset],
    );
    reply.header("Cache-Control", "no-store");
    return paged(rows.rows.map(profileDto), total, page, pageSize);
  });

  app.post("/api/directory/profiles/lookup", async (request) => {
    await sessionContext(db, request);
    const ids = Array.isArray(body(request).accountIds) ? (body(request).accountIds as unknown[]).filter((id): id is string => typeof id === "string").slice(0, 200) : [];
    const rows = await db.pool.query("SELECT * FROM profiles WHERE account_id=ANY($1::text[])", [ids]);
    return { profiles: rows.rows.map(profileDto) };
  });

  app.get<{ Querystring: Record<string, string> }>("/api/directory/users", async (request) => {
    const context = await sessionContext(db, request);
    const admin = await db.one("SELECT 1 FROM roles WHERE account_id=$1 AND role='administrator' AND status='approved'", [context.accountId]);
    if (!admin) throw new ApiError(403, "ADMINISTRATOR_REQUIRED", "Administrator access is required.");
    const { page, pageSize, offset } = pageInput(request.query);
    const query = String(request.query.query ?? "").trim();
    const pendingOnly = request.query.pendingOnly === "true";
    const requestedSort = String(request.query.sort ?? "");
    const sort = ["owner", "doctor", "administrator"].includes(requestedSort) ? requestedSort : "name";
    const direction = request.query.direction === "desc" ? "DESC" : "ASC";
    const order = sort === "name"
      ? `p.last_name ${direction},p.first_name ${direction},p.account_id ${direction}`
      : `COALESCE((SELECT sr.status FROM roles sr WHERE sr.account_id=p.account_id AND sr.role='${sort}'),'not_requested') ${direction},p.last_name,p.first_name,p.account_id`;
    const pattern = `%${query}%`;
    const condition = `a.credential_status<>'deleted' AND ($1='' OR translate(concat_ws(' ',p.first_name,p.patronymic,p.last_name),'Ёё','Ее') ILIKE translate($2,'Ёё','Ее') OR p.account_id ILIKE $2)
      AND ($3=false OR EXISTS(SELECT 1 FROM roles pr WHERE pr.account_id=p.account_id AND pr.status='pending' AND pr.role IN ('doctor','administrator')))`;
    const total = Number((await db.one<{ count: string }>(`SELECT count(*) FROM profiles p JOIN accounts a USING(account_id) WHERE ${condition}`, [query, pattern, pendingOnly]))!.count);
    const rows = await db.pool.query(`SELECT p.* FROM profiles p JOIN accounts a USING(account_id) WHERE ${condition} ORDER BY ${order} LIMIT $4 OFFSET $5`, [query, pattern, pendingOnly, pageSize, offset]);
    const ids = rows.rows.map((row) => String(row.account_id));
    const roleRows = ids.length ? (await db.pool.query("SELECT account_id,role,request_id,revision,status FROM roles WHERE account_id=ANY($1::text[])", [ids])).rows : [];
    const statusByAccount = new Map<string, Record<Role, RoleStatus>>();
    const requestsByAccount = new Map<string, DirectoryUserDto["roleRequests"]>();
    for (const id of ids) { statusByAccount.set(id, { owner: "not_requested", doctor: "not_requested", administrator: "not_requested" }); requestsByAccount.set(id, {}); }
    for (const roleRow of roleRows) {
      const accountId = String(roleRow.account_id);
      const role = roleRow.role as Role;
      const status = roleRow.status as RoleStatus;
      statusByAccount.get(accountId)![role] = status;
      requestsByAccount.get(accountId)![role] = { requestId: String(roleRow.request_id), revision: Number(roleRow.revision), role, status };
    }
    const pendingCount = Number((await db.one<{ count: string }>("SELECT count(*) FROM roles WHERE status='pending' AND role IN ('doctor','administrator')"))!.count);
    const items: DirectoryUserDto[] = rows.rows.map((row) => ({ ...profileDto(row), roleStatuses: statusByAccount.get(String(row.account_id))!, roleRequests: requestsByAccount.get(String(row.account_id))! }));
    return paged(items, total, page, pageSize, pendingCount);
  });

  app.patch<{ Params: { accountId: string } }>("/api/directory/users/:accountId/profile", async (request) => {
    const context = await sessionContext(db, request, true);
    if (context.accountId !== config.bootstrapAccountId) throw new ApiError(403, "BOOTSTRAP_ADMIN_REQUIRED", "Only the bootstrap Administrator may edit another profile.");
    const input = body(request);
    const expectedRevision = Number(input.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new ApiError(400, "VALIDATION_FAILED", "expectedRevision is required.");
    let profile!: DirectoryProfileDto;
    const operationId = randomUUID();
    const invalidatedTransferRequestIds: string[] = [];
    await auditMutation(db, ledger, {
      operationId, action: "profile.administrator-updated", actorAccountId: context.accountId, activeRole: "administrator",
      aggregateType: "profile", aggregateId: request.params.accountId, relatedAccountId: request.params.accountId,
      metadata: { invalidatedTransferRequestIds },
    }, async (client) => {
      const updated = await client.query(
        "UPDATE profiles SET revision=revision+1,first_name=$2,last_name=$3,patronymic=$4,updated_at=now() WHERE account_id=$1 AND revision=$5 RETURNING *",
        [request.params.accountId, requireText(input.firstName, "firstName", 100), requireText(input.lastName, "lastName", 100), optionalText(input.patronymic, 100) ?? null, expectedRevision],
      );
      if (!updated.rowCount) {
        const exists = await client.query("SELECT 1 FROM profiles WHERE account_id=$1", [request.params.accountId]);
        if (!exists.rowCount) throw new ApiError(404, "PROFILE_NOT_FOUND", "Profile not found.");
        throw new ApiError(409, "REVISION_CONFLICT", "The profile changed before this update.");
      }
      const invalidated = await client.query(
        "UPDATE pet_ownership_transfers SET status='invalidated',revision=revision+1,decided_at=now(),decided_by=$2 WHERE status='pending' AND (from_owner_account_id=$1 OR to_owner_account_id=$1) RETURNING transfer_request_id",
        [request.params.accountId, context.accountId],
      );
      invalidatedTransferRequestIds.push(...invalidated.rows.map((row) => String(row.transfer_request_id)));
      profile = profileDto(updated.rows[0]);
    });
    return { operationId, profile };
  });

  async function directoryPets(context: SessionContext, query: Record<string, string>, myOnly: boolean): Promise<DirectoryPageDto<DirectoryPetDto>> {
    const { page, pageSize, offset } = pageInput(query);
    const owner = String(query.owner ?? query.query ?? "").trim();
    const pet = String(query.pet ?? query.query ?? "").trim();
    const ownerAccountId = String(query.ownerAccountId ?? "").trim();
    const direction = query.direction === "desc" ? "DESC" : "ASC";
    const order = query.sort === "pet"
      ? `(p.pet_id=$3) DESC,p.name ${direction},pr.last_name,pr.first_name,p.pet_id`
      : `(p.owner_account_id=$1) DESC,(p.pet_id=$3) DESC,pr.last_name ${direction},pr.first_name ${direction},p.name,p.pet_id`;
    const exactOwnerPosition = myOnly ? 6 : 5;
    const where = `p.deleted_at IS NULL AND a.credential_status='active' ${myOnly ? "AND p.owner_account_id=$5" : ""}
      AND ($${exactOwnerPosition}='' OR p.owner_account_id=$${exactOwnerPosition})
      ${myOnly ? "" : "AND ($1<>'' OR $5<>'' OR p.pet_id=$3)"}
      AND ($1='' OR translate(concat_ws(' ',pr.first_name,pr.patronymic,pr.last_name),'Ёё','Ее') ILIKE translate($2,'Ёё','Ее') OR p.owner_account_id ILIKE $2)
      AND ($3='' OR translate(p.name,'Ёё','Ее') ILIKE translate($4,'Ёё','Ее') OR p.pet_id ILIKE $4)`;
    const values = myOnly
      ? [owner, `%${owner}%`, pet, `%${pet}%`, context.accountId, ownerAccountId]
      : [owner, `%${owner}%`, pet, `%${pet}%`, ownerAccountId];
    const total = Number((await db.one<{ count: string }>(`SELECT count(*) FROM pets p JOIN profiles pr ON pr.account_id=p.owner_account_id JOIN accounts a ON a.account_id=p.owner_account_id WHERE ${where}`, values))!.count);
    const rows = await db.pool.query(
      `SELECT p.*,pr.revision AS owner_profile_revision,pr.first_name,pr.last_name,pr.patronymic FROM pets p JOIN profiles pr ON pr.account_id=p.owner_account_id
       JOIN accounts a ON a.account_id=p.owner_account_id WHERE ${where}
       ORDER BY ${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, pageSize, offset]);
    return paged(rows.rows.map((row): DirectoryPetDto => ({
      petId: row.pet_id, ownerAccountId: row.owner_account_id, ownerDisplayName: displayName(row),
      ownerProfileRevision: Number(row.owner_profile_revision), revision: Number(row.revision),
      species: row.species, name: row.name, updatedAt: iso(row.updated_at),
    })), total, page, pageSize);
  }

  app.get<{ Querystring: Record<string, string> }>("/api/directory/pets", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return directoryPets(await sessionContext(db, request), request.query, false);
  });
  app.get<{ Querystring: Record<string, string> }>("/api/directory/my-pets", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return directoryPets(await sessionContext(db, request), request.query, true);
  });
  app.get<{ Params: { petId: string } }>("/api/directory/pets/:petId", async (request, reply) => {
    await sessionContext(db, request);
    const row = await db.one<Record<string, unknown>>(
      `SELECT p.*,pr.revision AS owner_profile_revision,pr.first_name,pr.last_name,pr.patronymic FROM pets p JOIN profiles pr ON pr.account_id=p.owner_account_id
       JOIN accounts a ON a.account_id=p.owner_account_id
       WHERE p.pet_id=$1 AND p.deleted_at IS NULL AND a.credential_status='active'`, [request.params.petId]);
    if (!row) throw new ApiError(404, "PET_NOT_FOUND", "Pet not found.");
    reply.header("Cache-Control", "no-store");
    return {
      petId: String(row.pet_id), ownerAccountId: String(row.owner_account_id), ownerDisplayName: displayName(row),
      ownerProfileRevision: Number(row.owner_profile_revision), revision: Number(row.revision),
      species: String(row.species), name: String(row.name), updatedAt: iso(row.updated_at as Date),
    } satisfies DirectoryPetDto;
  });

  app.get<{ Querystring: Record<string, string> }>("/api/directory/my-pet-accesses", async (request) => {
    const context = await sessionContext(db, request);
    const { page, pageSize, offset } = pageInput(request.query);
    const query = String(request.query.query ?? "").trim();
    const status = String(request.query.status ?? "all");
    const direction = request.query.direction === "desc" ? "DESC" : "ASC";
    const order = request.query.sort === "pet"
      ? `name ${direction},last_name,first_name,pet_id`
      : `last_name ${direction},first_name ${direction},name,pet_id`;
    const pattern = `%${query}%`;
    const rows = await db.pool.query(
      `WITH candidates AS (
        SELECT p.pet_id,p.owner_account_id,p.species,p.name,pr.first_name,pr.last_name,pr.patronymic,
          CASE WHEN g.status='active' THEN 'granted' WHEN ar.status='pending' THEN 'requested' ELSE 'revoked' END AS access_status,
          g.actions,g.grant_id,ar.request_id,GREATEST(g.created_at,ar.requested_at,p.updated_at) AS changed_at
        FROM pets p JOIN profiles pr ON pr.account_id=p.owner_account_id
        LEFT JOIN LATERAL (
          SELECT * FROM access_grants candidate WHERE candidate.pet_id=p.pet_id AND candidate.grantee_account_id=$1
          ORDER BY (candidate.status='active') DESC,candidate.created_at DESC LIMIT 1
        ) g ON true
        LEFT JOIN LATERAL (
          SELECT * FROM access_requests candidate WHERE candidate.pet_id=p.pet_id AND candidate.requester_account_id=$1
          ORDER BY (candidate.status='pending') DESC,candidate.requested_at DESC LIMIT 1
        ) ar ON true
        WHERE p.deleted_at IS NULL AND (g.grant_id IS NOT NULL OR ar.request_id IS NOT NULL)
      ) SELECT *,count(*) OVER() AS total FROM candidates
      WHERE ($2='all' OR access_status=$2) AND ($3='' OR translate(name,'Ёё','Ее') ILIKE translate($4,'Ёё','Ее') OR translate(concat_ws(' ',first_name,patronymic,last_name),'Ёё','Ее') ILIKE translate($4,'Ёё','Ее') OR pet_id ILIKE $4)
      ORDER BY ${order} LIMIT $5 OFFSET $6`, [context.accountId, status, query, pattern, pageSize, offset]);
    const total = Number(rows.rows[0]?.total ?? 0);
    const items: DoctorPetAccessDto[] = rows.rows.map((row) => ({
      petId: row.pet_id, ownerAccountId: row.owner_account_id, ownerDisplayName: displayName(row), species: row.species, name: row.name,
      status: row.access_status, ...(row.actions ? { permissions: row.actions } : {}), ...(row.grant_id ? { grantId: row.grant_id } : {}),
      ...(row.request_id ? { requestId: row.request_id } : {}),
    }));
    return paged(items, total, page, pageSize);
  });

  app.addHook("onClose", async () => { if (!provided?.db) await db.close(); });
  return app;
}
