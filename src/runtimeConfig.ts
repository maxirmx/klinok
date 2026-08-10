// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

export const RUNTIME_CONFIG_PATHS = ["/config.json"];
export interface LegalDocumentConfig { version: string; href: string }
export interface AppRuntimeConfig {
  enableLog: boolean;
  apiBaseUrl: string;
  dataGeneration: "v3";
  bootstrapAccountId: string;
  offlineLeaseDays: number;
  legal: { personalDataConsent: LegalDocumentConfig; userAgreement: LegalDocumentConfig };
}
export type AppRuntimeConfigInput = Partial<Omit<AppRuntimeConfig, "legal" | "dataGeneration">> & {
  dataGeneration?: string;
  legal?: { personalDataConsent?: Partial<LegalDocumentConfig>; userAgreement?: Partial<LegalDocumentConfig> };
};

function text(value: unknown, fallback: string): string { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
export function createDefaultRuntimeConfig(): AppRuntimeConfig {
  return {
    enableLog: false, apiBaseUrl: "", dataGeneration: "v3", bootstrapAccountId: "bootstrap-administrator", offlineLeaseDays: 7,
    legal: {
      personalDataConsent: { version: "2026-07-10", href: "/legal/personal-data-consent" },
      userAgreement: { version: "2026-07-10", href: "/legal/user-agreement" },
    },
  };
}
export const defaultRuntimeConfig = createDefaultRuntimeConfig();
export function normalizeRuntimeConfig(input: AppRuntimeConfigInput, defaults = defaultRuntimeConfig): AppRuntimeConfig {
  if (input.dataGeneration && input.dataGeneration !== "v3") throw new Error("Конфигурация приложения относится к другому поколению данных.");
  const offlineLeaseDays = Number(input.offlineLeaseDays ?? defaults.offlineLeaseDays);
  return {
    enableLog: typeof input.enableLog === "boolean" ? input.enableLog : defaults.enableLog,
    apiBaseUrl: typeof input.apiBaseUrl === "string" ? input.apiBaseUrl.replace(/\/$/, "") : defaults.apiBaseUrl,
    dataGeneration: "v3",
    bootstrapAccountId: text(input.bootstrapAccountId, defaults.bootstrapAccountId),
    offlineLeaseDays: Number.isInteger(offlineLeaseDays) && offlineLeaseDays > 0 ? offlineLeaseDays : defaults.offlineLeaseDays,
    legal: {
      personalDataConsent: { version: text(input.legal?.personalDataConsent?.version, defaults.legal.personalDataConsent.version), href: text(input.legal?.personalDataConsent?.href, defaults.legal.personalDataConsent.href) },
      userAgreement: { version: text(input.legal?.userAgreement?.version, defaults.legal.userAgreement.version), href: text(input.legal?.userAgreement?.href, defaults.legal.userAgreement.href) },
    },
  };
}
export async function loadRuntimeConfig(): Promise<AppRuntimeConfig> {
  if (typeof fetch !== "function") return defaultRuntimeConfig;
  try {
    const response = await fetch(RUNTIME_CONFIG_PATHS[0], { cache: "no-store" });
    return response.ok ? normalizeRuntimeConfig(await response.json() as AppRuntimeConfigInput) : defaultRuntimeConfig;
  } catch { return defaultRuntimeConfig; }
}
