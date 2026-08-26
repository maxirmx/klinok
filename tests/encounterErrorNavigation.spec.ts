// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { afterEach, describe, expect, it, vi } from "vitest";
import { focusFirstEncounterError } from "../src/encounterErrorNavigation";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("focusFirstEncounterError", () => {
  it("uses visual document order across native and parsed errors", () => {
    const form = document.createElement("form");
    const nativeInput = document.createElement("input");
    nativeInput.required = true;
    const parsedInput = document.createElement("input");
    parsedInput.setAttribute("aria-invalid", "true");
    form.append(nativeInput, parsedInput);
    document.body.append(form);
    const scrollIntoView = vi.fn();
    nativeInput.scrollIntoView = scrollIntoView;
    const reportValidity = vi.spyOn(nativeInput, "reportValidity");

    expect(focusFirstEncounterError(form)).toBe(nativeInput);
    expect(document.activeElement).toBe(nativeInput);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start", inline: "nearest" });
    expect(reportValidity).toHaveBeenCalledOnce();
  });

  it("makes an accessible parser-error container focusable and respects reduced motion", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    const form = document.createElement("form");
    const error = document.createElement("p");
    error.dataset.encounterErrorAnchor = "true";
    const scrollIntoView = vi.fn();
    error.scrollIntoView = scrollIntoView;
    form.append(error);
    document.body.append(form);

    expect(focusFirstEncounterError(form)).toBe(error);
    expect(error.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(error);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start", inline: "nearest" });
  });

  it("returns null when the form has no invalid fields", () => {
    expect(focusFirstEncounterError(document.createElement("form"))).toBeNull();
  });
});
