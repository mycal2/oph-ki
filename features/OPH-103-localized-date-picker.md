# OPH-103: Localized Date Picker (Replace Native `<input type="date">`)

## Status: Planned
**Created:** 2026-05-11
**Last Updated:** 2026-05-11

## Dependencies
- OPH-98 (i18n Infrastructure) — uses `useLocale()` for locale resolution
- OPH-100 (User-Level Language Override) — user's chosen locale must drive picker format
- OPH-101 Batch 2 (deployed) — uncovered this gap

## Background

OPH-101 Batch 2 migrated user-facing text on `/orders` to i18n. The page now switches between DE and EN labels correctly — but the date filter still renders in German format regardless of the user's chosen locale.

**Root cause:** the date filter uses native HTML `<input type="date">`. Browsers display the calendar/picker using the **browser or OS locale**, not anything controllable from app code. `useLocale()` cannot influence the rendering.

**Existing pattern to reuse:** `src/components/admin/date-range-picker.tsx` already implements a shadcn `Calendar + Popover` based date-range picker — but it imports `de` from `date-fns/locale` unconditionally and has a hardcoded German `aria-label`, so it's also locale-broken.

## Scope

Replace native `<input type="date">` with a locale-aware shadcn-based picker AND fix the existing admin date-range picker so both honor the user's locale.

**Files to change (3 call-sites + 1 existing component):**
1. `src/components/orders/orders-filter-bar.tsx:160,168` — date-from / date-to filter on `/orders`
2. `src/components/orders/review/order-edit-form.tsx:202` — order date field on the review form
3. `src/components/admin/date-range-picker.tsx` — make existing component locale-aware (admin reports page)

**New component:**
- `src/components/ui/date-picker.tsx` (or `src/components/date-picker.tsx`) — a single-date version of the existing range picker, locale-aware via `useLocale()` and date-fns locale lookup.

**Already-locale-aware:** `recent-orders.tsx:48` (uses `toLocaleDateString` with `useLocale()` mapping) — no change needed; only DISPLAY of dates, not picker.

## User Stories

- As a tenant user with `user_locale = en`, I want the date picker on `/orders` to display in English (e.g. month names "January") so my UI feels consistent.
- As a tenant user with `user_locale = en`, I want the order-review date field to use English month/day order so I don't have to translate in my head.
- As a platform admin, I want the date-range picker on the reports page to follow my locale, not be permanently in German.
- As any user, the user-locale change should take effect immediately on next page load — no extra config.

## Acceptance Criteria

- [ ] No `<input type="date">` remains in `src/components/orders/` or any other tenant-facing component (admin pages may still have native inputs if not in scope, but the 3 cited call-sites are migrated).
- [ ] A shared `DatePicker` component exists, accepts `value: Date | undefined`, `onChange: (date: Date | undefined) => void`, and reads `useLocale()` internally.
- [ ] When `useLocale() === "en"`, the calendar UI shows English month names and weekday abbreviations.
- [ ] When `useLocale() === "de"`, the calendar UI shows German month names and weekday abbreviations.
- [ ] The format string in the trigger button label respects locale (e.g. DE: `11.05.2026`, EN: `11/05/2026` or `May 11, 2026`).
- [ ] `aria-label` on the trigger uses `t("dateFromAriaLabel")` / equivalent i18n keys — no hardcoded German.
- [ ] `admin/date-range-picker.tsx` is updated to be locale-aware (no hardcoded German `aria-label` or `de` locale import).
- [ ] All 3 call-sites pass the user's locale through correctly — verified by switching language at `/settings/profile` and reloading.
- [ ] DE/EN parity preserved in `messages/{de,en}.json` for any new keys.
- [ ] `npx tsc --noEmit` clean.

## Edge Cases

- **User switches locale mid-session:** picker re-renders with new locale on next page load (we don't need real-time switching — the existing `useLocale()` resolves on render).
- **Date input must remain ISO format internally:** `filters.dateFrom` is a string in `YYYY-MM-DD` form (stored in URL state). The picker should still emit ISO strings to maintain API/URL contract — only the *display* changes.
- **Empty / cleared value:** picker shows the placeholder ("Datum wählen" / "Pick date") in the user's locale.
- **Date range constraints:** orders-filter-bar uses two independent date pickers (from / to). Component should not enforce relationship between them — that stays in `OrdersFilterBar`.
- **Salesforce app:** `salesforce-order-history.tsx` (deployed via OPH-88) uses its own date filter — check whether it has the same gap; if so, fold it into this ticket scope. Otherwise leave for a follow-up.

## Technical Requirements

- Use shadcn `Calendar` (`src/components/ui/calendar.tsx`) + `Popover` (`src/components/ui/popover.tsx`) — both already installed.
- Map `useLocale()` to a `date-fns` locale: `de` → `de`, `en` → `enGB` (DD/MM/YYYY) or `enUS` (MM/DD/YYYY) — recommend `enGB` for European English consistency.
- No DB migration.
- No backend changes.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
