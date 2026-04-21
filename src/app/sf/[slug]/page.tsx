import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { SalesforceHomeDashboard } from "@/components/salesforce/salesforce-home";
import type { AppMetadata } from "@/lib/types";

interface SalesforceHomePageProps {
  params: Promise<{ slug: string }>;
}

/**
 * OPH-91: Salesforce App home page — Dashboard with greeting and navigation tiles.
 *
 * Server component that:
 * 1. Verifies the user is authenticated
 * 2. Fetches user first name + tenant info for the dashboard
 * 3. Renders the SalesforceHomeDashboard client component
 */
export default async function SalesforceHomePage({ params }: SalesforceHomePageProps) {
  const { slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/sf/${slug}/login`);
  }

  const appMetadata = user.app_metadata as AppMetadata | undefined;
  const tenantId = appMetadata?.tenant_id;

  if (!tenantId) {
    redirect(`/sf/${slug}/login`);
  }

  const adminClient = createAdminClient();

  // Fetch user profile (first name for greeting)
  const { data: profile } = await adminClient
    .from("user_profiles")
    .select("first_name")
    .eq("id", user.id)
    .single();

  const firstName = (profile?.first_name as string) || null;

  // Fetch tenant info (name + logo)
  const { data: tenant } = await adminClient
    .from("tenants")
    .select("name, logo_url")
    .eq("id", tenantId)
    .single();

  const tenantName = (tenant?.name as string) || "";
  const tenantLogoUrl = (tenant?.logo_url as string | null) ?? null;

  return (
    <SalesforceHomeDashboard
      slug={slug}
      firstName={firstName}
      tenantName={tenantName}
      tenantLogoUrl={tenantLogoUrl}
    />
  );
}
