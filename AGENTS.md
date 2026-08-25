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
- Codecov patch coverage—the coverage of executable lines added or modified by the current change—must be at least 90% for every change. This is distinct from overall project coverage: a passing `codecov/project` check or a high repository-wide percentage does not satisfy this requirement. Add or extend tests until the `codecov/patch` check meets the target; do not lower the target or make the check informational.

## Shared UI components

- Every paginated interface must use `src/components/AppPaginator.vue`. Do not implement page navigation buttons, item ranges, or page-size selectors inline in screens or other components.
- Every editable field that combines catalog suggestions with a free-form value must use `src/components/AppCatalogCombobox.vue`, including pet color and diagnosis fields. Do not duplicate combobox behavior or add separate “Из справочника” / “Свободная форма” mode controls.
- Keep diagnosis classifier browsing two-level: first select a leaf category, then a diagnosis. Preserve direct full-classifier search when the user types.
- Differential diagnoses must support zero or more catalog selections together with zero or more independently added free-form diagnoses. Persist both collections without making them mutually exclusive.
- Prefer small icon-only action buttons. Every icon-only button must provide a concise tooltip with `title` and an equivalent accessible name with `aria-label`.
- In tables and table-like row layouts, align cell contents to the top on both wide and narrow screens. Mixed-height content such as status badges, identities, and action buttons must share the same top alignment rather than being vertically centered.

## Medical cards

- Keep one trailing action rail across the entire medical editor: the sticky editor actions, section actions, nested-card actions, and repeated-row actions must share the same inline-end edge. Multiple actions grow inward from that edge; nested surfaces must not introduce a competing local rail.
- Render medical-editor icon actions at `34px` square with `18px` icons and `8px` gaps. Align them to the top of their heading, control, or table-like row; do not vertically center them against wrapping or mixed-height content.
- Keep field affordances such as catalog dropdown toggles and the revaccination menu toggle attached to their inputs. Place semantic actions such as save, add, import, promote, and delete on the action rail.
- Order medical-editor action groups consistently: cancel before save, import before add, and promote before delete, with the primary or destructive action at the inline end.
- Keep action-bearing collections in one full-width column so every row uses the shared action rail. Do not create parallel local rails by rendering actionable laboratory results or differential diagnoses in multiple columns.
- Preserve the action rail on narrow screens: content may stack or wrap, but action size, order, top alignment, spacing, and inline-end position must remain stable.
- Render every checkbox or radio group as a bordered panel with rounded corners. Use a semantic `fieldset` and `legend`; when the visual group label is separate, keep the `legend` available to assistive technology.
- Render terminal checkbox and radio options with the shared `medical-card-options` responsive grid. Use the same option-column sizing and gaps for every group so checkboxes align across panels. Options must flow into as many columns as fit and collapse naturally on narrow screens; do not force these groups into a single column.
- On wide screens, place a checkbox or radio group's visible label in the shared label column and its options in the shared content column, aligned with neighboring fields. On narrow screens, stack the label above the options. Do not render selected-option counters.
- Lay out visible single-select questions in pairs when both selectors are compact. Treat a selector as naturally wide when its question label or any option label exceeds 40 characters.
- Promote selectors to the full content width according to these rules: when a group has no second selector, the first selector is always wide; when the second selector is conditionally hidden, the first visible selector grows wide; and when the second visible selector is naturally wide, both the first and second selectors are wide. Naturally wide selectors always span the full content width themselves.
- Set medical-card comment textareas to `rows="2"` and apply the shared `medical-card-comment` class so global textarea minimum heights do not enlarge them. Keep larger textareas for standalone free-text sections whose primary content is not a comment.
- In read-only medical-record history, structured section body text and values must inherit the same font family, size, weight, and line height as the `Что случилось` section. Labels may use the shared smaller muted-label treatment, but nested templates must not introduce a different body typography scale.

## Instrumental hierarchy

- Use one logical depth model in every editable structured instrumental study, including new-record and existing-record editors. Root `Раздел` rows are depth 0, their direct indicators are depth 1, and every conditionally revealed or otherwise nested child advances exactly one depth from its owning indicator. Apply this model to groups, single choices, integers, short and long text, selection sets, multiple-choice panels, and add controls; do not flatten any render mode into its parent depth.
- Treat a choice-continuation selector as the result continuation of its owning indicator: keep the continuation selector at the owning indicator's visual depth and in the shared result column, without repeating the indicator label. Render indicators and controls revealed by that selected choice at the next logical depth.
- On wide layouts, express each logical depth with a `22px` label/tree-marker step. Indent the indicator label and hierarchy marker, while keeping column headings and every result control aligned to the common result column. Hierarchy rendering must not move or create a competing trailing action rail.
- On narrow layouts, indent the complete child content by the same `22px` step per logical depth while preserving the fixed action size, top alignment, order, spacing, and inline-end action-rail position. Nested content must not create horizontal page or card overflow.
- Hide an instrumental or laboratory indicator add row, including its selector and add button, when no catalog options remain at that level. Restore the row immediately when removing an indicator makes an option available again.
- Require destructive confirmation only at `Раздел` level and above, such as deleting a populated section or study. Removing or clearing indicators, choice values, selection-set values, nested groups, and other descendants below `Раздел` must be immediate, even when they contain nested data.
- Keep read-only instrumental history on its existing recursive nested-list presentation. Do not apply editable-editor depth markers, indentation rules, controls, or action-rail layout to read-only views.
- Add regression coverage for hierarchy changes across depths 0 through 3, every affected render mode, exhausted selectors, confirmation boundaries, wide label indentation with aligned result columns, and narrow indentation without overflow.

## User-facing alerts

- Use `src/stores/alert.ts` for transient operation success and error messages that belong to the current page. Render them only through the shared `src/components/AppAlert.vue` surface; do not add screen-local page-level alert implementations.
- Keep validation messages beside their fields, modal-specific errors inside the open modal, and persistent application states such as permissions, device enrollment, key recovery, and synchronization in their contextual components.
- Alerts are single-message, latest-wins state. They remain until dismissed or navigation changes the route path; query-only and hash-only navigation must preserve them.

## Search

- Treat the Russian letters `е` and `ё` as equivalent when searching by a person's full name or a pet's name. Apply the same equivalence to both the search query and the stored value.

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
