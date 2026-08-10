// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it, vi } from "vitest";
import {
  createDefaultRuntimeConfig,
  normalizeRuntimeConfig,
  RUNTIME_CONFIG_PATHS,
  loadRuntimeConfig,
} from "../src/runtimeConfig";

describe("operational runtime config", () => {
  it("uses only the public config overlay", () => {
    expect(RUNTIME_CONFIG_PATHS).toEqual(["/config.json"]);
  });

  it("pins the v3 API and seven-day offline lease", () => {
    const config = createDefaultRuntimeConfig();
    expect(config.dataGeneration).toBe("v3");
    expect(config.apiBaseUrl).toBe("");
    expect(config.offlineLeaseDays).toBe(7);
    expect(config.bootstrapAccountId).toBe("bootstrap-administrator");
  });

  it("normalizes API and public legal metadata", () => {
    const defaults = createDefaultRuntimeConfig();
    const config = normalizeRuntimeConfig({ legal: { personalDataConsent: { version: "v2", href: "/consent-v2" } } }, defaults);
    expect(config.legal.personalDataConsent).toEqual({ version: "v2", href: "/consent-v2" });
  });

  it("rejects configuration from an incompatible data generation", () => {
    expect(() => normalizeRuntimeConfig({ dataGeneration: "v1" })).toThrow(
      "Конфигурация приложения относится к другому поколению данных.",
    );
  });

  it("loads a valid overlay and falls back when the public config is unavailable", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      apiBaseUrl: "https://api.example/",
      offlineLeaseDays: 5,
    })));
    await expect(loadRuntimeConfig()).resolves.toMatchObject({
      apiBaseUrl: "https://api.example",
      offlineLeaseDays: 5,
      dataGeneration: "v3",
    });

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(loadRuntimeConfig()).resolves.toBeDefined();
    fetchMock.mockResolvedValueOnce(new Response("", { status: 503 }));
    await expect(loadRuntimeConfig()).resolves.toBeDefined();
  });
});
