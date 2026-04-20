import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { ArticleSearch } from "@/components/salesforce/article-search";
import type { AppMetadata } from "@/lib/types";

/**
 * OPH-91: Salesforce App article search page (moved from /sf/[slug]/).
 *
 * Server component that:
 * 1. Verifies the user is authenticated
 * 2. Checks whether the tenant has any articles in the catalog
 * 3. Renders the client-side ArticleSearch component
 */
export default async function SalesforceOrderPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const appMetadata = user.app_metadata as AppMetadata | undefined;
  const tenantId = appMetadata?.tenant_id;

  if (!tenantId) {
    redirect("/login");
  }

  // Check if tenant has any articles (quick count query)
  const adminClient = createAdminClient();
  const { count } = await adminClient
    .from("article_catalog")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  const hasArticles = (count ?? 0) > 0;

  return <ArticleSearch hasArticles={hasArticles} />;
}
