// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type { SignedEvent } from "@klinok/protocol";

const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_INITIAL_RETRY_DELAY_MS = 100;

interface AuthObserverHttpError extends Error {
  status: number;
}

export interface AuthObserverNotificationFailure {
  event: SignedEvent;
  attempt: number;
  maxAttempts: number;
  retrying: boolean;
  error: Error;
}

export interface AuthObserverNotifierOptions {
  url?: string;
  token?: string;
  maxAttempts?: number;
  initialRetryDelayMs?: number;
  fetch?: typeof globalThis.fetch;
  wait?: (delayMs: number) => Promise<void>;
  onFailure?: (failure: AuthObserverNotificationFailure) => void;
}

function httpError(status: number): AuthObserverHttpError {
  return Object.assign(new Error(`Auth observer responded with HTTP ${status}.`), { status });
}

function retryable(error: Error): boolean {
  if (!("status" in error)) return true;
  const status = Number(error.status);
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function asError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

export class AuthObserverNotifier {
  private readonly maxAttempts: number;
  private readonly initialRetryDelayMs: number;
  private readonly fetchRequest: typeof globalThis.fetch;
  private readonly wait: (delayMs: number) => Promise<void>;

  constructor(private readonly options: AuthObserverNotifierOptions) {
    this.maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    this.initialRetryDelayMs = Math.max(0, options.initialRetryDelayMs ?? DEFAULT_INITIAL_RETRY_DELAY_MS);
    this.fetchRequest = options.fetch ?? globalThis.fetch;
    this.wait = options.wait ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  }

  async notify(event: SignedEvent): Promise<void> {
    if (!this.options.url || !this.options.token) return;
    let delayMs = this.initialRetryDelayMs;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchRequest(this.options.url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.options.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(event),
        });
        if (!response.ok) throw httpError(response.status);
        return;
      } catch (reason) {
        const error = asError(reason);
        const shouldRetry = attempt < this.maxAttempts && retryable(error);
        this.options.onFailure?.({
          event,
          attempt,
          maxAttempts: this.maxAttempts,
          retrying: shouldRetry,
          error,
        });
        if (!shouldRetry) throw error;
        await this.wait(delayMs);
        delayMs *= 2;
      }
    }
  }
}
