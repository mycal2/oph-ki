-- OPH-32: Visual Field Mapper for ERP Output Format
-- Adds field_mappings JSONB column to tenant_output_formats table.
-- This stores the user-defined mappings from output format fields to order data variables.

ALTER TABLE tenant_output_formats
  ADD COLUMN field_mappings JSONB DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN tenant_output_formats.field_mappings IS 'OPH-32: Array of field mapping objects mapping target output fields to canonical order data paths.';
