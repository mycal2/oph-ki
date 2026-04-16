-- OPH-59: Add slot column to support separate Auftragskopf/Positionen samples for split_csv.

-- 1. Add slot column with default
ALTER TABLE tenant_output_formats
  ADD COLUMN IF NOT EXISTS slot TEXT NOT NULL DEFAULT 'lines';

-- 2. Backfill (no-op since default handles it, but explicit for clarity)
UPDATE tenant_output_formats SET slot = 'lines' WHERE slot IS NULL;

-- 3. Add check constraint
ALTER TABLE tenant_output_formats
  ADD CONSTRAINT tenant_output_formats_slot_check CHECK (slot IN ('lines', 'header'));

-- 4. Drop old unique constraint (erp_config_id only) and create new one
ALTER TABLE tenant_output_formats
  DROP CONSTRAINT IF EXISTS tenant_output_formats_erp_config_id_key;
ALTER TABLE tenant_output_formats
  DROP CONSTRAINT IF EXISTS idx_output_formats_erp_config_unique;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_output_formats_erp_config_id_slot_key
  ON tenant_output_formats (erp_config_id, slot);
