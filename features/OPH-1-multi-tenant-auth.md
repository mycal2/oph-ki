# OPH-1: Multi-Tenant Auth & Benutzerverwaltung

## Status: Deployed
**Created:** 2026-02-27
**Last Updated:** 2026-02-28
**Deployed:** 2026-02-28

## Dependencies
- None (Basis für alle anderen Features)

## User Stories
- Als Mitarbeiter eines Dentalherstellers möchte ich mich mit E-Mail und Passwort anmelden, damit ich sicher auf die Bestelldaten meines Unternehmens zugreifen kann.
- Als Mitarbeiter möchte ich, dass ich ausschließlich die Daten meines eigenen Mandanten sehe, damit Daten anderer Dentalhersteller für mich unsichtbar sind.
- Als Admin meines Unternehmens möchte ich weitere Mitarbeiter einladen und verwalten, damit mein Team gemeinsam Bestellungen bearbeiten kann.
- Als Plattform-Admin möchte ich neue Mandanten (Dentalhersteller) anlegen und aktivieren/deaktivieren, damit ich den Zugang zur Plattform steuern kann.
- Als Benutzer möchte ich mein Passwort zurücksetzen können, damit ich auch nach einem vergessenen Passwort wieder Zugang erhalte.

## Acceptance Criteria
- [ ] Benutzer können sich per E-Mail + Passwort anmelden (Supabase Auth)
- [ ] Jeder Benutzer ist genau einem Mandanten (tenant) zugeordnet
- [ ] Alle Datenbankabfragen sind durch Row Level Security (RLS) mandantenspezifisch gefiltert — kein Benutzer sieht Daten eines anderen Mandanten
- [ ] Passwort-Reset-Flow per E-Mail funktioniert
- [ ] Tenant-Admins können Mitarbeiter per E-Mail einladen
- [ ] Eingeladene Benutzer durchlaufen einen Onboarding-Flow (Passwort setzen)
- [ ] Inaktive Benutzer / deaktivierte Mandanten erhalten keinen Zugang
- [ ] Session-Timeout nach Inaktivität (konfigurierbar, Standard: 8 Stunden)
- [ ] Rollen: `tenant_admin`, `tenant_user`, `platform_admin`

## Edge Cases
- Was passiert, wenn ein Benutzer versucht, per URL auf Daten eines anderen Mandanten zuzugreifen? → 403 Forbidden, kein Datenleck
- Was passiert, wenn die Einladungs-E-Mail abläuft (> 48h)? → Tenant-Admin muss neue Einladung versenden
- Was passiert, wenn ein Benutzer zu einem deaktivierten Mandanten gehört? → Login schlägt mit verständlicher Fehlermeldung fehl
- Was passiert bei mehrfachen fehlgeschlagenen Login-Versuchen? → Rate-Limiting nach 5 Versuchen (5 Minuten Sperrzeit)
- Was passiert, wenn der letzte Admin eines Mandanten deaktiviert wird? → Warnung an Plattform-Admin

## Technical Requirements
- Supabase Auth (E-Mail/Passwort)
- RLS auf allen Tabellen mit `tenant_id` als Filterbedingung
- Middleware prüft Session bei jedem geschützten Request
- JWT enthält `tenant_id` und `role` als Custom Claims

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Screen & Component Structure

```
/login
  └── LoginForm
        ├── Email input
        ├── Password input
        ├── Submit button
        └── "Forgot password?" link

/forgot-password
  └── ForgotPasswordForm
        ├── Email input
        └── Submit button (sends reset email)

/reset-password  (accessed via email link)
  └── ResetPasswordForm
        ├── New password input
        ├── Confirm password input
        └── Submit button

/invite/accept  (accessed via email invitation link)
  └── AcceptInviteForm
        ├── Welcome message (shows company name)
        ├── New password input
        ├── Confirm password input
        └── Submit button

/dashboard  (protected layout, shared by all app pages)
  └── AppLayout
        ├── TopNavigation
        │     ├── Company logo
        │     └── UserMenu (avatar, name, logout)
        └── [page content]

/settings/team  (tenant_admin only)
  └── TeamManagementPage
        ├── InviteUserButton → InviteUserDialog
        │     ├── Email input
        │     └── Role selector (tenant_admin / tenant_user)
        └── UsersTable
              ├── Columns: Name, Email, Role, Last Login, Status
              └── Row actions: Deactivate / Reactivate

/admin/*  (platform_admin only — separate layout)
  └── AdminLayout
        └── [admin pages: OPH-7, OPH-8, OPH-9]
```

### Data Model

**`tenants` table** — one row per dental manufacturer

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | string | Company name, e.g. "Dental GmbH" |
| slug | string | URL-safe short name (unique); used for inbound email addresses in OPH-10 |
| status | enum | active / inactive / trial |
| erp_type | enum | SAP / Dynamics365 / Sage / Custom |
| contact_email | string | Primary contact for the tenant |
| email_notifications_enabled | boolean | On/off toggle for OPH-13 (default: true) |
| created_at | timestamp | Creation time |

**`user_profiles` table** — extends Supabase's built-in auth user

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Same UUID as Supabase auth.users |
| tenant_id | UUID | Foreign key → tenants.id |
| role | enum | tenant_user / tenant_admin / platform_admin |
| first_name | string | Display name |
| last_name | string | Display name |
| status | enum | active / inactive |
| created_at | timestamp | |

All other tables in the system (orders, dealers, etc.) include a `tenant_id` column that references `tenants.id`.

### Security Architecture

**Two layers of protection:**

**Layer 1 — Next.js Middleware (front door)**
Runs on every incoming request before any page renders. Checks for a valid Supabase session. No session → redirect to `/login`. Route-level role enforcement:
- `/admin/*` → platform_admin only
- `/settings/team` → tenant_admin or platform_admin
- All other app routes → any authenticated, active user

**Layer 2 — Row Level Security (database vault)**
Database-level filter on every query. Even if middleware is bypassed, the database refuses to return data for the wrong tenant. Policies filter every row by `tenant_id` derived from the user's JWT.

**JWT Custom Claims (`app_metadata`):**
`tenant_id` and `role` are embedded in the Supabase JWT at login via a database function trigger. This means every API call carries the user's tenant identity without an additional database lookup. `app_metadata` is server-writable only and cannot be spoofed by the client.

### Auth Flows

| Flow | Steps |
|------|-------|
| **Login** | Enter email + password → Supabase verifies → session JWT issued → redirect to `/dashboard` |
| **Password Reset** | "Forgot password" → enter email → Supabase sends magic link → user clicks → `/reset-password` → enter new password → redirect to login |
| **Team Invitation** | Tenant Admin enters email in `/settings/team` → Supabase invite email sent → user clicks link → `/invite/accept` → sets password → `user_profile` row created → land on `/dashboard` |
| **Deactivate User** | Tenant Admin sets status = inactive → next request blocked at middleware → shown explanatory message |
| **Deactivate Tenant** | Platform Admin sets tenant status = inactive → all tenant users blocked at middleware |

### Tech Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Auth system | Supabase Auth | Built-in email/password, invite-by-email, password reset, and JWT — no custom auth code |
| Session in Next.js | `@supabase/ssr` | Purpose-built for Next.js App Router; works correctly in server components, API routes, and middleware |
| Route protection | Next.js Middleware | Centralized, runs at the edge before page renders |
| Tenant isolation | Row Level Security | Database-enforced isolation; immune to application-layer bugs |
| Role/tenant in JWT | `app_metadata` | Avoids extra DB round-trip per request; server-only field — cannot be modified by the client |

### Dependencies

| Package | Purpose |
|---------|---------|
| `@supabase/supabase-js` | Supabase client library |
| `@supabase/ssr` | Next.js App Router-compatible session management |

## QA Test Results (Re-Test #2)

**Tested:** 2026-02-27 (Re-test after bug fixes)
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Build Status:** Production build passes without errors (12 routes, all compiled successfully).
**Previous QA Pass:** 2026-02-27 (initial test found 11 bugs; 7 have been fixed)

### Previously Fixed Bugs (Verified in This Re-Test)

| Old Bug | Description | Fix Verified |
|---------|-------------|--------------|
| BUG-1 (Critical) | Rate limiting not wired up | FIXED -- `loginAction()` now calls `checkRateLimit()`, `recordFailedAttempt()`, and `clearRateLimit()` (lines 40-58, 67-71, 117-120 in `src/lib/auth-actions.ts`) |
| BUG-2 (Critical) | `.env` not in `.gitignore` | FIXED -- `.gitignore` now includes `.env` on line 30 (change is uncommitted but present in working tree) |
| BUG-3 (High) | Session timeout missing | FIXED -- Middleware now implements configurable inactivity timeout via `last_active_at` cookie and `NEXT_PUBLIC_SESSION_TIMEOUT_HOURS` env var (default: 8h). Session expiry redirects to `/login?error=session_expired` (lines 54-87 in `src/lib/supabase/middleware.ts`) |
| BUG-4 (High) | Security headers missing | FIXED -- `next.config.ts` now configures X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy: origin-when-cross-origin, Strict-Transport-Security, X-DNS-Prefetch-Control, and Permissions-Policy |
| BUG-5 (Medium) | `handle_new_user` trigger NULL tenant_id crash | FIXED -- Trigger now checks `IF v_tenant_id IS NULL THEN RETURN NEW; END IF;` (line 171-173 in migration). Users without tenant_id are silently skipped. |
| BUG-10 (Medium) | API routes skip user/tenant status checks | FIXED -- All three API routes (`/api/team/invite`, `/api/team/members`, `/api/team/[userId]/status`) now check `user_status` and `tenant_status` from `app_metadata` and return 403 if deactivated. |
| BUG-11 (Medium) | Invite API uses spoofable Origin header | FIXED -- Invite API now uses `NEXT_PUBLIC_SITE_URL` directly for `redirectTo` (line 95 in `src/app/api/team/invite/route.ts`). No Origin header usage. |

### Acceptance Criteria Status

#### AC-1: Benutzer koennen sich per E-Mail + Passwort anmelden (Supabase Auth)
- [x] Login page exists at `/login` with email + password fields
- [x] LoginForm uses `supabase.auth.signInWithPassword()` via server action
- [x] Post-login redirect uses `window.location.href` (not router.push), correct per Supabase SSR best practices
- [x] Loading state shows spinner during submission (`Loader2` component)
- [x] Error messages displayed for invalid credentials, unconfirmed email, and generic failures
- [x] Success path redirects to `/dashboard`
- [x] Rate limiting now active: blocks after 5 failed attempts per email, also tracks IP
- **PASS**

#### AC-2: Jeder Benutzer ist genau einem Mandanten (tenant) zugeordnet
- [x] `user_profiles.tenant_id` is `NOT NULL` with foreign key to `tenants.id`
- [x] `handle_new_user()` trigger reads `tenant_id` from `raw_user_meta_data` on user creation
- [x] JWT custom access token hook injects `tenant_id` into `app_metadata`
- [x] Trigger now gracefully handles missing `tenant_id` (returns NEW without inserting a profile row)
- **PASS**

#### AC-3: Alle Datenbankabfragen sind durch RLS mandantenspezifisch gefiltert
- [x] RLS enabled on `tenants` table
- [x] RLS enabled on `user_profiles` table
- [x] RLS enabled on `auth_rate_limits` table (service-role only, no user policies)
- [x] `tenants` SELECT policies: platform_admin sees all, users see own tenant only
- [x] `user_profiles` SELECT policies: platform_admin sees all, users see own tenant only
- [x] `tenants` INSERT/UPDATE/DELETE: restricted to platform_admin
- [x] `user_profiles` UPDATE: users can update own profile; tenant_admins can update tenant profiles
- [x] Custom access token hook derives `tenant_id` from JWT, not from user input
- **PASS**

#### AC-4: Passwort-Reset-Flow per E-Mail funktioniert
- [x] Forgot password page at `/forgot-password` with email input
- [x] `forgotPasswordAction()` always returns success (does not leak whether email exists) -- good security practice
- [x] Reset password page at `/reset-password` with password + confirm fields
- [x] Auth callback route at `/auth/callback` exchanges code for session
- [x] Success state shows confirmation and link to login
- [x] Validation: min 8 chars, passwords must match (both server and client side)
- **PASS**

#### AC-5: Tenant-Admins koennen Mitarbeiter per E-Mail einladen
- [x] InviteUserDialog component at `/settings/team` with email + role selector
- [x] API route `POST /api/team/invite` validates auth and role (tenant_admin or platform_admin)
- [x] Uses `adminClient.auth.admin.inviteUserByEmail()` with service role
- [x] Checks tenant status (active or trial) before allowing invitation
- [x] Handles duplicate email (409 Conflict response)
- [x] Zod validation on email and role input (`inviteUserSchema`)
- [x] Success feedback with auto-close dialog (2s delay)
- [x] Redirect URL now uses server-configured `NEXT_PUBLIC_SITE_URL` (not spoofable Origin header)
- **PASS**

#### AC-6: Eingeladene Benutzer durchlaufen einen Onboarding-Flow (Passwort setzen)
- [x] Accept invite page at `/invite/accept` with AcceptInviteForm
- [x] `acceptInviteAction()` validates password length (min 8) and match
- [x] Calls `supabase.auth.updateUser({ password })` to set the password
- [x] Redirects to `/dashboard` after 2 seconds on success
- [ ] BUG: `tenant_name` is read from `user.user_metadata.tenant_name` but the invite API does NOT set `tenant_name` in user metadata -- it only sets `tenant_id` and `role`. The welcome message will never show the company name. (see BUG-6)
- **PARTIAL PASS** (functional but incomplete UX -- see BUG-6)

#### AC-7: Inaktive Benutzer / deaktivierte Mandanten erhalten keinen Zugang
- [x] `loginAction()` checks `app_metadata.user_status === "inactive"` and signs out + returns error
- [x] `loginAction()` checks `app_metadata.tenant_status === "inactive"` and signs out + returns error
- [x] Middleware checks `user_status` and `tenant_status` on every protected page route and redirects to `/login`
- [x] Login page reads `?error=account_inactive` and `?error=tenant_inactive` from URL params to display localized messages
- [x] API routes now independently check `user_status` and `tenant_status` from app_metadata
- [x] Status toggle API prevents deactivating the last admin of a tenant
- [x] Status toggle API prevents self-deactivation
- **PASS**

#### AC-8: Session-Timeout nach Inaktivitaet (konfigurierbar, Standard: 8 Stunden)
- [x] Middleware implements inactivity timeout via `last_active_at` httpOnly cookie
- [x] Default timeout: 8 hours (configurable via `NEXT_PUBLIC_SESSION_TIMEOUT_HOURS` env var)
- [x] Cookie is updated (sliding window) on every page request
- [x] On timeout, user is signed out and redirected to `/login?error=session_expired`
- [x] Login form displays localized "Ihre Sitzung ist abgelaufen" message for expired sessions
- [x] Cookie is `httpOnly`, `sameSite: lax`, `secure` in production, with `maxAge` matching timeout
- [ ] BUG: `NEXT_PUBLIC_SESSION_TIMEOUT_HOURS` is not documented in `.env.local.example`. (see NEW-BUG-1)
- [ ] NOTE: Session timeout only applies to page routes, not API routes (API routes skip this check at middleware line 61: `if (user && !isApiRoute)`). This is acceptable since API calls from the frontend will redirect via the page-level session check.
- **PASS** (core functionality works; minor documentation gap)

#### AC-9: Rollen: tenant_admin, tenant_user, platform_admin
- [x] TypeScript type `UserRole` defines all three roles
- [x] Database CHECK constraint enforces `role IN ('tenant_user', 'tenant_admin', 'platform_admin')`
- [x] Middleware enforces role-based route access: `/admin/*` for platform_admin, `/settings/team` for admins
- [x] API routes check role from `app_metadata` before processing
- [x] UserMenu conditionally shows "Teamverwaltung" link for admins only
- [x] UsersTable shows role labels with localized badges (Administrator, Mitarbeiter, Plattform-Admin)
- **PASS**

### Edge Cases Status

#### EC-1: Benutzer versucht per URL auf Daten eines anderen Mandanten zuzugreifen (403 Forbidden)
- [x] RLS policies on `user_profiles` filter by `tenant_id` from JWT -- database returns empty results for wrong tenant
- [x] RLS policies on `tenants` filter by own tenant or platform_admin
- [x] Status toggle API checks `targetProfile.tenant_id !== tenantId` for tenant_admins (returns 403)
- [ ] BUG: API route `/api/team/members` still fetches all auth users via `adminClient.auth.admin.listUsers()` with `perPage: 1000` into server memory. Client response is correctly filtered but server-side memory exposure remains. (see BUG-7)
- **PARTIAL PASS** (RLS prevents client-side leaks; server-side memory concern persists)

#### EC-2: Einladungs-E-Mail laeuft ab (> 48h)
- [x] Supabase Auth handles invite token expiry natively (default: 24h, configurable in Supabase dashboard)
- [x] Expired invite leads to callback error, which redirects to `/login?error=auth_callback_failed`
- [ ] NOTE: The 48-hour expiry mentioned in the spec relies on Supabase dashboard configuration. No application-level enforcement exists. This is acceptable but should be documented.
- **PASS** (relies on Supabase configuration)

#### EC-3: Benutzer gehoert zu deaktiviertem Mandanten
- [x] Login blocks with clear message: "Ihr Mandant ist deaktiviert. Bitte kontaktieren Sie den Plattform-Support."
- [x] Middleware blocks on every page request with redirect to `/login?error=tenant_inactive`
- [x] API routes now also block deactivated tenants (return 403)
- **PASS**

#### EC-4: Mehrfache fehlgeschlagene Login-Versuche (Rate-Limiting nach 5 Versuchen)
- [x] `loginAction()` now calls `checkRateLimit()` before attempting sign-in (line 40)
- [x] Rate limiting checks both email (always) and IP address (when available via x-forwarded-for or x-real-ip)
- [x] `recordFailedAttempt()` is called on auth error (line 68) and session failure (line 92)
- [x] After `MAX_ATTEMPTS` (5) failures, `locked_until` is set for `LOCKOUT_MINUTES` (5 min)
- [x] Localized rate limit message: "Zu viele fehlgeschlagene Anmeldeversuche. Bitte versuchen Sie es in X Minuten erneut."
- [x] `clearRateLimit()` is called on successful login (line 117)
- [x] `auth_rate_limits` table has unique index on `(identifier, identifier_type)` and index on `locked_until`
- **PASS**

#### EC-5: Letzter Admin eines Mandanten wird deaktiviert (Warnung an Plattform-Admin)
- [x] Status toggle API correctly prevents deactivation of the last active admin (returns 400 error)
- [ ] BUG: The spec says "Warnung an Plattform-Admin" but no notification/warning is sent to the platform admin. The operation is simply blocked with an error message. (see BUG-8)
- **PARTIAL PASS** (block works, notification missing)

### Security Audit Results

#### Authentication
- [x] Unauthenticated users cannot access protected routes (middleware redirects to `/login`)
- [x] API routes validate session via `supabase.auth.getUser()`
- [x] `app_metadata` is server-writable only and cannot be spoofed by the client
- [x] Post-login redirect uses `window.location.href` (not router.push) as per best practices
- [x] Rate limiting now fully active on login flow (email + IP based)
- [x] Session inactivity timeout implemented (configurable, default 8 hours)

#### Authorization
- [x] RLS enforces tenant isolation at the database level
- [x] Middleware enforces role-based route access (`/admin/*`, `/settings/team`)
- [x] API routes check roles before processing
- [x] Tenant admins cannot manage users outside their tenant (status toggle checks tenant_id)
- [x] Self-deactivation is prevented
- [x] Platform admin can manage all users -- correct per spec

#### Input Validation
- [x] All API inputs validated with Zod schemas (inviteUserSchema, toggleUserStatusSchema)
- [x] Auth actions validate inputs before calling Supabase
- [x] Client-side forms use `required`, `type="email"`, and `minLength` attributes
- [ ] NOTE: loginAction() validates email/password presence manually rather than using the Zod loginSchema. Functional but inconsistent. (see BUG-9)

#### XSS Protection
- [x] React's JSX auto-escapes user input in templates
- [x] No use of `dangerouslySetInnerHTML` anywhere in the codebase
- [x] Error messages are predefined constants, not user-controlled

#### CSRF Protection
- [x] API routes use cookie-based auth (Supabase SSR cookies with SameSite)
- [x] Server actions are protected by Next.js's built-in CSRF token mechanism
- [ ] NOTE: Fetch-based API calls (invite, members, status) rely on SameSite cookies rather than explicit CSRF tokens. This is acceptable for modern browsers.

#### Secrets Management
- [x] `SUPABASE_SERVICE_ROLE_KEY` is never exposed with `NEXT_PUBLIC_` prefix
- [x] Admin client is only used in server-side code (API routes and rate-limit module)
- [x] `.env.local.example` documents required env vars with dummy values
- [x] `.env` is now in `.gitignore` (change is in working tree, not yet committed)
- [ ] WARNING: The `.env` file still exists on disk at project root with a real Supabase project URL and public key. While it is now gitignored, the `.gitignore` change is uncommitted. If `git add -A` is run before the `.gitignore` change is committed, the `.env` could still be staged. Recommend committing the `.gitignore` change first. (see NEW-BUG-2)

#### Security Headers
- [x] `next.config.ts` configures all required headers per `.claude/rules/security.md`:
  - X-Frame-Options: DENY
  - X-Content-Type-Options: nosniff
  - Referrer-Policy: origin-when-cross-origin
  - Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  - X-DNS-Prefetch-Control: on
  - Permissions-Policy: camera=(), microphone=(), geolocation=()
- [x] Headers applied to all routes via `source: "/(.*)"` pattern

#### API Route Security
- [x] Middleware bypasses API routes (they handle their own auth) -- acceptable pattern
- [x] All three API routes independently verify authentication and check user/tenant status
- [x] Rate limiting is active on login flow
- [ ] NOTE: API routes do not have their own rate limiting. Only the login flow is rate-limited. This is acceptable for now since API routes require valid authenticated sessions.

#### Data Exposure
- [ ] BUG: `/api/team/members` still fetches ALL auth users (up to 1000) from Supabase admin API regardless of tenant. Client response is filtered correctly but server-side memory exposure remains. (see BUG-7)

#### Auth Callback Redirect (NEW finding)
- [ ] BUG: Auth callback route (`/auth/callback`) uses `x-forwarded-host` header for redirect in production (line 28-29 in `src/app/auth/callback/route.ts`). The `x-forwarded-host` header can be spoofed if the application is not behind a properly configured reverse proxy. However, this is only used for the redirect after a successful code exchange (user already has a valid session), which limits the attack surface. (see NEW-BUG-3)

### Cross-Browser Testing

Note: Cross-browser testing is based on code review of the implementation. All components use standard HTML5 elements, shadcn/ui (Radix primitives), and Tailwind CSS, which have excellent cross-browser support.

- [x] Chrome: Standard HTML5 + Radix UI primitives -- expected to work
- [x] Firefox: Standard HTML5 + Radix UI primitives -- expected to work
- [x] Safari: Standard HTML5 + Radix UI primitives -- expected to work
- [ ] NOTE: `backdrop-filter` used in TopNavigation may degrade gracefully in older browsers, but the `supports-[backdrop-filter]` prefix ensures a fallback

### Responsive Testing

- [x] Mobile (375px): Auth forms use `max-w-md`, tables have `overflow-x-auto`, email column hidden on small screens (`hidden sm:table-cell`)
- [x] Tablet (768px): Dashboard grid shifts (`md:grid-cols-2`), padding adjusts, Last Login column appears
- [x] Desktop (1440px): Full layout with all columns visible, `max-w-7xl` container, action labels shown
- [x] AuthLayout centers forms vertically and horizontally with padding
- [x] UsersTable: Name shows inline email on mobile; Last Login hidden below `md`; Action labels hidden below `lg`
- [x] TeamManagementPage header stacks vertically on mobile, horizontal on `sm`+
- [x] InviteUserDialog is responsive (Radix Dialog centers on all sizes)

### Remaining Bugs

#### BUG-6: Invite Accept Form Never Shows Company Name (UNCHANGED from prior test)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Invite a user via `/api/team/invite`
  2. User clicks the invite link and arrives at `/invite/accept`
  3. AcceptInviteForm reads `user.user_metadata.tenant_name` (line 37 in accept-invite-form.tsx)
  4. Expected: The form shows "Sie wurden zur [Company Name] eingeladen"
  5. Actual: `tenant_name` is never set in user metadata. The invite API (line 92-94 in route.ts) only passes `tenant_id` and `role` to `inviteUserByEmail()`. The form always falls back to the generic message.
- **Files:** `src/app/api/team/invite/route.ts` (line 92), `src/components/auth/accept-invite-form.tsx` (line 37)
- **Priority:** Fix in next sprint

#### BUG-7: /api/team/members Fetches All Auth Users Into Memory (UNCHANGED from prior test)
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Call `GET /api/team/members` as a tenant_admin
  2. The route calls `adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })` (line 93-96 in route.ts)
  3. Expected: Only users for the requesting tenant should be fetched from auth
  4. Actual: ALL users across ALL tenants (up to 1000) are fetched into server memory, then filtered by matching IDs from the RLS-protected profiles query. The API response to the client IS correctly filtered, but server-side memory contains all cross-tenant user data (emails, last_sign_in_at, metadata).
  5. At scale (1000+ users across tenants), this becomes both a performance and a security concern.
- **Recommended fix:** Use individual `adminClient.auth.admin.getUserById()` calls for each profile ID, or batch with Supabase's filter capabilities.
- **Files:** `src/app/api/team/members/route.ts` (lines 92-96)
- **Priority:** Fix in next sprint

#### BUG-8: No Notification to Platform Admin When Last Admin Deactivation Is Blocked (UNCHANGED from prior test)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Attempt to deactivate the last active admin of a tenant via PATCH `/api/team/[userId]/status`
  2. Expected per spec: "Warnung an Plattform-Admin" -- the platform admin should be notified
  3. Actual: The operation is correctly blocked with error "Der letzte Administrator eines Mandanten kann nicht deaktiviert werden" but no notification is sent to the platform admin
- **Files:** `src/app/api/team/[userId]/status/route.ts` (lines 106-126)
- **Priority:** Nice to have

#### BUG-9: loginAction Does Not Use Zod Schema for Validation (UNCHANGED from prior test)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Review `src/lib/auth-actions.ts` loginAction() (line 28) -- uses manual `if (!email || !password)` check
  2. Review `src/lib/validations.ts` -- `loginSchema` exists but is never imported or used in auth-actions.ts
  3. Expected: Consistent Zod validation across all inputs per project convention
  4. Actual: Manual validation is used, which is functional but inconsistent with the Zod-first pattern used in API routes
- **Files:** `src/lib/auth-actions.ts`, `src/lib/validations.ts`
- **Priority:** Nice to have

#### NEW-BUG-1: NEXT_PUBLIC_SESSION_TIMEOUT_HOURS Not Documented in .env.local.example
- **Severity:** Low
- **Steps to Reproduce:**
  1. Open `.env.local.example` -- the `NEXT_PUBLIC_SESSION_TIMEOUT_HOURS` variable is not listed
  2. The middleware uses this variable (line 57 in `src/lib/supabase/middleware.ts`) with a default of 8
  3. Expected: All environment variables should be documented in `.env.local.example` per project rules
  4. Actual: Variable is undocumented; a developer would not know it exists without reading the middleware source
- **Files:** `.env.local.example`, `src/lib/supabase/middleware.ts`
- **Priority:** Nice to have

#### NEW-BUG-2: Uncommitted .gitignore Change Leaves .env Temporarily Unprotected
- **Severity:** High
- **Steps to Reproduce:**
  1. Run `git status` -- `.gitignore` shows as modified (unstaged)
  2. The `.env` file exists on disk with real Supabase project credentials (URL and public key)
  3. The `.gitignore` now includes `.env` but this change is NOT committed
  4. If someone runs `git checkout -- .gitignore` (discarding changes), the `.env` pattern is lost
  5. If someone runs `git add -A` before the `.gitignore` is committed, git may still pick up `.env` depending on order of operations
  6. Expected: The `.gitignore` change should be committed immediately to ensure `.env` is permanently protected
  7. Actual: The protection is only in the working tree, not in the repository
- **Files:** `.gitignore`, `.env`
- **Priority:** Fix before deployment (commit the `.gitignore` change immediately)

#### NEW-BUG-3: Auth Callback Uses x-forwarded-host Header for Redirect (Potentially Spoofable)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Review `src/app/auth/callback/route.ts` lines 23-31
  2. In production (non-development), the callback uses `x-forwarded-host` for the redirect URL
  3. The `x-forwarded-host` header can be spoofed by an attacker if the app is not behind a properly configured reverse proxy that strips/overwrites this header
  4. Expected: Redirect should use server-configured `NEXT_PUBLIC_SITE_URL` or validate the forwarded host
  5. Actual: An attacker could craft a request with a malicious `x-forwarded-host` to redirect the user to a phishing site after successful auth callback. However, this requires the user to click a legitimate Supabase auth link first, limiting the attack surface.
- **Note:** When deployed on Vercel, the `x-forwarded-host` header is set by the platform and cannot be spoofed by the end user. This is only a risk in custom deployments without proper proxy configuration.
- **Files:** `src/app/auth/callback/route.ts` (lines 23-31)
- **Priority:** Nice to have (low risk on Vercel; document for custom deployments)

### Summary

- **Acceptance Criteria:** 8/9 passed, 1 partial pass (AC-6 missing company name in invite UX)
- **Edge Cases:** 4/5 passed, 1 partial pass (EC-5 missing platform admin notification)
- **Previously Found Bugs:** 11 total -- 7 FIXED, 4 remaining
- **New Bugs Found:** 3
- **Total Open Bugs:** 7 (0 critical, 1 high, 1 medium, 5 low)
  - High: NEW-BUG-2 (uncommitted .gitignore leaves .env unprotected)
  - Medium: BUG-7 (all auth users fetched into server memory)
  - Low: BUG-6 (company name missing in invite), BUG-8 (no admin notification), BUG-9 (inconsistent Zod usage), NEW-BUG-1 (env var undocumented), NEW-BUG-3 (x-forwarded-host redirect)
- **Security:** Significantly improved since first test. All critical and high security issues from the first pass are resolved. One high-priority housekeeping item remains (committing .gitignore).
- **Production Ready:** CONDITIONAL YES -- commit the `.gitignore` change immediately (resolves NEW-BUG-2), then the application is ready for deployment. All remaining bugs are medium or low severity with no blockers.
- **Recommendation:** Commit the `.gitignore` change now, then proceed with deployment. Schedule BUG-7 for next sprint. Low-priority items (BUG-6, BUG-8, BUG-9, NEW-BUG-1, NEW-BUG-3) can be addressed as backlog items.

## Deployment
_To be added by /deploy_
