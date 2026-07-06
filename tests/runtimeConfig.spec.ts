// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { afterEach, describe, expect, it, vi } from "vitest";
import { createParticipantKeyPair, exportParticipantKeyPair } from "../src/cases/crypto";
import {
  createDefaultRuntimeConfig,
  DEVELOPMENT_TRUSTED_NODE_MULTIADDR,
  loadRuntimeConfig,
  normalizeRuntimeConfig,
  PRODUCTION_TRUSTED_NODE_MULTIADDR,
  RUNTIME_CONFIG_PATHS,
  SHARED_DEMO_PARTICIPANT_ID,
  type AppRuntimeConfig,
} from "../src/runtimeConfig";

describe("runtime config", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not expose backend mode selection in defaults or normalized config", () => {
    const defaults = createDefaultRuntimeConfig(true);
    const normalized = normalizeRuntimeConfig({ backendMode: "mock" } as Partial<AppRuntimeConfig>, defaults);

    expect(Object.prototype.hasOwnProperty.call(defaults, "backendMode")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(normalized, "backendMode")).toBe(false);
  });

  it("targets the localhost trusted node in development", () => {
    expect(createDefaultRuntimeConfig(true).p2p.trustedNodeMultiaddrs).toEqual([DEVELOPMENT_TRUSTED_NODE_MULTIADDR]);
  });

  it("defaults to the shared demo participant and disables generated participant keys", () => {
    const config = createDefaultRuntimeConfig(true);

    expect(config.p2p.participantId).toBe(SHARED_DEMO_PARTICIPANT_ID);
    expect(config.p2p.allowGeneratedParticipantKeys).toBe(false);
  });

  it("targets the predefined production trusted node outside development", () => {
    expect(createDefaultRuntimeConfig(false).p2p.trustedNodeMultiaddrs).toEqual([PRODUCTION_TRUSTED_NODE_MULTIADDR]);
  });

  it("falls back to the environment trusted node default when overrides are missing or invalid", () => {
    const defaults = createDefaultRuntimeConfig(true);

    expect(normalizeRuntimeConfig({}, defaults).p2p.trustedNodeMultiaddrs).toEqual([DEVELOPMENT_TRUSTED_NODE_MULTIADDR]);
    expect(
      normalizeRuntimeConfig(
        {
          p2p: {
            trustedNodeMultiaddrs: ["", "   "],
          },
        } as Partial<AppRuntimeConfig>,
        defaults,
      ).p2p.trustedNodeMultiaddrs,
    ).toEqual([DEVELOPMENT_TRUSTED_NODE_MULTIADDR]);
  });

  it("ignores raw TCP trusted node overrides because browsers must use websocket transport", () => {
    const defaults = createDefaultRuntimeConfig(true);
    const websocketPeerAddress =
      "/ip4/127.0.0.1/tcp/8089/ws/p2p/12D3KooWLffXJUCf7nxxvTSy8sN9BH363AQX3uUbQDdtx3dLFt5Z";

    expect(
      normalizeRuntimeConfig(
        {
          p2p: {
            trustedNodeMultiaddrs: [
              "/ip4/127.0.0.1/tcp/51240/p2p/12D3KooWLffXJUCf7nxxvTSy8sN9BH363AQX3uUbQDdtx3dLFt5Z",
            ],
          },
        } as Partial<AppRuntimeConfig>,
        defaults,
      ).p2p.trustedNodeMultiaddrs,
    ).toEqual([DEVELOPMENT_TRUSTED_NODE_MULTIADDR]);

    expect(
      normalizeRuntimeConfig(
        {
          p2p: {
            trustedNodeMultiaddrs: [
              "/ip4/127.0.0.1/tcp/51240/p2p/12D3KooWLffXJUCf7nxxvTSy8sN9BH363AQX3uUbQDdtx3dLFt5Z",
              websocketPeerAddress,
            ],
          },
        } as Partial<AppRuntimeConfig>,
        defaults,
      ).p2p.trustedNodeMultiaddrs,
    ).toEqual([websocketPeerAddress]);
  });

  it("falls back to the default participant private key when the override is missing or invalid", async () => {
    const defaultPrivateKey = (await exportParticipantKeyPair(await createParticipantKeyPair("default"))).privateKey;
    const overridePrivateKey = (await exportParticipantKeyPair(await createParticipantKeyPair("override"))).privateKey;
    const defaults = {
      ...createDefaultRuntimeConfig(true),
      p2p: {
        ...createDefaultRuntimeConfig(true).p2p,
        participantPrivateKey: defaultPrivateKey,
      },
    };

    expect(normalizeRuntimeConfig({}, defaults).p2p.participantPrivateKey).toBe(defaultPrivateKey);
    expect(
      normalizeRuntimeConfig(
        {
          p2p: {
            participantPrivateKey: "not-a-key",
          },
        } as Partial<AppRuntimeConfig>,
        defaults,
      ).p2p.participantPrivateKey,
    ).toBe(defaultPrivateKey);
    expect(
      normalizeRuntimeConfig(
        {
          p2p: {
            participantPrivateKey: overridePrivateKey,
          },
        } as Partial<AppRuntimeConfig>,
        defaults,
      ).p2p.participantPrivateKey,
    ).toBe(overridePrivateKey);
  });

  it("derives the configured participant public key from the private JWK when omitted", async () => {
    const exported = await exportParticipantKeyPair(await createParticipantKeyPair(SHARED_DEMO_PARTICIPANT_ID));
    const config = normalizeRuntimeConfig({
      p2p: {
        participantPrivateKey: exported.privateKey,
      },
    } as Partial<AppRuntimeConfig>);

    expect(config.p2p.participantPublicKeys[SHARED_DEMO_PARTICIPANT_ID]).toMatchObject({
      kty: "RSA",
      n: exported.privateKey.n,
      e: exported.privateKey.e,
      key_ops: ["wrapKey"],
    });
  });

  it("loads runtime config overlays in config, build key, then local key order", async () => {
    const exported = await exportParticipantKeyPair(await createParticipantKeyPair(SHARED_DEMO_PARTICIPANT_ID));
    const responses = new Map<string, Partial<AppRuntimeConfig>>([
      ["/config.json", { enableLog: false, p2p: { databaseName: "config-db" } } as Partial<AppRuntimeConfig>],
      [
        "/shared-participant-key.json",
        { p2p: { participantPrivateKey: exported.privateKey } } as Partial<AppRuntimeConfig>,
      ],
      [
        "/shared-participant-key.local.json",
        { p2p: { databaseName: "local-db" } } as Partial<AppRuntimeConfig>,
      ],
    ]);
    const fetchMock = vi.fn(async (path: string | URL | Request, init?: RequestInit) => {
      expect(init).toMatchObject({ cache: "no-store" });
      const response = responses.get(path.toString());
      return response
        ? new Response(JSON.stringify(response), { status: 200 })
        : new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const config = await loadRuntimeConfig();

    expect(fetchMock).toHaveBeenCalledTimes(RUNTIME_CONFIG_PATHS.length);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(RUNTIME_CONFIG_PATHS);
    expect(config.enableLog).toBe(false);
    expect(config.p2p.databaseName).toBe("local-db");
    expect(config.p2p.participantPrivateKey).toEqual(exported.privateKey);
    expect(config.p2p.participantPublicKeys[SHARED_DEMO_PARTICIPANT_ID]).toMatchObject({
      n: exported.privateKey.n,
      e: exported.privateKey.e,
    });
  });

  it("ignores missing optional runtime config overlays", async () => {
    const fetchMock = vi.fn(async (path: string | URL | Request) => {
      if (path.toString() === "/config.json") {
        return new Response(JSON.stringify({ enableLog: false }), { status: 200 });
      }

      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const config = await loadRuntimeConfig();

    expect(config.enableLog).toBe(false);
    expect(config.p2p.participantId).toBe(SHARED_DEMO_PARTICIPANT_ID);
    expect(config.p2p.participantPrivateKey).toBeUndefined();
    expect(config.p2p.allowGeneratedParticipantKeys).toBe(false);
  });
});
