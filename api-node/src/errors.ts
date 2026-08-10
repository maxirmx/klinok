// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

export function requireText(value: unknown, field: string, maximum = 500): string {
  if (typeof value !== "string" || !value.trim()) throw new ApiError(400, "VALIDATION_FAILED", `${field} is required.`);
  const normalized = value.trim();
  if (normalized.length > maximum) throw new ApiError(400, "VALIDATION_FAILED", `${field} is too long.`);
  return normalized;
}

export function optionalText(value: unknown, maximum = 500): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new ApiError(400, "VALIDATION_FAILED", "Expected text.");
  const normalized = value.trim();
  if (normalized.length > maximum) throw new ApiError(400, "VALIDATION_FAILED", "Text is too long.");
  return normalized || undefined;
}
