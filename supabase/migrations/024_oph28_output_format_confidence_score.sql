-- ============================================================================
-- OPH-28: Output Format Sample Upload & Confidence Score
--
-- Creates the tenant_output_formats table for storing parsed sample formats
-- and adds confidence score columns to the orders table.
-- ============================================================================

-- 1. Create tenant_output_formats table
CREATE TABLE IF NOT EXISTS public.tenant_output_formats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('csv', 'xlsx', 'xml', 'json')),
  detected_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
  column_count INTEGER NOT NULL DEFAULT 0,
  required_column_count INTEGER NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT unique_tenant_output_format UNIQUE (tenant_id)
);

-- Index for fast lookup by tenant
CREATE INDEX IF NOT EXISTS idx_tenant_output_formats_tenant_id
  ON public.tenant_output_formats(tenant_id);

-- 2. Enable RLS
ALTER TABLE public.tenant_output_formats ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies — platform admins only for all operations
CREATE POLICY "platform_admins_select_output_formats"
  ON public.tenant_output_formats FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
        AND (u.raw_app_meta_data->>'role') = 'platform_admin'
    )
  );

CREATE POLICY "platform_admins_insert_output_formats"
  ON public.tenant_output_formats FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
        AND (u.raw_app_meta_data->>'role') = 'platform_admin'
    )
  );

CREATE POLICY "platform_admins_update_output_formats"
  ON public.tenant_output_formats FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
        AND (u.raw_app_meta_data->>'role') = 'platform_admin'
    )
  );

CREATE POLICY "platform_admins_delete_output_formats"
  ON public.tenant_output_formats FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
        AND (u.raw_app_meta_data->>'role') = 'platform_admin'
    )
  );

-- 4. Add confidence score columns to orders table
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS output_format_confidence_score INTEGER,
  ADD COLUMN IF NOT EXISTS output_format_missing_columns JSONB;

-- Add check constraint for score range
ALTER TABLE public.orders
  ADD CONSTRAINT chk_confidence_score_range
  CHECK (output_format_confidence_score IS NULL OR (output_format_confidence_score >= 0 AND output_format_confidence_score <= 100));

-- 5. Create Supabase Storage bucket for output format samples (if not exists)
-- Note: Storage bucket creation is done via the Supabase dashboard or CLI,
-- not via SQL migrations. The bucket name is: tenant-output-formats
-- Access: Only platform admins via API routes (no direct Storage RLS needed).
