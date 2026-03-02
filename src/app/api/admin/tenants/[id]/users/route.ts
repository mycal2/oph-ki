import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse } from "@/lib/admin-auth";
import type { TenantUserListItem } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/tenants/[id]/users
 *
 * Returns all users for a specific tenant, including email and last sign-in
 * from Supabase Auth. Platform admin only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Mandanten-ID." },
        { status: 400 }
      );
    }

    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { adminClient } = auth;

    // Verify tenant exists
    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .select("id")
      .eq("id", id)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { success: false, error: "Mandant nicht gefunden." },
        { status: 404 }
      );
    }

    // Fetch user profiles for this tenant (admin client bypasses RLS)
    const { data: profiles, error: profilesError } = await adminClient
      .from("user_profiles")
      .select("id, tenant_id, role, first_name, last_name, status, created_at")
      .eq("tenant_id", id)
      .order("created_at", { ascending: true })
      .limit(200);

    if (profilesError) {
      console.error("Error fetching user profiles:", profilesError.message);
      return NextResponse.json(
        { success: false, error: "Benutzer konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Fetch auth user details (email, last_sign_in_at) via admin client
    const userIds = profiles.map((p) => p.id);
    const { data: authUsersData } = await adminClient.auth.admin.listUsers({
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

    // Combine profiles with auth data
    const users: TenantUserListItem[] = profiles.map((profile) => {
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

    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    console.error("Error in GET /api/admin/tenants/[id]/users:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
