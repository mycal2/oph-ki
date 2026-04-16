-- OPH-61: Configurable Output Filenames for Split CSV Export
--
-- Adds 4 new columns to erp_configs:
--   1. split_output_mode: "zip" (default) or "separate"
--   2. header_filename_template: template for Auftragskopf filename
--   3. lines_filename_template: template for Positionen filename
--   4. zip_filename_template: template for ZIP archive filename

SET search_path = public;

ALTER TABLE public.erp_configs
  ADD COLUMN IF NOT EXISTS split_output_mode text NULL DEFAULT 'zip'
    CHECK (split_output_mode IS NULL OR split_output_mode IN ('zip', 'separate'));

ALTER TABLE public.erp_configs
  ADD COLUMN IF NOT EXISTS header_filename_template text NULL;

ALTER TABLE public.erp_configs
  ADD COLUMN IF NOT EXISTS lines_filename_template text NULL;

ALTER TABLE public.erp_configs
  ADD COLUMN IF NOT EXISTS zip_filename_template text NULL;

COMMENT ON COLUMN public.erp_configs.split_output_mode IS 'OPH-61: Output delivery mode for split_csv — "zip" (single ZIP download) or "separate" (two CSV downloads).';
COMMENT ON COLUMN public.erp_configs.header_filename_template IS 'OPH-61: Filename template for the Auftragskopf CSV. Supports {order_number}, {timestamp}, {customer_number}, {order_date}.';
COMMENT ON COLUMN public.erp_configs.lines_filename_template IS 'OPH-61: Filename template for the Positionen CSV. Same variable support as header.';
COMMENT ON COLUMN public.erp_configs.zip_filename_template IS 'OPH-61: Filename template for the ZIP archive. Same variable support as header.';
