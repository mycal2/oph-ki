-- OPH-73: Salesforce App — Sales Rep Role & Tenant Feature Flag
--
-- Adds:
--   1. salesforce_enabled + salesforce_slug columns to tenants
--   2. sales_rep as a recognized user role (stored in app_metadata, not a DB enum)

-- 1. Add Salesforce configuration columns to tenants
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS salesforce_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS salesforce_slug text;

-- Unique constraint on salesforce_slug (only non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS tenants_salesforce_slug_unique
  ON tenants (salesforce_slug) WHERE salesforce_slug IS NOT NULL;

-- Index for fast slug lookups (middleware resolves subdomain → tenant)
CREATE INDEX IF NOT EXISTS idx_tenants_salesforce_slug
  ON tenants (salesforce_slug) WHERE salesforce_slug IS NOT NULL;

COMMENT ON COLUMN tenants.salesforce_enabled IS 'OPH-73: Whether the Salesforce App is enabled for this tenant.';
COMMENT ON COLUMN tenants.salesforce_slug IS 'OPH-73: Unique subdomain slug for the Salesforce App (e.g. "meisinger" → meisinger.ids.online).';
