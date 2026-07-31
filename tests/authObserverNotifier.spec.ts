// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it, vi } from "vitest";
import type { SignedEvent } from "@klinok/protocol";
import { AuthObserverNotifier } from "../p2p-node/src/authObserverNotifier";

const event = {
  eventId: "event-1",
  eventType: "pet.created",
} as SignedEvent;

describe("auth observer notifier", () => {
  it("retries transient failures with exponential delays", async () => {
    const fetchRequest = vi.fn()
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 202 });
    const wait = vi.fn().mockResolvedValue(undefined);
    const onFailure = vi.fn();
    const notifier = new AuthObserverNotifier({
      url: "http://auth.test/internal/events",
      token: "secret",
      fetch: fetchRequest,
      wait,
      onFailure,
    });

    await expect(notifier.notify(event)).resolves.toBeUndefined();

    expect(fetchRequest).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[100], [200]]);
    expect(onFailure).toHaveBeenCalledTimes(2);
    expect(onFailure).toHaveBeenNthCalledWith(1, expect.objectContaining({ attempt: 1, retrying: true }));
    expect(onFailure).toHaveBeenNthCalledWith(2, expect.objectContaining({ attempt: 2, retrying: true }));
  });

  it("does not retry a permanent observer rejection", async () => {
    const fetchRequest = vi.fn().mockResolvedValue({ ok: false, status: 422 });
    const wait = vi.fn().mockResolvedValue(undefined);
    const onFailure = vi.fn();
    const notifier = new AuthObserverNotifier({
      url: "http://auth.test/internal/events",
      token: "secret",
      fetch: fetchRequest,
      wait,
      onFailure,
    });

    await expect(notifier.notify(event)).rejects.toThrow("HTTP 422");
    expect(fetchRequest).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1, retrying: false }));
  });
});
