# OPH-96: Order Review Locking (Concurrent Edit Prevention)

## Status: Planned
**Created:** 2026-04-27
**Last Updated:** 2026-04-27

## Dependencies
- Requires: OPH-5 (Bestellprüfung & manuelle Korrektur) — the review page being locked

## Background

When multiple users from the same tenant have access to the order review page, two users can open the same order simultaneously and overwrite each other's changes without realising it. This feature prevents that by introducing a per-order session lock: the first user to open the review page acquires the lock, all subsequent users see a read-only view with a banner showing who is currently reviewing. The lock auto-expires after 15 minutes of inactivity (heartbeat-based), and tenant admins / platform admins can forcibly break a stuck lock.

## User Stories

- As a tenant user, I want to be notified when I open an order that is already being reviewed by a colleague, so that I don't accidentally overwrite their changes.
- As a tenant user reviewing an order, I want the system to automatically keep my session active while I'm working, so that I don't lose my lock due to inactivity while I'm still on the page.
- As a tenant user whose lock has expired, I want to receive a clear warning before I try to save, so that I know my session timed out and my changes may not be saved.
- As a tenant admin, I want to be able to forcibly release a lock that has been held too long (e.g. a colleague is on holiday), so that orders don't get stuck indefinitely.
- As a second user viewing a locked order, I want to see who is currently reviewing it so that I know who to contact if I urgently need to make a change.

## Acceptance Criteria

### Lock Acquisition
- [ ] When a user opens the order review page, the system attempts to acquire a lock for that order
- [ ] If no lock exists or the existing lock is expired, the lock is acquired immediately and the user can edit normally
- [ ] A lock stores: locking user's ID, display name, timestamp of acquisition, and expiry time (15 min from last heartbeat)
- [ ] The lock is scoped to the tenant — only users within the same tenant can see/respect each other's locks

### Heartbeat (Keep-Alive)
- [ ] While the review page is open, the client sends a heartbeat every 4 minutes to extend the lock expiry by 15 minutes from now
- [ ] If the browser tab is closed, navigated away, or the computer goes to sleep, heartbeats stop and the lock expires naturally after 15 minutes

### Read-Only View for Second User
- [ ] When a second user opens a locked order, all edit fields and action buttons (save, approve, mark for clarification) are disabled
- [ ] A prominent banner is shown at the top of the review page: "Wird gerade von [Vorname Nachname] bearbeitet. Die Seite ist schreibgeschützt."
- [ ] The second user can still view all order data, extracted fields, and documents in read-only mode
- [ ] The banner shows the time the lock was acquired: "Gesperrt seit [HH:MM Uhr]"
- [ ] The page auto-refreshes every 60 seconds to detect when the lock is released, at which point the user is notified and editing becomes available

### Lock Release
- [ ] The lock is released when the locking user navigates away from the review page (browser `beforeunload` / `visibilitychange` events trigger a release API call)
- [ ] The lock is released automatically after 15 minutes without a heartbeat
- [ ] When the lock is released, any user currently viewing the order in read-only mode sees the banner update: "Sperre aufgehoben — Sie können die Bestellung jetzt bearbeiten."

### Lock Expiry Warning for Original User
- [ ] If the original user's lock has expired (e.g. they left for 20 minutes and came back), and they try to save, the system detects the expired lock and shows a warning: "Ihre Sitzung ist abgelaufen. Bitte laden Sie die Seite neu, um die Bestellung erneut zu sperren."
- [ ] Their unsaved changes are not silently discarded — the warning dialog should let them copy/note the changes before refreshing

### Admin Lock Override
- [ ] Tenant admins and platform admins see a "Sperre aufheben" button in the read-only banner
- [ ] Clicking it shows a confirmation dialog: "Sperre von [Name] aufheben? Diese Person verliert ungespeicherte Änderungen."
- [ ] On confirmation, the lock is immediately released and the admin can now edit
- [ ] Regular users do not see the override button

## Edge Cases

- **User closes laptop lid / goes to sleep:** Heartbeats stop. Lock expires after 15 min. Any other user can then acquire it.
- **Browser crash / network failure:** Same as above — no explicit release call reaches the server. Lock expires naturally.
- **Same user opens in two tabs:** The same user ID holding the lock — both tabs are treated as the same lock holder. The second tab can edit (same user), not blocked.
- **User is offline temporarily:** Heartbeat fails silently for up to 15 min before lock expires. On reconnect, the client re-acquires the lock if it's still available.
- **Order status changes while locked:** If an order is approved or exported by a background process while locked, the lock is released server-side on status change. The editing user sees an error on their next save attempt.
- **Lock acquired on non-editable order (exported/approved):** Lock acquisition is blocked for orders with status `exported`. Orders with status `approved` or `checked` can still be locked (admin corrections are possible).
- **Tenant with only one user:** Lock still works but is rarely triggered. No meaningful impact.
- **Platform admin viewing cross-tenant orders:** Platform admins can view any tenant's orders. They can override locks but their own lock is scoped to that tenant's order.

## Technical Requirements

- Lock acquisition must be atomic (no two users can simultaneously acquire the same lock) — use a DB-level upsert with unique constraint on `order_id`
- Heartbeat endpoint must be lightweight (< 50ms) — just an UPDATE to extend expiry
- Read-only polling (60s interval) must not create excessive DB load — use a cheap SELECT on lock status only
- Lock state must survive server restarts — stored in the database, not in-memory
- Security: lock acquisition API must verify the requesting user belongs to the same tenant as the order

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
