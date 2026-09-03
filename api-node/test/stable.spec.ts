// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it } from "vitest";
import { normalizeEmail, sha256, stableSerialize } from "../src/stable.js";

describe("canonical serialization", () => {
  it("sorts nested object keys while retaining array order", () => {
    expect(stableSerialize({ z: 1, child: { b: 2, a: 1 }, values: [2, 1], ignored: undefined }))
      .toBe('{"child":{"a":1,"b":2},"values":[2,1],"z":1}');
    expect(sha256("same")).toHaveLength(64);
  });

  it("normalizes account emails consistently", () => {
    expect(normalizeEmail("  USER@Example.RU ")).toBe("user@example.ru");
  });
});
