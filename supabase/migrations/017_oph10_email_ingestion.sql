-- ============================================================================
-- OPH-10: E-Mail-Weiterleitungs-Ingestion
-- Migration: Add inbound email columns to tenants/orders,
--            create email_quarantine table with RLS.
-- ============================================================================


-- ============================================================================
-- 1. TENANTS: Add inbound email address column
-- Auto-generated as {slug}@inbound.{domain} when tenant is created.
-- ============================================================================
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS inbound_email_address TEXT;

-- Unique constraint — each tenant gets a distinct inbound address
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_inbound_email_address_unique UNIQUE (inbound_email_address);


-- ============================================================================
-- 2. ORDERS: Add email-specific columns
-- ============================================================================

-- Source distinguishes how the order was created
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'web_upload'
    CHECK (source IN ('web_upload', 'email_inbound'));

-- Message-ID header for duplicate detection (globally unique per email)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS message_id TEXT;

-- The forwarding employee's email address
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS sender_email TEXT;

-- Index for fast duplicate lookups by Message-ID within a tenant
CREATE INDEX IF NOT EXISTS idx_orders_message_id
  ON public.orders(tenant_id, message_id)
  WHERE message_id IS NOT NULL;


-- ============================================================================
-- 3. EMAIL_QUARANTINE TABLE
-- Stores emails from unauthorized senders for admin review.
-- ============================================================================
CREATE TABLE public.email_quarantine (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sender_email    TEXT        NOT NULL,
  sender_name     TEXT,
  subject         TEXT,
  message_id      TEXT,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  storage_path    TEXT,
  review_status   TEXT        NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected')),
  reviewed_by     UUID        REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  order_id        UUID        REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_quarantine_tenant_id      ON public.email_quarantine(tenant_id);
CREATE INDEX idx_email_quarantine_review_status   ON public.email_quarantine(review_status);
CREATE INDEX idx_email_quarantine_message_id      ON public.email_quarantine(tenant_id, message_id)
  WHERE message_id IS NOT NULL;

ALTER TABLE public.email_quarantine ENABLE ROW LEVEL SECURITY;

-- Platform admins can view all quarantined emails
CREATE POLICY "Platform admins can view all quarantine entries"
  ON public.email_quarantine FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

-- Platform admins can update quarantine entries (approve/reject)
CREATE POLICY "Platform admins can update quarantine entries"
  ON public.email_quarantine FOR UPDATE
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

-- Insert via service role only (webhook handler uses admin client)
