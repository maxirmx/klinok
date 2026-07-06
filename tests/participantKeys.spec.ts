// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { describe, expect, it } from "vitest";
import { createParticipantKeyPair, exportParticipantKeyPair } from "../src/cases/crypto";
import {
  getParticipantKeyStorageKey,
  resolveParticipantKeyPair,
  type ParticipantKeyStorage,
} from "../src/cases/participantKeys";
import { createDefaultRuntimeConfig, SHARED_DEMO_PARTICIPANT_ID, type P2PClientConfig } from "../src/runtimeConfig";

class MemoryParticipantKeyStorage implements ParticipantKeyStorage {
  readonly items = new Map<string, string>();

  getItem(key: string) {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}

function createConfig(overrides: Partial<P2PClientConfig> = {}): P2PClientConfig {
  return {
    ...createDefaultRuntimeConfig(true).p2p,
    participantPublicKeys: {},
    ...overrides,
  };
}

describe("participant key resolution", () => {
  it("prefers a configured shared participant key over browser storage", async () => {
    const configured = await exportParticipantKeyPair(await createParticipantKeyPair(SHARED_DEMO_PARTICIPANT_ID));
    const stored = await exportParticipantKeyPair(await createParticipantKeyPair(SHARED_DEMO_PARTICIPANT_ID));
    const storage = new MemoryParticipantKeyStorage();
    storage.setItem(
      getParticipantKeyStorageKey(SHARED_DEMO_PARTICIPANT_ID),
      JSON.stringify({ publicKey: stored.publicKey, privateKey: stored.privateKey }),
    );

    const resolved = await resolveParticipantKeyPair(createConfig({
      participantPrivateKey: configured.privateKey,
      participantPublicKeys: {
        [SHARED_DEMO_PARTICIPANT_ID]: configured.publicKey,
      },
    }), storage);
    const exported = await exportParticipantKeyPair(resolved);

    expect(exported.privateKey.d).toBe(configured.privateKey.d);
  });

  it("fails clearly when generated participant keys are disabled and no key is configured", async () => {
    await expect(resolveParticipantKeyPair(createConfig(), new MemoryParticipantKeyStorage())).rejects.toThrow(
      "P2P participant private key is required",
    );
  });

  it("preserves the generated browser key path when explicitly enabled", async () => {
    const storage = new MemoryParticipantKeyStorage();
    const config = createConfig({ allowGeneratedParticipantKeys: true });
    const first = await resolveParticipantKeyPair(config, storage);
    const firstExported = await exportParticipantKeyPair(first);
    const second = await resolveParticipantKeyPair(config, storage);
    const secondExported = await exportParticipantKeyPair(second);

    expect(storage.getItem(getParticipantKeyStorageKey(SHARED_DEMO_PARTICIPANT_ID))).toBeTruthy();
    expect(secondExported.privateKey.d).toBe(firstExported.privateKey.d);
  });

  it("regenerates generated browser keys when stored JSON is malformed", async () => {
    const storage = new MemoryParticipantKeyStorage();
    const storageKey = getParticipantKeyStorageKey(SHARED_DEMO_PARTICIPANT_ID);
    storage.setItem(storageKey, "{not-json");

    const resolved = await resolveParticipantKeyPair(createConfig({ allowGeneratedParticipantKeys: true }), storage);
    const exported = await exportParticipantKeyPair(resolved);

    expect(exported.privateKey.d).toBeTruthy();
    expect(() => JSON.parse(storage.getItem(storageKey) ?? "")).not.toThrow();
    expect(storage.getItem(storageKey)).not.toBe("{not-json");
  });

  it("regenerates generated browser keys when stored JWK data is invalid", async () => {
    const storage = new MemoryParticipantKeyStorage();
    const storageKey = getParticipantKeyStorageKey(SHARED_DEMO_PARTICIPANT_ID);
    storage.setItem(
      storageKey,
      JSON.stringify({ publicKey: { kty: "RSA" }, privateKey: { kty: "RSA" } }),
    );

    const resolved = await resolveParticipantKeyPair(createConfig({ allowGeneratedParticipantKeys: true }), storage);
    const exported = await exportParticipantKeyPair(resolved);

    expect(exported.privateKey.d).toBeTruthy();
    expect(JSON.parse(storage.getItem(storageKey) ?? "{}").privateKey.d).toBe(exported.privateKey.d);
  });
});
