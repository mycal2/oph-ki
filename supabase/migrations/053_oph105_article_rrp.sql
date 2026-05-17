-- OPH-105: Article RRP (Recommended Retail Price) Field
-- Adds a nullable RRP column to the article_catalog table.
-- RRP is the Unverbindliche Preisempfehlung (UVP) — a single price per article,
-- the same for all customers — used for computing discounted prices (OPH-106..OPH-109).
--
-- Notes on the column:
--   * NUMERIC(12,4): 12 digits total, 4 decimal places — consistent with other price
--     fields in the schema and allows sub-cent precision for discount math.
--   * NULL = "not set" (distinct from 0.00 which means "explicit €0.00 price").
--   * No index — column is not used in WHERE/JOIN for this feature; lookups happen
--     by article_id during extraction (OPH-108).

ALTER TABLE public.article_catalog
  ADD COLUMN IF NOT EXISTS rrp NUMERIC(12,4) NULL;

COMMENT ON COLUMN public.article_catalog.rrp IS
  'OPH-105: Unverbindliche Preisempfehlung (UVP) in EUR. NULL = not set, 0 = explicit €0.00.';
