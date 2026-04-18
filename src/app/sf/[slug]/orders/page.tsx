import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SalesforceOrderHistory } from "@/components/salesforce/salesforce-order-history";
import type { Metadata } from "next";

interface OrdersPageProps {
  params: Promise<{ slug: string }>;
}

export const metadata: Metadata = {
  title: "Bestellungen | Salesforce App",
  description: "Ihre Bestellhistorie anzeigen.",
};

/**
 * OPH-81: Salesforce App order history page.
 *
 * Server component that verifies auth, then renders the client-side
 * SalesforceOrderHistory component.
 */
export default async function OrdersPage({ params }: OrdersPageProps) {
  const { slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/sf/${slug}/login`);
  }

  return <SalesforceOrderHistory slug={slug} />;
}
