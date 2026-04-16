import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardStats } from "@/components/orders/dashboard-stats";
import { RecentOrders } from "@/components/dashboard/recent-orders";
import { TeamOrActionTile } from "@/components/dashboard/team-or-action-tile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppMetadata } from "@/lib/types";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard | IDS.online",
  description: "Ihr IDS.online Dashboard.",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch the user's profile for display name and role
  let firstName = "";
  let userRole = "tenant_user";
  let tenantId: string | null = null;
  let teamMemberCount: number | null = null;

  if (user) {
    const appMetadata = user.app_metadata as AppMetadata | undefined;
    tenantId = appMetadata?.tenant_id ?? null;
    userRole = appMetadata?.role ?? "tenant_user";

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("first_name, role")
      .eq("id", user.id)
      .single();

    firstName =
      profile?.first_name ||
      user.user_metadata?.first_name ||
      user.email?.split("@")[0] ||
      "";

    if (profile?.role) {
      userRole = profile.role;
    }

    // Fetch team member count for admins (server-side)
    const isAdmin = userRole === "tenant_admin" || userRole === "platform_admin";
    if (isAdmin && tenantId) {
      try {
        const adminClient = createAdminClient();
        const { count } = await adminClient
          .from("user_profiles")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "active");

        teamMemberCount = count ?? 0;
      } catch {
        // Fail silently - tile will still show, just without count
        teamMemberCount = null;
      }
    }
  }

  const isAdmin = userRole === "tenant_admin" || userRole === "platform_admin";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Willkommen zur{"\u00fc"}ck{firstName ? `, ${firstName}` : ""}. Hier ist eine {"\u00dc"}bersicht Ihres Arbeitsbereichs.
          </p>
        </div>
        <Button asChild className="sm:shrink-0">
          <Link href="/orders/upload">
            <Upload className="h-4 w-4" />
            Bestellung hochladen
          </Link>
        </Button>
      </div>

      {/* Stats tiles row: DashboardStats (5 tiles) + team/action tile */}
      <div className="space-y-3">
        <DashboardStats />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <TeamOrActionTile
            teamMemberCount={teamMemberCount}
            isAdmin={isAdmin}
          />
        </div>
      </div>

      {/* Recent Orders */}
      <RecentOrders />
    </div>
  );
}
