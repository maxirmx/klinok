// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg, { type PoolClient, type QueryResultRow } from "pg";

const { Pool } = pg;
export type DbClient = Pick<PoolClient, "query">;
const MIGRATION_VERSIONS = ["001_initial", "002_what_happened_catalog"] as const;

export class Database {
  readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 10 });
  }

  async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(1263956067)");
      await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
      const migrationDir = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations");
      for (const version of MIGRATION_VERSIONS) {
        const existing = await client.query("SELECT 1 FROM schema_migrations WHERE version = $1", [version]);
        if (!existing.rowCount) {
          const sql = await readFile(resolve(migrationDir, `${version}.sql`), "utf8");
          await client.query("BEGIN");
          try {
            const result = await client.query(sql);
            const report = (Array.isArray(result) ? result : [result])
              .flatMap((migrationResult) => migrationResult.rows ?? [])
              .find((row) => row && typeof row === "object" && "scanned_records" in row) as Record<string, unknown> | undefined;
            if (report?.scanned_records !== undefined) {
              console.info(`Migration ${version}: ${JSON.stringify(report)}`);
            }
            await client.query("INSERT INTO schema_migrations(version) VALUES ($1)", [version]);
            await client.query("COMMIT");
          } catch (reason) {
            await client.query("ROLLBACK");
            throw reason;
          }
        }
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(1263956067)").catch(() => undefined);
      client.release();
    }
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const value = await work(client);
      await client.query("COMMIT");
      return value;
    } catch (reason) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw reason;
    } finally {
      client.release();
    }
  }

  async one<T extends QueryResultRow>(sql: string, values: unknown[] = []): Promise<T | null> {
    const result = await this.pool.query<T>(sql, values);
    return result.rows[0] ?? null;
  }

  close(): Promise<void> { return this.pool.end(); }
}
