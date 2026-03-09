import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppMetadata, ApiResponse, TeamMember } from "@/lib/types";

/**
 * GET /api/team/members
 * List all team members for the current tenant.
 * Requires authentication. RLS filters by tenant_id from JWT.
 * Uses admin client to fetch auth.users for last_sign_in_at + email.
 */
export async function GET(): Promise<NextResponse<ApiResponse<TeamMember[]>>> {
  try {
    // 1. Verify authentication
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Nicht authentifiziert." },
        { status: 401 }
      );
    }

    // 2. Check user/tenant status and role from JWT app_metadata
    const appMetadata = user.app_metadata as AppMetadata | undefined;

    if (appMetadata?.user_status === "inactive") {
      return NextResponse.json(
        { success: false, error: "Ihr Konto ist deaktiviert." },
        { status: 403 }
      );
    }
    if (appMetadata?.tenant_status === "inactive") {
      return NextResponse.json(
        { success: false, error: "Ihr Mandant ist deaktiviert." },
        { status: 403 }
      );
    }

    if (
      !appMetadata?.role ||
      !["tenant_admin", "platform_admin"].includes(appMetadata.role)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Keine Berechtigung. Nur Administratoren können Teammitglieder sehen.",
        },
        { status: 403 }
      );
    }

    const tenantId = appMetadata.tenant_id;
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: "Kein Mandant zugeordnet." },
        { status: 400 }
      );
    }

    // 3. Fetch user profiles for this tenant (RLS filters automatically)
    const { data: profiles, error: profilesError } = await supabase
      .from("user_profiles")
      .select("id, tenant_id, role, first_name, last_name, status, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError.message);
      return NextResponse.json(
        { success: false, error: "Teammitglieder konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // 4. Fetch auth user details (email, last_sign_in_at) via admin client
    //    We batch-fetch to avoid N+1
    const adminClient = createAdminClient();
    const userIds = profiles.map((p) => p.id);

    // Supabase admin API lists users; we fetch by page filtering
    // For up to 100 users this is fine with a single page
    const { data: authUsersData } =
      await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

    const authUsersMap = new Map<
      string,
      { email: string; last_sign_in_at: string | null }
    >();

    if (authUsersData?.users) {
      for (const authUser of authUsersData.users) {
        if (userIds.includes(authUser.id)) {
          authUsersMap.set(authUser.id, {
            email: authUser.email ?? "",
            last_sign_in_at: authUser.last_sign_in_at ?? null,
          });
        }
      }
    }

    // 5. Combine profiles with auth data
    const members: TeamMember[] = profiles.map((profile) => {
      const authData = authUsersMap.get(profile.id);
      return {
        id: profile.id,
        email: authData?.email ?? "",
        first_name: profile.first_name,
        last_name: profile.last_name,
        role: profile.role,
        status: profile.status,
        last_sign_in_at: authData?.last_sign_in_at ?? null,
      };
    });

    return NextResponse.json({ success: true, data: members });
  } catch (error) {
    console.error("Unexpected error in members route:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
