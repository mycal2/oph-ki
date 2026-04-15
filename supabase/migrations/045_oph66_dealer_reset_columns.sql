-- OPH-66: Add dealer reset audit columns to orders table
-- These columns track who reset the dealer assignment and when.
-- They are cleared (set back to NULL) when a new dealer is assigned.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS dealer_reset_by UUID REFERENCES user_profiles(id),
  ADD COLUMN IF NOT EXISTS dealer_reset_at TIMESTAMPTZ;

-- No index needed: these columns are not queried in WHERE/ORDER BY/JOIN clauses.
-- No RLS changes: the API route uses the admin client and enforces authorization in application code.
