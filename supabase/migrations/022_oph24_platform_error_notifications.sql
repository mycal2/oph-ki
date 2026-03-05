-- ============================================================================
-- OPH-24: Platform Error Notification Emails
-- Migration: Create platform_settings singleton table with RLS
-- ============================================================================

-- 1. Create platform_settings table (singleton — one row only)
CREATE TABLE public.platform_settings (
  id TEXT PRIMARY KEY DEFAULT 'singleton'
    CHECK (id = 'singleton'),
  error_notification_emails TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- 2. Seed with default notification email
INSERT INTO public.platform_settings (id, error_notification_emails)
VALUES ('singleton', ARRAY['michael.mollath@ids.online']);

-- 3. Enable RLS
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies: only platform_admin can read and write
CREATE POLICY "platform_settings_select_admin"
  ON public.platform_settings FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

CREATE POLICY "platform_settings_update_admin"
  ON public.platform_settings FOR UPDATE
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

-- Note: No INSERT or DELETE policies — the singleton row is seeded by the migration.
-- Service role (admin client) bypasses RLS for internal reads (e.g. sendPlatformErrorNotification).
