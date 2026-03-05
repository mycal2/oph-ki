# OPH-22: Kundennummer immer in Extrahierten Bestelldaten anzeigen

## Status: Deployed
**Created:** 2026-03-05
**Last Updated:** 2026-03-05

## Dependencies
- Requires: OPH-19 (Customer Number Recognition & Editing) — extraction and storage already implemented

## Problem Statement

OPH-19 implemented full Kundennummer extraction, storage, and editing. However, in the "Extrahierte Bestelldaten" section (extraction result preview), the customer number field is only shown when a value was found. When no customer number was extracted, the field disappears entirely.

This is inconsistent with the edit form (which always shows the field) and makes it unclear to users whether extraction was attempted. Users should always see the field — even if empty — so they know a customer number can be entered or was expected.

---

## User Stories

- As a tenant employee reviewing an order, I always want to see the "Kundennummer" field in the extracted order data section, so I know immediately whether one was found and can add it manually if missing.
- As a tenant employee, when no customer number was extracted, I want to see an empty/dash placeholder in the field, so I know the system looked for it but did not find one.

---

## Acceptance Criteria

- [ ] The Kundennummer (Kd.-Nr.) field is always rendered in the "Extrahierte Bestelldaten" section, regardless of whether a value was extracted
- [ ] When a customer number was extracted, it is displayed as today (e.g. "Kd.-Nr.: 12345")
- [ ] When no customer number is available (null/empty), the field is still shown with a visual indicator (e.g. a dash "—" or the label "Kd.-Nr.: —")
- [ ] The field appearance is consistent — same icon, same label — whether populated or empty
- [ ] The field is shown in the same location it currently appears (within the sender info block)

---

## Edge Cases

- **No sender info at all**: If the entire sender block is absent, the customer number field need not be shown (the sender block itself handles this guard)
- **Empty string vs null**: Both should render as the empty/dash state — not as a visible value
- **Whitespace-only string**: Should also render as empty state

---

## Technical Requirements

- Change is limited to `src/components/orders/extraction-result-preview.tsx`
- No API changes, no database changes, no new components needed

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results

**Tested:** 2026-03-05 | **Result: PASS — 5/5 AC, 0 bugs, production ready**

| AC | Criterion | Result |
|----|-----------|--------|
| AC-1 | Field always rendered | PASS |
| AC-2 | Populated value displayed normally | PASS |
| AC-3 | Null/empty shows em dash | PASS |
| AC-4 | Consistent icon and label | PASS |
| AC-5 | Same location in sender block | PASS |

Edge cases (null, empty string, whitespace): all PASS. No security concerns (read-only display, JSX escaping, no API changes).

## Deployment

- **Deployed:** 2026-03-05
- **Commit:** `e9e06aa`
- **Tag:** `v1.22.0-OPH-22`
- **Vercel:** auto-deployed via push to `main`
- **No database migration required**
