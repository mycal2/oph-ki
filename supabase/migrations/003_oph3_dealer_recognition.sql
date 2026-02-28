-- ============================================================================
-- OPH-3: Händler-Erkennung & Händler-Profile
-- Migration: Create global dealers table, extend orders with dealer recognition
--            columns, add RLS policies and indexes.
-- ============================================================================


-- ============================================================================
-- 1. DEALERS TABLE (global — shared across all tenants)
-- Dealer profiles contain recognition rules that apply to all manufacturers.
-- ============================================================================
CREATE TABLE public.dealers (
  id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                    TEXT        NOT NULL,
  known_domains           TEXT[]      NOT NULL DEFAULT '{}',
  known_sender_addresses  TEXT[]      NOT NULL DEFAULT '{}',
  subject_patterns        TEXT[]      NOT NULL DEFAULT '{}',
  filename_patterns       TEXT[]      NOT NULL DEFAULT '{}',
  format_type             TEXT        NOT NULL DEFAULT 'email_text'
    CHECK (format_type IN ('email_text', 'pdf_table', 'excel')),
  extraction_hints        TEXT,
  active                  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dealers_active ON public.dealers(active) WHERE active = TRUE;
CREATE INDEX idx_dealers_name   ON public.dealers(name);

-- Updated_at trigger (reuses existing function from OPH-1)
CREATE TRIGGER set_dealers_updated_at
  BEFORE UPDATE ON public.dealers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================================
-- 2. DEALERS RLS
-- All authenticated users can read. Only platform_admin can write.
-- ============================================================================
ALTER TABLE public.dealers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can read dealers"
  ON public.dealers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Platform admins can insert dealers"
  ON public.dealers FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

CREATE POLICY "Platform admins can update dealers"
  ON public.dealers FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

CREATE POLICY "Platform admins can delete dealers"
  ON public.dealers FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );


-- ============================================================================
-- 3. EXTEND ORDERS TABLE with dealer recognition columns
-- ============================================================================
ALTER TABLE public.orders
  ADD COLUMN dealer_id              UUID REFERENCES public.dealers(id) ON DELETE SET NULL,
  ADD COLUMN recognition_method     TEXT NOT NULL DEFAULT 'none'
    CHECK (recognition_method IN ('domain', 'address', 'subject', 'filename', 'manual', 'none')),
  ADD COLUMN recognition_confidence INTEGER NOT NULL DEFAULT 0
    CHECK (recognition_confidence >= 0 AND recognition_confidence <= 100),
  ADD COLUMN dealer_overridden_by   UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN dealer_overridden_at   TIMESTAMPTZ,
  ADD COLUMN override_reason        TEXT;

CREATE INDEX idx_orders_dealer_id ON public.orders(dealer_id);


-- ============================================================================
-- 4. SEED: Sample dealer profiles for common dental distributors
-- These will be used for immediate recognition testing.
-- ============================================================================
INSERT INTO public.dealers (name, known_domains, known_sender_addresses, subject_patterns, filename_patterns, format_type, extraction_hints, active)
VALUES
  (
    'Henry Schein GmbH',
    ARRAY['henryschein.de', 'henryschein.com'],
    ARRAY['orders@henryschein.de', 'bestellungen@henryschein.de'],
    ARRAY['Bestellung', 'Order', 'Henry Schein'],
    ARRAY['henryschein', 'hs_order', 'hs-order'],
    'excel',
    'Artikelnummern typischerweise in Spalte B, Menge in Spalte D. Bestellnummer im Betreff nach #.',
    true
  ),
  (
    'Dental Depot',
    ARRAY['dentaldepot.de'],
    ARRAY['bestellung@dentaldepot.de'],
    ARRAY['Dental Depot', 'DD-Bestellung'],
    ARRAY['dentaldepot', 'dd_order', 'dd-order'],
    'pdf_table',
    'PDF mit tabellarischer Struktur. Artikelnummer links, Bezeichnung Mitte, Menge rechts.',
    true
  ),
  (
    'Zahn-Discount24',
    ARRAY['zahn-discount24.de'],
    ARRAY[],
    ARRAY['Zahn-Discount', 'ZD24'],
    ARRAY['zd24', 'zahndiscount'],
    'email_text',
    'Freitext-Bestellungen per E-Mail. Artikelnummern oft als Liste im E-Mail-Body.',
    true
  );
