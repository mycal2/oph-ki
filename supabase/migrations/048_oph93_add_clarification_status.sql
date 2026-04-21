-- OPH-93: Add 'clarification' (Klaerung) to orders.status CHECK constraint
-- New workflow branch: extracted/review/checked -> clarification -> extracted (or checked)
-- The 'clarification' state indicates an order is blocked pending clarification.
-- Also adds a nullable clarification_note column (max 500 chars) for the reason text.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY['uploaded'::text, 'processing'::text, 'extracted'::text, 'review'::text, 'checked'::text, 'clarification'::text, 'approved'::text, 'exported'::text, 'error'::text]));

-- Clarification note: free-text reason for why the order needs clarification.
-- Cleared when clarification is resolved.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS clarification_note text;
ALTER TABLE public.orders ADD CONSTRAINT orders_clarification_note_length CHECK (clarification_note IS NULL OR length(clarification_note) <= 500);
