import { describe, expect, it } from "vitest";
import { normalizePetProfile, petBirthSummary, preparePetPhoto } from "../src/petProfile";

describe("pet profile normalization", () => {
  it("keeps only supported fields and clears legacy sex values", () => {
    const normalized = normalizePetProfile({
      petId: "pet-1",
      ownerAccountId: "owner-1",
      name: "Шарик",
      species: "Собака",
      breed: "Бигль",
      sex: "Кобель",
      birthYear: 2022,
      color: "трёхцветный",
      weightKg: 12.4,
      notes: "Заметка",
      legacyOptionalField: "drop-me",
      keyVersion: 1,
      tombstoned: false,
      updatedAt: "2026-07-17T10:00:00.000Z",
    });

    expect(normalized.sex).toBeUndefined();
    expect(normalized.notes).toBe("Заметка");
    expect(normalized).not.toHaveProperty("legacyOptionalField");
  });

  it("renders exact completed age or a year-only summary", () => {
    expect(petBirthSummary({ birthDate: "2022-07-18" }, new Date("2026-07-17T12:00:00Z"))).toBe("3 полных лет · 18.07.2022");
    expect(petBirthSummary({ birthYear: 2021 }, new Date("2026-07-17T12:00:00Z"))).toBe("2021 год рождения");
  });

  it("rejects unsupported photo formats before decoding", async () => {
    const file = new File(["not-an-image"], "pet.gif", { type: "image/gif" });
    await expect(preparePetPhoto(file)).rejects.toThrow("JPEG, PNG или WebP");
  });
});
