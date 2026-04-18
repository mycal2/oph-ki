import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CheckoutDeliveryStep } from "@/components/salesforce/checkout-delivery-step";
import type { AppMetadata } from "@/lib/types";
import type { Metadata } from "next";

interface DeliveryPageProps {
  params: Promise<{ slug: string }>;
}

export const metadata: Metadata = {
  title: "Kasse - Lieferung | Salesforce App",
  description: "Bestellvorgang: Lieferadresse und Bemerkungen.",
};

/**
 * OPH-79: Salesforce App checkout step 2 — Delivery & Notes.
 *
 * Server component that verifies the user is authenticated
 * and has a valid tenant, then renders the client-side
 * CheckoutDeliveryStep. The flow guard (isDealerIdentified)
 * is checked client-side since checkout state lives in React Context.
 */
export default async function DeliveryPage({ params }: DeliveryPageProps) {
  const { slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/sf/${slug}/login`);
  }

  const appMetadata = user.app_metadata as AppMetadata | undefined;
  if (!appMetadata?.tenant_id) {
    redirect(`/sf/${slug}/login`);
  }

  return <CheckoutDeliveryStep slug={slug} />;
}
