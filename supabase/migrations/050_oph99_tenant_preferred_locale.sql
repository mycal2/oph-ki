-- OPH-99: Tenant-Level Language Preference
-- Adds a nullable preferred_locale column to the tenants table.
-- When set, the value becomes the default UI language for any tenant user
-- that has not configured a personal preference (OPH-100).
-- NULL = not configured, falls back to the system default ("de").

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS preferred_locale text NULL;

-- Restrict to the supported locale set so invalid values can never be persisted.
-- Idempotent so the migration can be safely re-applied (e.g. `supabase db reset`).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_preferred_locale_check'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_preferred_locale_check CHECK (
        preferred_locale IS NULL OR preferred_locale IN ('de', 'en')
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.tenants.preferred_locale IS
  'OPH-99: Tenant-level UI language preference. NULL = not set (falls back to system default "de"). Allowed values: de, en.';

-- No index needed: this column is read on every authenticated request as part
-- of the existing tenant lookup by primary key (single-row read), never used
-- as a filter across rows.
