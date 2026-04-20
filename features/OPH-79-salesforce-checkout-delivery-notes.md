# OPH-79: Salesforce App — Checkout: Delivery & Notes (SF-8)

## Status: In Review
**Created:** 2026-04-17
**Last Updated:** 2026-04-17
**PRD:** [Salesforce App PRD](../docs/SALESFORCE-PRD.md)

## Dependencies
- OPH-78 (SF-7): Checkout — Dealer Identification — delivery step comes after dealer identification

## User Stories
- As a sales rep, I want to optionally add a delivery address that is different from the dealer's address so that orders can be shipped to an alternate location.
- As a sales rep, I want to add notes to the order so that I can communicate special instructions (e.g. "urgent", "deliver by Friday").
- As a sales rep, I want to skip both delivery address and notes if they're not needed so that the checkout stays fast.

## Acceptance Criteria
- [ ] After dealer identification, the checkout shows an optional "Abweichende Lieferadresse" (alternate delivery address) section, collapsed by default.
- [ ] Expanding the delivery address section shows fields: company name, street, zip code, city, country (defaulting to Deutschland).
- [ ] An order-level "Bemerkungen" (notes) text field is shown, optional, with a placeholder like "z.B. Dringend, Lieferung bis Freitag".
- [ ] Notes field has a reasonable max length (500 characters) with a character counter.
- [ ] Both sections can be left empty — they are purely optional.
- [ ] A "Weiter zur Zusammenfassung" (Continue to summary) button proceeds to the order review/submission step.

## Edge Cases
- Sales rep enters a partial delivery address (e.g. only city, no street): allow it — the back office can follow up.
- Notes contain special characters or line breaks: preserve formatting.
- Sales rep goes back from this step to change the dealer: delivery and notes inputs are preserved.

---

## Tech Design (Solution Architect)

### Overview
OPH-79 is step 2 of the 3-step checkout (OPH-78 → OPH-79 → OPH-80). It adds delivery address and notes to the order before submission. Both fields are already defined in `CheckoutProvider` — but `deliveryAddress` is currently typed as a plain string. To support the structured address form, it needs to be updated to a `DeliveryAddress` object. No new API endpoints are needed.

---

### A) Context Change (CheckoutProvider)

`src/components/salesforce/checkout-provider.tsx` needs one update:

Replace `deliveryAddress: string` with a structured type:

```
DeliveryAddress:
  companyName  (optional string)
  street       (optional string)
  zipCode      (optional string)
  city         (optional string)
  country      (string, default "Deutschland")
```

`setDeliveryAddress` is updated to accept `DeliveryAddress | null`.

This is a non-breaking change — OPH-78 and OPH-80 both ignore `deliveryAddress` content (OPH-80 reads it but doesn't exist yet).

---

### B) Component Structure

```
sf/[slug]/checkout/delivery/page.tsx  (NEW)
+-- Auth guard: redirect to /login if unauthenticated
+-- Flow guard: redirect to /checkout if isDealerIdentified is false
+-- CheckoutDeliveryStep (NEW client component)
    +-- Step header: "Schritt 2 von 3: Lieferung & Bemerkungen"
    +-- Progress bar / step indicator (3 steps)
    |
    +-- [SECTION A] Abweichende Lieferadresse (collapsible, collapsed by default)
    |   +-- Toggle header: "Abweichende Lieferadresse hinzufügen" + chevron icon
    |   +-- When expanded:
    |       +-- Company name input (optional)
    |       +-- Street input (optional)
    |       +-- Zip code + City inputs (side by side on wider screens)
    |       +-- Country input (default "Deutschland", optional)
    |
    +-- [SECTION B] Bemerkungen (always visible)
    |   +-- Textarea, 3 rows
    |   +-- Placeholder: "z.B. Dringend, Lieferung bis Freitag"
    |   +-- Character counter: "123 / 500"
    |   +-- maxLength enforcement: 500
    |
    +-- Sticky footer
        +-- [← Zurück] → navigates to /sf/[slug]/checkout
        +-- [Weiter zur Zusammenfassung →] → always enabled (both fields optional)
            → navigates to /sf/[slug]/checkout/confirm
```

---

### C) State Handling

- On mount: pre-fill form from `CheckoutContext` (`deliveryAddress`, `notes`) — preserves data if user goes back from step 3.
- Address section open/closed state is local component state (not persisted to context).
- If the address section is collapsed when the user proceeds, `setDeliveryAddress(null)` clears any previously entered address.
- Notes are synced to context on every keystroke via `setNotes`.

---

### D) APIs Reused

None — all state is in `CheckoutContext` (already set up in OPH-78). No database writes at this step.

---

### E) Files Changed

| File | Change |
|---|---|
| `src/components/salesforce/checkout-provider.tsx` | MODIFY: Replace `deliveryAddress: string` with `DeliveryAddress` type + update setter signature |
| `src/app/sf/[slug]/checkout/delivery/page.tsx` | NEW: Step 2 route (auth + flow guard) |
| `src/components/salesforce/checkout-delivery-step.tsx` | NEW: Collapsible address + notes form |

No new npm packages. Collapsible uses shadcn/ui `Collapsible` or simple local toggle state + Tailwind transitions.

## QA Test Results

**Tested:** 2026-04-17
**App URL:** http://localhost:3003
**Tester:** QA Engineer (AI)

### Acceptance Criteria Status

#### AC-1: Collapsible "Abweichende Lieferadresse" section, collapsed by default
- [x] After dealer identification, the checkout shows the delivery step (route `/sf/[slug]/checkout/delivery`)
- [x] Delivery address section uses shadcn/ui Collapsible (Radix primitive) with correct toggle behavior
- [x] Section is collapsed by default when no prior address exists in context (`addressOpen = deliveryAddress !== null`)
- [x] Section auto-opens if returning from step 3 with a previously saved address

#### AC-2: Delivery address fields (company, street, zip, city, country with Deutschland default)
- [x] Company name field present with label "Firmenname"
- [x] Street field present with label "Strasse & Hausnummer"
- [x] Zip code and City fields present side-by-side (`grid-cols-[120px_1fr]`)
- [x] Country field present, defaults to "Deutschland"
- [x] All fields are optional (no required markers, no validation blocking)

#### AC-3: "Bemerkungen" text field with placeholder
- [x] Textarea present with label "Bemerkungen"
- [x] Placeholder text: "z.B. Dringend, Lieferung bis Freitag" (matches spec exactly)
- [x] Textarea is always visible (not inside collapsible)
- [x] Textarea has `rows={3}` and `resize-none` class

#### AC-4: Notes max length 500 with character counter
- [x] `NOTES_MAX_LENGTH = 500` constant used consistently
- [x] `maxLength={NOTES_MAX_LENGTH}` attribute on textarea (browser enforcement)
- [x] `handleNotesChange` slices input at 500 chars (JS enforcement)
- [x] Character counter shown as "{length} / 500" right-aligned below textarea

#### AC-5: Both sections can be left empty
- [x] "Weiter zur Zusammenfassung" button has no `disabled` prop -- always clickable
- [x] `handleContinue` handles empty address (sets `deliveryAddress(null)`)
- [x] Empty notes default to `""` in context

#### AC-6: "Weiter zur Zusammenfassung" button proceeds to confirm step
- [x] Button text: "Weiter zur Zusammenfassung" with ArrowRight icon
- [x] Routes to `/sf/[slug]/checkout/confirm`
- [x] Saves address to context before navigation (if section is open and has data)

### Edge Cases Status

#### EC-1: Partial delivery address (only city, no street)
- [x] `handleContinue` checks `hasAnyField` -- any single non-empty field saves the entire address object
- [x] Server-side Zod schema allows all fields to be empty strings
- [x] Confirm step (OPH-80) renders partial address correctly using `.filter(Boolean).join(", ")`

#### EC-2: Special characters and line breaks in notes
- [x] Notes rendered on confirm step with `whitespace-pre-line` CSS class, preserving line breaks
- [x] Zod schema uses `z.string().max(500)` without stripping/sanitizing special characters
- [x] React auto-escapes all JSX output, preventing XSS

#### EC-3: Back navigation preserves delivery and notes inputs
- [x] Notes are synced to context on every keystroke -- preserved when navigating back from step 2 and returning
- [ ] BUG: Address fields are NOT synced to context on change -- only on "Continue". If user fills in address fields then clicks "Zuruck" (back to step 1), address data is lost. See BUG-1 below.

### Security Audit Results

- [x] Authentication: Server component verifies `user` via `supabase.auth.getUser()` and redirects to login if unauthenticated
- [x] Authorization: Flow guard redirects to step 1 if `isDealerIdentified` is false (prevents skipping steps)
- [x] Input validation (server): Zod schema validates delivery address and notes on `POST /api/sf/orders`
- [x] Input validation (notes): Both client-side (`maxLength`, `.slice()`) and server-side (`.max(500)`) enforcement
- [x] XSS prevention: React auto-escapes output; no `dangerouslySetInnerHTML` used
- [x] SQL injection: Supabase uses parameterized queries; address stored as JSONB
- [ ] BUG: Delivery address fields have no max length on client or server (Zod schema uses `z.string()` without `.max()`). See BUG-2 below.
- [x] CSRF: Next.js API routes use same-origin cookie-based auth; no additional CSRF token needed
- [x] No secrets exposed in client bundle
- [x] No sensitive data in API responses beyond what the authenticated user should see

### Cross-Browser & Responsive

- [x] 375px (Mobile): Layout uses `max-w-lg px-4`, zip+city grid (120px + 1fr) fits within ~343px available width
- [x] 768px (Tablet): Single-column layout with adequate spacing
- [x] 1440px (Desktop): Content centered in `max-w-lg` container, no layout issues
- [x] Sticky footer: `pb-28` (112px) provides clearance for the fixed footer (~72px)
- [x] Collapsible: Radix UI primitive handles keyboard navigation (Enter/Space), focus management, ARIA attributes

### Bugs Found

#### BUG-1: Address data lost on back navigation (Zuruck)
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Complete step 1 (dealer identification)
  2. On step 2, expand the delivery address section
  3. Fill in some address fields (e.g. company name, city)
  4. Click "Zuruck" (back arrow button) to return to step 1
  5. On step 1, click "Weiter" again to return to step 2
  6. Expected: Address fields are preserved with previously entered data
  7. Actual: Address fields are blank; data was never saved to CheckoutContext because `setDeliveryAddress` is only called in `handleContinue`, not on field change
- **Note:** Notes are NOT affected -- they sync to context on every keystroke. Only address fields are affected.
- **Spec reference:** Edge case says "delivery and notes inputs are preserved" on back navigation
- **Priority:** Fix before deployment

#### BUG-2: No max length on delivery address fields (client + server)
- **Severity:** Medium
- **Steps to Reproduce:**
  1. On step 2, expand the delivery address section
  2. Paste an extremely long string (e.g. 100KB) into any address field (company name, street, city, etc.)
  3. Click "Continue" and submit the order
  4. Expected: Input is rejected or truncated at a reasonable length (e.g. 255 characters)
  5. Actual: The string is accepted without limit on both client (no `maxLength` on `<Input>`) and server (Zod schema uses `z.string().optional()` without `.max()`)
- **Impact:** Could be used for storage abuse; extremely long values stored in JSONB in PostgreSQL
- **Priority:** Fix before deployment

#### BUG-3: Delivery page auth guard less thorough than step 1
- **Severity:** Low
- **Steps to Reproduce:**
  1. Step 1 (`checkout/page.tsx`) checks: user exists AND `tenant_id` from app_metadata exists
  2. Step 2 (`delivery/page.tsx`) checks: user exists only -- does not verify `tenant_id`
  3. A user without a valid `tenant_id` could reach the delivery page (though the client-side flow guard and the API route's Zod validation would catch issues downstream)
- **Impact:** Minimal in practice -- the API route validates `tenant_id`, `role`, and `user_status`/`tenant_status`. But inconsistency could lead to confusing error messages if user reaches step 3.
- **Priority:** Nice to have (fix in next sprint)

### Summary
- **Acceptance Criteria:** 6/6 passed
- **Edge Cases:** 2/3 passed (1 bug on back-navigation address preservation)
- **Bugs Found:** 3 total (0 critical, 0 high, 2 medium, 1 low)
- **Security:** 1 issue found (unbounded string length on delivery address fields)
- **Production Ready:** NO
- **Recommendation:** Fix BUG-1 and BUG-2 before deployment. BUG-1 violates the spec's edge case requirement. BUG-2 is a defense-in-depth concern. BUG-3 is cosmetic and can be deferred.

## Deployment
_To be added by /deploy_
