-- OPH-104: Tenant Price Lookup Feature Flag
-- Adds a price_lookup_enabled boolean column to the tenants table.
-- When true, the tenant gains access to discount-rate UI (OPH-106) and the
-- extraction pipeline performs the price-lookup step (OPH-108).
-- Defaults to FALSE so existing tenants are explicitly opted-in by a platform admin.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS price_lookup_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenants.price_lookup_enabled IS
  'OPH-104: When true, this tenant has the paid Price Lookup add-on (discount rates UI + extraction price lookup). Default false; platform admins opt tenants in explicitly.';
