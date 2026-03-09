-- ============================================================================
-- OPH-30: Add xml_structure column to tenant_output_formats
--
-- Stores the parsed XML tree structure for template generation.
-- Only populated for XML sample files, NULL for CSV/XLSX/JSON.
-- ============================================================================

ALTER TABLE public.tenant_output_formats
  ADD COLUMN IF NOT EXISTS xml_structure JSONB DEFAULT NULL;
