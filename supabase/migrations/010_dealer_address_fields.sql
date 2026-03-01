-- ============================================================================
-- Migration: Add address fields to dealers table
-- Feature: Full dealer address for display and AI matching
-- ============================================================================

-- Add address columns to dealers table
ALTER TABLE public.dealers
  ADD COLUMN street       TEXT,
  ADD COLUMN postal_code  TEXT,
  ADD COLUMN city         TEXT,
  ADD COLUMN country      TEXT;

-- Create index for address-based matching
CREATE INDEX idx_dealers_country_city ON public.dealers (country, city) WHERE active = TRUE;

-- Seed addresses for existing dealers
UPDATE public.dealers SET street = 'Monzastrasse 2a', postal_code = '63225', city = 'Langen', country = 'DE'
WHERE name = 'Henry Schein GmbH';

UPDATE public.dealers SET street = 'Chemin des Cibleries 2', postal_code = '1896', city = 'Vouvry', country = 'CH'
WHERE name = 'Condor Dental';
