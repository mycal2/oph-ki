# OPH-34: Admin Manual Upload with Tenant Selection

## Status: Planned
**Created:** 2026-03-09
**Last Updated:** 2026-03-09

## Dependencies
- Requires: OPH-1 (Multi-Tenant Auth) - for platform_admin role detection
- Requires: OPH-2 (Bestellungs-Upload) - the existing upload flow being extended
- Requires: OPH-8 (Admin: Mandanten-Management) - for the list of available tenants

## User Stories

- As a platform admin, I want to upload an order file and select which tenant it belongs to, so that I can process orders on behalf of any tenant without needing to log in as that tenant.
- As a platform admin, I want to see a dropdown of all active tenants before uploading, so that I can assign the order to the correct tenant.
- As a platform admin, I want the upload to behave exactly like a regular tenant upload (dealer recognition, AI extraction, notification) but attributed to the selected tenant.
- As a platform admin, I want the uploaded order to appear in the selected tenant's order list, so that tenant users can review and approve it.
- As a platform admin, I want to see the tenant-selection step prominently before uploading, so that I don't accidentally upload to the wrong tenant.

## Acceptance Criteria

- [ ] A dedicated admin upload page exists at `/admin/upload` (or the existing `/orders/upload` page conditionally shows tenant selection for platform_admins).
- [ ] Platform admins see a "Mandant auswählen" dropdown at the top of the upload form before they can start uploading.
- [ ] The dropdown lists all active tenants (name + slug), sorted alphabetically.
- [ ] The "Hochladen" button is disabled until both a tenant is selected AND at least one file is added.
- [ ] On upload, the selected `tenantId` is passed to the backend, overriding the JWT-derived tenant.
- [ ] The backend verifies the caller has `platform_admin` role before accepting a tenant override.
- [ ] Dealer recognition, AI extraction, and email notifications run for the target tenant's context (e.g., the target tenant's ERP config is used for export).
- [ ] The uploaded order appears in the selected tenant's order list with correct `tenant_id`.
- [ ] Regular tenant users are NOT affected — their upload flow is unchanged (no tenant dropdown shown).
- [ ] After a successful admin upload, the success screen shows the selected tenant name for confirmation.

## Edge Cases

- **No active tenants:** Show an info message "Keine aktiven Mandanten vorhanden." and disable the upload form.
- **Admin selects tenant then changes files:** Tenant selection persists; files can be changed freely.
- **Admin clears tenant selection mid-upload:** Not possible — selection is locked once upload starts (same as file inputs).
- **Non-admin accesses admin upload route:** Redirect to `/orders/upload` (standard tenant flow).
- **Selected tenant has no ERP config assigned:** Upload and extraction still proceed normally; export will show a warning when the tenant user tries to export.
- **Platform admin also has a tenant_id in JWT (edge case):** The admin-selected tenant always takes precedence over any JWT tenant_id for platform_admin users on this flow.

## Technical Requirements (optional)
- Frontend-only change to the upload page + a new optional `tenantId` parameter in the upload API routes.
- The backend (`/api/orders/upload` and `/api/orders/upload/confirm`) must accept an optional `tenantId` override, but only when the caller has `role = platform_admin` in their JWT.
- Tenant list can be loaded from the existing `/api/admin/tenants` endpoint (filter `status = active`).
- No new database migrations needed — just using the existing `tenant_id` field on orders.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Component Structure

```
/admin/upload  (new page — platform_admin only)
├── TenantSelector          ← new component: loads active tenants, required first
├── Subject input           ← reused from existing upload page
├── FileDropzone            ← reused as-is (disabled until tenant selected)
├── UploadFileList          ← reused as-is
└── Upload button           ← disabled until tenant selected + at least 1 file

useFileUpload hook          ← extended with optional tenantId parameter
├── Threads tenantId into step 1: POST /api/orders/upload (presign)
└── Threads tenantId into step 3: POST /api/orders/upload/confirm

/api/orders/upload          ← extended: accepts optional tenantId body field
/api/orders/upload/confirm  ← extended: accepts optional tenantId body field
```

### What Gets Built

**1. New page: `/admin/upload`**
- Platform-admin-only page in the existing `/admin/` section
- Loads active tenant list from `/api/admin/tenants` on mount
- Shows TenantSelector at top; rest of form is disabled until a tenant is chosen
- After successful upload, success screen shows "Hochgeladen für: [Tenant Name]"
- Non-admins who visit this URL are redirected to `/orders/upload`

**2. Extended `useFileUpload` hook**
- Accepts an optional `tenantId` parameter
- When provided, includes it in both the presign and confirm API request bodies
- No change to existing behavior when `tenantId` is not provided

**3. Extended upload API endpoints (backend)**
- Both `/api/orders/upload` and `/api/orders/upload/confirm` accept an optional `tenantId` body field
- Security check: if `tenantId` is present in the body, the caller's JWT `role` must be `platform_admin` — otherwise 403
- When a valid admin override is present, the provided `tenantId` is used instead of the JWT-derived one for all order/file creation

**4. No changes to the existing `/orders/upload` tenant page**
- Regular tenant users see no change whatsoever
- The hook's `tenantId` parameter defaults to undefined — existing behavior is fully preserved

### Data Flow

```
Admin opens /admin/upload
    → Page fetches active tenants from /api/admin/tenants
    → Admin picks tenant from dropdown
    → Admin adds files
    → Admin clicks "Hochladen"

useFileUpload (with tenantId)
    → POST /api/orders/upload  { filename, ..., tenantId }
        ↓ Backend: verifies role = platform_admin, uses tenantId
        ↓ Creates order record under target tenant
        ↓ Returns signed storage URL
    → PUT storage URL (direct upload, unchanged)
    → POST /api/orders/upload/confirm  { orderId, ..., tenantId }
        ↓ Backend: verifies role = platform_admin, uses tenantId
        ↓ Inserts order_files record under target tenant
        ↓ Triggers dealer recognition + AI extraction for target tenant
        ↓ Triggers email notification for target tenant's settings
```

### Tech Decisions

| Decision | Why |
|---|---|
| New `/admin/upload` page (not modifying `/orders/upload`) | Zero risk of accidentally showing tenant selector to regular users |
| Reuse `useFileUpload` hook with optional tenantId | No duplication of the 3-step upload logic |
| Backend security check on `platform_admin` role | Prevents any tenant user from spoofing a tenantId override via the API |
| Load tenants from existing `/api/admin/tenants` | No new endpoint needed |
| No DB migrations | `tenant_id` column already exists on all relevant tables |

### No new packages needed

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
