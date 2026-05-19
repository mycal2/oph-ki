# OPH-101: Full i18n Coverage

## Status: In Progress
**Created:** 2026-05-08
**Last Updated:** 2026-05-11

## Dependencies
- Requires: OPH-98 (i18n Infrastructure — next-intl, useTranslations, message JSON files, locale resolution)
- Requires: OPH-99 (Tenant-Level Language Preference)
- Requires: OPH-100 (User-Level Language Override)

## Overview
Make every user-facing string in the OPH platform and Salesforce App translatable via next-intl. OPH-98–100 laid the infrastructure and translated the auth flows and language settings cards. This feature completes the job: every label, error, toast, placeholder, ARIA attribute, and helper text in the in-scope pages is extracted to `messages/de.json` + `messages/en.json` and rendered via `useTranslations()`.

Platform-admin pages (`/admin/*`) are **out of scope** — they are used only by the internal German-speaking team.

## In-Scope Pages & Components

### Tenant Pages (any authenticated tenant/platform user)
- Sidebar navigation (`app-sidebar.tsx`, `top-navigation.tsx`)
- User menu dropdown (`user-menu.tsx`)
- Dashboard (`dashboard/recent-orders.tsx`, `dashboard/team-or-action-tile.tsx`, `orders/dashboard-stats.tsx`)
- Orders list & filter bar (`orders/orders-list.tsx`, `orders/orders-filter-bar.tsx`)
- Order upload flow (`orders/file-dropzone.tsx`, `orders/upload-file-item.tsx`, `orders/upload-file-list.tsx`)
- Order review page (`orders/review/*` — all components)
- Order detail (`orders/order-detail-content.tsx`, `orders/order-detail-header.tsx`, `orders/order-file-list.tsx`, `orders/email-body-panel.tsx`)
- Export flow (`orders/export/*` — all components)
- Dealer section & dialogs (`orders/dealer/*`)
- Order preview (public magic-link page: `orders/preview/*`)
- Extraction result preview (`orders/extraction-result-preview.tsx`, `orders/extraction-status-badge.tsx`)
- Settings — profile page (`settings/profile/page.tsx`, `tenant-logo-upload.tsx`)
- Settings — team page (`team/users-table.tsx`, `team/invite-user-dialog.tsx`, `team/edit-name-dialog.tsx`)
- Settings — article catalog (`article-catalog/*`)
- Settings — customer catalog (`customer-catalog/*`)
- Settings — dealer mappings (`dealer-mappings/*`)
- Settings — inbound email, data retention (settings pages)
- Delete order dialog (`orders/delete-order-dialog.tsx`)

### Salesforce App (sales reps)
- SF login form (`salesforce/salesforce-login-form.tsx`)
- SF header & navigation (`salesforce/salesforce-header.tsx`)
- SF home dashboard (`salesforce/salesforce-home.tsx`)
- Article search & browse (`salesforce/article-search.tsx`)
- Basket (`salesforce/basket-view.tsx`, `salesforce/basket-provider.tsx`)
- Checkout steps (`salesforce/checkout-dealer-step.tsx`, `salesforce/checkout-delivery-step.tsx`, `salesforce/checkout-confirm-step.tsx`)
- Order history (`salesforce/salesforce-order-history.tsx`, `salesforce/salesforce-order-detail.tsx`)
- SF profile (`salesforce/salesforce-profile.tsx`)

### Shared
- Error pages (404, general error boundaries)
- `environment-banner.tsx`
- `layout/tenant-context-required.tsx`

## User Stories
- As an English-speaking customer (tenant user), I want every label, button, error message, and helper text on the orders pages to appear in English when my language is set to English, so I can use the platform without knowing German.
- As a sales rep using the Salesforce App, I want the entire app — including basket, checkout, and order history — to render in English when I have set English as my language, so I can work efficiently.
- As any user, I want success and error toasts, validation messages, and empty-state descriptions to appear in my chosen language, not German.
- As a screen-reader user, I want ARIA labels and accessibility text to be translated so assistive technology announces content in the correct language.
- As a developer, I want an ESLint warning whenever a hardcoded German string is added to JSX so that new code can't silently bypass the i18n system.

## Acceptance Criteria

### Coverage
- [ ] Every user-visible string in all in-scope components is rendered via `useTranslations()` — no hardcoded German (or English) string remains in JSX for in-scope files.
- [ ] Coverage includes: UI labels & headings, button text, error & validation messages, toast notifications, input placeholders, helper text, empty-state descriptions, and ARIA/accessibility labels.
- [ ] `messages/de.json` and `messages/en.json` contain matching keys for every translated string. No key exists in one file without a counterpart in the other.

### Glossary
- [ ] `docs/i18n-glossary.md` is created and defines the canonical English translation for all domain-specific terms: Mandant→Tenant, Bestellung→Order, Händler→Dealer, Stammdaten→Master Data, Kundenstamm→Customer Catalog, Artikelstamm→Article Catalog, Kundennummer→Customer Number, Artikelnummer→Article Number, Lieferantenartikelnummer→Supplier Article Number, Außendienstler→Sales Rep, Prüfung→Review, Extraktion→Extraction, ERP-Export→ERP Export, Zeilenposition→Line Item.
- [ ] All translated English strings in `messages/en.json` are consistent with the glossary.

### ESLint
- [ ] A warn-level ESLint rule is configured that flags literal German strings (strings containing German-specific characters like ä, ö, ü, ß, or common German words) inside JSX expressions in in-scope files.
- [ ] The rule does not block builds or CI — warnings only.
- [ ] Existing violations in out-of-scope files (`/admin/*`) are suppressed or excluded from the rule.

### Functional
- [ ] A tenant user with `user_locale = en` navigating to every in-scope page sees fully English UI with no German strings visible.
- [ ] Switching back to German (`user_locale = null`, `tenant_locale = null`) renders everything back in German.
- [ ] No existing feature functionality is broken by the migration (all in-scope pages load and behave identically after translation).
- [ ] TypeScript compile passes clean after each chunk of migration.

### Key namespace structure
- [ ] Message keys follow a consistent hierarchical namespace pattern, e.g.:
  - `orders.*` for order-related pages and components
  - `settings.*` for all settings pages (already partially in place)
  - `salesforce.*` for all Salesforce App pages (already partially in place)
  - `layout.*` for sidebar, top navigation, user menu
  - `common.*` for shared labels reused across pages (already partially in place)

## Edge Cases
- A key exists in `de.json` but is missing in `en.json` — must not happen; `request.ts` falls back to German already, but missing keys mean the user sees German in English mode for that string. The spec requires 1:1 key parity.
- A string is used in multiple components (e.g. "Speichern" → "Save") — use `common.save` rather than duplicating under each namespace. Avoid creating duplicate keys for identical strings.
- Dynamic strings with variables (e.g. "Willkommen zurück, {name}") — use next-intl's ICU message format with interpolation: `t('welcomeBack', { name })`.
- Pluralisation (e.g. "1 Bestellung" vs "3 Bestellungen") — use next-intl plural selectors where needed.
- Platform-admin pages (`/admin/*`) still have hardcoded German. The ESLint rule must exclude these files to avoid noise.
- After migration, if a component is deleted or renamed, orphaned keys in the message files should be cleaned up (best-effort; not a hard requirement for this feature).
- The order of migration (tenant pages and SF pages in parallel, per the agreed approach) means some pages will be English and some German during the transition — this is acceptable while the feature is in progress.

## Technical Requirements
- **Approach:** Batch-migrate one feature area per execution chunk (e.g. "orders review", "orders list", "SF checkout") using AI-assisted extraction. Lock the glossary before starting any translation work.
- **Execution order:** Glossary → ESLint rule → tenant pages + SF pages in parallel batches → final QA pass.
- **Namespace depth:** 2 levels max (e.g. `orders.review.title`) to keep keys readable and avoid over-nesting.
- **No new packages required:** next-intl is already installed and configured (OPH-98).
- **TypeScript:** `npx tsc --noEmit` must pass after each batch.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### What's already translated (no work needed)
The following namespaces are complete from OPH-98–100:
- `common.*` — Save, Cancel, Delete, Edit, Try again, connection errors, etc.
- `auth.*` — Login, forgot password, reset password, accept invite
- `settings.tenantLanguage.*` — Tenant language card
- `settings.userLanguage.*` — User language card
- `dashboard.title`, `dashboard.welcomeBack` — Dashboard greeting
- `orders.status.*` — Order status labels (pending, review, exported, etc.)
- `salesforce.*` nav labels — Home, Search, Basket, History, Checkout, Submit order

Everything else is hardcoded German and needs to be migrated.

---

### Execution Plan: 8 Batches

Migration is split into 8 logical batches. **Batch 0 is a prerequisite for all others.** Batches 1–7 run in parallel across the two product areas (tenant app + Salesforce App).

```
Batch 0 — Foundation (prerequisite)
  Glossary file: docs/i18n-glossary.md
  ESLint warn rule: configured once, applies to all in-scope files

Batch 1 — Layout & Navigation (tenant)
  Sidebar, top navigation, user menu, environment banner

Batch 2 — Dashboard (tenant)
  Recent orders panel, action tiles, stats cards

Batch 3 — Orders: List & Upload (tenant)
  Orders list, filter bar, upload dropzone, upload file list,
  delete order dialog, extraction status badge

Batch 4 — Orders: Review & Detail (tenant)
  Order review page (all sub-components), order detail header/content,
  file list, email body panel, extraction result preview

Batch 5 — Orders: Export, Dealer & Preview (tenant)
  Export dialog/button/preview, dealer badge/dialogs,
  public magic-link preview page

Batch 6 — Settings (tenant)
  Team management (table, invite dialog, edit name dialog),
  article catalog, customer catalog, dealer mappings,
  tenant logo upload, inbound email settings, data retention settings

Batch 7 — Salesforce App (sales reps)
  SF header, home dashboard, article search, basket,
  checkout (3 steps), order history, order detail, SF profile
```

---

### Message Key Namespace Map

Each product area owns its own namespace. Max 2 levels deep to keep keys readable.

```
messages/de.json (and en.json — identical structure)
│
├── common.*          ← shared: Save, Cancel, Delete, errors, etc. (EXISTS)
├── auth.*            ← login/password/invite flows (EXISTS)
├── layout.*          ← NEW: sidebar, top-nav, user menu, banners
├── dashboard.*       ← PARTIAL: add stats, recent orders, tiles
├── orders.*
│   ├── status.*      ← EXISTS
│   ├── review.*      ← PARTIAL: expand with all review strings
│   ├── list.*        ← NEW
│   ├── upload.*      ← NEW
│   ├── detail.*      ← NEW
│   ├── export.*      ← NEW
│   ├── dealer.*      ← NEW
│   └── preview.*     ← NEW
├── settings.*
│   ├── tenantLanguage.*  ← EXISTS
│   ├── userLanguage.*    ← EXISTS
│   ├── team.*            ← NEW
│   ├── articleCatalog.*  ← NEW
│   ├── customerCatalog.* ← NEW
│   ├── dealerMappings.*  ← NEW
│   ├── inboundEmail.*    ← NEW
│   ├── dataProtection.*  ← NEW
│   └── logo.*            ← NEW
├── salesforce.*
│   ├── (nav labels EXISTS)
│   ├── login.*      ← NEW
│   ├── header.*     ← NEW
│   ├── home.*       ← NEW
│   ├── search.*     ← NEW
│   ├── basket.*     ← NEW
│   ├── checkout.*   ← NEW
│   ├── orders.*     ← NEW
│   └── profile.*    ← NEW
└── errors.*         ← NEW: 404, error boundary messages
```

Strings that appear in multiple places (e.g. "Bestellung löschen" confirmation text) live in `common.*` rather than being duplicated in two namespaces.

---

### ESLint Guardrail

**Package to install:** `eslint-plugin-i18next` (1 new dev dependency)

This is an established, purpose-built rule for catching hardcoded strings in JSX. It will warn (not error) when a literal string appears directly in JSX markup — the same pattern as forgetting to wrap `"Speichern"` in a `t()` call.

**Configuration:**
- Rule level: `warn` (developers see yellow squiggles in VS Code; CI does not fail)
- Excluded from the rule: `/admin/*`, `/messages/`, test files, type files

Once installed, it prevents regressions immediately — any developer adding a new hardcoded string gets an instant warning in their editor.

---

### Glossary File

A single markdown file at `docs/i18n-glossary.md` lists every domain-specific German term alongside its agreed English translation. It is **written before any translation work begins** to ensure all 8 batches use consistent terminology.

Key terms to lock (from the spec):

| German | English |
|---|---|
| Mandant | Tenant |
| Bestellung | Order |
| Händler | Dealer |
| Stammdaten | Master Data |
| Kundenstamm | Customer Catalog |
| Artikelstamm | Article Catalog |
| Kundennummer | Customer Number |
| Artikelnummer | Article Number |
| Lieferantenartikelnummer | Supplier Article Number |
| Außendienstler | Sales Rep |
| Prüfung / Prüfen | Review |
| Extraktion | Extraction |
| ERP-Export | ERP Export |
| Zeilenposition | Line Item |
| Mandantenverwaltung | Tenant Management |
| Abmelden | Sign Out |
| Bestellhistorie | Order History |

---

### New Dependencies

| Package | Purpose |
|---|---|
| `eslint-plugin-i18next` | Warns on hardcoded strings in JSX — prevents i18n regressions |

No other new packages needed. `next-intl` is already installed and fully configured.

---

### What Does NOT Change
- No database changes
- No API changes
- No changes to locale resolution logic (OPH-98)
- No changes to the cookie system (OPH-99/100)
- Out-of-scope files (`/admin/*`) are untouched

---

### Execution Order Summary

```
1. Write docs/i18n-glossary.md
2. Install eslint-plugin-i18next, configure .eslintrc
3. Run Batch 1 (Layout) + Batch 7 (Salesforce) in parallel
4. Run Batch 2 (Dashboard) + continue SF cleanup
5. Run Batches 3–6 (Orders + Settings) in sequence
6. Final QA pass: verify every in-scope page renders in English
```

## Progress

| Batch | Scope | Status | Notes |
|---|---|---|---|
| 0 | Foundation — `eslint-plugin-i18next`, glossary, parity check, message-file scaffold | ✅ Deployed (2026-05-11) | `i18next/no-literal-string` enabled at warn level, excludes `/admin/*`, `messages/`, tests, `*.d.ts`. `docs/i18n-glossary.md` locked with 17 canonical DE→EN terms. DE/EN parity verified. |
| 1 | Layout & Navigation — sidebar, top nav, user menu, env banner, tenant-context-required | ✅ Deployed (2026-05-11) | 5 components migrated to `useTranslations("layout.*")`. |
| 2 | Tenant Dashboard + Orders list + Upload | ⏳ Pending | ~10 files. |
| 3 | Order Review + Detail screens | ⏳ Pending | ~12 files. Heaviest batch. |
| 4 | Order Export + Dealer + Preview screens | ⏳ Pending | ~8 files. |
| 5 | Settings — profile, team, notifications, data protection, inbound email | ⏳ Pending | ~10 files. |
| 6 | Admin catalogs — articles, customers, dealers | ⏳ Pending | ~8 files. |
| 7 | Salesforce App — 11 components | ✅ Deployed (2026-05-11) | All SF surfaces migrated to `useTranslations("salesforce.*")`. |

**Done so far:** Batches 0, 1, 7 (foundation + layout + Salesforce App).
**Remaining:** Batches 2–6 (~45 tenant-side OPH files).

### Per-Batch Workflow (when resuming)
Each pending batch is its own focused session:
1. `/frontend oph-101 batch <N>` — implement
2. `npx tsc --noEmit` + DE/EN key-parity check
3. Manually smoke-test the affected pages in DE + EN
4. Commit: `feat(OPH-101): Batch <N> — <scope>`
5. `/deploy dev`

Status changes to **Deployed** only after all batches 2–6 are complete.

## QA Test Results
_To be added by /qa once all batches are complete_

## Deployment

### Batches 0, 1, 7 (Foundation + Layout + Salesforce App)
- **Production:** https://oph-ki.ids.online — Deployed 2026-05-11
- **Staging:** https://oph-ki-staging.ids.online — Deployed 2026-05-11
- **Dev:** https://oph-ki-dev.ids.online — Deployed 2026-05-11
- No DB migration. Commit `8d490e4 feat(OPH-101): Batches 0+1+7 — foundation, layout & Salesforce App i18n`.

### Batches 2–6 (Tenant-side pages)
_Pending — to be deployed batch-by-batch._
