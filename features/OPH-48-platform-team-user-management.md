# OPH-48: Platform Team User Management Actions

## Overview
**Status:** Planned
**Created:** 2026-03-24
**Priority:** P1

## Problem
The platform admin can currently invite new platform team members and deactivate/reactivate them. However, there is no way to:
- Resend an activation link to a platform user who missed or lost their invite email
- Trigger a password reset for a platform user who is locked out
- Change the role of a platform user (e.g., from `platform_admin` to `platform_viewer` or vice versa)

These actions already exist for **tenant users** (OPH-38, OPH-41), but not for **platform users** managed via the Team page.

## Solution
Add three new actions to the platform Team user list (the existing `users-table.tsx` component):
1. **Einladung erneut senden** — resend the activation email to a pending platform user
2. **Passwort zurücksetzen** — trigger a password reset email for an active platform user
3. **Rolle ändern** — change the role of a platform user

These actions appear in a per-row action menu, consistent with the existing admin UI pattern for tenant users.

## User Stories

1. **As a platform admin**, I want to resend an activation link to a platform team member who hasn't completed registration, so they can access the system without me needing to delete and re-invite them.
2. **As a platform admin**, I want to trigger a password reset email for a platform user who is locked out, so I can help them regain access quickly.
3. **As a platform admin**, I want to change the role of a platform user, so I can promote or demote team members as responsibilities change.
4. **As a platform admin**, I want a confirmation dialog before any of these actions are triggered, so I don't accidentally send emails or change roles.
5. **As a platform admin**, I want a toast notification confirming success or failure of each action, so I know whether the action was effective.

## Acceptance Criteria

### AC-1: Resend Invite
- [ ] Each pending (not yet confirmed) platform user row has a "Einladung erneut senden" action in the row action menu
- [ ] The action is only visible/enabled for users who have not yet confirmed their account
- [ ] Clicking the action shows a confirmation dialog before sending
- [ ] On success, a toast notification confirms the email was sent
- [ ] On failure, a toast notification shows a meaningful error message
- [ ] The platform admin cannot resend an invite to themselves

### AC-2: Reset Password
- [ ] Each active platform user row has a "Passwort zurücksetzen" action in the row action menu
- [ ] Clicking the action shows a confirmation dialog before sending
- [ ] On success, a toast notification confirms the email was sent
- [ ] On failure, a toast notification shows a meaningful error message
- [ ] The action is disabled for inactive users with a tooltip explaining why
- [ ] The platform admin cannot trigger a password reset for themselves (they use the standard "Passwort vergessen" flow)

### AC-3: Change Role
- [ ] Each platform user row (except the currently logged-in admin) has a "Rolle ändern" action in the row action menu
- [ ] Clicking the action opens a role change confirmation dialog showing current role → new role
- [ ] Available roles are the same platform roles currently supported (e.g., `platform_admin`, `platform_viewer`)
- [ ] On success, the user list refreshes and shows the updated role badge
- [ ] On failure, a toast notification shows a meaningful error message
- [ ] A platform admin cannot change their own role (to prevent accidental self-lockout)

### AC-4: Safety Guards
- [ ] All three actions require confirmation before executing
- [ ] A platform admin cannot perform any of these actions on their own account
- [ ] Inactive users can only have their role changed (not resend invite or reset password)

## Edge Cases

- **EC-1:** User has already confirmed their account → "Einladung erneut senden" is hidden or disabled
- **EC-2:** User is inactive/deactivated → "Einladung erneut senden" and "Passwort zurücksetzen" are disabled; "Rolle ändern" still available
- **EC-3:** Email delivery fails (Supabase error) → show error toast; do not silently fail
- **EC-4:** Platform admin tries to act on own account → action is hidden or disabled with tooltip "Nicht auf eigenes Konto anwendbar"
- **EC-5:** Two admins simultaneously change the same user's role → last write wins; no special conflict handling needed
- **EC-6:** Only one platform admin exists and they try to change their own role away from `platform_admin` → blocked (guard against self-lockout)

## Dependencies
- Requires: OPH-1 (Multi-Tenant Auth) — platform_admin role required
- Related: OPH-38 (Resend Invite & Password Reset for Tenant Users) — same pattern, different user type
- Related: OPH-41 (Change Tenant User Role) — same pattern, different user type
- Existing: `/api/team/[userId]/role` route — may already support role changes; verify before building
- Existing: `/api/team/invite` route — may be reusable for resend invite logic
