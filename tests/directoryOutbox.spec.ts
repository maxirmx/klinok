// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enqueueDirectoryPet,
  enqueueDirectoryPetDeletion,
  enqueueDirectoryProfile,
  discardDirectoryProfileOperation,
  flushDirectoryOutbox,
  listDirectoryOutbox,
} from "../src/directoryOutbox";

describe("directory outbox", () => {
  beforeEach(() => localStorage.clear());

  it("retains failed profile and pet publication and resumes in dependency order", async () => {
    enqueueDirectoryPet("owner-1", { petId: "pet-1", species: "Собака", name: "Буся" });
    enqueueDirectoryProfile("owner-1", { firstName: "Ольга", lastName: "Владелец" });
    const calls: string[] = [];
    const syncProfile = vi.fn(async () => {
      calls.push("profile");
      throw new Error("offline");
    });
    const syncPet = vi.fn(async () => { calls.push("pet"); });

    await flushDirectoryOutbox({
      accountId: "owner-1",
      syncProfile,
      syncPet,
      deletePet: vi.fn(),
    });

    expect(calls).toEqual(["profile"]);
    expect(listDirectoryOutbox("owner-1")).toHaveLength(2);

    syncProfile.mockImplementationOnce(async () => { calls.push("profile-retry"); });
    await flushDirectoryOutbox({
      accountId: "owner-1",
      syncProfile,
      syncPet,
      deletePet: vi.fn(),
    });

    expect(calls).toEqual(["profile", "profile-retry", "pet"]);
    expect(listDirectoryOutbox("owner-1")).toEqual([]);
  });

  it("coalesces a pending pet upsert into an idempotent deletion", async () => {
    enqueueDirectoryPet("owner-1", { petId: "pet-1", species: "Собака", name: "Буся" });
    enqueueDirectoryPetDeletion("owner-1", "pet-1");
    const syncPet = vi.fn();
    const deletePet = vi.fn().mockResolvedValue(undefined);

    expect(listDirectoryOutbox("owner-1")).toEqual([
      expect.objectContaining({ kind: "pet.delete", petId: "pet-1" }),
    ]);
    await flushDirectoryOutbox({
      accountId: "owner-1",
      syncProfile: vi.fn(),
      syncPet,
      deletePet,
    });

    expect(deletePet).toHaveBeenCalledWith("pet-1");
    expect(syncPet).not.toHaveBeenCalled();
    expect(listDirectoryOutbox("owner-1")).toEqual([]);
  });

  it("discards an obsolete profile publication after an atomic server update", () => {
    enqueueDirectoryProfile("owner-1", { firstName: "Старое", lastName: "Имя" });

    discardDirectoryProfileOperation("owner-1");

    expect(listDirectoryOutbox("owner-1")).toEqual([]);
  });

  it("drops terminal tombstone failures instead of retrying a stale upsert forever", async () => {
    enqueueDirectoryPet("owner-1", { petId: "pet-1", species: "Собака", name: "Буся" });
    const terminal = Object.assign(new Error("deleted"), { code: "PET_TOMBSTONED" });

    await flushDirectoryOutbox({
      accountId: "owner-1",
      syncProfile: vi.fn(),
      syncPet: vi.fn().mockRejectedValue(terminal),
      deletePet: vi.fn(),
      isPermanentFailure: ({ reason }) => reason === terminal,
    });

    expect(listDirectoryOutbox("owner-1")).toEqual([]);
  });

  it("ignores malformed persisted operations", () => {
    localStorage.setItem("klinok:directory-outbox:owner-1", JSON.stringify([
      { operationId: "broken", kind: "pet.upsert", createdAt: "2026-07-10T10:00:00.000Z" },
      { operationId: "broken-delete", kind: "pet.delete", createdAt: "2026-07-10T10:00:00.000Z" },
      { operationId: 42, kind: "pet.delete", petId: "pet-1", createdAt: "2026-07-10T10:00:00.000Z" },
    ]));

    expect(listDirectoryOutbox("owner-1")).toEqual([]);
  });
});
