# OPH-89: Außendienstler — Edit Name & Status

## Status: In Review
**Created:** 2026-04-18
**Last Updated:** 2026-04-18

## Dependencies
- OPH-74 (SF-3): Sales Rep User Management — the Außendienstler page and `UsersTable` this feature extends
- OPH-1: Multi-Tenant Auth — role-based access control (tenant_admin, platform_admin)

## User Stories
- As a tenant admin, I want to edit an Außendienstler's first and last name so that their profile reflects their correct identity.
- As a platform admin, I want to edit an Außendienstler's name on behalf of a tenant so that I can correct data without involving the tenant admin.
- As a tenant admin, I want to activate or deactivate an Außendienstler so that I can control who has access to the Salesforce App.
- As a platform admin, I want to activate or deactivate an Außendienstler across any tenant so that I can manage access centrally.

## Acceptance Criteria
- [ ] The Außendienstler row dropdown menu (`...`) contains a **"Name bearbeiten"** action for both tenant_admin and platform_admin.
- [ ] Clicking "Name bearbeiten" opens a dialog with two editable fields: **Vorname** and **Nachname**.
- [ ] The email address is shown as read-only text inside the dialog for context — it cannot be edited.
- [ ] Both Vorname and Nachname are required fields (cannot be saved empty).
- [ ] Saving updates the `first_name` and `last_name` in `user_profiles` for that user.
- [ ] On success, the table row updates immediately (no full-page reload needed).
- [ ] The dropdown also contains **"Deaktivieren"** (for active users) and **"Reaktivieren"** (for inactive users) — these already exist in `UsersTable` and must continue to work for the `sales_rep` role.
- [ ] A tenant admin can only edit users that belong to their own tenant.
- [ ] A platform admin can edit users across all tenants (via the admin tenant detail page or the tenant's Außendienstler page).

## Edge Cases
- First name or last name is submitted as whitespace-only: trim and reject as empty.
- Name is unchanged from the current value: saving is still allowed (no "nothing changed" error needed).
- Network error during save: show an inline error in the dialog; do not close it.
- The sales rep is currently logged into the Salesforce App: the name change takes effect on next login (the `sf_user` greeting cookie refreshes on next magic-link authentication).
- Very long names: the API should enforce a max length (100 characters each field).

---

## Tech Design (Solution Architect)

### Overview
One new API endpoint + one new dialog component + one small addition to the existing dropdown in `UsersTable`.

No database schema changes (columns already exist). No new packages.

### Component Changes

```
UsersTable (MODIFY — src/components/team/users-table.tsx)
  └── Dropdown "..." for each sales_rep row
      └── ADD "Name bearbeiten" menu item (shown for tenant_admin + platform_admin)
          └── opens EditNameDialog

EditNameDialog (NEW — src/components/team/edit-name-dialog.tsx)
  ├── Dialog title: "Name bearbeiten"
  ├── Read-only email display (context only)
  ├── Vorname input (required, max 100 chars)
  ├── Nachname input (required, max 100 chars)
  ├── "Speichern" button → PATCH /api/team/[userId]/name
  └── "Abbrechen" button
```

### API

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/team/[userId]/name` | PATCH | Update `first_name` + `last_name` in `user_profiles`. Requires `tenant_admin` or `platform_admin`. Tenant admins scoped to own tenant. |

### Files

| File | Change |
|---|---|
| `src/app/api/team/[userId]/name/route.ts` | NEW: PATCH handler — validates input (Zod), checks auth & tenant scope, updates `user_profiles` |
| `src/components/team/edit-name-dialog.tsx` | NEW: Dialog with Vorname + Nachname inputs |
| `src/components/team/users-table.tsx` | ADD "Name bearbeiten" dropdown item that opens the dialog; update row on success |

## QA Test Results

**Tested:** 2026-04-18
**App URL:** http://localhost:3003
**Tester:** QA Engineer (AI)
**Method:** Code review + static analysis (all 3 implementation files, Zod schema, RLS policies, related endpoints)

### Acceptance Criteria Status

#### AC-1: Dropdown menu contains "Name bearbeiten" for tenant_admin and platform_admin
- [x] The `UsersTable` dropdown includes a "Name bearbeiten" menu item with a Pencil icon (line 427-441 of users-table.tsx).
- [x] Visibility gated by `canChangeRoles` which is `true` for tenant_admin and platform_admin (line 282-283).
- [x] Hidden for self (isSelf check on line 427).
- [x] Platform users can only be edited by platform_admin (line 427: `!isTargetPlatform || currentUserRole === "platform_admin"`).

#### AC-2: Clicking "Name bearbeiten" opens a dialog with Vorname and Nachname
- [x] `EditNameDialog` component opens with two input fields: "Vorname" (id: edit-first-name) and "Nachname" (id: edit-last-name).
- [x] Dialog title is "Name bearbeiten".
- [x] Both fields pre-populated with current values via `useEffect` on `open` change.

#### AC-3: Email shown as read-only inside dialog
- [x] Email displayed as read-only `<p>` text under a "E-Mail" label (not an input field). Cannot be edited.

#### AC-4: Vorname and Nachname are required (cannot be saved empty)
- [x] Client-side: HTML `required` attribute on both inputs + explicit trim-and-check in `handleSubmit` (lines 61-69).
- [x] Server-side: Zod `updateUserNameSchema` uses `.trim().min(1)` for both fields.
- [x] Both validations produce German error messages.

#### AC-5: Saving updates first_name and last_name in user_profiles
- [x] API PATCH handler updates `user_profiles` table via `adminClient.from("user_profiles").update({ first_name, last_name }).eq("id", userId)` (line 104-107).
- [x] `updated_at` trigger fires automatically on row update.

#### AC-6: Table row updates immediately on success (no full-page reload)
- [x] `onSaved` callback in UsersTable uses `setUsers()` to update the specific user row in local state (lines 582-591).
- [x] Toast notification "Name erfolgreich geändert." shown on success.

#### AC-7: Deaktivieren/Reaktivieren continue to work for sales_rep role
- [x] The Deaktivieren/Reaktivieren dropdown items (lines 488-503) are rendered unconditionally for all users regardless of role filter, based only on current `user.status`.
- [x] The `handleToggleStatus` function calls the existing `/api/team/[userId]/status` endpoint which has no role restriction on the target user.

#### AC-8: Tenant admin can only edit users in own tenant
- [x] API enforces tenant scoping: if caller role is `tenant_admin`, it checks `targetProfile.tenant_id !== tenantId` and returns 403 (lines 93-101 of route.ts).

#### AC-9: Platform admin can edit users across all tenants
- [x] API only applies tenant scoping for `tenant_admin`; `platform_admin` bypasses this check (line 94 condition).

### Edge Cases Status

#### EC-1: Whitespace-only name submission
- [x] Client-side: `firstName.trim()` check rejects empty result (lines 57-69 in edit-name-dialog.tsx).
- [x] Server-side: Zod `.trim().min(1)` rejects whitespace-only strings.

#### EC-2: Name unchanged from current value
- [x] No "nothing changed" check exists. Saving the same name is allowed -- API processes the update regardless. Correct per spec.

#### EC-3: Network error during save
- [x] `catch` block sets inline error "Verbindungsfehler. Bitte versuchen Sie es erneut." (line 101).
- [x] Dialog remains open (no `onOpenChange(false)` in error path).
- [x] Loading state properly reset in `finally` block (line 103).

#### EC-4: Sales rep logged into Salesforce App during name change
- [x] The name change only updates `user_profiles.first_name/last_name`. The Salesforce App greeting cookie (`sf_user`) refreshes on next magic-link auth. This is a documentation/behavioral note, not a code concern.

#### EC-5: Very long names (max 100 characters)
- [x] Client-side: `maxLength={100}` HTML attribute on both inputs.
- [x] Client-side: Explicit `.length > 100` check in handleSubmit (lines 71-79).
- [x] Server-side: Zod `.max(100)` validation on both fields.

### Security Audit Results

#### Authentication
- [x] API verifies authentication via `supabase.auth.getUser()` (line 22). Returns 401 on failure.
- [x] Inactive user/tenant checks (lines 37-48). Returns 403 when deactivated.

#### Authorization
- [x] Role check restricts to `tenant_admin` and `platform_admin` only (lines 50-58). `tenant_user`, `sales_rep`, `platform_viewer` correctly rejected with 403.
- [x] Tenant scoping enforced for `tenant_admin` (lines 93-101).
- [x] Platform admin can edit cross-tenant (by design).
- [x] No self-edit restriction in API (UI prevents it, but API allows it -- acceptable since self-editing one's own name is not a security concern).

#### Input Validation
- [x] Server-side Zod validation before any database operation (line 62).
- [x] No `dangerouslySetInnerHTML` used in rendering -- React default escaping protects against XSS in name fields.
- [x] SQL injection not possible: Supabase client uses parameterized queries.

#### IDOR (Insecure Direct Object Reference)
- [x] The `userId` URL parameter is validated by checking it exists in `user_profiles` (lines 79-89).
- [x] Tenant-scoped access control prevents cross-tenant IDOR for tenant_admin.
- [ ] NOTE: No UUID format validation on the `userId` path parameter. If a non-UUID string is passed, the Supabase `.eq("id", userId)` query will fail gracefully (Postgres UUID type mismatch returns no rows -> 404). Not exploitable, but adds unnecessary database load. Pre-existing pattern across all `/api/team/[userId]/*` endpoints.

#### Rate Limiting
- [ ] NOTE: No rate limiting on the PATCH endpoint. A malicious actor with valid credentials could spam name updates. This is a pre-existing pattern across all team management endpoints, not specific to OPH-89.

#### Data Exposure
- [x] API response on success contains only `{ success: true }` -- no sensitive data leaked.
- [x] Error messages are generic and do not expose internal details.

#### Malformed Request Body
- [ ] BUG: If the request body is not valid JSON (e.g., empty body, plain text), `request.json()` on line 61 throws an error. The outer try-catch catches it and returns 500 "Interner Serverfehler." This should ideally return 400 "Bad Request." Pre-existing pattern across all similar endpoints.

### Bugs Found

#### BUG-1: Malformed JSON body returns 500 instead of 400
- **Severity:** Low
- **Steps to Reproduce:**
  1. Send a PATCH request to `/api/team/{userId}/name` with valid auth headers.
  2. Set request body to invalid JSON (e.g., `"not json"` or empty body).
  3. Expected: 400 status with a descriptive error message.
  4. Actual: 500 status with "Interner Serverfehler."
- **Priority:** Nice to have (pre-existing pattern across all team endpoints; not exploitable)

### Notes (Not Bugs -- Pre-existing Patterns)

1. **No UUID validation on userId path parameter:** The userId is not validated as a UUID before hitting the database. Supabase handles invalid UUIDs gracefully (returns no rows), so this is not exploitable. Consistent with `/api/team/[userId]/status`, `/api/team/[userId]/role`, etc.

2. **No rate limiting on the endpoint:** Consistent with all team management endpoints. Consider adding rate limiting as a platform-wide improvement.

3. **adminClient bypasses RLS:** This is by design -- the API uses the service-role client because RLS UPDATE policies require the calling user to be in the same tenant, but platform_admin needs cross-tenant access. The code performs its own authorization checks before using adminClient.

### Cross-Browser & Responsive Assessment (Code Review)

- [x] Dialog uses shadcn/ui `Dialog` component (accessible, responsive by default).
- [x] Input fields use shadcn/ui `Input` component.
- [x] Buttons use shadcn/ui `Button` component.
- [x] Footer uses `DialogFooter` which stacks on mobile viewports.
- [x] Table already uses responsive classes (`hidden sm:table-cell`, `hidden md:table-cell`).
- [x] No custom CSS or non-standard layout -- all Tailwind + shadcn/ui primitives.

### Regression Check
- [x] Existing Deaktivieren/Reaktivieren actions unchanged for all roles including sales_rep.
- [x] Existing role change functionality (`canChangeThisUserRole`) logic unchanged.
- [x] Existing resend invite / reset password actions unchanged.
- [x] Build succeeds with no TypeScript or compilation errors.
- [x] No new dependencies added.

### Summary
- **Acceptance Criteria:** 9/9 passed
- **Edge Cases:** 5/5 passed
- **Bugs Found:** 1 total (0 critical, 0 high, 0 medium, 1 low)
- **Security:** Pass (1 low-severity issue found; no exploitable vulnerabilities)
- **Production Ready:** YES
- **Recommendation:** Deploy. The single low-severity bug (malformed JSON returning 500 instead of 400) is a pre-existing pattern across all team endpoints and is not blocking.

## Deployment
_To be added by /deploy_
