// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

const encounterErrorSelector = [
  '[data-encounter-error-anchor="true"]',
  '[aria-invalid="true"]',
  "input:invalid",
  "select:invalid",
  "textarea:invalid",
].join(", ");

function isNativeFormControl(element: HTMLElement): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return element instanceof HTMLInputElement
    || element instanceof HTMLSelectElement
    || element instanceof HTMLTextAreaElement;
}

export function focusFirstEncounterError(form: HTMLFormElement): HTMLElement | null {
  const target = form.querySelector<HTMLElement>(encounterErrorSelector);
  if (!target) return null;

  if (!isNativeFormControl(target) && !target.hasAttribute("tabindex")) target.tabIndex = -1;
  const reducedMotion = form.ownerDocument.defaultView
    ?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  target.scrollIntoView?.({
    behavior: reducedMotion ? "auto" : "smooth",
    block: "start",
    inline: "nearest",
  });
  target.focus({ preventScroll: true });
  if (isNativeFormControl(target) && !target.validity.valid) target.reportValidity();
  return target;
}
