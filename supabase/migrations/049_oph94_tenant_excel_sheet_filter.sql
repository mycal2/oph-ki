-- OPH-94: Tenant Excel Sheet Filter
-- Adds an optional excel_sheet_name column to the tenants table.
-- When set, only the matching sheet is extracted from Excel order files.

ALTER TABLE public.tenants
  ADD COLUMN excel_sheet_name text NULL;

-- Enforce max length via CHECK constraint
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_excel_sheet_name_length CHECK (
    excel_sheet_name IS NULL OR length(excel_sheet_name) <= 100
  );

COMMENT ON COLUMN public.tenants.excel_sheet_name IS
  'OPH-94: Name of the Excel sheet to extract. NULL = use all sheets.';
