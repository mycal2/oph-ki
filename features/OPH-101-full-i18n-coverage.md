# OPH-101: Full i18n Coverage

## Status: Planned
**Created:** 2026-05-08
**Last Updated:** 2026-05-08

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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
