// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it } from "vitest";
import { loadApiConfig } from "../src/config.js";

describe("API configuration", () => {
  it.each([
    [undefined, false],
    ["", false],
    ["false", false],
    ["true", true],
    ["uniquelocal", "uniquelocal"],
    ["10.0.0.0/8", "10.0.0.0/8"],
  ])("parses KLINOK_TRUST_PROXY=%s", (value, expected) => {
    expect(loadApiConfig({ KLINOK_TRUST_PROXY: value }).trustProxy).toBe(expected);
  });

  it("rejects obsolete numeric hop-count trust", () => {
    expect(() => loadApiConfig({ KLINOK_TRUST_PROXY: "1" })).toThrow(
      "KLINOK_TRUST_PROXY does not support numeric hop counts",
    );
  });
});
