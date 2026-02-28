-- OPH-5: Order Review & Manual Correction
-- Adds review columns to orders table and creates the order_edits audit trail table.

-- ============================================================================
-- 1. Add review columns to the orders table
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS reviewed_data JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID DEFAULT NULL
    REFERENCES public.user_profiles(id) ON DELETE SET NULL;

-- Index for querying orders by reviewer
CREATE INDEX IF NOT EXISTS idx_orders_reviewed_by ON public.orders(reviewed_by);

-- ============================================================================
-- 2. Create order_edits audit trail table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  field_path TEXT NOT NULL,
  old_value JSONB DEFAULT NULL,
  new_value JSONB DEFAULT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_order_edits_order_id ON public.order_edits(order_id);
CREATE INDEX IF NOT EXISTS idx_order_edits_tenant_id ON public.order_edits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_edits_changed_at ON public.order_edits(changed_at DESC);

-- ============================================================================
-- 3. Enable RLS on order_edits
-- ============================================================================

ALTER TABLE public.order_edits ENABLE ROW LEVEL SECURITY;

-- Tenant users can read edits for their own tenant's orders
CREATE POLICY "order_edits_select_tenant"
  ON public.order_edits
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

-- Platform admins can read all edits
CREATE POLICY "order_edits_select_platform_admin"
  ON public.order_edits
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'platform_admin'
    )
  );

-- Tenant users can insert edits for their own tenant's orders
CREATE POLICY "order_edits_insert_tenant"
  ON public.order_edits
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (
      SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

-- Platform admins can insert edits for any order
CREATE POLICY "order_edits_insert_platform_admin"
  ON public.order_edits
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'platform_admin'
    )
  );

-- No UPDATE or DELETE policies -- audit records are immutable
