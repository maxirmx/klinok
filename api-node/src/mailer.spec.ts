// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it, vi } from "vitest";
import { EmailWorker, type EmailTransport } from "./mailer.js";

describe("email outbox", () => {
  it("uses bounded exponential retries and records a terminal failure", async () => {
    let attempts = 0;
    let terminalError = "";
    const delays: number[] = [];
    const query = vi.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.startsWith("SELECT email_id")) return terminalError ? { rows: [], rowCount: 0 } : {
        rows: [{ email_id: "email-1", recipient: "user@example.ru", subject: "Тема", text_body: "Текст", attempts }], rowCount: 1,
      };
      if (sql.includes("terminal_error = $3")) {
        attempts = Number(values[1]); terminalError = String(values[2]); return { rows: [], rowCount: 1 };
      }
      if (sql.includes("next_attempt_at")) {
        attempts = Number(values[1]); delays.push(Number(values[2])); return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const transport: EmailTransport = { sendMail: vi.fn().mockRejectedValue(new Error("SMTP unavailable")), close: vi.fn() };
    const worker = new EmailWorker({ pool: { query } } as never, {
      host: "mail", port: 1025, secure: false, from: "Клинок <noreply@klinok.local>",
    }, transport);

    for (let attempt = 0; attempt < 8; attempt += 1) await worker.flush();

    expect(transport.sendMail).toHaveBeenCalledTimes(8);
    expect(delays).toEqual([2, 4, 8, 16, 32, 64, 128]);
    expect(attempts).toBe(8);
    expect(terminalError).toBe("SMTP unavailable");
  });
});
