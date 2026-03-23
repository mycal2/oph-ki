-- OPH-39: Manufacturer Article Catalog
-- Each tenant maintains a catalog of their own articles (Artikelstamm).

-- 1. Create the article_catalog table
CREATE TABLE IF NOT EXISTS public.article_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  article_number TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  color TEXT,
  packaging TEXT,
  ref_no TEXT,
  gtin TEXT,
  keywords TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Unique constraint: article_number is unique per tenant
  CONSTRAINT article_catalog_tenant_article_unique UNIQUE (tenant_id, article_number)
);

-- 2. Index on tenant_id for fast catalog lookups
CREATE INDEX IF NOT EXISTS idx_article_catalog_tenant_id ON public.article_catalog(tenant_id);

-- 3. Trigger for updated_at using existing set_updated_at() function
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.article_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Enable Row Level Security
ALTER TABLE public.article_catalog ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies: tenant users can only access their own rows

-- SELECT: Users can read articles belonging to their tenant
CREATE POLICY "article_catalog_select_own_tenant"
  ON public.article_catalog FOR SELECT
  USING (
    tenant_id = (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'tenant_id'
    )::UUID
  );

-- INSERT: Tenant admins can insert articles for their own tenant
CREATE POLICY "article_catalog_insert_own_tenant"
  ON public.article_catalog FOR INSERT
  WITH CHECK (
    tenant_id = (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'tenant_id'
    )::UUID
    AND (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'role'
    ) IN ('tenant_admin', 'platform_admin')
  );

-- UPDATE: Tenant admins can update articles belonging to their tenant
CREATE POLICY "article_catalog_update_own_tenant"
  ON public.article_catalog FOR UPDATE
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

-- DELETE: Tenant admins can delete articles belonging to their tenant
CREATE POLICY "article_catalog_delete_own_tenant"
  ON public.article_catalog FOR DELETE
  USING (
    tenant_id = (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'tenant_id'
    )::UUID
    AND (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'role'
    ) IN ('tenant_admin', 'platform_admin')
  );
