// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { buildApi } from "./app.js";
import { loadApiConfig } from "./config.js";
import { Database } from "./db.js";
import { Ledger } from "./ledger.js";
import { EmailWorker } from "./mailer.js";

const config = loadApiConfig();
const db = new Database(config.databaseUrl);
const ledger = new Ledger();
const app = await buildApi(config, { db, ledger });
const worker = new EmailWorker(db, config.smtp);
worker.start();

let closing = false;
async function close(): Promise<void> {
  if (closing) return;
  closing = true;
  await worker.stop();
  await app.close();
  await db.close();
}

process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());

try {
  await app.listen({ host: config.host, port: config.port });
} catch (reason) {
  app.log.error(reason);
  await close();
  process.exitCode = 1;
}
