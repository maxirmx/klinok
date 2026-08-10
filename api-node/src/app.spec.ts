// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it, vi } from "vitest";
import { buildApi } from "./app.js";
import type { Database } from "./db.js";
import { Ledger } from "./ledger.js";

describe("API rate limiting", () => {
  it("applies the global limit and returns a structured 429 response", async () => {
    const zeroHash = "0".repeat(64);
    const pool = { query: vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM audit_blocks")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("SELECT height, block_hash FROM ledger_head")) {
        return { rows: [{ height: "0", block_hash: zeroHash }], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }) };
    const database = {
      migrate: vi.fn().mockResolvedValue(undefined),
      pool,
    } as unknown as Database;
    const app = await buildApi({
      host: "127.0.0.1",
      port: 8090,
      databaseUrl: "postgres://unused",
      publicOrigin: "http://localhost:8080",
      cookieSecure: false,
      enforceOrigin: true,
      trustProxy: false,
      sessionDays: 30,
      bootstrapAccountId: "bootstrap-administrator",
      legal: { personalDataConsentVersion: "test", userAgreementVersion: "test" },
      smtp: { host: "127.0.0.1", port: 1025, secure: false, from: "test@example.invalid" },
    }, { db: database, ledger: new Ledger() });
    app.log.level = "silent";

    try {
      let response;
      for (let request = 0; request <= 300; request += 1) {
        response = await app.inject({ method: "GET", url: "/healthz", remoteAddress: "192.0.2.1" });
      }

      expect(response?.statusCode).toBe(429);
      expect(response?.headers["retry-after"]).toBe("60");
      expect(response?.json()).toEqual({
        error: { code: "RATE_LIMITED", message: "Rate limit exceeded, retry in 1 minute." },
      });
    } finally {
      await app.close();
    }
  });
});
