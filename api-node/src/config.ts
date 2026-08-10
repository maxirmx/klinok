// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

export interface ApiConfig {
  host: string;
  port: number;
  databaseUrl: string;
  publicOrigin: string;
  cookieSecure: boolean;
  enforceOrigin: boolean;
  trustProxy: boolean | number | string;
  sessionDays: number;
  bootstrapAccountId: string;
  legal: { personalDataConsentVersion: string; userAgreementVersion: string };
  smtp: { host: string; port: number; secure: boolean; user?: string; password?: string; from: string };
}

function boolean(value: string | undefined, fallback: boolean): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`Expected a positive integer, received: ${value}`);
  return parsed;
}

function proxy(value: string | undefined): boolean | number | string {
  if (!value || value === "false") return false;
  if (value === "true") return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    host: env.KLINOK_API_HOST ?? "0.0.0.0",
    port: Number(env.KLINOK_API_PORT ?? 8090),
    databaseUrl: env.KLINOK_DATABASE_URL ?? "postgres://klinok:klinok@127.0.0.1:5432/klinok",
    publicOrigin: env.KLINOK_PUBLIC_ORIGIN ?? "http://localhost:8080",
    cookieSecure: boolean(env.KLINOK_COOKIE_SECURE, env.NODE_ENV === "production"),
    enforceOrigin: boolean(env.KLINOK_ENFORCE_ORIGIN, true),
    trustProxy: proxy(env.KLINOK_TRUST_PROXY),
    sessionDays: positiveInteger(env.KLINOK_SESSION_DAYS, 30),
    bootstrapAccountId: env.KLINOK_BOOTSTRAP_ACCOUNT_ID ?? "bootstrap-administrator",
    legal: {
      personalDataConsentVersion: env.KLINOK_PERSONAL_DATA_CONSENT_VERSION ?? "2026-07-10",
      userAgreementVersion: env.KLINOK_USER_AGREEMENT_VERSION ?? "2026-07-10",
    },
    smtp: {
      host: env.KLINOK_SMTP_HOST ?? "127.0.0.1",
      port: Number(env.KLINOK_SMTP_PORT ?? 1025),
      secure: boolean(env.KLINOK_SMTP_SECURE, false),
      ...(env.KLINOK_SMTP_USER ? { user: env.KLINOK_SMTP_USER } : {}),
      ...(env.KLINOK_SMTP_PASSWORD ? { password: env.KLINOK_SMTP_PASSWORD } : {}),
      from: env.KLINOK_SMTP_FROM ?? "Клинок <noreply@klinok.local>",
    },
  };
}
