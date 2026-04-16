-- OPH-58: Split Multi-File ERP Export (Header + Lines CSV)
-- Adds support for "split_csv" format: two CSV files (Auftragskopf + Positionen) in a ZIP.
-- Changes:
--   1. Extend format CHECK to include 'split_csv'
--   2. Add header_column_mappings JSONB column for header-file column definitions
--   3. Add empty_value_placeholder TEXT column (default '' for existing, '@' for split_csv)

-- 1. Extend format CHECK constraint
ALTER TABLE public.erp_configs
  DROP CONSTRAINT IF EXISTS erp_configs_format_check;
ALTER TABLE public.erp_configs
  ADD CONSTRAINT erp_configs_format_check CHECK (format IN ('csv', 'xml', 'json', 'split_csv'));

-- 2. Add header column mappings (only used when format = 'split_csv')
ALTER TABLE public.erp_configs
  ADD COLUMN IF NOT EXISTS header_column_mappings jsonb DEFAULT NULL;

-- 3. Add empty value placeholder (default '' keeps existing configs unchanged)
ALTER TABLE public.erp_configs
  ADD COLUMN IF NOT EXISTS empty_value_placeholder text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.erp_configs.header_column_mappings IS 'OPH-58: Column mappings for the Auftragskopf (header) CSV in split_csv format. Same structure as column_mappings.';
COMMENT ON COLUMN public.erp_configs.empty_value_placeholder IS 'OPH-58: Value used for unmapped columns in export output. Default empty string, typically "@" for split_csv.';
