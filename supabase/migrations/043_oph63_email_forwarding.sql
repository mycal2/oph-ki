-- OPH-63: Per-Tenant Email Forwarding
-- Adds two new columns to the tenants table for email forwarding configuration.
-- All existing tenants default to forwarding disabled (no data migration needed).

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS email_forwarding_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_forwarding_address text DEFAULT NULL;

-- No index needed: these columns are only read per-tenant (single-row lookup by id/slug),
-- never used in WHERE filters across multiple tenants.
