-- ============================================================================
-- OPH-7: Admin Händler-Regelwerk-Verwaltung
-- Migration: Add description to dealers, extend format_type, create audit log
-- ============================================================================

-- 1. Add description column to dealers
ALTER TABLE public.dealers
  ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Extend format_type CHECK constraint to include 'mixed'
ALTER TABLE public.dealers DROP CONSTRAINT IF EXISTS dealers_format_type_check;
ALTER TABLE public.dealers ADD CONSTRAINT dealers_format_type_check
  CHECK (format_type IN ('email_text', 'pdf_table', 'excel', 'mixed'));

-- 3. Create dealer_audit_log table
CREATE TABLE public.dealer_audit_log (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id   UUID        NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  changed_by  UUID        NOT NULL,
  admin_email TEXT        NOT NULL,
  action      TEXT        NOT NULL
    CHECK (action IN ('created', 'updated', 'deactivated', 'reactivated')),
  changed_fields JSONB,
  snapshot_before JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dealer_audit_log_dealer_id ON public.dealer_audit_log(dealer_id);
CREATE INDEX idx_dealer_audit_log_created_at ON public.dealer_audit_log(created_at DESC);

-- 4. RLS for dealer_audit_log
ALTER TABLE public.dealer_audit_log ENABLE ROW LEVEL SECURITY;

-- Platform admins can read audit logs
CREATE POLICY "Platform admins can read dealer audit logs"
  ON public.dealer_audit_log FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

-- Insert via service role only (API-level writes using admin client)
-- No INSERT policy for authenticated users — admin client bypasses RLS
