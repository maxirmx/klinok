// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it } from "vitest";
import { dateOnly } from "./rows.js";

describe("PostgreSQL row conversion", () => {
  it("preserves date-only values returned as strings or local Date objects", () => {
    expect(dateOnly("2022-06-17")).toBe("2022-06-17");
    expect(dateOnly(new Date(2022, 5, 17))).toBe("2022-06-17");
  });
});
