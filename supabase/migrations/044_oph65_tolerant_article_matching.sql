-- OPH-65: Tolerant Article Number Matching
-- Adds per-dealer toggle for stripping leading zeros during article number matching.

-- Add boolean flag to dealer profile (default false — opt-in per dealer)
ALTER TABLE dealers
  ADD COLUMN IF NOT EXISTS strip_leading_zeros_in_article_numbers BOOLEAN NOT NULL DEFAULT FALSE;

-- Comment for documentation
COMMENT ON COLUMN dealers.strip_leading_zeros_in_article_numbers IS
  'OPH-65: When true, leading zeros in digit runs are ignored during article number matching (e.g. "016" matches "16"). Default false.';
