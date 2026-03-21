# OPH-41: Change Tenant User Role

## Status: Planned
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
