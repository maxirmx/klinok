// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it } from "vitest";
import { suggestedDeviceName } from "../src/deviceName";

describe("device name suggestion", () => {
  it("combines User-Agent Client Hints operating system and browser", () => {
    expect(suggestedDeviceName({
      userAgentData: {
        platform: "Windows",
        brands: [
          { brand: "Not_A Brand", version: "99" },
          { brand: "Chromium", version: "126" },
          { brand: "Microsoft Edge", version: "126" },
        ],
      },
    })).toBe("Windows · Edge");
  });

  it("falls back to the legacy user agent for macOS Chrome", () => {
    expect(suggestedDeviceName({
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
    })).toBe("macOS · Chrome");
  });

  it("recognizes iPadOS Safari despite its desktop platform", () => {
    expect(suggestedDeviceName({
      platform: "MacIntel",
      maxTouchPoints: 5,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
    })).toBe("iOS · Safari");
  });

  it("uses a neutral browser fallback without calling it this device", () => {
    expect(suggestedDeviceName({})).toBe("Браузер");
  });
});
