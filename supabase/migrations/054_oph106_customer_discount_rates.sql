-- OPH-106: Customer Discount Rates Management
--
-- Introduces two tables backing the new "Rabatte" tab on the customer detail
-- page (gated by tenant.price_lookup_enabled / OPH-104).
--
--   customer_default_discounts   — one row per customer who has a default rate
--   customer_article_discounts   — one row per explicit (customer, article) override
--
-- The effective rate per (customer, article) is *computed* at view/extraction
-- time, never persisted, so a newly added article inherits the default without
-- any backfill. Cascading deletes keep referential integrity automatic.
--
-- All access is tenant-scoped via RLS using the JWT app_metadata claim, matching
-- the existing customer_catalog / article_catalog policies (migrations 028/029).

-- ---------------------------------------------------------------------------
-- 1. customer_default_discounts (one row per customer)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_default_discounts (
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id  UUID NOT NULL REFERENCES public.customer_catalog(id) ON DELETE CASCADE,
  discount_rate NUMERIC(5,2) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT customer_default_discounts_pkey PRIMARY KEY (tenant_id, customer_id),
  CONSTRAINT customer_default_discounts_rate_check
    CHECK (discount_rate >= 0 AND discount_rate <= 100)
);

COMMENT ON TABLE public.customer_default_discounts IS
  'OPH-106: Customer-level default discount rate (percent). Applies to all articles that have no explicit override in customer_article_discounts.';

CREATE INDEX IF NOT EXISTS idx_customer_default_discounts_tenant_customer
  ON public.customer_default_discounts(tenant_id, customer_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.customer_default_discounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.customer_default_discounts ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone in the tenant can read
CREATE POLICY "customer_default_discounts_select_own_tenant"
  ON public.customer_default_discounts FOR SELECT
  USING (
    tenant_id = (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'tenant_id'
    )::UUID
  );

-- INSERT: tenant_admin / platform_admin only
CREATE POLICY "customer_default_discounts_insert_own_tenant"
  ON public.customer_default_discounts FOR INSERT
  WITH CHECK (
    tenant_id = (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'tenant_id'
    )::UUID
    AND (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'role'
    ) IN ('tenant_admin', 'platform_admin')
  );

-- UPDATE: tenant_admin / platform_admin only
CREATE POLICY "customer_default_discounts_update_own_tenant"
  ON public.customer_default_discounts FOR UPDATE
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

-- DELETE: tenant_admin / platform_admin only
CREATE POLICY "customer_default_discounts_delete_own_tenant"
  ON public.customer_default_discounts FOR DELETE
  USING (
    tenant_id = (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'tenant_id'
    )::UUID
    AND (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'role'
    ) IN ('tenant_admin', 'platform_admin')
  );


-- ---------------------------------------------------------------------------
-- 2. customer_article_discounts (one row per explicit override)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_article_discounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id  UUID NOT NULL REFERENCES public.customer_catalog(id) ON DELETE CASCADE,
  article_id   UUID NOT NULL REFERENCES public.article_catalog(id) ON DELETE CASCADE,
  discount_rate NUMERIC(5,2) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT customer_article_discounts_unique
    UNIQUE (tenant_id, customer_id, article_id),
  CONSTRAINT customer_article_discounts_rate_check
    CHECK (discount_rate >= 0 AND discount_rate <= 100)
);

COMMENT ON TABLE public.customer_article_discounts IS
  'OPH-106: Explicit per-(customer, article) discount overrides. Takes precedence over customer_default_discounts during lookup.';

CREATE INDEX IF NOT EXISTS idx_customer_article_discounts_tenant_customer
  ON public.customer_article_discounts(tenant_id, customer_id);

-- Helps OPH-108 reverse-lookups (which customers override this article).
CREATE INDEX IF NOT EXISTS idx_customer_article_discounts_article
  ON public.customer_article_discounts(tenant_id, article_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.customer_article_discounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.customer_article_discounts ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone in the tenant can read
CREATE POLICY "customer_article_discounts_select_own_tenant"
  ON public.customer_article_discounts FOR SELECT
  USING (
    tenant_id = (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'tenant_id'
    )::UUID
  );

-- INSERT: tenant_admin / platform_admin only
CREATE POLICY "customer_article_discounts_insert_own_tenant"
  ON public.customer_article_discounts FOR INSERT
  WITH CHECK (
    tenant_id = (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'tenant_id'
    )::UUID
    AND (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'role'
    ) IN ('tenant_admin', 'platform_admin')
  );

-- UPDATE: tenant_admin / platform_admin only
CREATE POLICY "customer_article_discounts_update_own_tenant"
  ON public.customer_article_discounts FOR UPDATE
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

-- DELETE: tenant_admin / platform_admin only
CREATE POLICY "customer_article_discounts_delete_own_tenant"
  ON public.customer_article_discounts FOR DELETE
  USING (
    tenant_id = (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'tenant_id'
    )::UUID
    AND (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'role'
    ) IN ('tenant_admin', 'platform_admin')
  );
