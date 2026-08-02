# Project rules

## Source copyright headers

- Every maintained source file that supports comments must include the following copyright notice at the top, using the file format's appropriate comment syntax. Keep shebangs and required parser directives before the notice. HTML and CSS artifacts are exempt, as are data formats such as JSON that do not support comments.

  ```text
  Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
  All rights reserved.
  This file is a part of Klinok application
  ```

## Shared UI components

- Every paginated interface must use `src/components/AppPaginator.vue`. Do not implement page navigation buttons, item ranges, or page-size selectors inline in screens or other components.
- Prefer small icon-only action buttons. Every icon-only button must provide a concise tooltip with `title` and an equivalent accessible name with `aria-label`.
- In tables and table-like row layouts, align cell contents to the top on both wide and narrow screens. Mixed-height content such as status badges, identities, and action buttons must share the same top alignment rather than being vertically centered.

## Medical cards

- Render terminal checkbox and radio option groups in medical cards with the shared `medical-card-options` responsive grid. Options must flow into as many columns as fit and collapse naturally on narrow screens; do not force these groups into a single column.
- Set medical-card comment textareas to `rows="2"` and apply the shared `medical-card-comment` class so global textarea minimum heights do not enlarge them. Keep larger textareas for standalone free-text sections whose primary content is not a comment.

## User-facing alerts

- Use `src/stores/alert.ts` for transient operation success and error messages that belong to the current page. Render them only through the shared `src/components/AppAlert.vue` surface; do not add screen-local page-level alert implementations.
- Keep validation messages beside their fields, modal-specific errors inside the open modal, and persistent application states such as permissions, device enrollment, key recovery, and synchronization in their contextual components.
- Alerts are single-message, latest-wins state. They remain until dismissed or navigation changes the route path; query-only and hash-only navigation must preserve them.
