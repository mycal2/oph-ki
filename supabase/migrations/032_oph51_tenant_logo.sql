-- OPH-51: Add logo_url column to tenants and create tenant-logos storage bucket.

-- 1. Add logo_url column
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- 2. Create the tenant-logos storage bucket (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-logos', 'tenant-logos', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage policy: anyone can read (public bucket)
CREATE POLICY "Public read access for tenant logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'tenant-logos');

-- 4. Storage policy: platform_admin can upload/update/delete any tenant logo
CREATE POLICY "Platform admin can manage tenant logos"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'tenant-logos'
  AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
)
WITH CHECK (
  bucket_id = 'tenant-logos'
  AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
);

-- 5. Storage policy: tenant_admin can manage their own tenant's logo
-- File naming convention: <tenant_id>.<ext>
CREATE POLICY "Tenant admin can manage own logo"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'tenant-logos'
  AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'tenant_admin'
  AND name LIKE (auth.jwt() -> 'app_metadata' ->> 'tenant_id') || '.%'
)
WITH CHECK (
  bucket_id = 'tenant-logos'
  AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'tenant_admin'
  AND name LIKE (auth.jwt() -> 'app_metadata' ->> 'tenant_id') || '.%'
);
