import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BasketView } from "@/components/salesforce/basket-view";
import type { Metadata } from "next";

interface BasketPageProps {
  params: Promise<{ slug: string }>;
}

export const metadata: Metadata = {
  title: "Warenkorb | Salesforce App",
  description: "Ihren Warenkorb anzeigen und bearbeiten.",
};

/**
 * OPH-77: Salesforce App basket page.
 *
 * Server component that verifies auth, then renders the client-side BasketView.
 */
export default async function BasketPage({ params }: BasketPageProps) {
  const { slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/sf/${slug}/login`);
  }

  return <BasketView slug={slug} />;
}
