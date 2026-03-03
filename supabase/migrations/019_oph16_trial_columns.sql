-- OPH-16: Add trial period columns to tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ;

-- OPH-16: Add preview token columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS preview_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS preview_token_expires_at TIMESTAMPTZ;

-- Index for public preview token lookup
CREATE INDEX IF NOT EXISTS idx_orders_preview_token ON public.orders (preview_token) WHERE preview_token IS NOT NULL;

-- Index for trial expiry cron job
CREATE INDEX IF NOT EXISTS idx_tenants_trial_expires ON public.tenants (trial_expires_at) WHERE status = 'trial';
