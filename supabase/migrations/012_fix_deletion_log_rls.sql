-- ============================================================================
-- OPH-12 fix: Restrict INSERT policy on data_deletion_log
-- ============================================================================
-- The original policy used WITH CHECK (true), allowing any authenticated user
-- to insert fake audit entries. Restrict to admin roles only.

DROP POLICY IF EXISTS "Service role can insert deletion logs" ON public.data_deletion_log;

CREATE POLICY "Admins can insert deletion logs"
  ON public.data_deletion_log FOR INSERT
  WITH CHECK (
    ((current_setting('request.jwt.claims', true)::jsonb) -> 'app_metadata' ->> 'role') IN ('tenant_admin', 'platform_admin')
  );
