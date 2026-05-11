# OPH-98: i18n Infrastructure

## Status: Deployed
**Created:** 2026-05-07
**Last Updated:** 2026-05-07

## Dependencies
- None (foundational feature — OPH-99 and OPH-100 depend on this)

## Overview
Install and configure an internationalization (i18n) library for the Next.js App Router, extract all existing German UI strings into translation files, and establish the infrastructure that allows OPH-99 (tenant-level language) and OPH-100 (user-level language override) to determine and apply the active locale at runtime.

Supported locales in this phase: **de** (German, default) and **en** (English).

## User Stories
- As a developer, I want a central place to define UI strings in multiple languages so that I never need to hunt for hardcoded German text again.
- As a developer, I want locale resolution logic in one place (middleware or layout) so that new locale sources (tenant setting, user preference) can be plugged in without touching every component.
- As a user, I want the UI language to be consistent across every page so that I never see a mix of German and English.
- As a platform admin, I want the admin area to also support both languages so that the internationalised experience is complete.

## Acceptance Criteria
- [ ] An i18n library is installed and configured for the Next.js App Router (recommended: `next-intl`).
- [ ] Translation files exist for `de` and `en` covering every hardcoded UI string in the app (labels, button text, error messages, placeholder text, headings, toast messages).
- [ ] A locale resolution function exists that accepts an ordered list of preferred locales (user preference → tenant default → browser `Accept-Language` header → fallback `de`) and returns the active locale.
- [ ] The resolved locale is applied consistently on every server-rendered page and client component without page reload.
- [ ] German remains the default locale; the app behaves identically to today when no preference is set.
- [ ] All existing pages render without visual regression in `de` locale after string extraction.
- [ ] English translations are complete (no untranslated fallback keys visible to the user).
- [ ] TypeScript type safety: accessing a missing translation key is a compile-time error.
- [ ] No locale prefix is added to URLs (locale is determined by user/tenant preference, not URL path).

## Edge Cases
- A translation key exists in `de` but not yet in `en` — should fall back to the `de` string, not show a raw key.
- A new developer adds a hardcoded string in a component without going through the translation system — linting rule or CI check should catch this (optional for MVP, document as a follow-up).
- The app is rendered during server-side generation with no user session (e.g., public `/orders/preview`) — should default to `de`.
- Strings that include dynamic values (e.g., "Willkommen, {name}") must support interpolation in both locales.
- Pluralisation rules differ between `de` and `en` (e.g., "1 Bestellung" vs "2 Bestellungen") — the library must support plural forms.
- Date, number, and currency formatting may differ between locales — use the library's formatting helpers rather than hardcoded formats.
- Salesforce App (`/sf/*` routes) must also be covered by the same i18n infrastructure.

## Technical Requirements
- Library choice: `next-intl` (supports App Router, server components, no URL-prefix requirement).
- Translation files: JSON format at `messages/de.json` and `messages/en.json`.
- Locale detection: implemented as a utility function (`resolveLocale(preferences: string[]): Locale`) so OPH-99 and OPH-100 can supply preferences without coupling to middleware internals.
- No changes to URL structure (no `/de/` or `/en/` prefix in routes).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### System Overview

```
User makes a request
        │
        ▼
Middleware (src/middleware.ts)
  └── passes preferred_locale cookie through unchanged
        │
        ▼
Root Layout (src/app/layout.tsx)
  └── reads preferred_locale cookie
  └── calls resolveLocale([cookieValue]) → "de" | "en"
  └── loads messages/de.json or messages/en.json
  └── wraps entire app in <NextIntlClientProvider locale messages>
        │
        ├──▶ Protected Layout  (OPH app pages)
        │       └── components call useTranslations() / getTranslations()
        │
        └──▶ Salesforce Layout  (/sf/* pages)
                └── components call useTranslations() / getTranslations()
```

No URL changes. The locale lives in a cookie; routes stay identical.

### New Files & Folders

```
messages/
  de.json         ← All German strings, organised by page area
  en.json         ← Matching English strings, same keys

src/
  i18n/
    request.ts    ← next-intl config: how to find the active locale per request
    routing.ts    ← Declares supported locales (de, en) + default (de)
  lib/
    i18n/
      resolve-locale.ts   ← resolveLocale(preferences[]) utility function
```

No new pages, no new DB tables.

### Translation File Structure

Both `de.json` and `en.json` share the same key hierarchy:

```
messages/
  de.json / en.json
    ├── common          ← Shared: "Speichern", "Abbrechen", "Laden..."
    ├── auth            ← Login, password reset, invite accept
    ├── orders          ← Orders list, upload, review, export
    ├── settings        ← Tenant settings, team, article catalog
    ├── admin           ← Admin panel (tenants, dealers, ERP configs)
    └── salesforce      ← Salesforce App (/sf/*)
```

TypeScript enforces key existence at compile time — accessing a missing key is a build error.

### Locale Resolution

`resolveLocale(preferences: string[])` in `src/lib/i18n/`:
- Accepts an ordered preference list (user pref → tenant pref → fallback)
- Returns the first valid locale (`"de"` or `"en"`)
- Falls back to `"de"` if the list is empty or all values are null/unknown
- OPH-99 and OPH-100 supply values to this list; they don't own the logic

### Cookie Bridge

```
Name:      preferred_locale
Values:    "de" | "en"
Written:   OPH-99 (tenant settings) and OPH-100 (user profile)
Read:      Root layout (server-side, every request)
Absent:    resolveLocale() returns "de" — no behaviour change from today
httpOnly:  false (must be readable server-side via cookies() API)
SameSite:  Lax, Secure in production, path: /
```

This cookie is the only coupling point between the infrastructure and the preference features.

### Tech Decision: Cookie-Based Locale (No URL Prefix)

| Option | Why not chosen |
|---|---|
| URL prefix (`/de/…`) | Breaks every existing URL, bookmark, and redirect in the app |
| Cookie-based (chosen) | Zero URL changes; works with existing auth middleware |
| Browser Accept-Language only | Ignores stored user/tenant preference |

`next-intl` supports both modes. We use "without i18n routing" (no URL prefix).

### Dependencies

| Package | Purpose |
|---|---|
| `next-intl` | App Router–native i18n — `useTranslations`, `getTranslations`, `NextIntlClientProvider`, plural support, date/number formatting |

## QA Test Results
_To be added by /qa_

## Deployment

- **Production:** https://oph-ki.ids.online — Deployed 2026-05-11
- **Staging:** https://oph-ki-staging.ids.online — Deployed 2026-05-11
- **Dev:** https://oph-ki-dev.ids.online — Deployed 2026-05-11
- No DB migration. Adds `next-intl`, `messages/{de,en}.json`, locale resolution helpers.
