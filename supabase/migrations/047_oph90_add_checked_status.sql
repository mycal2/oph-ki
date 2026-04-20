-- OPH-90: Add 'checked' (Geprüft) to orders.status CHECK constraint
-- New workflow: extracted -> checked -> approved -> exported
-- The 'checked' state indicates a reviewer has verified the data but has not yet released it for export.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY['uploaded'::text, 'processing'::text, 'extracted'::text, 'review'::text, 'checked'::text, 'approved'::text, 'exported'::text, 'error'::text]));
