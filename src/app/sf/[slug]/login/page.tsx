import { Suspense } from "react";
import { SalesforceLoginForm } from "@/components/salesforce/salesforce-login-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

interface SalesforceLoginPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * OPH-75: Salesforce App login page.
 *
 * Server component that resolves the tenant from the URL slug,
 * then renders the magic link login form with tenant branding.
 */
export async function generateMetadata({ params }: SalesforceLoginPageProps): Promise<Metadata> {
  const { slug } = await params;
  const adminClient = createAdminClient();
  const { data: tenant } = await adminClient
    .from("tenants")
    .select("name")
    .eq("salesforce_slug", slug)
    .eq("salesforce_enabled", true)
    .single();

  return {
    title: tenant
      ? `Anmelden | ${tenant.name}`
      : "Anmelden | Salesforce App",
    description: "Melden Sie sich mit einem Magic Link an.",
  };
}

export default async function SalesforceLoginPage({ params }: SalesforceLoginPageProps) {
  const { slug } = await params;

  // Resolve tenant from slug to get the name for display
  const adminClient = createAdminClient();
  const { data: tenant } = await adminClient
    .from("tenants")
    .select("id, name, salesforce_enabled, salesforce_slug, logo_url")
    .eq("salesforce_slug", slug)
    .eq("salesforce_enabled", true)
    .single();

  if (!tenant) {
    notFound();
  }

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Suspense>
        <SalesforceLoginForm
          tenantName={tenant.name as string}
          slug={slug}
          logoUrl={(tenant.logo_url as string | null) ?? null}
        />
      </Suspense>
    </div>
  );
}
