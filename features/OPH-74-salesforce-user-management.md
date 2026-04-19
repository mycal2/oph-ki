# OPH-74: Salesforce App — Sales Rep User Management in OPH (SF-3)

## Status: In Review
**Created:** 2026-04-17
**Last Updated:** 2026-04-17
**PRD:** [Salesforce App PRD](../docs/SALESFORCE-PRD.md)

## Dependencies
- OPH-73 (SF-2): Sales Rep Role & Tenant Feature Flag — section only visible when `salesforce_enabled = true`
- OPH-1: Multi-Tenant Auth (user management foundation)

## User Stories
- As a tenant admin, I want a dedicated "Außendienst" section in OPH to manage my sales rep users separately from back-office users.
- As a tenant admin, I want to invite a new sales rep by entering their email address so that they receive a magic link to set up their account.
- As a tenant admin, I want to deactivate a sales rep so that they can no longer access the Salesforce App.
- As a tenant admin, I want to see a list of all sales rep users with their name, email, and status (active/inactive).

## Acceptance Criteria
- [ ] A new "Außendienst" navigation item appears in the OPH sidebar for tenant admins, ONLY when `salesforce_enabled = true` for their tenant.
- [ ] The Außendienst page shows a table of all `sales_rep` users belonging to the tenant: name, email, status, last login.
- [ ] "Einladen" button allows tenant admin to invite a new sales rep by email. The invited user is created with role `sales_rep`.
- [ ] Tenant admin can activate/deactivate a sales rep (toggle status).
- [ ] Tenant admin can resend the invite email for a pending sales rep.
- [ ] The user count in this section only shows `sales_rep` users, not `tenant_admin` or `tenant_user`.
- [ ] If the platform admin disables Salesforce App for the tenant, the "Außendienst" section disappears from the sidebar.

## Edge Cases
- Tenant admin tries to invite an email that already exists as a user in the system (different role or different tenant): clear error message.
- Tenant admin deactivates all sales reps: Außendienst section still visible (just empty list), Salesforce App returns "no active users" if someone tries to log in.
- Sales rep user is the only user with that email: deactivating them doesn't affect other tenants.
- Large number of sales reps (50+): paginated list.

---

## Tech Design (Solution Architect)

### Overview
Almost all the infrastructure already exists — the Team page, `UsersTable`, `InviteUserDialog`, and all `/api/team/` routes. OPH-74 adds a filtered view for `sales_rep` users and one critical backend addition: storing `salesforce_slug` in new sales rep accounts at invite time so OPH-75 magic link auth works.

---

### A) Component Structure

```
OPH Sidebar
+-- Außendienst (NEW — only when salesforce_enabled = true for this tenant)
    +-- Außendienstler page  src/app/(protected)/settings/aussendienstler/page.tsx
        +-- Page header + "Einladen" button (InviteUserDialog, role fixed to sales_rep)
        +-- UsersTable with roleFilter="sales_rep"
            +-- Name, email, status badge, last login, actions menu
                +-- Activate / Deactivate
                +-- Resend invite
```

---

### B) Files Changed

| File | Change |
|---|---|
| `src/app/(protected)/settings/aussendienstler/page.tsx` | NEW: Außendienstler page — mirrors settings/team, filtered to sales_rep |
| `src/components/team/users-table.tsx` | MODIFY: Add optional `roleFilter` prop, passes `?role=` to members API |
| `src/components/team/invite-user-dialog.tsx` | MODIFY: Add optional `fixedRole` prop — pre-selects role, hides selector |
| `src/app/api/team/members/route.ts` | MODIFY: Support optional `?role=` filter query param |
| `src/app/api/team/invite/route.ts` | MODIFY: For sales_rep invites, store tenant's `salesforce_slug` in app_metadata |
| `src/hooks/use-current-user-role.ts` | MODIFY: Also return `salesforceEnabled` from tenant's salesforce_enabled flag |
| `src/components/layout/app-sidebar.tsx` | MODIFY: Add "Außendienst" nav item, shown only when salesforceEnabled = true |

---

### C) Critical Backend Addition — `salesforce_slug` in Invite

When a `sales_rep` is invited, the invite route stores the tenant's `salesforce_slug` in their `app_metadata`:

```
app_metadata = {
  tenant_id, role: "sales_rep", user_status: "active",
  salesforce_slug: "meisinger"   ← fetched from tenants table at invite time
}
```

This is what OPH-75's middleware uses to verify the user belongs to the correct subdomain. Without it, magic link login fails with `wrong_tenant`.

---

### D) Conditional Sidebar

`useCurrentUserRole` is extended to also query `tenants.salesforce_enabled` for the current user's tenant. The "Außendienst" nav item renders only when:
- Role is `tenant_admin`
- `salesforceEnabled = true`

---

### E) Data Model

No new tables or columns. Uses:
- `user_profiles` table (existing)
- `app_metadata` on Supabase Auth users (`salesforce_slug` added for sales_rep at invite)
- `tenants.salesforce_enabled` (added in OPH-73)

No new npm packages.

## QA Test Results

**Tested:** 2026-04-17
**Method:** Code review + build verification (no running app instance)
**Tester:** QA Engineer (AI)

### Build Verification
- [x] `npm run build` succeeds with no errors
- [x] `/settings/aussendienstler` page appears in the build output
- [x] No TypeScript compilation errors related to OPH-74 changes

### Acceptance Criteria Status

#### AC-1: "Aussendienst" navigation item appears only when salesforce_enabled = true for tenant admins
- [x] `app-sidebar.tsx` line 270: `showAussendienst = role === "tenant_admin" && salesforceEnabled`
- [x] `useCurrentUserRole` hook queries `tenants.salesforce_enabled` for the current user's tenant
- [x] Sidebar item renders conditionally within the `{showAussendienst && ...}` block
- **PASS**

#### AC-2: Aussendienstler page shows table of sales_rep users (name, email, status, last login)
- [x] `aussendienstler/page.tsx` renders `<UsersTable roleFilter="sales_rep" />`
- [x] `UsersTable` passes `?role=sales_rep` query param to `/api/team/members`
- [x] API route filters by role: `profileQuery.eq("role", roleFilter)`
- [x] Table columns include Name, E-Mail, Rolle, Letzter Login, Status, Aktionen
- **PASS**

#### AC-3: "Einladen" button invites with role fixed to sales_rep
- [x] `InviteUserDialog` receives `fixedRole="sales_rep"` prop
- [x] When `fixedRole` is set, role selector is hidden (`{!fixedRole && ...}`)
- [x] Role value is initialized from `fixedRole` on dialog open: `useState(fixedRole ?? "")`
- [x] Zod validation in `inviteUserSchema` includes `"sales_rep"` in the allowed enum
- [x] Button label customized: "Aussendienstler einladen"
- **PASS**

#### AC-4: Tenant admin can activate/deactivate a sales rep (toggle status)
- [x] `UsersTable` renders activate/deactivate dropdown items for all users
- [x] Status toggle calls `PATCH /api/team/[userId]/status` which allows `tenant_admin`
- [x] Status route verifies target user belongs to same tenant
- **PASS**

#### AC-5: Tenant admin can resend invite email for a pending sales rep
- [ ] BUG: `resend-invite` route at `/api/team/[userId]/resend-invite` requires `platform_admin` role (line 48). Tenant admins cannot resend invites for their sales rep users.
- [ ] BUG: The frontend `canResendInvite` guard (users-table.tsx line 359) also only shows for `platform_admin`, so tenant admins never see the "Einladung erneut senden" option.
- **FAIL** (see BUG-1)

#### AC-6: User count only shows sales_rep users, not tenant_admin or tenant_user
- [x] The `roleFilter="sales_rep"` prop on `UsersTable` causes only `sales_rep` users to be fetched from the API
- [x] Empty state message is customized for sales_rep context
- **PASS**

#### AC-7: If platform admin disables Salesforce App, the section disappears from sidebar
- [x] Sidebar checks `salesforceEnabled` which is fetched live from the tenant record
- [x] If `salesforce_enabled` is toggled off, `showAussendienst` becomes `false`
- **PASS**

### Edge Cases Status

#### EC-1: Invite email already exists as user (different role/tenant)
- [x] Invite route catches `"already been registered"` error from Supabase and returns "Diese E-Mail-Adresse ist bereits registriert." (409)
- **PASS**

#### EC-2: All sales reps deactivated — page still visible, empty list
- [x] Empty state renders "Noch keine Aussendienstler vorhanden." message when user list is empty
- [x] Sidebar visibility is controlled by `salesforce_enabled`, not by sales rep count
- **PASS**

#### EC-3: Deactivating a sales rep doesn't affect other tenants
- [x] Status toggle route verifies `tenant_id` match before updating
- [x] Update is scoped to the specific user ID
- **PASS**

#### EC-4: Large number of sales reps (50+) — paginated list
- [ ] BUG: No pagination implemented. The API has `.limit(100)` and the table renders all results in a single scroll. For 50+ users the UX degrades but data is not lost (up to 100 users).
- **PARTIAL PASS** (see BUG-2)

### Security Audit Results

#### Authentication
- [x] Middleware requires authentication for `/settings/aussendienstler` (all protected routes)
- [x] API route `/api/team/members` verifies auth via `supabase.auth.getUser()`
- [x] API route `/api/team/invite` verifies auth

#### Authorization
- [x] `/api/team/members` requires `tenant_admin` or `platform_admin` role
- [x] `/api/team/invite` requires `tenant_admin` or `platform_admin` role
- [x] Members API scopes query to current user's `tenant_id`
- [ ] BUG: The `/settings/aussendienstler` page has NO middleware-level route protection. The middleware (middleware.ts) only enforces role checks for `/admin/*` and `/settings/team`. A `tenant_user` or `sales_rep` user who navigates directly to `/settings/aussendienstler` will see the page load (though the API call will fail with 403 since the API requires admin role). This is a defense-in-depth gap. (see BUG-3)
- [ ] BUG: The `?role=` query parameter on `/api/team/members` is not validated against an allowlist of valid roles. An attacker could pass arbitrary strings (e.g., `?role=platform_admin`) to probe the system, though RLS + tenant_id scoping prevents cross-tenant data leaks. (see BUG-4)

#### Input Validation
- [x] Invite uses Zod schema (`inviteUserSchema`) for email and role validation
- [x] Role enum is constrained to `["tenant_user", "tenant_admin", "sales_rep"]`
- [x] Status toggle uses Zod schema (`toggleUserStatusSchema`)
- [x] XSS in email field mitigated by `type="email"` HTML validation + Zod `.email()` server-side

#### salesforce_slug in app_metadata
- [x] Invite route correctly fetches `salesforce_slug` from tenant only for `sales_rep` role
- [x] If `salesforce_slug` is null/empty, it is not included in app_metadata (graceful degradation)
- [ ] BUG: If a tenant has `salesforce_enabled = true` but no `salesforce_slug` configured, inviting a sales rep succeeds but the user will have no `salesforce_slug` in their app_metadata. OPH-75 magic link auth will fail with "salesforce_not_configured" when the sales rep tries to log in. There is no warning to the tenant admin during the invite flow. (see BUG-5)

#### Role Change
- [x] `changeUserRoleSchema` only allows `["tenant_user", "tenant_admin"]` — a sales_rep cannot be role-changed to tenant_admin or vice versa via the role change UI
- [ ] BUG: The role change dropdown in `UsersTable` (line 440) computes `newRole` with the logic: `user.role === "tenant_user" ? "tenant_admin" : "tenant_user"`. For a `sales_rep` user, this evaluates to `"tenant_user"`. If `canChangeThisUserRole` were true for a sales_rep (which it currently is not because `isPlatformRole` returns false and the logic skips self), the role change could set them to `tenant_user`. However, the backend `changeUserRoleSchema` would reject `sales_rep -> tenant_user` since the target profile has role `sales_rep` which is not `tenant_admin` or `tenant_user` initially, and the schema only accepts those two values as the new role. This is an indirect protection but the UI logic does not explicitly account for `sales_rep`. (see BUG-6)

#### Rate Limiting
- [x] Role change route has rate limiting via `checkAdminRateLimit`
- [x] Resend invite route has rate limiting
- [ ] The invite route itself (`/api/team/invite`) does NOT have explicit rate limiting beyond Supabase's built-in limits. A tenant admin could rapidly send many invites.

#### Data Exposure
- [x] Members API lists only users from the same tenant (scoped by `tenant_id`)
- [x] Auth user data (email, last_sign_in_at) fetched via admin client but only exposed for matching user IDs
- [ ] BUG: The members API (line 104-108) fetches ALL auth users across the entire platform (`listUsers` with `perPage: 1000`) and then filters client-side by matching user IDs. While only tenant-scoped data is returned, this is inefficient and loads all platform users into server memory on every request. For a platform with many tenants, this is a performance concern and unnecessarily touches auth records outside the tenant. (see BUG-7)

### Cross-Browser and Responsive (Code Review)
- [x] Page uses responsive flex layout (`flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`)
- [x] Table hides Email column on mobile (`hidden sm:table-cell`)
- [x] Table hides "Letzter Login" column on smaller screens (`hidden md:table-cell`)
- [x] Mobile email is shown inline under the name (`sm:hidden`)
- [x] `overflow-x-auto` on table container for horizontal scroll on small screens
- [x] Uses shadcn/ui components throughout (Dialog, Table, Badge, etc.)

### Bugs Found

#### BUG-1: Tenant admin cannot resend invite for pending sales rep users
- **Severity:** High
- **Steps to Reproduce:**
  1. Log in as a tenant_admin with salesforce_enabled = true
  2. Navigate to /settings/aussendienstler
  3. Invite a new sales rep by email
  4. Before the sales rep accepts, check the actions dropdown for that user
  5. Expected: "Einladung erneut senden" option is available
  6. Actual: The option is not shown because both frontend guard and backend route require platform_admin role
- **Root Cause:** `/api/team/[userId]/resend-invite/route.ts` line 48 checks `role !== "platform_admin"` and rejects non-platform-admins. Frontend `canResendInvite` (users-table.tsx line 359) also requires `platform_admin`.
- **Priority:** Fix before deployment

#### BUG-2: No pagination for large sales rep lists (50+)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Have a tenant with 50+ sales rep users
  2. Navigate to /settings/aussendienstler
  3. Expected: Paginated table
  4. Actual: All users (up to 100) rendered in a single scrollable list
- **Note:** The API limits to 100 results. The spec calls for pagination at 50+.
- **Priority:** Nice to have (same limitation exists on the Team page)

#### BUG-3: No middleware-level route guard for /settings/aussendienstler
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Log in as a tenant_user (non-admin)
  2. Navigate directly to /settings/aussendienstler in the browser URL bar
  3. Expected: Redirect to /dashboard (same as /settings/team behavior)
  4. Actual: Page loads (shows header and card), then the API call returns 403 and shows an error state. The page skeleton and headers are briefly visible.
- **Root Cause:** Middleware only checks role for `/admin/*` and `/settings/team` paths. `/settings/aussendienstler` is not covered.
- **Priority:** Fix before deployment

#### BUG-4: roleFilter query param not validated on members API
- **Severity:** Low
- **Steps to Reproduce:**
  1. Authenticate as tenant_admin
  2. Call `GET /api/team/members?role=platform_admin`
  3. Expected: Rejected or ignored
  4. Actual: Query runs with `.eq("role", "platform_admin")` but returns empty array (since tenant RLS scoping prevents cross-tenant data). No error returned, but the arbitrary role string is passed directly to the database query.
- **Note:** No actual data leak due to tenant_id scoping, but violates input validation best practices.
- **Priority:** Nice to have

#### BUG-5: No warning when inviting sales rep to tenant without salesforce_slug
- **Severity:** Medium
- **Steps to Reproduce:**
  1. As platform_admin, enable salesforce_enabled for a tenant but leave salesforce_slug empty
  2. As tenant_admin of that tenant, navigate to /settings/aussendienstler
  3. Invite a new sales rep by email
  4. Expected: Warning that salesforce_slug is not configured, or invite blocked
  5. Actual: Invite succeeds silently. The sales rep receives the invite email but when they try to log in via the Salesforce App, they get redirected to login with "salesforce_not_configured" error.
- **Root Cause:** Invite route (line 152) only adds `salesforce_slug` if it exists, but does not warn/block when it is missing for a sales_rep invite.
- **Priority:** Fix before deployment

#### BUG-6: Role change UI logic does not account for sales_rep role
- **Severity:** Low
- **Steps to Reproduce:**
  1. This is a theoretical concern: the `newRole` calculation (line 440 in users-table.tsx) does not have a branch for `sales_rep`. If the `canChangeThisUserRole` guard were to change in the future, a sales_rep's role could be incorrectly toggled.
  2. Currently mitigated by the fact that `canChangeThisUserRole` evaluates to false for most sales_rep scenarios.
- **Note:** The backend `changeUserRoleSchema` would also reject invalid transitions, providing a second layer of protection.
- **Priority:** Nice to have (defense-in-depth improvement)

#### BUG-7: Members API fetches all platform auth users on every request
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Have a platform with 500+ total users across all tenants
  2. Call `GET /api/team/members` as a tenant_admin
  3. Expected: Only relevant auth user records fetched
  4. Actual: `adminClient.auth.admin.listUsers({ perPage: 1000 })` loads all platform users into memory, then filters by matching IDs
- **Note:** This is a pre-existing issue (not introduced by OPH-74) but affects the Aussendienstler page performance. The `perPage: 1000` cap also means tenants with profiles beyond the first 1000 auth users may have missing email/last_sign_in_at data.
- **Priority:** Fix in next sprint (pre-existing issue, not OPH-74 specific)

### Summary
- **Acceptance Criteria:** 6/7 passed (AC-5 failed: resend invite for tenant admins)
- **Bugs Found:** 7 total (0 critical, 1 high, 2 medium, 4 low)
- **Security:** Route-level auth gap for /settings/aussendienstler; missing salesforce_slug warning; unvalidated role filter param
- **Production Ready:** NO
- **Recommendation:** Fix BUG-1 (resend invite permissions), BUG-3 (middleware route guard), and BUG-5 (salesforce_slug warning) before deployment. The remaining bugs are lower priority and can be addressed in subsequent sprints.

## Deployment
_To be added by /deploy_
