-- OPH-100: User-Level Language Override
-- Adds a nullable preferred_locale column to the user_profiles table.
-- When set, the value overrides the tenant-level preferred_locale (OPH-99)
-- for this individual user only.
-- NULL = use the tenant default (which itself falls back to "de").

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS preferred_locale text NULL;

-- Restrict to the supported locale set so invalid values can never be persisted.
-- Idempotent so the migration can be safely re-applied (e.g. `supabase db reset`).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_profiles_preferred_locale_check'
      AND conrelid = 'public.user_profiles'::regclass
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_preferred_locale_check CHECK (
        preferred_locale IS NULL OR preferred_locale IN ('de', 'en')
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.user_profiles.preferred_locale IS
  'OPH-100: User-level UI language override. NULL = follow tenant default (OPH-99). Allowed values: de, en.';

-- No new index needed: the column is read by primary-key lookup on user_profiles
-- (single-row read for the authenticated user) on every authenticated page request.
-- The existing PK index covers this access pattern.

-- RLS: existing policies on user_profiles already allow each user to SELECT
-- and UPDATE their own row (`Users can update own profile` policy). The new
-- column inherits these policies — no new policies required.
