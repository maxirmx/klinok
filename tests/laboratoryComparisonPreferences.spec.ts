// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { beforeEach, describe, expect, it } from "vitest";
import {
  laboratoryComparisonPreferenceKey,
  readLaboratoryComparisonPreference,
  writeLaboratoryComparisonPreference,
  type LaboratoryComparisonScope,
} from "../src/laboratoryComparisonPreferences";

const scope: LaboratoryComparisonScope = { accountId: "account-1", role: "doctor", petId: "pet-1" };

beforeEach(() => localStorage.clear());

describe("laboratory comparison preferences", () => {
  it("builds an account, role, and pet scoped key", () => {
    expect(laboratoryComparisonPreferenceKey(scope))
      .toBe("klinok:v3:account-1:doctor:pet-1:laboratory-comparison");
    expect(laboratoryComparisonPreferenceKey({ ...scope, role: "owner" }))
      .not.toBe(laboratoryComparisonPreferenceKey(scope));
    expect(laboratoryComparisonPreferenceKey({ ...scope, petId: "pet-2" }))
      .not.toBe(laboratoryComparisonPreferenceKey(scope));
    const firstGrantScope = { ...scope, grantId: "grant-1" };
    const secondGrantScope = { ...scope, grantId: "grant-2" };
    expect(laboratoryComparisonPreferenceKey(firstGrantScope))
      .toBe(laboratoryComparisonPreferenceKey(secondGrantScope));
  });

  it("round trips stable IDs, removes duplicates, and removes an empty preference", () => {
    writeLaboratoryComparisonPreference(scope, ["indicator-1", "indicator-1", " indicator-2 "]);

    expect(readLaboratoryComparisonPreference(scope)).toEqual(["indicator-1", "indicator-2"]);
    expect(JSON.parse(localStorage.getItem(laboratoryComparisonPreferenceKey(scope)) ?? "null"))
      .toEqual({ version: 1, indicatorIds: ["indicator-1", "indicator-2"] });

    writeLaboratoryComparisonPreference(scope, []);
    expect(localStorage.getItem(laboratoryComparisonPreferenceKey(scope))).toBeNull();
  });

  it("normalizes whitespace-corrupted stored IDs", () => {
    localStorage.setItem(laboratoryComparisonPreferenceKey(scope), JSON.stringify({
      version: 1,
      indicatorIds: [" indicator-1 ", "indicator-1"],
    }));

    expect(readLaboratoryComparisonPreference(scope)).toEqual(["indicator-1"]);
  });

  it.each([
    ["damaged JSON", "{"],
    ["unknown version", JSON.stringify({ version: 2, indicatorIds: ["indicator-1"] })],
    ["non-array IDs", JSON.stringify({ version: 1, indicatorIds: "indicator-1" })],
    ["empty ID", JSON.stringify({ version: 1, indicatorIds: ["indicator-1", " "] })],
    ["non-string ID", JSON.stringify({ version: 1, indicatorIds: ["indicator-1", 2] })],
  ])("safely ignores %s", (_description, value) => {
    localStorage.setItem(laboratoryComparisonPreferenceKey(scope), value);
    expect(readLaboratoryComparisonPreference(scope)).toEqual([]);
  });

  it("does not expose browser storage failures", () => {
    const unavailable = {
      getItem() { throw new Error("denied"); },
      setItem() { throw new Error("denied"); },
      removeItem() { throw new Error("denied"); },
    };

    expect(readLaboratoryComparisonPreference(scope, unavailable)).toEqual([]);
    expect(() => writeLaboratoryComparisonPreference(scope, ["indicator-1"], unavailable)).not.toThrow();
    expect(() => writeLaboratoryComparisonPreference(scope, [], unavailable)).not.toThrow();
  });

  it("does not read or write a preference without an exact runtime scope", () => {
    const missingAccount = { ...scope, accountId: undefined } as unknown as LaboratoryComparisonScope;
    const missingPet = { ...scope, petId: "" };

    writeLaboratoryComparisonPreference(missingAccount, ["indicator-1"]);
    writeLaboratoryComparisonPreference(missingPet, ["indicator-1"]);
    expect(readLaboratoryComparisonPreference(missingAccount)).toEqual([]);
    expect(readLaboratoryComparisonPreference(missingPet)).toEqual([]);
    expect(localStorage.length).toBe(0);
  });
});
