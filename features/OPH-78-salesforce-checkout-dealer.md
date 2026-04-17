# OPH-78: Salesforce App — Checkout: Dealer Identification (SF-7)

## Status: In Progress
**Created:** 2026-04-17
**Last Updated:** 2026-04-17
**PRD:** [Salesforce App PRD](../docs/AD-PRD.md)

## Dependencies
- OPH-77 (SF-6): Shopping Basket — checkout is entered from the basket
- OPH-46: Manufacturer Customer Catalog — customer number lookup
- OPH-3: Händler-Erkennung & Händler-Profile — dealer selection

## User Stories
- As a sales rep, I want to enter a customer number so that the system automatically identifies the dealer and I don't need to enter details manually.
- As a sales rep, I want to select a dealer from a list if I don't have the customer number so that I can still submit the order quickly.
- As a sales rep, I want to enter dealer details manually if the dealer is not in the system so that I can place orders for new dealers.

## Acceptance Criteria
- [ ] Checkout page shows a customer number input field as the primary identification method.
- [ ] As the sales rep types a customer number, the system searches the tenant's customer catalog in real-time.
- [ ] If the customer number is recognized: show the matched dealer/customer name as confirmation. Sales rep can proceed.
- [ ] If the customer number is not recognized: show a message "Kundennummer nicht gefunden" and offer the dealer selection dropdown as a fallback.
- [ ] Dealer selection dropdown shows all dealers linked to the tenant, searchable by name.
- [ ] If the dealer is also not in the list: a "Neuer Händler" button reveals a manual entry form with fields: company name, contact person (optional), email (optional), phone (optional), address (optional).
- [ ] The checkout flow is a single page with progressive disclosure: customer number → dealer dropdown → manual entry (each fallback only shown when needed).
- [ ] The identified dealer info (however obtained) is shown as a summary card before proceeding to delivery/notes.

## Edge Cases
- Customer number matches multiple entries in the catalog: show all matches and let the sales rep pick one.
- Sales rep enters customer number, gets a match, then clears the field: reset to initial state.
- Tenant has no customer catalog entries: skip customer number step, go directly to dealer selection.
- Tenant has no dealers linked: skip dealer selection, go directly to manual entry.
- Sales rep starts typing in manual entry, then finds the dealer in the dropdown: switching back clears the manual entry form.

---

## Tech Design (Solution Architect)

### Overview
OPH-78 is step 1 of the 3-step checkout (OPH-78 → OPH-79 → OPH-80). Introduces a `CheckoutProvider` context (same pattern as `BasketProvider`) to share checkout state across all three steps. Customer lookup reuses the existing `/api/customers` endpoint — no new API needed.

---

### A) Checkout Context (spans OPH-78, 79, 80)

```
sf/[slug]/layout.tsx
  └── BasketProvider
       └── CheckoutProvider (NEW — holds all checkout state across steps)
            └── {children}  →  /checkout, /checkout/delivery, /checkout/confirm
```

Checkout context holds: selected customer, manual dealer info, which step was used, delivery address (OPH-79), notes (OPH-79).

---

### B) Component Structure

```
sf/[slug]/checkout/page.tsx (NEW)
+-- CheckoutDealerStep (NEW client component)
    +-- Step header + progress indicator (step 1 of 3)
    +-- [STEP A] Customer number input
    |   +-- Debounced search → match card or "Nicht gefunden" + reveal Step B
    +-- [STEP B] Dealer dropdown (shown when A fails)
    |   +-- Searchable list of customer_catalog entries
    |   +-- Selection → confirm card or "Nicht dabei?" → reveal Step C
    +-- [STEP C] Manual entry (shown when B also fails)
    |   +-- Company name (required), contact/email/phone/address (optional)
    +-- Sticky footer: [Weiter →] (enabled when dealer identified)
```

Progressive disclosure: only the current + previous steps are visible.

---

### C) APIs Reused

| Need | Endpoint |
|---|---|
| Customer number lookup | `GET /api/customers?search={number}&pageSize=10` |
| Dropdown list | `GET /api/customers?pageSize=200` |

"Dealers linked to the tenant" = entries in the tenant's `customer_catalog` (OPH-46). No new API needed.

---

### D) Files Changed

| File | Change |
|---|---|
| `src/components/salesforce/checkout-provider.tsx` | NEW: React Context for all checkout state |
| `src/hooks/use-checkout.ts` | NEW: Context consumer hook |
| `src/app/sf/[slug]/layout.tsx` | MODIFY: Add `<CheckoutProvider>` inside `<BasketProvider>` |
| `src/app/sf/[slug]/checkout/page.tsx` | NEW: Checkout step 1 route |
| `src/components/salesforce/checkout-dealer-step.tsx` | NEW: Progressive disclosure form |

No new npm packages. All UI uses existing shadcn/ui components.

## QA Test Results

**Tested:** 2026-04-17
**Tester:** QA Engineer (AI)
**Method:** Code review + TypeScript build + ESLint (manual browser testing blocked -- feature not yet deployed or running locally)

### Build & Lint Status
- [x] TypeScript compiles with zero errors (`npx tsc --noEmit`)
- [x] Production build succeeds (`npm run build`) -- `/sf/[slug]/checkout` route registered
- [x] No new ESLint violations

### Acceptance Criteria Status

#### AC-1: Checkout page shows a customer number input field as the primary identification method
- [x] PASS: `CustomerNumberSearch` component renders as Step A with label "Kundennummer eingeben", search icon, and auto-focus on mount. Only shown when `hasCustomers` is true.

#### AC-2: Real-time customer catalog search as user types
- [x] PASS: Debounced search (400ms) calls `GET /api/customers?search={term}&pageSize=10`. Abort controller cancels in-flight requests on new input. Loading spinner shown during search.

#### AC-3: Recognized customer number shows matched name as confirmation, can proceed
- [x] PASS: Search results are rendered as selectable cards showing `customer_number`, `company_name`, and city. Selected card gets primary ring styling + check icon. `onMatch` sets checkout context and enables "Weiter" button.

#### AC-4: Unrecognized customer number shows "Kundennummer nicht gefunden" and offers dropdown fallback
- [x] PASS: When `results.length === 0` after search, message "Kundennummer nicht gefunden. Waehlen Sie einen Haendler aus der Liste." is shown. `onNotFound()` sets `showDropdown = true` to reveal Step B.

#### AC-5: Dealer selection dropdown shows all dealers, searchable by name
- [x] PASS: `DealerDropdown` loads all customers via `GET /api/customers?pageSize=200`. Client-side filtering by `company_name` and `customer_number`. Limited to 10 initial display with "Alle N anzeigen" expand button.

#### AC-6: "Neuer Haendler" button reveals manual entry form with correct fields
- [x] PASS: "Neuer Haendler (nicht in der Liste)" button calls `onNotFound()` to set `showManualEntry = true`. Form has: company name (required, marked with *), contact person, email, phone, address (all optional). "Haendler uebernehmen" button disabled until company name is non-empty.

#### AC-7: Single page with progressive disclosure
- [x] PASS: All three steps render on the same page (`checkout/page.tsx`). Step B only appears after Step A fails. Step C only appears after clicking "Neuer Haendler" in Step B. Previous steps become visually dimmed (`opacity-50 pointer-events-none`) via `isActive` prop.

#### AC-8: Identified dealer info shown as summary card before proceeding
- [x] PASS: `DealerSummaryCard` renders when `isDealerIdentified` is true, showing all available details (name, number, address, email) with a method badge ("Kundennummer" / "Aus Liste" / "Manuell") and an "Aendern" button.

### Edge Cases Status

#### EC-1: Customer number matches multiple entries
- [x] PASS: API returns up to 10 results. All results are rendered as a list of selectable cards. User picks one.

#### EC-2: Sales rep enters customer number, gets match, then clears field
- [ ] BUG: Partially fails. See BUG-1 below.

#### EC-3: Tenant has no customer catalog entries -- skip customer number step
- [x] PASS (with note): When `hasCustomers=false`, Step A is hidden (`{hasCustomers && ...}`), Step B is hidden (`{showDropdown && hasCustomers && ...}`), and Step C (manual entry) is shown immediately. The spec says "go directly to dealer selection" but since the customer catalog IS the dealer list per the tech design, skipping to manual entry is the correct behavior.

#### EC-4: Tenant has no dealers linked -- skip to manual entry
- [x] PASS: Same condition as EC-3 (customer catalog = dealers). Manual entry is shown directly.

#### EC-5: Switching from manual entry back to dropdown clears manual form
- [x] PASS: When a dropdown selection is made, `setShowManualEntry(false)` unmounts the `ManualDealerEntry` component, destroying its local state. If the component is later re-shown, it remounts with `initialValues` from context (which is `null` after dropdown selection), so all fields are empty.

### Security Audit Results

- [x] Authentication: Checkout page verifies `user` via `supabase.auth.getUser()` and redirects to login if unauthenticated
- [x] Authorization: `/api/customers` scopes queries to `tenantId` from the user's JWT `app_metadata` -- no cross-tenant data access possible
- [x] Authorization: Middleware enforces `sales_rep` role can only access their own tenant's Salesforce subdomain
- [x] RLS: `customer_catalog` table has RLS enabled with tenant-scoped SELECT policy (defense-in-depth, though API uses admin client)
- [x] XSS: No `dangerouslySetInnerHTML`, `eval()`, or `innerHTML` usage. All user/customer data rendered through React JSX (auto-escaped)
- [x] Input sanitization: API endpoint escapes LIKE wildcards (`%`, `_`) and strips special characters (`,`, `.`, `(`, `)`, `"`) from search input
- [x] Sensitive data: No secrets, tokens, or credentials in client-side code or network responses
- [x] CSRF: API uses cookie-based Supabase auth with SameSite=Lax cookies
- [ ] NOTE: `/api/customers` uses `createAdminClient()` (bypasses RLS) with application-level tenant filtering. Consistent with existing codebase pattern but diverges from defense-in-depth principle in `security.md`.
- [ ] NOTE: Checkout page does not verify URL slug matches user's tenant at page level. Middleware enforces this for production subdomains but not in direct `/sf/[slug]/checkout` access (blocked by middleware line 81-82 for non-Salesforce hosts anyway).

### Cross-Browser & Responsive (Code Review)

- [x] Responsive layout: `max-w-lg` container with `px-4` padding. Sticky footer spans full width with `max-w-lg` inner container.
- [x] Bottom padding `pb-28` prevents content from being hidden behind fixed footer
- [x] Input fields use `h-12 text-base` sizing appropriate for mobile touch targets
- [x] All customer cards use `truncate` for overflow text, `min-w-0` for flex shrinking
- [x] No fixed pixel widths that would break on narrow viewports
- [ ] NOTE: Cannot verify actual rendering across Chrome/Firefox/Safari without running dev server

### Bugs Found

#### BUG-1: Clearing customer number input after match does not reset checkout context
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Go to checkout page with a tenant that has customer catalog entries
  2. Type a customer number that returns a match
  3. Click on a match to select it (summary card appears, "Weiter" button becomes enabled)
  4. Clear the customer number input field (backspace/select-all-delete)
  5. Expected: Checkout resets to initial state -- summary card disappears, "Weiter" button becomes disabled
  6. Actual: Local component state resets (results list clears, `selectedId` becomes null) but `CheckoutContext` still holds `selectedCustomer` and `isDealerIdentified` remains `true`. Summary card persists. "Weiter" button stays enabled.
- **Root Cause:** `handleInputChange` in `CustomerNumberSearch` (line 257) does not call the parent `clearDealerIdentification` or any context reset when the input is cleared. It only resets local component state (`query`, `results`, `hasSearched`, `selectedId`).
- **Fix Suggestion:** When `value.trim().length === 0` in `handleInputChange`, also call a parent callback (e.g., add an `onClear` prop) that triggers `clearDealerIdentification()` in the checkout context.
- **Priority:** Fix before deployment

### Regression Check
- [x] OPH-77 (Basket): "Zur Kasse" button correctly links to `/sf/${slug}/checkout`
- [x] OPH-72 (Salesforce Layout): `CheckoutProvider` correctly nested inside `BasketProvider` in layout
- [x] OPH-46 (Customer Catalog): `/api/customers` endpoint unchanged, continues to work for existing features
- [x] Existing Salesforce routes (`/sf/[slug]`, `/sf/[slug]/basket`, `/sf/[slug]/login`) unaffected

### Summary
- **Acceptance Criteria:** 8/8 passed (code review)
- **Edge Cases:** 4/5 passed, 1 bug found (EC-2)
- **Bugs Found:** 1 total (0 critical, 0 high, 1 medium, 0 low)
- **Security:** Pass (no vulnerabilities found; 2 informational notes)
- **Production Ready:** NO -- BUG-1 should be fixed first (medium severity, violates documented edge case)
- **Recommendation:** Fix BUG-1 (clearing customer number input should reset checkout context), then this feature is ready for deployment.

## Deployment
_To be added by /deploy_
