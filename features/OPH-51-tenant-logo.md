# OPH-51: Tenant Company Logo

## Status: Planned
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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
