import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { CheckoutDealerStep } from "@/components/salesforce/checkout-dealer-step";
import type { AppMetadata } from "@/lib/types";
import type { Metadata } from "next";

interface CheckoutPageProps {
  params: Promise<{ slug: string }>;
}

export const metadata: Metadata = {
  title: "Kasse - Händler | Salesforce App",
  description: "Bestellvorgang: Händler identifizieren.",
};

/**
 * OPH-78: Salesforce App checkout step 1 — Dealer Identification.
 *
 * Server component that:
 * 1. Verifies the user is authenticated
 * 2. Pre-checks whether the tenant has customer catalog entries
 * 3. Renders the client-side CheckoutDealerStep component
 */
export default async function CheckoutPage({ params }: CheckoutPageProps) {
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

  // Check if tenant has any customer catalog entries
  const adminClient = createAdminClient();
  const { count } = await adminClient
    .from("customer_catalog")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  const hasCustomers = (count ?? 0) > 0;

  return <CheckoutDealerStep slug={slug} hasCustomers={hasCustomers} />;
}
