# OPH-89: Außendienstler — Edit Name & Status

## Status: Planned
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
_To be added by /qa_

## Deployment
_To be added by /deploy_
