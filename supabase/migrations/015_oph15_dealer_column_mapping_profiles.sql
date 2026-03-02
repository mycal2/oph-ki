-- ============================================================================
-- Migration: OPH-15 Dealer Column Mapping Profiles
-- Feature: Per-dealer, per-format-type column-to-field mapping rules
--          that enrich the AI extraction prompt with structural context.
-- ============================================================================

-- 1. Create the dealer_column_mapping_profiles table
CREATE TABLE public.dealer_column_mapping_profiles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id   UUID        NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  format_type TEXT        NOT NULL CHECK (format_type IN ('pdf_table', 'excel', 'email_text')),
  mappings    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: max one profile per (dealer_id, format_type)
CREATE UNIQUE INDEX idx_column_mapping_profiles_unique
  ON public.dealer_column_mapping_profiles (dealer_id, format_type);

-- Performance indexes
CREATE INDEX idx_column_mapping_profiles_dealer
  ON public.dealer_column_mapping_profiles (dealer_id);

-- 2. Enable Row Level Security
ALTER TABLE public.dealer_column_mapping_profiles ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies
-- SELECT: all authenticated users can read (mappings are global, needed during extraction)
CREATE POLICY "select_column_mapping_profiles"
  ON public.dealer_column_mapping_profiles
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: platform_admin only
CREATE POLICY "insert_column_mapping_profiles"
  ON public.dealer_column_mapping_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'platform_admin'
  );

-- UPDATE: platform_admin only
CREATE POLICY "update_column_mapping_profiles"
  ON public.dealer_column_mapping_profiles
  FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'platform_admin'
  );

-- DELETE: platform_admin only
CREATE POLICY "delete_column_mapping_profiles"
  ON public.dealer_column_mapping_profiles
  FOR DELETE TO authenticated
  USING (
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'platform_admin'
  );

-- 4. Updated_at trigger (reuse existing function from earlier migrations)
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.dealer_column_mapping_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
