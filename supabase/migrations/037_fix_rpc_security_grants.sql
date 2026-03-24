-- Security fix: Revoke EXECUTE on admin-only RPC functions from authenticated role.
-- These functions are SECURITY DEFINER and expose cross-tenant data (orders, tenants,
-- billing). The API layer calls them via adminClient (service_role), so the
-- authenticated grant is unnecessary and allows any logged-in user to bypass the
-- admin check by calling the RPC directly.

REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_stats(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_billing_report(DATE, DATE, UUID[], BOOLEAN) FROM authenticated;
