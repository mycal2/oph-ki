-- ============================================================================
-- Migration: Add 'ai_content' recognition method
-- Feature: AI-based dealer recognition from document content
-- ============================================================================

-- Add 'ai_content' to the recognition_method CHECK constraint
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_recognition_method_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_recognition_method_check
  CHECK (recognition_method IN ('domain', 'address', 'subject', 'filename', 'manual', 'ai_content', 'none'));
