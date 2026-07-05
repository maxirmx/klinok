// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { describe, expect, it, vi } from "vitest";
import { KlinokAccessController } from "../src/cases/accessController";

describe("case access controller", () => {
  it("keeps wildcard writes open without fetching writer identities", async () => {
    const access = await KlinokAccessController({ write: ["*"] })({
      identities: {
        getIdentity: vi.fn(async () => {
          throw new Error("identity should not be fetched for wildcard writes");
        }),
        verifyIdentity: vi.fn(async () => false),
      },
    });

    await expect(access.canAppend({ identity: "missing-identity-block" })).resolves.toBe(true);
  });

  it("treats malformed persisted writer lists as empty instead of throwing", async () => {
    const access = await KlinokAccessController()({ address: "/klinok/%E0%A4%A" });

    expect(access.write).toEqual([]);
    await expect(access.canAppend({ identity: "identity-hash" })).resolves.toBe(false);
  });
});
