// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import type { P2PClientConfig } from "../runtimeConfig";
import {
  createParticipantKeyPair,
  deriveParticipantPublicKeyJwk,
  exportParticipantKeyPair,
  importParticipantKeyPair,
  type ParticipantKeyPair,
} from "./crypto";

export const PARTICIPANT_KEY_STORAGE_PREFIX = "klinok:p2p:participant:";

export interface ParticipantKeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function getParticipantKeyStorageKey(participantId: string) {
  return `${PARTICIPANT_KEY_STORAGE_PREFIX}${participantId}`;
}

function getBrowserParticipantKeyStorage(): ParticipantKeyStorage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

async function importStoredParticipantKeyPair(
  config: P2PClientConfig,
  stored: string,
): Promise<ParticipantKeyPair | null> {
  try {
    const parsed = JSON.parse(stored) as { publicKey: JsonWebKey; privateKey: JsonWebKey };
    return await importParticipantKeyPair(config.participantId, parsed.publicKey, parsed.privateKey);
  } catch {
    return null;
  }
}

export async function resolveParticipantKeyPair(
  config: P2PClientConfig,
  storage: ParticipantKeyStorage | null = getBrowserParticipantKeyStorage(),
): Promise<ParticipantKeyPair> {
  if (config.participantPrivateKey) {
    const publicKey = config.participantPublicKeys[config.participantId] ??
      deriveParticipantPublicKeyJwk(config.participantPrivateKey);
    if (!publicKey) {
      throw new Error(`P2P participant public key is missing for ${config.participantId}.`);
    }

    return importParticipantKeyPair(
      config.participantId,
      publicKey,
      config.participantPrivateKey,
    );
  }

  if (!config.allowGeneratedParticipantKeys) {
    throw new Error(
      "P2P participant private key is required. Provide /shared-participant-key.json, " +
      "/shared-participant-key.local.json, or enable p2p.allowGeneratedParticipantKeys.",
    );
  }

  const storageKey = getParticipantKeyStorageKey(config.participantId);
  const stored = storage?.getItem(storageKey) ?? null;
  if (stored) {
    const storedPair = await importStoredParticipantKeyPair(config, stored);
    if (storedPair) {
      return storedPair;
    }
  }

  const pair = await createParticipantKeyPair(config.participantId);
  if (storage) {
    const exported = await exportParticipantKeyPair(pair);
    storage.setItem(
      storageKey,
      JSON.stringify({ publicKey: exported.publicKey, privateKey: exported.privateKey }),
    );
  }

  return pair;
}
