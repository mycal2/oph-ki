import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { SalesforceProfile } from "@/components/salesforce/salesforce-profile";
import type { Metadata } from "next";

interface ProfilePageProps {
  params: Promise<{ slug: string }>;
}

export const metadata: Metadata = {
  title: "Profil | Salesforce App",
  description: "Ihr Profil und Bestellhistorie.",
};

/**
 * OPH-86: Salesforce App profile page.
 *
 * Server component that verifies auth, fetches user profile data,
 * then renders the client-side SalesforceProfile component.
 */
export default async function ProfilePage({ params }: ProfilePageProps) {
  const { slug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/sf/${slug}/login`);
  }

  // Fetch user profile for display
  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from("user_profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();

  const firstName = (profile?.first_name as string) || null;
  const lastName = (profile?.last_name as string) || null;
  const email = user.email || null;

  return (
    <SalesforceProfile
      slug={slug}
      firstName={firstName}
      lastName={lastName}
      email={email}
    />
  );
}
