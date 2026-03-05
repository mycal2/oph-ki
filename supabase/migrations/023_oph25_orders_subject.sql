-- ============================================================================
-- OPH-25: E-Mail-Betreff als Extraktionsquelle
-- Migration: Add subject column to orders table.
-- Stores the email subject from forwarded emails or manual input.
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS subject TEXT;
