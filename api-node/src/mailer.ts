// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import nodemailer from "nodemailer";
import type { ApiConfig } from "./config.js";
import type { Database } from "./db.js";

export interface EmailTransport {
  sendMail(message: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
  close(): void;
}

export class EmailWorker {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private readonly transport: EmailTransport;

  constructor(private readonly db: Database, config: ApiConfig["smtp"], transport?: EmailTransport) {
    this.transport = transport ?? nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.user ? { auth: { user: config.user, pass: config.password ?? "" } } : {}),
    }) as EmailTransport;
    this.from = config.from;
  }

  private readonly from: string;

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), 1_000);
    void this.flush();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 10));
    this.transport.close();
  }

  async flush(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const rows = await this.db.pool.query<{
        email_id: string; recipient: string; subject: string; text_body: string; attempts: number;
      }>(`SELECT email_id, recipient, subject, text_body, attempts
          FROM email_outbox
          WHERE sent_at IS NULL AND terminal_error IS NULL AND next_attempt_at <= now()
          ORDER BY created_at ASC LIMIT 10`);
      for (const row of rows.rows) {
        try {
          await this.transport.sendMail({ from: this.from, to: row.recipient, subject: row.subject, text: row.text_body });
          await this.db.pool.query("UPDATE email_outbox SET sent_at = now() WHERE email_id = $1", [row.email_id]);
        } catch (reason) {
          const attempts = row.attempts + 1;
          const message = reason instanceof Error ? reason.message.slice(0, 500) : String(reason).slice(0, 500);
          if (attempts >= 8) {
            await this.db.pool.query("UPDATE email_outbox SET attempts = $2, terminal_error = $3 WHERE email_id = $1", [row.email_id, attempts, message]);
          } else {
            await this.db.pool.query(
              "UPDATE email_outbox SET attempts = $2, next_attempt_at = now() + ($3 * interval '1 second') WHERE email_id = $1",
              [row.email_id, attempts, Math.min(300, 2 ** attempts)],
            );
          }
        }
      }
    } finally {
      this.running = false;
    }
  }
}
