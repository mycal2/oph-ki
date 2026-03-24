# OPH-51: Tenant Company Logo

## Status: In Review
**Created:** 2026-03-24
**Last Updated:** 2026-03-24

## Dependencies
- Requires: OPH-1 (Multi-Tenant Auth) — tenant identity determines which logo to show
- Requires: OPH-8 (Admin Tenant Management) — logo upload available in admin tenant profile

## User Stories
- As a tenant user, I want to see my company logo in the navigation bar so that I immediately know which tenant environment I am working in.
- As a tenant admin, I want to upload my company logo in the settings so that all my colleagues see it while using the platform.
- As a platform admin, I want to upload a logo for a tenant on the admin tenant detail page so that I can set it up during onboarding.
- As a platform admin, I want to see each tenant's logo on the admin tenant list so I can visually identify tenants at a glance.

## Acceptance Criteria
- [ ] AC-1: A `logo_url` field is added to the `tenants` table (nullable text, public URL to stored image).
- [ ] AC-2: A file upload control is added to the tenant settings page (accessible to `tenant_admin` users) to upload/replace the company logo.
- [ ] AC-3: A file upload control is also available on the Admin Tenant Detail page (OPH-42) for `platform_admin` users.
- [ ] AC-4: Accepted file formats: PNG, JPG, SVG, WebP. Maximum file size: 2 MB.
- [ ] AC-5: Uploaded logos are stored in a Supabase Storage bucket named `tenant-logos` with public read access. The filename uses the tenant ID to prevent collisions.
- [ ] AC-6: The top navigation bar displays the tenant's company logo on the right side of the IDS platform logo, separated by a thin vertical divider, on all protected pages.
- [ ] AC-7: If a tenant has no logo uploaded, the navigation bar shows no logo (no empty space or broken image).
- [ ] AC-8: The logo is constrained to a max height of 32px in the navigation, with width auto-scaling to preserve aspect ratio.
- [ ] AC-9: Platform admin users navigating `/admin/*` pages do not see a tenant logo in the nav (they have no tenant context).
- [ ] AC-10: An existing logo can be removed (reset to none) via a "Logo entfernen" button next to the upload control.
- [ ] AC-11: Logo changes are reflected immediately after save — no page reload required.

## Edge Cases
- Tenant has no logo: Navigation shows only the IDS platform logo — no gap, no broken image.
- Upload fails (network error): Show an error toast; the existing logo remains unchanged.
- File exceeds 2 MB: Show a validation error before uploading — do not attempt the upload.
- Unsupported file type: Show a validation error immediately on file selection.
- Very wide or very tall logo: CSS constrains height to 32px, width auto — no overflow, no layout shift.
- Platform admin is also a tenant member: When on `/admin/*` pages, no logo shown; on tenant pages (if any), show tenant logo.
- Logo URL becomes stale (file deleted from storage): Show no image (broken `<img>` is handled with `onError` → hide the element).
- Simultaneous upload from two browser tabs: Last write wins (file overwritten by tenant ID key).

## Technical Requirements
- Security: Only `tenant_admin` and `platform_admin` roles may upload/delete logos. Public read access on the storage bucket (logo URLs are not secret).
- Storage: Supabase Storage bucket `tenant-logos`, public, with RLS: only service-role or authenticated tenant_admin for the matching tenant may write.
- Performance: Logo image served directly from Supabase CDN URL — no server-side proxy needed.
- Browser Support: Chrome, Firefox, Safari, Edge.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Component Structure

```
TopNavigation (existing — src/components/layout/top-navigation.tsx)
+-- IDS Platform Logo (existing, left side)
+-- [NEW] TenantLogoDisplay (new small component)
|     → shows tenant logo if available, hidden otherwise
|     → hidden entirely for platform_admin users on /admin/* pages
+-- NavLinks (existing)
+-- UserMenu (existing)

Admin Tenant Detail Page (existing — OPH-42)
+-- TenantProfileForm (existing)
    +-- [NEW] Logo Upload Section
          +-- Current logo preview (or "Kein Logo" placeholder)
          +-- File input (PNG/JPG/SVG/WebP, max 2 MB)
          +-- "Logo hochladen" button
          +-- "Logo entfernen" button (only shown when logo exists)

Tenant Settings Page (existing — /settings/*)
+-- [NEW] Logo Upload Section (same as above, tenant_admin only)
    → Best place: a new card on an existing settings page, or a new
      /settings/profile page if none exists yet
```

---

### Data Model

**Tenants table — one new field:**
```
logo_url: text (nullable)
  - Full public URL to the logo image in Supabase Storage
  - NULL when no logo has been uploaded
  - Example: https://<project>.supabase.co/storage/v1/object/public/tenant-logos/<tenantId>.png
```

**Supabase Storage:**
```
Bucket: tenant-logos
  - Public read: yes (logos are not secret)
  - Write access: platform_admin (service role) or tenant_admin for their own tenant
  - File naming: <tenantId>.<ext>  (e.g. "abc-123.png")
  - One file per tenant — uploading replaces the previous file
```

---

### Data Flow

```
Upload flow:
  User selects file in browser
    → client validates format + size (instant feedback, no server round-trip)
    → file uploaded directly to Supabase Storage from browser
    → returned public URL saved to tenants.logo_url via PATCH /api/admin/tenants/[id]
       (platform_admin) or PATCH /api/settings/profile (tenant_admin)
    → TopNavigation re-fetches tenant data → logo appears immediately

Display flow:
  TopNavigation mounts
    → reads tenant_id from JWT (already available in existing useCurrentUserRole hook)
    → fetches tenant profile (logo_url included)
    → renders <img> if logo_url is set; renders nothing if null
    → onError handler hides image if URL becomes broken
```

---

### Tech Decisions

**Direct browser-to-Storage upload (not server proxied)**
File uploads go from the browser directly to Supabase Storage without passing through our Next.js server. This is faster, avoids server memory limits, and is the standard Supabase pattern. Our server only stores the resulting URL.

**Extend existing PATCH `/api/admin/tenants/[id]` for logo_url**
Rather than adding a new API route, the `logo_url` field is included in the existing tenant update payload. Keeps the API surface minimal.

**Add a new PATCH `/api/settings/profile` route for tenant self-service**
Tenant admins can't call the admin route. A new lightweight settings route lets them update their own tenant's logo_url.

**Single file per tenant, named by tenant ID**
Storing one file per tenant (overwriting on re-upload) avoids orphaned files accumulating in storage. No cleanup job needed.

**TenantLogoDisplay as a separate small component**
Keeps `TopNavigation` clean. The new component handles its own data fetch, loading state, and error fallback independently. Easy to test and maintain.

**No new packages required**
Supabase JS client (already installed) handles Storage uploads natively. Next.js `<Image>` component handles display.

---

### Build Plan
1. **Backend:** Add `logo_url` to `tenants` table (migration) + add to tenant API responses + create Storage bucket + add tenant self-service PATCH route
2. **Frontend:** Build `TenantLogoDisplay` component + add to `TopNavigation` + add logo upload section to `TenantProfileForm` + add logo upload to tenant settings

## QA Test Results

**QA Date:** 2026-03-24
**Tested By:** QA Engineer (code review + security audit)
**Overall Result:** NOT READY -- 1 High bug, 1 Medium bug, 1 Low bug

### Acceptance Criteria Results

| AC | Description | Result | Notes |
|----|-------------|--------|-------|
| AC-1 | `logo_url` field added to `tenants` table | PASS | Migration 032 adds nullable TEXT column |
| AC-2 | Upload control on tenant settings page (tenant_admin) | PASS | `/settings/profile` page with role check |
| AC-3 | Upload control on Admin Tenant Detail page (platform_admin) | PASS | Integrated in `tenant-profile-form.tsx` |
| AC-4 | Accepted formats: PNG, JPG, SVG, WebP; max 2 MB | PASS | Client-side validation in `tenant-logo-upload.tsx` |
| AC-5 | Stored in `tenant-logos` bucket, filename uses tenant ID | PASS | Migration creates bucket; upload uses `<tenantId>.<ext>` |
| AC-6 | Nav bar shows tenant logo right of IDS logo with divider | PASS | `TenantLogoDisplay` in `top-navigation.tsx` with Separator |
| AC-7 | No logo = no gap, no broken image | PASS | Component returns `null` when no logo |
| AC-8 | Logo constrained to max-height 32px, width auto | PASS | `h-8 w-auto max-w-[120px] object-contain` |
| AC-9 | Platform admin on `/admin/*` pages sees no tenant logo | PASS | `pathname.startsWith("/admin")` check |
| AC-10 | "Logo entfernen" button to remove logo | PASS | Button shown only when logo exists, deletes from storage + sets null |
| AC-11 | Logo changes reflected immediately (no reload) | FAIL | See BUG-1 below |

### Edge Cases Tested

| Edge Case | Result | Notes |
|-----------|--------|-------|
| Tenant has no logo | PASS | Returns null, no visual artifact |
| Upload fails (network error) | PASS | Error toast shown, existing logo unchanged |
| File exceeds 2 MB | PASS | Validation before upload, toast error |
| Unsupported file type | PASS | Immediate validation on file selection |
| Very wide/tall logo | PASS | CSS constrains height, object-contain preserves ratio |
| Broken image URL (stale) | PASS | `onError` handler hides element |
| Simultaneous upload (two tabs) | PASS | Last write wins via upsert + tenant ID key |
| Platform admin also tenant member on /admin/* | PASS | Logo hidden on admin pages |

### Bugs Found

#### BUG-1: Nav logo does not update after upload without page reload [HIGH]

**Severity:** High
**Priority:** P1
**Component:** `src/components/layout/tenant-logo-display.tsx`

**Description:** After uploading or removing a logo on the settings or admin page, the `TenantLogoDisplay` component in the navigation bar does NOT refresh. It fetches the logo URL once on mount (via `useEffect`) and never re-fetches. The user must manually reload the page to see the updated logo in the nav. This violates AC-11 ("Logo changes are reflected immediately after save -- no page reload required").

**Steps to Reproduce:**
1. Log in as tenant_admin
2. Navigate to Firmenprofil (/settings/profile)
3. Upload a logo
4. Observe the navigation bar -- the logo does NOT appear
5. Reload the page -- the logo now appears

**Expected:** The nav logo updates immediately after upload.
**Actual:** The nav logo only updates after a full page reload.

**Root Cause:** `TenantLogoDisplay` uses a `useEffect` with `[shouldHide, isLoadingRole]` dependencies. There is no mechanism (e.g., shared state, event bus, or refetch trigger) to notify the nav component when the logo changes.

**Suggested Fix:** Use a shared context or a custom event (e.g., `window.dispatchEvent(new Event('tenant-logo-updated'))`) to trigger a re-fetch in `TenantLogoDisplay` after a successful upload or removal.

---

#### BUG-2: PATCH /api/settings/logo accepts arbitrary external URLs (Security) [MEDIUM]

**Severity:** Medium
**Priority:** P2
**Component:** `src/app/api/settings/logo/route.ts`

**Description:** The Zod schema `updateLogoSchema` validates that `logo_url` is a valid URL (`z.string().url()`) but does NOT validate that the URL belongs to the expected Supabase storage domain. A tenant_admin could use the API to set `logo_url` to any external URL (e.g., `https://evil.com/tracking-pixel.png`). This URL would then be rendered as an `<img>` tag in the navigation bar for ALL users of that tenant, enabling:
- Tracking pixels (IP harvesting of all tenant users)
- Potential phishing (visually misleading logo)
- Content injection (offensive imagery)

The `TenantLogoUpload` component normally uploads to Supabase Storage first, but a malicious tenant_admin could bypass the UI and call the API directly with `curl`.

**Steps to Reproduce:**
1. Authenticate as tenant_admin
2. Send: `PATCH /api/settings/logo` with body `{"logo_url": "https://evil.com/track.png"}`
3. All tenant users now load `https://evil.com/track.png` in their nav bar

**Suggested Fix:** Add URL domain validation to the Zod schema or the API handler. Only accept URLs matching the Supabase storage domain pattern: `https://<PROJECT_REF>.supabase.co/storage/v1/object/public/tenant-logos/`.

---

#### BUG-3: German text uses ASCII instead of umlauts in several places [LOW]

**Severity:** Low
**Priority:** P3
**Component:** Multiple files

**Description:** Several user-facing German strings use ASCII approximations instead of proper umlauts:
- `tenant-logo-upload.tsx` line 71: "Nicht unterstutztes Format" (should be "unterstutztes" -> "unterstuetztes" or properly "unterstütztes")
- `tenant-logo-upload.tsx` line 263: "Logo-Datei auswahlen" (should be "auswählen")
- `settings/profile/page.tsx` line 149: "konnen" (should be "können"), "andern" (should be "ändern")
- `settings/profile/page.tsx` line 186: "fur" (should be "für")

**Steps to Reproduce:**
1. Navigate to /settings/profile as a non-admin user
2. Observe text "Nur Administratoren konnen das Firmenlogo andern."

**Expected:** Proper German umlauts (ä, ö, ü).
**Actual:** ASCII approximations without umlauts.

---

### Security Audit

| Check | Result | Notes |
|-------|--------|-------|
| Authentication on GET /api/settings/logo | PASS | Checks user session, returns 401 if not authenticated |
| Authorization on PATCH /api/settings/logo | PASS | Only tenant_admin and platform_admin roles allowed |
| Tenant isolation (PATCH updates only own tenant) | PASS | Uses `tenantId` from JWT app_metadata, not from request body |
| Input validation (Zod) | PARTIAL | Validates URL format but not domain origin (see BUG-2) |
| Storage RLS: public read | PASS | SELECT policy for public on tenant-logos bucket |
| Storage RLS: platform_admin write | PASS | ALL policy checking role in JWT |
| Storage RLS: tenant_admin write (own files only) | PASS | LIKE pattern with tenant_id prefix |
| Inactive user access | PASS | GET endpoint checks user_status !== "inactive" |
| XSS via logo_url | LOW RISK | URL is rendered in `<img src>` tag, not innerHTML; browsers do not execute JS from img src |
| SSRF via logo_url | LOW RISK | Image loaded client-side (browser), not server-side; no SSRF on server |
| File size enforcement server-side | NOT TESTED | 2 MB limit is client-side only; Supabase Storage may have its own limits but there is no server-side check |

### Cross-Browser Testing

Manual browser testing not performed (code review only). No browser-specific APIs or CSS features are used that would cause compatibility issues. The implementation uses standard Next.js Image component with `unoptimized` flag and standard Tailwind CSS classes.

### Responsive Testing

The upload component uses `flex` layout with `gap-4` which should adapt to small screens. The nav logo uses `h-8 w-auto max-w-[120px]` which is appropriately constrained. No responsive-specific issues identified in code review.

### Regression Impact

| Feature | Risk | Notes |
|---------|------|-------|
| OPH-1 (Auth) | None | No auth flow changes |
| OPH-8 (Admin Tenant Management) | Low | TenantProfileForm extended with logo section; existing fields unchanged |
| OPH-42 (Admin Tenant Detail) | Low | Logo upload added to form; existing functionality preserved |
| Top Navigation (all features) | Low | TenantLogoDisplay added as sibling component; no changes to existing nav elements |

### Summary

- **Acceptance Criteria:** 10/11 passed, 1 failed (AC-11)
- **Bugs Found:** 3 total -- 1 High, 1 Medium, 1 Low
- **Security:** 1 medium-severity finding (arbitrary URL injection)
- **Production Ready:** NO -- BUG-1 (High) must be fixed before deployment

## Deployment
_To be added by /deploy_
