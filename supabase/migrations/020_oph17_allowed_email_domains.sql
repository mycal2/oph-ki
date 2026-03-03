-- ============================================================================
-- Migration: OPH-17 - Add allowed_email_domains to tenants
-- Replaces user-list sender auth with domain-based authorization
-- ============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS allowed_email_domains TEXT[] DEFAULT '{}';
