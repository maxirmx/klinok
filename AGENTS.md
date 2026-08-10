# Project rules

## Source copyright headers

- Every maintained source file that supports comments must include the following copyright notice at the top, using the file format's appropriate comment syntax. Keep shebangs and required parser directives before the notice. HTML and CSS artifacts are exempt, as are data formats such as JSON that do not support comments.

  ```text
  Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
  All rights reserved.
  This file is a part of Klinok application
  ```

## Validation

- The Compose end-to-end suite (`npm run test:e2e:compose`) must pass for every change.

## Shared UI components

- Every paginated interface must use `src/components/AppPaginator.vue`. Do not implement page navigation buttons, item ranges, or page-size selectors inline in screens or other components.
- Prefer small icon-only action buttons. Every icon-only button must provide a concise tooltip with `title` and an equivalent accessible name with `aria-label`.
- In tables and table-like row layouts, align cell contents to the top on both wide and narrow screens. Mixed-height content such as status badges, identities, and action buttons must share the same top alignment rather than being vertically centered.

## Medical cards

- Render every checkbox or radio group as a bordered panel with rounded corners. Use a semantic `fieldset` and `legend`; when the visual group label is separate, keep the `legend` available to assistive technology.
- Render terminal checkbox and radio options with the shared `medical-card-options` responsive grid. Use the same option-column sizing and gaps for every group so checkboxes align across panels. Options must flow into as many columns as fit and collapse naturally on narrow screens; do not force these groups into a single column.
- On wide screens, place a checkbox or radio group's visible label in the shared label column and its options in the shared content column, aligned with neighboring fields. On narrow screens, stack the label above the options. Do not render selected-option counters.
- Lay out visible single-select questions in pairs when both selectors are compact. Treat a selector as naturally wide when its question label or any option label exceeds 40 characters.
- Promote selectors to the full content width according to these rules: when a group has no second selector, the first selector is always wide; when the second selector is conditionally hidden, the first visible selector grows wide; and when the second visible selector is naturally wide, both the first and second selectors are wide. Naturally wide selectors always span the full content width themselves.
- Set medical-card comment textareas to `rows="2"` and apply the shared `medical-card-comment` class so global textarea minimum heights do not enlarge them. Keep larger textareas for standalone free-text sections whose primary content is not a comment.
- In read-only medical-record history, structured section body text and values must inherit the same font family, size, weight, and line height as the `Что случилось` section. Labels may use the shared smaller muted-label treatment, but nested templates must not introduce a different body typography scale.

## User-facing alerts

- Use `src/stores/alert.ts` for transient operation success and error messages that belong to the current page. Render them only through the shared `src/components/AppAlert.vue` surface; do not add screen-local page-level alert implementations.
- Keep validation messages beside their fields, modal-specific errors inside the open modal, and persistent application states such as permissions, device enrollment, key recovery, and synchronization in their contextual components.
- Alerts are single-message, latest-wins state. They remain until dismissed or navigation changes the route path; query-only and hash-only navigation must preserve them.

## Cross-source consistency

- For every flow that crosses the auth directory, control projection, medical projection, or an event-embedded snapshot, explicitly choose the authoritative source for current identity, status, and action identifiers. Use that authority consistently from list or search result through selection, modal display, mutation, and refresh.
- Carry opaque server-provided account, pet, request, grant, role, and parent-grant identifiers through the complete UI flow. Do not reconstruct an action target from a display name, list position, or a different local projection, and make exact identifier matches take precedence over fuzzy search matches.
- Revalidate the authoritative record immediately before a state-changing action. A modal may become stale while it is open; if the target, status, permission, grant, request, role, or device certificate has changed, stop the action, refresh the view, and show a contextual message.
- Do not expose an enabled action for a directory-backed row until every required local projection and cryptographic artifact is actionable. Represent projection lag as an explicit synchronizing or unavailable state instead of allowing an operation that is expected to fail.
- Resolve current user and pet names from the authoritative current profile when the UI promises a current identity. Keep names embedded in historical events as immutable historical snapshots and do not silently present them as current identities.
- Treat writes to more than one store as a synchronization workflow. Make operations idempotent, persist unfinished work in the account-scoped outbox, preserve dependency order, retry transient failures, surface pending synchronization, and use terminal tombstones for deletions. Never report a multi-store operation as fully synchronized while a required write is only in memory or has failed.
- Reconcile competing projections with monotonic revisions or timestamps and deterministic tie-breaking. Never overwrite a newer directory record, pet snapshot, key version, role decision, grant, or device revocation with an older local observation.
- Scope asynchronous observers and subscriptions to the active account and repository instance. Ignore callbacks from disposed connections, and clear account-specific projections, conflicts, and pending UI state during logout, forced reconnect, or account changes.
- Preserve replay compatibility for existing event histories. Enforce new invariants at the command boundary when rejecting an old event in a reducer would make a valid legacy history unreplayable; otherwise introduce an explicit migration or protocol version.
- Add regression tests for every cross-source flow. At minimum cover either side being ahead, missing or undecryptable local data, delayed events, rename after snapshot creation, partial multi-store failure and retry, deletion races, stale open modals, reconnect callbacks, revoked devices, and server-provided identifiers differing from locally derivable targets.
