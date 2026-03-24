-- OPH-49: Dealer-Linked Kundenstamm
-- Adds dealer_id (link to global dealer profile) and notes field to customer_catalog.

-- Add new columns
ALTER TABLE customer_catalog
  ADD COLUMN dealer_id UUID REFERENCES dealers(id) ON DELETE SET NULL,
  ADD COLUMN notes TEXT;

-- Partial unique constraint: one entry per tenant per dealer (only for linked entries)
CREATE UNIQUE INDEX uq_customer_catalog_tenant_dealer
  ON customer_catalog (tenant_id, dealer_id)
  WHERE dealer_id IS NOT NULL;

-- Index for join performance
CREATE INDEX idx_customer_catalog_dealer_id
  ON customer_catalog (dealer_id)
  WHERE dealer_id IS NOT NULL;
