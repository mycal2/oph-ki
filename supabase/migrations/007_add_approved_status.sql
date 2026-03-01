-- Fix BUG-001 (OPH-6 QA): Add 'approved' to orders.status CHECK constraint
-- The original migration (002) only allowed: uploaded, processing, extracted, review, exported, error
-- OPH-5 added the "approved" status in TypeScript but the DB constraint was never updated.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY['uploaded'::text, 'processing'::text, 'extracted'::text, 'review'::text, 'approved'::text, 'exported'::text, 'error'::text]));
