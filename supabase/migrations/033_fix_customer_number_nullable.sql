-- Fix: Make customer_number nullable so auto-created dealer entries don't need placeholder values.
-- Replace the strict unique constraint with a partial index that only applies to non-empty values.

ALTER TABLE customer_catalog DROP CONSTRAINT IF EXISTS customer_catalog_tenant_customer_unique;
ALTER TABLE customer_catalog ALTER COLUMN customer_number DROP NOT NULL;

-- Partial unique index: only enforce uniqueness when customer_number is actually set
CREATE UNIQUE INDEX IF NOT EXISTS customer_catalog_tenant_customer_unique
ON customer_catalog (tenant_id, customer_number)
WHERE customer_number IS NOT NULL AND customer_number != '';

-- Clear existing H- placeholder values
UPDATE customer_catalog SET customer_number = NULL WHERE customer_number LIKE 'H-%' AND dealer_id IS NOT NULL;
