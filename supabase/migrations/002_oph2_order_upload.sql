-- ============================================================================
-- OPH-2: Bestellungs-Upload (Web: .eml, PDF, Excel)
-- Migration: Create orders, order_files tables with RLS,
--            Supabase Storage bucket for order files,
--            and extend rate limits to cover upload requests.
-- ============================================================================


-- ============================================================================
-- 1. EXTEND RATE LIMITS: allow 'upload_ip' as an identifier type
-- ============================================================================
ALTER TABLE public.auth_rate_limits
  DROP CONSTRAINT IF EXISTS auth_rate_limits_identifier_type_check;

ALTER TABLE public.auth_rate_limits
  ADD CONSTRAINT auth_rate_limits_identifier_type_check
    CHECK (identifier_type IN ('email', 'ip', 'upload_ip'));


-- ============================================================================
-- 2. ORDERS TABLE
-- One order record per upload session.
-- Status tracks the lifecycle: uploaded → processing → extracted → review → exported / error
-- ============================================================================
CREATE TABLE public.orders (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  uploaded_by UUID        REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  status      TEXT        NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded', 'processing', 'extracted', 'review', 'exported', 'error')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_tenant_id   ON public.orders(tenant_id);
CREATE INDEX idx_orders_status      ON public.orders(status);
CREATE INDEX idx_orders_uploaded_by ON public.orders(uploaded_by);
CREATE INDEX idx_orders_created_at  ON public.orders(created_at DESC);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Users see only their own tenant's orders
CREATE POLICY "Users can view own tenant orders"
  ON public.orders FOR SELECT
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID
  );

-- Platform admins can see all orders
CREATE POLICY "Platform admins can view all orders"
  ON public.orders FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

-- Insert via service role only (API routes use admin client)
-- Regular users cannot insert directly

-- Tenant users can update status of their own tenant's orders (for review/correction flow)
CREATE POLICY "Users can update own tenant orders"
  ON public.orders FOR UPDATE
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID
  )
  WITH CHECK (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID
  );

CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================================
-- 3. ORDER_FILES TABLE
-- Each uploaded file linked to an order.
-- Original files are stored permanently for audit/traceability.
-- ============================================================================
CREATE TABLE public.order_files (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id          UUID        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  tenant_id         UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  original_filename TEXT        NOT NULL,
  storage_path      TEXT        NOT NULL UNIQUE,
  file_size_bytes   BIGINT      NOT NULL CHECK (file_size_bytes > 0),
  mime_type         TEXT        NOT NULL,
  sha256_hash       TEXT        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_files_order_id    ON public.order_files(order_id);
CREATE INDEX idx_order_files_tenant_id   ON public.order_files(tenant_id);
CREATE INDEX idx_order_files_sha256_hash ON public.order_files(sha256_hash);
-- Composite index for per-tenant duplicate detection
CREATE INDEX idx_order_files_tenant_hash ON public.order_files(tenant_id, sha256_hash);

ALTER TABLE public.order_files ENABLE ROW LEVEL SECURITY;

-- Users see only their own tenant's files
CREATE POLICY "Users can view own tenant order files"
  ON public.order_files FOR SELECT
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID
  );

-- Platform admins can see all files
CREATE POLICY "Platform admins can view all order files"
  ON public.order_files FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

-- Insert via service role only (API routes use admin client)


-- ============================================================================
-- 4. SUPABASE STORAGE: order-files bucket
-- Private bucket — files are only accessible via signed URLs or admin client.
-- Files stored at path: {tenant_id}/{order_id}/{sanitized_filename}
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'order-files',
  'order-files',
  false,
  26214400,  -- 25 MB in bytes
  ARRAY[
    'message/rfc822',
    'application/octet-stream',
    'text/plain',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users can only upload/read files within their own tenant folder
-- The first path segment must match the authenticated user's tenant_id
CREATE POLICY "Authenticated users can upload to own tenant folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'order-files'
    AND (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  );

CREATE POLICY "Authenticated users can read own tenant folder"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'order-files'
    AND (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  );

CREATE POLICY "Authenticated users can delete from own tenant folder"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'order-files'
    AND (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  );
