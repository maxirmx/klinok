// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

function errorDetails(reason: unknown): Record<string, string> {
  const candidate = reason && typeof reason === "object"
    ? reason as { name?: unknown; message?: unknown; code?: unknown }
    : null;
  const message = reason instanceof Error
    ? reason.message
    : typeof candidate?.message === "string"
      ? candidate.message
      : String(reason);
  return {
    errorMessage: message,
    ...(typeof candidate?.name === "string" ? { errorName: candidate.name } : {}),
    ...(typeof candidate?.code === "string" ? { errorCode: candidate.code } : {}),
  };
}

export function logInitializationError(event: string, stage: string, reason: unknown): void {
  console.error(JSON.stringify({
    level: "error",
    event,
    stage,
    ...errorDetails(reason),
  }), reason);
}
