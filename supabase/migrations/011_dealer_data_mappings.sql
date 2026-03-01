-- ============================================================================
-- Migration: OPH-14 Dealer Data Mappings
-- Feature: Article number, unit conversion, and field label mappings
-- ============================================================================

CREATE TABLE public.dealer_data_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  mapping_type TEXT NOT NULL CHECK (mapping_type IN ('article_number', 'unit_conversion', 'field_label')),
  dealer_value TEXT NOT NULL,
  erp_value TEXT NOT NULL,
  conversion_factor DECIMAL(10,4),
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one mapping per dealer/tenant/type/value (case-insensitive)
-- Uses COALESCE to treat NULL tenant_id (global) as a distinct group
CREATE UNIQUE INDEX idx_dealer_mappings_unique
  ON public.dealer_data_mappings (dealer_id, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), mapping_type, lower(trim(dealer_value)))
  WHERE active = TRUE;

-- Performance indexes
CREATE INDEX idx_dealer_mappings_dealer ON public.dealer_data_mappings (dealer_id) WHERE active = TRUE;
CREATE INDEX idx_dealer_mappings_tenant ON public.dealer_data_mappings (tenant_id) WHERE active = TRUE;

-- RLS
ALTER TABLE public.dealer_data_mappings ENABLE ROW LEVEL SECURITY;

-- SELECT: all authenticated users can read
CREATE POLICY "select_mappings" ON public.dealer_data_mappings
  FOR SELECT TO authenticated USING (true);

-- INSERT: platform_admin (global) or tenant_admin (own tenant)
CREATE POLICY "insert_mappings" ON public.dealer_data_mappings
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'platform_admin'
    OR (
      (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'tenant_admin'
      AND tenant_id = (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid())
    )
  );

-- UPDATE: platform_admin or tenant_admin for own entries
CREATE POLICY "update_mappings" ON public.dealer_data_mappings
  FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'platform_admin'
    OR (
      (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'tenant_admin'
      AND tenant_id = (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid())
    )
  );

-- DELETE: platform_admin or tenant_admin for own entries
CREATE POLICY "delete_mappings" ON public.dealer_data_mappings
  FOR DELETE TO authenticated
  USING (
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'platform_admin'
    OR (
      (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'tenant_admin'
      AND tenant_id = (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid())
    )
  );

-- Updated_at trigger (reuse existing function)
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.dealer_data_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add has_unmapped_articles flag to orders table
ALTER TABLE public.orders ADD COLUMN has_unmapped_articles BOOLEAN NOT NULL DEFAULT FALSE;
