import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { SalesforceHeader } from "@/components/salesforce/salesforce-header";
import { BasketProvider } from "@/components/salesforce/basket-provider";
import { CheckoutProvider } from "@/components/salesforce/checkout-provider";

interface SalesforceLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

/**
 * OPH-72: Salesforce App layout.
 *
 * Resolves the tenant from the URL slug (set by middleware rewrite).
 * If the slug doesn't match an active Salesforce tenant, shows 404.
 * Renders a mobile-first layout with IDS.online + tenant branding.
 */
export default async function SalesforceLayout({ children, params }: SalesforceLayoutProps) {
  const { slug } = await params;

  // Resolve tenant from slug
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

  // OPH-85: Fetch current user's name for the header dropdown
  let userName: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await adminClient
        .from("user_profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .single();
      if (profile) {
        const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
        userName = fullName || user.email || null;
      } else {
        userName = user.email || null;
      }
    }
  } catch {
    // Non-critical — header will show fallback
  }

  return (
    <BasketProvider>
      <CheckoutProvider>
        <div className="min-h-svh flex flex-col bg-background">
          <SalesforceHeader
            tenantName={tenant.name as string}
            tenantLogoUrl={(tenant.logo_url as string | null) ?? null}
            slug={slug}
            userName={userName}
          />
          <main className="flex-1">
            <div className="mx-auto max-w-lg px-4 py-6">
              {children}
            </div>
          </main>
        </div>
      </CheckoutProvider>
    </BasketProvider>
  );
}
