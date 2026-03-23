-- OPH-46: Manufacturer Customer Catalog
-- Each tenant maintains a catalog of their customers (Kundenstamm).

-- 1. Create the customer_catalog table
CREATE TABLE IF NOT EXISTS public.customer_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_number TEXT NOT NULL,
  company_name TEXT NOT NULL,
  street TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT,
  email TEXT,
  phone TEXT,
  keywords TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Unique constraint: customer_number is unique per tenant
  CONSTRAINT customer_catalog_tenant_customer_unique UNIQUE (tenant_id, customer_number)
);

-- 2. Index on tenant_id for fast catalog lookups (used by OPH-47 matching)
CREATE INDEX IF NOT EXISTS idx_customer_catalog_tenant_id ON public.customer_catalog(tenant_id);

-- 3. Trigger for updated_at using existing set_updated_at() function
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.customer_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Enable Row Level Security
ALTER TABLE public.customer_catalog ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies: tenant users can only access their own rows

-- SELECT: Users can read customers belonging to their tenant
CREATE POLICY "customer_catalog_select_own_tenant"
  ON public.customer_catalog FOR SELECT
  USING (
    tenant_id = (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'tenant_id'
    )::UUID
  );

-- INSERT: Tenant admins can insert customers for their own tenant
CREATE POLICY "customer_catalog_insert_own_tenant"
  ON public.customer_catalog FOR INSERT
  WITH CHECK (
    tenant_id = (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'tenant_id'
    )::UUID
    AND (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'role'
    ) IN ('tenant_admin', 'platform_admin')
  );

-- UPDATE: Tenant admins can update customers belonging to their tenant
CREATE POLICY "customer_catalog_update_own_tenant"
  ON public.customer_catalog FOR UPDATE
  USING (
    tenant_id = (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'tenant_id'
    )::UUID
    AND (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'role'
    ) IN ('tenant_admin', 'platform_admin')
  )
  WITH CHECK (
    tenant_id = (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'tenant_id'
    )::UUID
  );

-- DELETE: Tenant admins can delete customers belonging to their tenant
CREATE POLICY "customer_catalog_delete_own_tenant"
  ON public.customer_catalog FOR DELETE
  USING (
    tenant_id = (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'tenant_id'
    )::UUID
    AND (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'role'
    ) IN ('tenant_admin', 'platform_admin')
  );
