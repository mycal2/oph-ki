-- OPH-52: Tenant Billing Model Configuration
-- Adds billing model and pricing columns to the tenants table.
-- All columns are nullable: NULL = not configured (distinct from 0.00).

ALTER TABLE tenants
  ADD COLUMN billing_model text
    CHECK (billing_model IN ('pay-per-use', 'license-based', 'flat-rate')),
  ADD COLUMN setup_fee numeric(10,2),
  ADD COLUMN monthly_fee numeric(10,2),
  ADD COLUMN cost_per_order numeric(10,2);

-- No new RLS policy needed: existing admin-only policy on tenants already
-- restricts all access to platform admins.

-- Index on billing_model for OPH-53/54 KPI dashboard and billing report queries.
CREATE INDEX idx_tenants_billing_model ON tenants(billing_model)
  WHERE billing_model IS NOT NULL;
