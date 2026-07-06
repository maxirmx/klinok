// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { deriveParticipantPublicKeyJwk } from "./cases/crypto";

export const DEVELOPMENT_TRUSTED_NODE_MULTIADDR = "/ip4/127.0.0.1/tcp/8089/ws";
export const PRODUCTION_TRUSTED_NODE_MULTIADDR = "/dns4/klinok.sw.consulting/tcp/8089/tls/ws";
export const SHARED_DEMO_PARTICIPANT_ID = "klinok-demo-shared";
export const RUNTIME_CONFIG_PATHS = [
  "/config.json",
  "/shared-participant-key.json",
  "/shared-participant-key.local.json",
];

export interface P2PClientConfig {
  databaseName: string;
  databaseAddress?: string;
  identityId: string;
  participantId: string;
  trustedNodeMultiaddrs: string[];
  writeIdentityIds: string[];
  participantPublicKeys: Record<string, JsonWebKey>;
  participantPrivateKey?: JsonWebKey;
  allowGeneratedParticipantKeys: boolean;
}

export interface AppRuntimeConfig {
  enableLog: boolean;
  p2p: P2PClientConfig;
}

export type P2PClientConfigInput = Partial<P2PClientConfig>;

export interface AppRuntimeConfigInput {
  enableLog?: boolean;
  p2p?: P2PClientConfigInput;
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeOptionalString(value: unknown, fallback?: string): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeStringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];

  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  return items.length ? items : [...fallback];
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function isWebSocketTrustedNodeMultiaddr(value: string): boolean {
  return /\/(?:tls\/)?ws(?:\/|$)/.test(value) || /\/wss(?:\/|$)/.test(value);
}

function normalizeTrustedNodeMultiaddrs(value: unknown, fallback: string[]): string[] {
  const items = normalizeStringList(value, []).filter(isWebSocketTrustedNodeMultiaddr);
  return items.length ? items : [...fallback];
}

function normalizePublicKeys(value: unknown, fallback: Record<string, JsonWebKey> = {}): Record<string, JsonWebKey> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...fallback };

  const result: Record<string, JsonWebKey> = { ...fallback };
  for (const [key, jwk] of Object.entries(value as Record<string, unknown>)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (jwk && typeof jwk === "object" && !Array.isArray(jwk)) {
      result[key] = jwk as JsonWebKey;
    }
  }
  return result;
}

function normalizeOptionalJsonWebKey(value: unknown, fallback?: JsonWebKey): JsonWebKey | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonWebKey) : fallback;
}

export function getDefaultTrustedNodeMultiaddrs(isDevelopment = import.meta.env.DEV): string[] {
  return [isDevelopment ? DEVELOPMENT_TRUSTED_NODE_MULTIADDR : PRODUCTION_TRUSTED_NODE_MULTIADDR];
}

export function createDefaultRuntimeConfig(isDevelopment = import.meta.env.DEV): AppRuntimeConfig {
  return {
    enableLog: true,
    p2p: {
      databaseName: "klinok-cases",
      identityId: "klinok-browser-owner",
      participantId: SHARED_DEMO_PARTICIPANT_ID,
      trustedNodeMultiaddrs: getDefaultTrustedNodeMultiaddrs(isDevelopment),
      writeIdentityIds: ["*"],
      participantPublicKeys: {},
      allowGeneratedParticipantKeys: false,
    },
  };
}

export const defaultRuntimeConfig: AppRuntimeConfig = createDefaultRuntimeConfig();

export function normalizeRuntimeConfig(
  value: AppRuntimeConfigInput,
  defaults: AppRuntimeConfig = defaultRuntimeConfig,
): AppRuntimeConfig {
  const p2p: P2PClientConfigInput = value.p2p ?? {};
  const participantId = normalizeString(p2p.participantId, defaults.p2p.participantId);
  const participantPrivateKey = normalizeOptionalJsonWebKey(p2p.participantPrivateKey, defaults.p2p.participantPrivateKey);
  const participantPublicKeys = normalizePublicKeys(p2p.participantPublicKeys, defaults.p2p.participantPublicKeys);
  if (participantPrivateKey && !participantPublicKeys[participantId]) {
    const derivedPublicKey = deriveParticipantPublicKeyJwk(participantPrivateKey);
    if (derivedPublicKey) {
      participantPublicKeys[participantId] = derivedPublicKey;
    }
  }

  return {
    enableLog: typeof value.enableLog === "boolean" ? value.enableLog : defaults.enableLog,
    p2p: {
      databaseName: normalizeString(p2p.databaseName, defaults.p2p.databaseName),
      databaseAddress: normalizeOptionalString(p2p.databaseAddress, defaults.p2p.databaseAddress),
      identityId: normalizeString(p2p.identityId, defaults.p2p.identityId),
      participantId,
      trustedNodeMultiaddrs: normalizeTrustedNodeMultiaddrs(p2p.trustedNodeMultiaddrs, defaults.p2p.trustedNodeMultiaddrs),
      writeIdentityIds: normalizeStringList(p2p.writeIdentityIds, defaults.p2p.writeIdentityIds),
      participantPublicKeys,
      participantPrivateKey,
      allowGeneratedParticipantKeys: normalizeBoolean(
        p2p.allowGeneratedParticipantKeys,
        defaults.p2p.allowGeneratedParticipantKeys,
      ),
    },
  };
}

function mergeRuntimeConfigOverlay(
  base: AppRuntimeConfigInput,
  overlay: AppRuntimeConfigInput,
): AppRuntimeConfigInput {
  return {
    ...base,
    ...overlay,
    p2p: {
      ...(base.p2p ?? {}),
      ...(overlay.p2p ?? {}),
      participantPublicKeys: {
        ...(base.p2p?.participantPublicKeys ?? {}),
        ...(overlay.p2p?.participantPublicKeys ?? {}),
      },
    },
  };
}

export function mergeRuntimeConfigOverlays(overlays: AppRuntimeConfigInput[]): AppRuntimeConfigInput {
  return overlays.reduce<AppRuntimeConfigInput>(mergeRuntimeConfigOverlay, {});
}

async function loadRuntimeConfigOverlay(path: string): Promise<AppRuntimeConfigInput | null> {
  if (typeof fetch !== "function") {
    return null;
  }

  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as AppRuntimeConfigInput;
  } catch {
    return null;
  }
}

export async function loadRuntimeConfig(): Promise<AppRuntimeConfig> {
  if (typeof fetch !== "function") {
    return defaultRuntimeConfig;
  }

  const overlays = await Promise.all(RUNTIME_CONFIG_PATHS.map(loadRuntimeConfigOverlay));
  return normalizeRuntimeConfig(mergeRuntimeConfigOverlays(overlays.filter((item): item is AppRuntimeConfigInput => item !== null)));
}
