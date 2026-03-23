# OPH-41: Change Tenant User Role

## Status: In Review
**Created:** 2026-03-21
**Last Updated:** 2026-03-21

## Dependencies
- Requires: OPH-1 (Multi-Tenant Auth) — role model: tenant_user / tenant_admin
- Requires: OPH-8 (Admin: Mandanten-Management) — platform admin user list
- Requires: OPH-38 (Admin: Resend Invite) — action menu already exists on user rows

## Overview
Platform admins and tenant admins can change the role of a tenant user between `tenant_user` and `tenant_admin`. This allows promoting a regular user to admin (e.g., when someone takes over team management) or demoting an admin back to a regular user. The role change takes effect on the user's next login.

## User Stories
- As a platform_admin, I want to change a tenant user's role between "Benutzer" and "Administrator" from the Admin panel so that I can help tenants manage their team structure.
- As a tenant_admin, I want to promote a team member to admin or demote an admin to regular user from my Settings → Team view so that I can manage my own team without contacting platform support.
- As a user whose role was changed, I want to see my correct permissions after logging out and back in so that the change takes effect cleanly.
- As a platform_admin or tenant_admin, I want a confirmation dialog before role changes so that accidental clicks don't immediately change permissions.

## Acceptance Criteria
- [ ] In the Admin panel (Admin → Tenants → [Tenant] → Users tab), each user row's action menu has a new option: "Zu Administrator machen" or "Zu Benutzer machen" depending on current role
- [ ] In Settings → Team (tenant_admin view), each user row's action menu also has the same role-change option
- [ ] The role-change option is only shown for active users (inactive users cannot have their role changed)
- [ ] A confirmation dialog is shown before the change is applied: "Rolle von [Name / E-Mail] zu [neue Rolle] ändern?"
- [ ] After confirming, the role is updated in `user_profiles.role` and `auth.users.raw_app_meta_data`
- [ ] A success toast is shown: "Rolle erfolgreich geändert. Der Benutzer muss sich neu anmelden."
- [ ] The user list refreshes automatically after the change
- [ ] A platform_admin cannot demote themselves via this feature
- [ ] A tenant_admin cannot demote themselves via this feature (must have at least one admin remaining)
- [ ] The role of platform_admin users cannot be changed via this feature (only tenant roles: tenant_user ↔ tenant_admin)
- [ ] The change takes effect for the affected user on their next login (JWT is not invalidated immediately)

## Tech Design (Solution Architect)

### Component Structure

```
Admin panel: /admin/tenants/[id] → Benutzer tab
  └── TenantUsersTab (existing)
       └── user row action dropdown (existing DropdownMenu)
            +-- "Zu Administrator machen" / "Zu Benutzer machen"  ← NEW item
                → opens RoleChangeConfirmDialog (NEW, shared)

Settings → Team (/settings/team)
  └── UsersTable (existing)
       └── user row action menu  ← NEW (currently only deactivate/reactivate buttons)
            +-- "Zu Administrator machen" / "Zu Benutzer machen"
                → opens RoleChangeConfirmDialog (NEW, shared)

src/components/admin/role-change-confirm-dialog.tsx  (NEW, shared)
  +-- "Rolle von [Name / E-Mail] zu [neue Rolle] ändern?"
  +-- Confirm → calls onConfirm() → toast → refreshes list
  +-- Cancel
```

### New API Endpoints

| Endpoint | Caller | Auth |
|---|---|---|
| `PATCH /api/admin/tenants/[id]/users/[userId]/role` | Platform admin | platform_admin only |
| `PATCH /api/team/[userId]/role` | Tenant admin | tenant_admin (own tenant only) |

Request body: `{ role: "tenant_user" | "tenant_admin" }`

Both update:
1. `user_profiles.role` — database source of truth
2. `auth.users.raw_app_meta_data.role` — so next JWT reflects the new role

### Guards (enforced server-side)

| Guard | Error |
|---|---|
| Cannot change own role | "Sie können Ihre eigene Rolle nicht ändern." |
| Cannot change platform_admin | "Die Rolle von Platform-Admins kann hier nicht geändert werden." |
| Cannot demote last admin in tenant | "Mindestens ein Administrator muss im Mandanten verbleiben." |
| User not in tenant | 404 |
| User inactive | 400 |

### No new packages needed

---

## Valid Role Transitions
| Current role | Can change to |
|---|---|
| `tenant_user` | `tenant_admin` |
| `tenant_admin` | `tenant_user` (unless last admin in tenant) |
| `platform_admin` | — (not changeable via this feature) |

## Edge Cases
- EC-1: Tenant has only one tenant_admin → demoting them to tenant_user is blocked with error: "Mindestens ein Administrator muss im Mandanten verbleiben."
- EC-2: User is currently logged in when role changes → role takes effect on next login; no forced logout
- EC-3: User is inactive → role-change action is not shown (only available for active users)
- EC-4: Platform admin tries to change a platform_admin's role → blocked (platform_admin role is managed separately)
- EC-5: Tenant admin tries to change their own role → blocked with error: "Sie können Ihre eigene Rolle nicht ändern."
- EC-6: Race condition (two admins try to demote the last admin simultaneously) → DB constraint or check at API level prevents both from succeeding; second request returns an error

---

## QA Test Results

**Tested:** 2026-03-21
**App URL:** http://localhost:3003
**Tester:** QA Engineer (AI)
**Method:** Code review + static analysis (implementation not yet committed to git)

### Acceptance Criteria Status

#### AC-1: Admin panel role-change menu option
- [x] `tenant-users-tab.tsx` adds "Zu Administrator machen" / "Zu Benutzer machen" to the existing DropdownMenu based on current role (lines 410-420)
- [x] Correct icons used: Shield for promote, ShieldOff for demote

#### AC-2: Settings > Team role-change menu option
- [x] `users-table.tsx` adds "Zu Administrator machen" / "Zu Benutzer machen" to the DropdownMenu (lines 356-367)
- [x] Correct icons used: Shield / ShieldOff

#### AC-3: Role-change option only shown for active users
- [x] Admin panel: condition `u.status === "active" && u.role !== "platform_admin"` (line 395-396)
- [x] Team view: condition `canChangeThisUserRole` includes `user.status === "active"` (line 286)
- [x] Server-side guard returns 400 for inactive users in both endpoints

#### AC-4: Confirmation dialog shown before change
- [x] Both components use AlertDialog with title "Rolle von [Name] zu [neue Rolle] andern?"
- [x] Dialog includes descriptive text about the consequences
- [x] Cancel button dismisses dialog without action
- [ ] BUG: Admin panel uses em-dash fallback for missing names (see BUG-1)

#### AC-5: Role updated in user_profiles.role and auth.users.raw_app_meta_data
- [x] Both endpoints update `user_profiles.role` via Supabase update
- [x] Both endpoints update `auth.users` via `adminClient.auth.admin.updateUserById` with `app_metadata: { role: newRole }`
- [x] Auth metadata update is non-blocking (failure logged, does not prevent success response)

#### AC-6: Success toast shown
- [x] Both components show: "Rolle erfolgreich geandert. Der Benutzer muss sich neu anmelden." -- matches spec exactly

#### AC-7: User list refreshes after change
- [x] Admin panel calls `loadUsers()` on success (line 203)
- [x] Team view calls `loadUsers()` on success (line 197)

#### AC-8: Platform admin cannot demote themselves
- [x] Server-side guard: `userId === user.id` returns "Sie konnen Ihre eigene Rolle nicht andern." (admin route line 81-86)
- [x] In team view, client-side guard hides option for own user: `user.id !== currentUserId` (line 288)
- [ ] BUG: Admin panel does NOT have client-side guard for self (see BUG-2 -- low severity, server catches it)

#### AC-9: Tenant admin cannot demote themselves
- [x] Server-side guard in team route: `userId === user.id` returns error (line 121)
- [x] Client-side guard in team view hides option for own user (line 288)

#### AC-10: Platform admin roles cannot be changed
- [x] Server-side guard: `profile.role === "platform_admin"` returns error (admin route line 73, team route line 113)
- [x] Client-side: `u.role !== "platform_admin"` hides menu item in both views

#### AC-11: Change takes effect on next login
- [x] `app_metadata` is updated so the next JWT reflects the new role
- [x] No session invalidation or forced logout is triggered
- [x] Success toast tells user to re-login

### Edge Cases Status

#### EC-1: Last admin demotion blocked
- [x] Both endpoints check admin count with `count: "exact"` query filtered by `tenant_id`, `role: "tenant_admin"`, `status: "active"`
- [x] Returns "Mindestens ein Administrator muss im Mandanten verbleiben." when count <= 1

#### EC-2: User currently logged in when role changes
- [x] No forced logout; role takes effect on next login via JWT refresh

#### EC-3: Inactive user role-change hidden
- [x] Both client-side conditions check `status === "active"`
- [x] Both server-side guards return 400 for inactive users

#### EC-4: Platform admin role change blocked
- [x] Handled correctly in both endpoints and both UI components

#### EC-5: Tenant admin self-demotion blocked
- [x] Server-side guard catches `userId === user.id` in team route
- [x] Client-side guard hides the option in team view

#### EC-6: Race condition on last admin demotion
- [ ] BUG: No database-level constraint or row-level lock (see BUG-3). Two concurrent requests could both pass the count check before either update completes. Low probability in practice.

### Security Audit Results

- [x] Authentication: Admin endpoint requires `platform_admin` via `requirePlatformAdmin()`. Team endpoint verifies session via `supabase.auth.getUser()`.
- [x] Authorization: Admin endpoint restricted to platform_admin. Team endpoint checks `tenant_admin` or `platform_admin` role from JWT, and verifies target user belongs to same tenant.
- [x] Input validation: Zod schema `changeUserRoleSchema` validates role is exactly `"tenant_user"` or `"tenant_admin"`. Admin endpoint validates UUID format for both tenantId and userId.
- [ ] BUG: Team endpoint does NOT validate UUID format for userId parameter (see BUG-4)
- [ ] BUG: Team endpoint update is not scoped to tenant_id (see BUG-5)
- [x] Rate limiting: Admin endpoint uses `checkAdminRateLimit`. Team endpoint does NOT have explicit rate limiting but relies on Supabase auth overhead.
- [x] No secrets exposed in responses
- [x] Error messages do not leak internal details
- [x] XSS: No user input is rendered as HTML; React handles escaping
- [x] Injection: Zod validation + Supabase parameterized queries prevent SQL injection
- [x] No new NEXT_PUBLIC_ environment variables exposed

### Bugs Found

#### BUG-1: Admin panel confirmation dialog shows em-dash for users without names
- **Severity:** Low
- **Steps to Reproduce:**
  1. Go to Admin > Tenants > [Tenant] > Users tab
  2. Find a user who has no first_name or last_name set (e.g., a newly invited user)
  3. Open the action menu and click "Zu Administrator machen"
  4. Expected: Dialog shows "Rolle von user@example.com zu Administrator andern?"
  5. Actual: Dialog shows "Rolle von -- zu Administrator andern?" (em-dash character)
- **Root Cause:** `tenant-users-tab.tsx` line 270-273 falls back to `\u2014` (em-dash) instead of email
- **Priority:** Fix in next sprint

#### BUG-2: Admin panel does not hide role-change option for own user (client-side)
- **Severity:** Low
- **Steps to Reproduce:**
  1. As platform_admin, go to Admin > Tenants > [Your own tenant] > Users tab
  2. Find your own user row
  3. Expected: Role-change option is hidden (since platform_admin role is not changeable)
  4. Actual: Role-change option IS hidden because of the `u.role !== "platform_admin"` check, which works correctly for this case. However, if a platform_admin is also listed with role `tenant_admin` in a tenant (edge case), the option would show and the server would reject it.
- **Note:** This is defensive -- the server-side guard catches all cases. Very low risk.
- **Priority:** Nice to have

#### BUG-3: No database-level protection against race condition on last-admin demotion
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Tenant has exactly 2 tenant_admins (Admin A and Admin B)
  2. Two platform admins simultaneously send PATCH requests to demote both Admin A and Admin B
  3. Both requests read count=2, both pass the guard, both updates succeed
  4. Expected: One request should fail with "Mindestens ein Administrator muss im Mandanten verbleiben."
  5. Actual: Both succeed, leaving the tenant with zero admins
- **Root Cause:** The count check and the update are not atomic. No database trigger or constraint enforces minimum admin count.
- **Priority:** Fix in next sprint (low probability but high impact if exploited)

#### BUG-4: Team role endpoint does not validate UUID format for userId
- **Severity:** Medium
- **Steps to Reproduce:**
  1. As tenant_admin, send: `PATCH /api/team/not-a-uuid/role` with body `{ "role": "tenant_user" }`
  2. Expected: 400 response with "Ungultige ID." (matching admin endpoint behavior)
  3. Actual: Supabase query will fail with a database error or return no results (caught as 404), but the error is not clean
- **Root Cause:** `/api/team/[userId]/role/route.ts` does not validate UUID format, unlike the admin endpoint which has `UUID_REGEX.test()`
- **Priority:** Fix before deployment

#### BUG-5: Team role endpoint update not scoped to tenant_id (defense-in-depth)
- **Severity:** Medium
- **Steps to Reproduce:**
  1. The update at line 152 of `/api/team/[userId]/role/route.ts` uses `.eq("id", userId)` only
  2. The admin endpoint at line 112-113 uses both `.eq("id", userId).eq("tenant_id", tenantId)`
  3. While the authorization check earlier prevents cross-tenant access, the update itself does not enforce tenant scoping
- **Root Cause:** Missing `.eq("tenant_id", targetProfile.tenant_id)` on the update query
- **Impact:** If a bug is introduced in the authorization logic above, the update would affect any user across any tenant. Defense-in-depth principle suggests scoping the update.
- **Priority:** Fix before deployment

#### BUG-6: Team role endpoint lacks explicit rate limiting
- **Severity:** Low
- **Steps to Reproduce:**
  1. As tenant_admin, rapidly send many PATCH requests to `/api/team/[userId]/role`
  2. Expected: Rate limiting kicks in (like admin endpoint uses `checkAdminRateLimit`)
  3. Actual: No explicit rate limiting; requests are only limited by Supabase auth overhead
- **Priority:** Fix in next sprint

#### BUG-7: Shared RoleChangeConfirmDialog not created as specified in tech design
- **Severity:** Low
- **Steps to Reproduce:**
  1. Tech design specifies `src/components/admin/role-change-confirm-dialog.tsx` as a shared component
  2. Actual: Dialog code is duplicated inline in both `tenant-users-tab.tsx` and `users-table.tsx`
- **Impact:** Code duplication; any future changes to the dialog need to be made in two places
- **Priority:** Nice to have (refactoring, not functional)

### Cross-Browser / Responsive Notes
- Code review only (no live browser testing performed). The implementation uses standard shadcn/ui components (AlertDialog, DropdownMenu, Badge, Table) which are already cross-browser tested via the existing component library.
- The team view table uses `overflow-x-auto` for responsiveness. The admin panel table uses `hidden sm:table-cell` for responsive column hiding.
- No new custom CSS or layout changes that would introduce responsive regressions.

### Regression Check
- OPH-38 (Resend Invite / Password Reset): Existing action menu items preserved in both components; no regressions detected in code.
- OPH-8 (Admin Tenant Management): TenantUsersTab interface unchanged; new state and handler added but existing props untouched.
- OPH-1 (Multi-Tenant Auth): No changes to auth flow; role update uses existing app_metadata pattern.

### Summary
- **Acceptance Criteria:** 10/11 passed (1 with minor bug)
- **Edge Cases:** 5/6 passed (1 race condition vulnerability)
- **Bugs Found:** 7 total (0 critical, 3 medium, 4 low)
- **Security:** 2 medium-severity findings (missing UUID validation, missing tenant scoping on update)
- **Production Ready:** NO
- **Recommendation:** Fix BUG-4 (UUID validation) and BUG-5 (tenant-scoped update) before deployment. BUG-3 (race condition) should be addressed soon after. Remaining bugs are low priority.
