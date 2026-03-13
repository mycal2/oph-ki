# OPH-36: Sticky PDF Preview on Order Review Page

## Status: In Review
**Created:** 2026-03-13
**Last Updated:** 2026-03-13

## Dependencies
- Requires: OPH-27 (Order File Preview) - for the document preview panel

## User Stories
- As a reviewer, I want the PDF preview to stay visible while I scroll through the order lines, so that I can verify extracted data against the original document without scrolling back up.
- As a reviewer working with long orders (20+ line items), I want both panels independently usable so I can compare any line item with the corresponding section in the PDF.

## Acceptance Criteria
- [ ] AC-1: On desktop (≥1024px), the left PDF preview panel is sticky and remains visible when scrolling
- [ ] AC-2: The right order lines panel scrolls independently
- [ ] AC-3: The sticky panel respects the page header/nav height — no overlap
- [ ] AC-4: The PDF panel fills the available viewport height (no wasted whitespace)
- [ ] AC-5: On mobile/tablet (<1024px), layout remains stacked (no sticky — insufficient width)
- [ ] AC-6: Re-extract and approve buttons in the header remain accessible

## Edge Cases
- What happens when the PDF fails to load? → The sticky panel still shows the error/loading state without breaking layout
- What happens with very short order lists (1-2 items)? → Layout stays the same, right panel just doesn't need scrolling
- What happens when the browser is resized across the breakpoint? → Layout switches cleanly between sticky and stacked

## Technical Requirements
- Pure CSS/Tailwind change — no new components or state needed
- Key approach: `sticky top-[X]` on left column, `self-start` to prevent stretch, `h-[calc(100vh-Xpx)]` for viewport height
- Outer grid needs `items-start` instead of default `items-stretch`
- Browser Support: Chrome, Firefox, Safari, Edge

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results

**Tested:** 2026-03-13
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)

### Acceptance Criteria Status

#### AC-1: On desktop (>=1024px), the left PDF preview panel is sticky and remains visible when scrolling
- [x] `DocumentPreviewPanel` applies `lg:sticky lg:top-[4.25rem]` at the lg (1024px+) breakpoint
- [x] Parent grid in `review-page-content.tsx` uses `items-start` which is required for sticky to function
- [x] No parent containers (AppLayout, main, container) have `overflow: hidden/auto/scroll` that would break sticky positioning
- **PASS**

#### AC-2: The right order lines panel scrolls independently
- [x] `OrderEditForm` has no sticky positioning, so it scrolls naturally with the page
- [x] Grid `items-start` prevents the right column from being stretched to match the sticky left column
- **PASS**

#### AC-3: The sticky panel respects the page header/nav height -- no overlap
- [x] Header total height: `h-1` (4px brand bar) + `h-14` (56px nav) = 60px = 3.75rem
- [x] Sticky offset `top-[4.25rem]` (68px) = header (60px) + 8px gap, preventing overlap
- [x] Header is `sticky top-0 z-50`, preview panel sits below it in the stacking context
- **PASS**

#### AC-4: The PDF panel fills the available viewport height (no wasted whitespace)
- [x] Height calc: `lg:h-[calc(100vh-4.25rem-1.5rem)]` accounts for header offset + bottom margin
- [x] Card uses `flex flex-col` and CardContent uses `flex-1 min-h-0` to fill available space
- [x] iframe uses `lg:h-full` to expand within the card on desktop
- **PASS**

#### AC-5: On mobile/tablet (<1024px), layout remains stacked (no sticky -- insufficient width)
- [x] All sticky/height classes are `lg:` prefixed, so they only apply at 1024px+
- [x] Grid is `grid-cols-1 lg:grid-cols-2`, so below lg it stacks vertically
- [x] iframe falls back to `h-[500px] min-h-[400px]` on mobile
- **PASS**

#### AC-6: Re-extract and approve buttons in the header remain accessible
- [x] `ReviewPageHeader` is rendered OUTSIDE and ABOVE the two-column grid
- [x] `DealerSection` is also rendered above the grid
- [x] Neither is inside the sticky container, so they remain in normal document flow
- **PASS**

### Edge Cases Status

#### EC-1: PDF fails to load -- sticky panel shows error/loading state without breaking layout
- [x] Loading state: `stickyClasses` are applied to the loading skeleton Card
- [x] Error state: `stickyClasses` are applied to the error Card with retry button
- [x] Empty files state: `stickyClasses` are applied to the empty state Card
- **PASS**

#### EC-2: Very short order lists (1-2 items) -- layout stays the same
- [x] No conditional logic based on item count; layout is always the same grid
- [x] Right panel simply doesn't need scrolling; left panel remains sticky regardless
- **PASS**

#### EC-3: Browser resize across breakpoint -- layout switches cleanly
- [x] Tailwind responsive classes are CSS media queries, so they react to viewport changes without JS
- [x] No JavaScript breakpoint detection that could cause stale state
- **PASS**

### Security Audit Results

- [x] Authentication: `preview-url` API verifies user session before returning signed URLs
- [x] Authorization: Tenant isolation enforced -- non-admin users can only access their own tenant's orders
- [x] Platform admin bypass: Correctly allows cross-tenant access for platform_admin role
- [x] Input validation: orderId validated against UUID regex before database query
- [x] Signed URL security: URLs expire after 1 hour, non-PDF files forced to download mode
- [x] No new API endpoints or data exposure introduced by this feature (CSS-only change)
- [x] No sensitive data exposed in client-side code
- **No security issues found** -- this feature is a pure CSS/Tailwind layout change with no new attack surface.

### Cross-Browser & Responsive

- [x] **Chrome:** CSS `position: sticky` fully supported
- [x] **Firefox:** CSS `position: sticky` fully supported
- [x] **Safari:** CSS `position: sticky` fully supported (no `-webkit-sticky` prefix needed for modern Safari)
- [x] **Edge:** CSS `position: sticky` fully supported
- [x] **375px (Mobile):** Stacked layout, no sticky behavior, iframe at 500px height
- [x] **768px (Tablet):** Stacked layout, no sticky behavior (lg breakpoint is 1024px)
- [x] **1440px (Desktop):** Two-column layout with sticky left panel

### Observations (Not Bugs)

#### OBS-1: Hardcoded sticky offset coupled to header height
- **Severity:** Low (maintenance concern)
- **Description:** The `4.25rem` offset in `document-preview-panel.tsx` is hardcoded and assumes the header height of `h-1` + `h-14`. If the header height changes in the future, the sticky offset would need manual updating.
- **Recommendation:** Consider extracting the header height as a CSS custom property or Tailwind theme variable if header changes are anticipated.

#### OBS-2: Mobile iframe height may be excessive on small viewports
- **Severity:** Low (UX consideration, not per spec)
- **Description:** On mobile, the iframe defaults to `h-[500px]` which may push the order edit form far below the fold on small screens. This is pre-existing behavior from OPH-27 and not a regression introduced by OPH-36.

### Regression Check

- [x] OPH-27 (Order File Preview): Preview panel still renders correctly; signed URL logic unchanged
- [x] OPH-5 (Order Review): Review page header, auto-save, approve, and re-extract flows unaffected
- [x] OPH-32 (Visual Field Mapper): Not affected (different page/component)
- [x] Build passes without errors or warnings

### Summary
- **Acceptance Criteria:** 6/6 passed
- **Edge Cases:** 3/3 passed
- **Bugs Found:** 0
- **Security:** Pass -- no new attack surface (CSS-only change)
- **Production Ready:** YES
- **Recommendation:** Deploy. This is a clean, well-scoped CSS/Tailwind change with no functional or security risks.

## Deployment
_To be added by /deploy_
