-- OPH-4: AI Extraction — Add extraction columns to orders table
-- These columns track the status and result of Claude API extraction.

-- Add extraction columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS extraction_status TEXT DEFAULT NULL
    CHECK (extraction_status IN ('pending', 'processing', 'extracted', 'failed')),
  ADD COLUMN IF NOT EXISTS extracted_data JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS extraction_attempts INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS extraction_error TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.orders.extraction_status IS 'AI extraction status: pending, processing, extracted, failed';
COMMENT ON COLUMN public.orders.extracted_data IS 'Canonical JSON order data extracted by Claude API';
COMMENT ON COLUMN public.orders.extraction_attempts IS 'Number of extraction attempts (max 3)';
COMMENT ON COLUMN public.orders.extraction_error IS 'Last extraction error message if status = failed';

-- Index on extraction_status for polling queries
CREATE INDEX IF NOT EXISTS idx_orders_extraction_status
  ON public.orders (extraction_status)
  WHERE extraction_status IS NOT NULL;
