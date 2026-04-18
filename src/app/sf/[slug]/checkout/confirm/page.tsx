import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CheckoutConfirmStep } from "@/components/salesforce/checkout-confirm-step";
import type { AppMetadata } from "@/lib/types";
import type { Metadata } from "next";

interface ConfirmPageProps {
  params: Promise<{ slug: string }>;
}

export const metadata: Metadata = {
  title: "Kasse - Zusammenfassung | Salesforce App",
  description: "Bestellvorgang: Bestellung pruefen und absenden.",
};

/**
 * OPH-80: Salesforce App checkout step 3 -- Order Summary & Submission.
 *
 * Server component that verifies the user is authenticated
 * and has a valid tenant, then renders the client-side
 * CheckoutConfirmStep. The flow guards (isDealerIdentified,
 * basket non-empty) are checked client-side since checkout
 * and basket state live in React Context.
 */
export default async function ConfirmPage({ params }: ConfirmPageProps) {
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

  return <CheckoutConfirmStep slug={slug} />;
}
