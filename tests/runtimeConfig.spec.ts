// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it, vi } from "vitest";
import {
  createDefaultRuntimeConfig,
  DEVELOPMENT_TRUSTED_NODE_MULTIADDR,
  normalizeRuntimeConfig,
  PRODUCTION_TRUSTED_NODE_MULTIADDR,
  RUNTIME_CONFIG_PATHS,
  loadRuntimeConfig,
} from "../src/runtimeConfig";

describe("operational runtime config", () => {
  it("uses only the public config overlay", () => {
    expect(RUNTIME_CONFIG_PATHS).toEqual(["/config.json"]);
  });

  it("pins the versioned control and medical databases without writer overrides", () => {
    const config = createDefaultRuntimeConfig(true);
    expect(config.p2p.dataGeneration).toBe("v2");
    expect(config.p2p.controlDatabaseName).toBe("klinok-control-v2");
    expect(config.p2p.medicalDatabaseName).toBe("klinok-medical-v4");
    expect(config.p2p.trustedNodeMultiaddrs).toEqual([DEVELOPMENT_TRUSTED_NODE_MULTIADDR]);
    expect(Object.keys(config.p2p)).not.toContain("writeIdentityIds");
    expect(Object.keys(config.p2p)).not.toContain("participantPrivateKey");
  });

  it("uses the production trusted node and normalizes public legal metadata", () => {
    const defaults = createDefaultRuntimeConfig(false);
    const config = normalizeRuntimeConfig({ legal: { personalDataConsent: { version: "v2", href: "/consent-v2" } } }, defaults);
    expect(config.p2p.trustedNodeMultiaddrs).toEqual([PRODUCTION_TRUSTED_NODE_MULTIADDR]);
    expect(config.legal.personalDataConsent).toEqual({ version: "v2", href: "/consent-v2" });
  });

  it("rejects configuration from incompatible data generations and database names", () => {
    expect(() => normalizeRuntimeConfig({ p2p: { dataGeneration: "v1" } })).toThrow(
      "Конфигурация приложения относится к другому поколению данных.",
    );
    expect(() => normalizeRuntimeConfig({
      p2p: { controlDatabaseName: "legacy-control" as "klinok-control-v2" },
    })).toThrow("Имя базы управляющих событий");
    expect(() => normalizeRuntimeConfig({
      p2p: { medicalDatabaseName: "legacy-medical" as "klinok-medical-v4" },
    })).toThrow("Имя базы медицинских событий");
  });

  it("loads a valid overlay and falls back when the public config is unavailable", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      authBaseUrl: "https://auth.example/",
      p2p: { trustedNodeMultiaddrs: ["  /dns4/node.example/tcp/443/wss  "] },
    })));
    await expect(loadRuntimeConfig()).resolves.toMatchObject({
      authBaseUrl: "https://auth.example",
      p2p: { trustedNodeMultiaddrs: ["/dns4/node.example/tcp/443/wss"] },
    });

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(loadRuntimeConfig()).resolves.toBeDefined();
    fetchMock.mockResolvedValueOnce(new Response("", { status: 503 }));
    await expect(loadRuntimeConfig()).resolves.toBeDefined();
  });
});
