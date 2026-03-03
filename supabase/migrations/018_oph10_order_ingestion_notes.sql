-- OPH-10 bugfix: Add ingestion_notes column for attachment warnings
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ingestion_notes JSONB;

COMMENT ON COLUMN public.orders.ingestion_notes IS 'Warnings from email ingestion (skipped attachments, etc.)';
