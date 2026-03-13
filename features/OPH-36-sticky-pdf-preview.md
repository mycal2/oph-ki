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
_To be added by /qa_

## Deployment
_To be added by /deploy_
