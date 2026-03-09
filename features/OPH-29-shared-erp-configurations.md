# OPH-29: Shared ERP Configurations (Decoupled from Tenants)

## Status: Planned
**Created:** 2026-03-09
**Last Updated:** 2026-03-09

## Summary
Refactor the ERP mapping system so that ERP configurations are standalone, reusable entities instead of being stored per-tenant. Admins define named ERP configurations globally (e.g. "Majesty XML", "SAP CSV Export"), and then assign one configuration to each tenant. Changes to a shared config immediately apply to all tenants using it. Configs can be duplicated to quickly create variants.

## Dependencies
- Requires: OPH-9 (Admin: ERP-Mapping-Konfiguration) — this feature replaces/refactors OPH-9

## User Stories

- As a platform admin, I want to create a named ERP configuration (e.g. "Majesty XML") so that I can reuse it across multiple tenants.
- As a platform admin, I want to assign an ERP configuration to a tenant so that their orders export in the correct format.
- As a platform admin, I want to edit an ERP configuration in one place and have all assigned tenants automatically use the updated settings.
- As a platform admin, I want to duplicate an existing ERP configuration so that I can create a similar variant with minor adjustments without starting from scratch.
- As a platform admin, I want to see which tenants are currently using a given ERP configuration so I understand the impact of editing it.
- As a platform admin, I want version history per ERP configuration so that I can roll back to a previous state if a change breaks something.
- As a platform admin, I want to delete an ERP configuration, but only if no tenants are currently assigned to it.

## Acceptance Criteria

### ERP Configuration Management Page (`/admin/erp-configs`)
- [ ] The page lists all named ERP configurations (not tenants), showing: name, format, number of assigned tenants, last updated date, version number.
- [ ] A "New Configuration" button opens a creation form/sheet.
- [ ] Each row has a "Edit" action that opens the configuration editor.
- [ ] Each row has a "Duplicate" action that creates a copy with the name prefixed by "Kopie von " and opens it for editing.
- [ ] Each row has a "Delete" action, disabled (greyed out with tooltip) if any tenant is currently assigned to the config.
- [ ] The page shows an empty state if no configurations exist yet.

### ERP Configuration Editor
- [ ] The editor has a required "Name" field (e.g. "Majesty XML Export") and an optional "Description" field.
- [ ] All existing mapping settings are present: format, column mappings, separator, encoding, line ending, decimal separator, XML template, fallback mode.
- [ ] A "Assigned Tenants" section shows a read-only list of tenant names currently using this config.
- [ ] The test dialog (test with JSON or existing order) still works, using any tenant assigned to the config as the order source (or allowing order ID input directly).
- [ ] Saving creates a new version. Version history tab shows all versions with rollback capability.
- [ ] The output format sample upload (OPH-28) is part of this editor, not per-tenant.

### Tenant Configuration — ERP Config Assignment
- [ ] The tenant form/sheet has a dropdown "ERP-Konfiguration" that lists all available named ERP configurations.
- [ ] The dropdown shows config name, format badge, and number of assigned tenants for each option.
- [ ] An option "Keine" (none) is available — tenant can have no ERP config assigned.
- [ ] The currently assigned config is pre-selected when editing an existing tenant.
- [ ] Saving the tenant form updates the assignment immediately.
- [ ] The tenant admin table shows the assigned ERP config name (or "–" if none) in a column.

### Shared Config Behaviour
- [ ] When an ERP configuration is edited and saved, all tenants assigned to it use the new version for all subsequent exports.
- [ ] Version history belongs to the ERP configuration, not to any individual tenant.

### Data Migration
- [ ] Existing per-tenant ERP configs are NOT automatically migrated. The system starts fresh.
- [ ] If a tenant has no ERP config assigned, export falls back to the current behaviour (no ERP export available / fallback mode).

## Edge Cases

- **Editing a config used by many tenants:** The editor clearly warns "Diese Konfiguration wird von X Mandanten verwendet. Änderungen betreffen alle." before saving.
- **Deleting a config with assigned tenants:** The delete button is disabled; hovering shows "Kann nicht gelöscht werden – X Mandanten zugewiesen."
- **Duplicating a config:** The duplicate gets a new unique name, is NOT automatically assigned to any tenant, and opens in the editor immediately.
- **Test dialog with no assigned tenants:** The "Bestellung wählen" tab is still available but the order dropdown is empty; a note explains that no tenants are assigned yet.
- **Tenant form with no configs defined yet:** The dropdown shows only "Keine" with a note "Noch keine ERP-Konfigurationen angelegt."
- **Circular impact visibility:** Saving a shared config shows a success toast mentioning how many tenants were affected (e.g. "Gespeichert – 3 Mandanten aktualisiert").

## Technical Requirements
- Security: Platform admin only (same as current OPH-9)
- The `erp_configs` table is restructured: keyed by its own UUID, no longer keyed by `tenant_id`
- The `tenants` table gets a nullable foreign key `erp_config_id → erp_configs.id`
- The existing `erp_config_versions` table is restructured to reference `erp_config_id` instead of `tenant_id`
- All existing ERP export routes must be updated to resolve config via tenant's `erp_config_id`

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Component Structure

```
/admin/erp-configs (page — redesigned)
+-- ErpConfigListTable (NEW — shows named configs, not tenants)
|   +-- Row: config name, format badge, # assigned tenants, last updated, version
|   +-- Actions: Edit | Duplicate | Delete (disabled if tenants assigned)
+-- "New Configuration" Button → opens ErpConfigEditor sheet

/admin/erp-configs/[configId] (page — URL param changes from tenantId to configId)
+-- ErpConfigEditor (refactored — same UI, different data source)
|   +-- Name + Description fields (NEW at top)
|   +-- Format / Column Mappings / Separator / etc. (unchanged)
|   +-- "Assigned Tenants" section (NEW, read-only list)
|   +-- OutputFormatTab (moved here from per-tenant, OPH-28)
|   +-- Version History Tab (unchanged, already config-keyed in DB)
+-- Impact warning banner: "Wird von X Mandanten verwendet"

/admin/tenants (unchanged page)
+-- TenantFormSheet (updated)
    +-- ERP-Konfiguration dropdown (NEW)
        +-- Option: "Keine"
        +-- Option per config: name + format badge + # tenants assigned
```

### Data Model Changes

**`erp_configs` table — refactored:**
- REMOVE: `tenant_id` column + its unique constraint
- REMOVE: `is_default` column (meaningless without tenant link)
- ADD: `name` (text, required, unique) — e.g. "Majesty XML Export"
- ADD: `description` (text, optional)
- KEEP: all other columns unchanged (format, column_mappings, separator, quote_char, encoding, xml_template, line_ending, decimal_separator, fallback_mode, timestamps)

**`tenants` table — one new column:**
- ADD: `erp_config_id` (nullable FK → erp_configs.id, ON DELETE SET NULL)

**`erp_config_versions` table — no change:**
Already references `erp_config_id`, not `tenant_id`. Version history works automatically for shared configs.

**`tenant_output_formats` table — minor addition:**
- ADD: `erp_config_id` (nullable FK → erp_configs.id) for OPH-28 output formats to attach to configs
- KEEP: `tenant_id` column for backward compatibility with existing rows

### API Routes

| Current | New | Change |
|---|---|---|
| `GET /api/admin/erp-configs` | Same URL | Returns named configs (not tenants) |
| — | `POST /api/admin/erp-configs` | NEW: Create a config |
| `GET/PUT /api/admin/erp-configs/[tenantId]` | `GET/PUT /api/admin/erp-configs/[configId]` | Config-keyed, not tenant-keyed |
| — | `DELETE /api/admin/erp-configs/[configId]` | NEW: Delete if no tenants assigned |
| — | `POST /api/admin/erp-configs/[configId]/duplicate` | NEW: Duplicate |
| `.../[tenantId]/copy-from/[srcId]` | (removed) | Replaced by duplicate |
| `.../[tenantId]/rollback/[vId]` | `.../[configId]/rollback/[vId]` | Config-keyed |
| `.../[tenantId]/test` | `.../[configId]/test` | Config-keyed |
| `.../[tenantId]/orders` | `.../[configId]/orders` | Fetches across all assigned tenants |
| `GET/POST/DELETE /api/admin/output-formats/[tenantId]` | `.../output-formats/config/[configId]` | Config-keyed for OPH-29 |

**Internal-only changes (URL unchanged):**
- `GET /api/orders/[orderId]/export` — ERP config lookup changes from `WHERE tenant_id = X` to joining through `tenants.erp_config_id`
- `GET /api/orders/[orderId]/export/preview` — same
- `POST /api/orders/[orderId]/extract` — same (confidence scoring)
- `PUT /api/admin/tenants/[id]` — accepts new `erp_config_id` field in payload

### Key Technical Decisions

- **`ON DELETE SET NULL`** on `tenants.erp_config_id`: if a config is deleted, tenants safely lose their assignment rather than breaking
- **No junction table**: one tenant → one config (simple FK, not many-to-many)
- **Version history already config-keyed**: `erp_config_versions` requires no schema changes
- **No new packages**: pure refactor using existing Supabase, Zod, React, shadcn/ui

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
