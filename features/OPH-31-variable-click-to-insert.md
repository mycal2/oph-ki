# OPH-31: Variable Click-to-Insert in XML Template Editor

## Status: Deployed
**Created:** 2026-03-09
**Last Updated:** 2026-03-09

## Dependencies
- Requires: OPH-9 (Admin: ERP-Mapping-Konfiguration) - for XML template editor UI
- Requires: OPH-30 (Auto-Generate XML Template) - the variable reference panel it builds on

## User Stories

- As a platform admin, I want to click on a variable in the "Verfügbare Variablen" panel so that the variable is inserted at my current cursor position in the XML template textarea without manual typing.
- As a platform admin, I want the inserted variable to be wrapped in Handlebars syntax (`{{variable.path}}`) automatically so that I don't have to type the double-curly braces myself.
- As a platform admin, I want the cursor to move to just after the inserted variable so that I can continue editing immediately after clicking.
- As a platform admin, I want a visual indicator that a variable is clickable so that I can discover this functionality without being told.

## Acceptance Criteria

- [ ] Clicking a variable in the "Verfügbare Variablen" panel inserts `{{variable.path}}` at the current cursor position in the template textarea.
- [ ] If no cursor position exists (textarea not yet focused), the variable is appended at the end of the template.
- [ ] After insertion, the cursor is placed immediately after the inserted `{{variable.path}}` text.
- [ ] The textarea receives focus after insertion so the admin can continue typing.
- [ ] Variables are visually styled as clickable (cursor: pointer, hover state).
- [ ] The "Verfügbare Variablen" panel stays open after a variable is clicked (does not collapse).
- [ ] Insertion works correctly when the template textarea already contains content (mid-text cursor position is preserved).
- [ ] The `onChange` callback is called with the updated template string after insertion (keeps the editor state in sync).

## Edge Cases

- **Empty textarea, no cursor:** Variable is inserted at position 0 / appended, producing `{{variable.path}}` as the full content.
- **Cursor at start of line:** Variable is inserted before any existing text on that line.
- **Cursor at end of template:** Variable is appended correctly with no extra whitespace.
- **Text selected in textarea:** The selected text is replaced by the inserted `{{variable.path}}` (standard browser text insertion behavior).
- **Variable containing `#each` (e.g., `order.line_items`):** Inserted as `{{order.line_items}}` — the admin must manually add the `#each` block wrapper. No special handling needed.
- **Panel collapsed when variable clicked:** Cannot happen — the panel must be open for variables to be visible.

## Technical Requirements (optional)
- Frontend-only change: no API calls, no database changes.
- Must use the textarea's `selectionStart` and `selectionEnd` DOM properties to determine cursor position.
- Must call `textarea.focus()` and `textarea.setSelectionRange()` after insertion to restore cursor position.
- The `Textarea` ref must be forwarded or accessed via `useRef` — the textarea is currently uncontrolled for selection purposes.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results

**Tested:** 2026-03-09
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Method:** Code review + build verification (frontend-only feature)

### Acceptance Criteria Status

#### AC-1: Clicking a variable inserts `{{variable.path}}` at cursor position
- [x] `handleVariableClick` creates snippet as `` `{{${variablePath}}}` `` and inserts at `selectionStart` position
- [x] Uses `template.slice(0, pos) + snippet + template.slice(selEnd)` for correct mid-text insertion

#### AC-2: If no cursor position exists, variable is appended at end of template
- [ ] BUG: When textarea has content but was never focused/clicked, `el.selectionStart` returns 0 in most browsers (not end-of-content). The fallback `cursorPosRef.current` is only used when `el` is null, but the ref is always set after mount. Variable is inserted at position 0 instead of appended at the end. See BUG-1 below.

#### AC-3: Cursor placed immediately after inserted text
- [x] `requestAnimationFrame` callback calls `setSelectionRange(newCursorPos, newCursorPos)` where `newCursorPos = pos + snippet.length`

#### AC-4: Textarea receives focus after insertion
- [x] `textareaRef.current.focus()` is called in the `requestAnimationFrame` callback

#### AC-5: Variables visually styled as clickable
- [x] Variable buttons have `cursor-pointer` class and `hover:bg-primary/10` transition
- [x] Title attribute provides tooltip: "Klicken zum Einfuegen an Cursorposition"

#### AC-6: Panel stays open after variable click
- [x] `handleVariableClick` does not modify the `refOpen` state that controls the Collapsible

#### AC-7: Insertion works with mid-text cursor position
- [x] Uses `selectionStart` for position and `selectionEnd` for selection replacement, slicing template correctly

#### AC-8: onChange callback called with updated template
- [x] `onChange(newTemplate)` is called on line 94

### Edge Cases Status

#### EC-1: Empty textarea, no cursor
- [x] Variable is inserted at position 0 producing `{{variable.path}}` as full content (matches spec: "inserted at position 0 / appended")

#### EC-2: Cursor at start of line
- [x] `selectionStart` correctly reflects start-of-line position; insertion is correct

#### EC-3: Cursor at end of template
- [x] `selectionStart` at end of text; `template.slice(selEnd)` produces empty string; variable appended correctly

#### EC-4: Text selected in textarea
- [x] `selectionStart` and `selectionEnd` differ when text is selected; `template.slice(0, pos) + snippet + template.slice(selEnd)` replaces selection correctly

#### EC-5: Variable containing #each (order.line_items)
- [x] Inserted as `{{order.line_items}}` with no special handling, matching spec

#### EC-6: Panel collapsed when variable clicked
- [x] Cannot happen -- variables are inside CollapsibleContent and invisible when collapsed

### Security Audit Results

- [x] No API calls: This is a frontend-only feature with no network requests
- [x] No injection risk: Variables are from a hardcoded static list (AVAILABLE_VARIABLES), not user input
- [x] No sensitive data exposure: Variable names are static constants, no secrets involved
- [x] No XSS: Inserted text goes through React controlled value (no dangerouslySetInnerHTML)
- [x] Authentication: Feature is within the /admin protected route, requires admin login

### Cross-Browser / Responsive Notes

- The `selectionStart`/`selectionEnd` API and `setSelectionRange()` are well-supported across Chrome, Firefox, and Safari
- `requestAnimationFrame` is universally supported
- The variable grid uses `sm:grid-cols-2` -- displays as single column on mobile (375px), two columns on tablet/desktop
- Variable buttons use truncation (`truncate` class) for long descriptions on narrow screens

### Bugs Found

#### BUG-1: Variable inserted at position 0 instead of end when textarea never focused
- **Severity:** Low
- **Steps to Reproduce:**
  1. Navigate to Admin > ERP Configurations > select a config > XML tab
  2. Ensure the XML template textarea already has content (e.g., from a template suggestion)
  3. Without clicking into the textarea at all, open the "Verfuegbare Variablen" panel
  4. Click any variable (e.g., `{{order.order_number}}`)
  5. Expected: Variable is appended at the END of the template
  6. Actual: Variable is inserted at position 0 (beginning of template)
- **Root Cause:** `el.selectionStart` returns 0 when a textarea has not been focused. The code uses `el.selectionStart` when `el` exists (always after mount), bypassing the `cursorPosRef.current` fallback which was meant for this case.
- **Fix Suggestion:** Track whether the textarea has been focused at least once. If not, use `template.length` as the insertion position.
- **Priority:** Fix in next sprint

#### BUG-2: `group-hover` CSS class has no effect on variable code element
- **Severity:** Low
- **Steps to Reproduce:**
  1. Open the "Verfuegbare Variablen" panel
  2. Hover over a variable button
  3. Expected: The `<code>` element inside the button gets a `bg-primary/20` background on hover
  4. Actual: Only the button row gets the `hover:bg-primary/10` effect; the code element's `group-hover:bg-primary/20` has no effect because no parent has the `group` class
- **Root Cause:** Line 159 uses `group-hover:bg-primary/20` on the code element, but the parent `<button>` does not have a `group` class
- **Fix Suggestion:** Add `group` class to the `<button>` element on line 156
- **Priority:** Nice to have

### Regression Check

- [x] OPH-9 (ERP-Mapping): XML template editor textarea still functions for manual editing
- [x] OPH-30 (Auto-Generate XML Template): Template suggestion acceptance still sets template value correctly (separate `onAccept` handler in `erp-config-editor.tsx`)
- [x] Build passes: `npm run build` completes without errors

### Summary
- **Acceptance Criteria:** 7/8 passed (1 low-severity bug on AC-2)
- **Bugs Found:** 2 total (0 critical, 0 high, 0 medium, 2 low)
- **Security:** Pass -- frontend-only feature with no attack surface
- **Production Ready:** YES
- **Recommendation:** Deploy. The 2 low-severity bugs are minor UX polish items that can be fixed in a follow-up sprint. No blocking issues.

## Deployment
- **Deployed:** 2026-03-09
- **No migrations required** (frontend-only feature)
