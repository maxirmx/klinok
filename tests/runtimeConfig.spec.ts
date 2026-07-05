// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { describe, expect, it } from "vitest";
import {
  createDefaultRuntimeConfig,
  DEVELOPMENT_TRUSTED_NODE_MULTIADDR,
  normalizeRuntimeConfig,
  PRODUCTION_TRUSTED_NODE_MULTIADDR,
  type AppRuntimeConfig,
} from "../src/runtimeConfig";

describe("runtime config", () => {
  it("does not expose backend mode selection in defaults or normalized config", () => {
    const defaults = createDefaultRuntimeConfig(true);
    const normalized = normalizeRuntimeConfig({ backendMode: "mock" } as Partial<AppRuntimeConfig>, defaults);

    expect(Object.prototype.hasOwnProperty.call(defaults, "backendMode")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(normalized, "backendMode")).toBe(false);
  });

  it("targets the localhost trusted node in development", () => {
    expect(createDefaultRuntimeConfig(true).p2p.trustedNodeMultiaddrs).toEqual([DEVELOPMENT_TRUSTED_NODE_MULTIADDR]);
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

  it("falls back to the default participant private key when the override is missing or invalid", () => {
    const defaultPrivateKey: JsonWebKey = { kty: "oct", k: "default-key" };
    const overridePrivateKey: JsonWebKey = { kty: "oct", k: "override-key" };
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
});
