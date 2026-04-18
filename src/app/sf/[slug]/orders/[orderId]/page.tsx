import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SalesforceOrderDetail } from "@/components/salesforce/salesforce-order-detail";
import type { Metadata } from "next";

interface OrderDetailPageProps {
  params: Promise<{ slug: string; orderId: string }>;
}

export const metadata: Metadata = {
  title: "Bestelldetails | Salesforce App",
  description: "Details einer Bestellung anzeigen.",
};

/**
 * OPH-81: Salesforce App order detail page.
 *
 * Server component that verifies auth, then renders the client-side
 * SalesforceOrderDetail component with reorder functionality.
 */
export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { slug, orderId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/sf/${slug}/login`);
  }

  return <SalesforceOrderDetail slug={slug} orderId={orderId} />;
}
