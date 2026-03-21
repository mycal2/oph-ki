import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAdminRateLimit } from "@/lib/admin-auth";
import { changeUserRoleSchema } from "@/lib/validations";
import type { AppMetadata, ApiResponse } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/team/[userId]/role
 * Change a user's role (tenant_user <-> tenant_admin).
 * Requires tenant_admin or platform_admin role.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { userId } = await params;

    // BUG-4: Validate UUID format
    if (!UUID_REGEX.test(userId)) {
      return NextResponse.json(
        { success: false, error: "Ungültige ID." },
        { status: 400 }
      );
    }

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
          error: "Keine Berechtigung.",
        },
        { status: 403 }
      );
    }

    // BUG-6: Rate limiting
    const rateLimitResponse = checkAdminRateLimit(user.id);
    if (rateLimitResponse) return rateLimitResponse;

    // 3. Validate input
    const body = await request.json();
    const parsed = changeUserRoleSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungültige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const { role: newRole } = parsed.data;
    const tenantId = appMetadata.tenant_id;

    // 4. Verify the target user belongs to the same tenant
    const adminClient = createAdminClient();

    const { data: targetProfile, error: profileError } = await adminClient
      .from("user_profiles")
      .select("id, tenant_id, role, status")
      .eq("id", userId)
      .single();

    if (profileError || !targetProfile) {
      return NextResponse.json(
        { success: false, error: "Benutzer nicht gefunden." },
        { status: 404 }
      );
    }

    // Tenant admins can only manage their own tenant
    if (
      appMetadata.role === "tenant_admin" &&
      targetProfile.tenant_id !== tenantId
    ) {
      return NextResponse.json(
        { success: false, error: "Keine Berechtigung für diesen Benutzer." },
        { status: 403 }
      );
    }

    // 5. Guard: user must be active
    if (targetProfile.status !== "active") {
      return NextResponse.json(
        { success: false, error: "Die Rolle von inaktiven Benutzern kann nicht geändert werden." },
        { status: 400 }
      );
    }

    // 6. Guard: cannot change platform_admin role
    if (targetProfile.role === "platform_admin") {
      return NextResponse.json(
        { success: false, error: "Die Rolle von Platform-Admins kann hier nicht geändert werden." },
        { status: 400 }
      );
    }

    // 7. Guard: cannot change own role
    if (userId === user.id) {
      return NextResponse.json(
        { success: false, error: "Sie können Ihre eigene Rolle nicht ändern." },
        { status: 400 }
      );
    }

    // 8. Guard: last admin check when demoting
    if (newRole === "tenant_user" && targetProfile.role === "tenant_admin") {
      const { count } = await adminClient
        .from("user_profiles")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", targetProfile.tenant_id)
        .eq("role", "tenant_admin")
        .eq("status", "active");

      if (count !== null && count <= 1) {
        return NextResponse.json(
          {
            success: false,
            error: "Mindestens ein Administrator muss im Mandanten verbleiben.",
          },
          { status: 400 }
        );
      }
    }

    // 9. Update the user's role in user_profiles (BUG-5: scoped to tenant_id for defense-in-depth)
    const targetTenantId = targetProfile.tenant_id;
    const { error: updateError } = await adminClient
      .from("user_profiles")
      .update({ role: newRole })
      .eq("id", userId)
      .eq("tenant_id", targetTenantId);

    if (updateError) {
      console.error("Error updating user role:", updateError.message);
      return NextResponse.json(
        { success: false, error: "Rolle konnte nicht geändert werden." },
        { status: 500 }
      );
    }

    // BUG-3: Post-update verification for race condition on last-admin demotion
    if (newRole === "tenant_user") {
      const { count: postCount } = await adminClient
        .from("user_profiles")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", targetTenantId)
        .eq("role", "tenant_admin")
        .eq("status", "active");

      if (postCount !== null && postCount === 0) {
        // Rollback: re-set the role back to tenant_admin
        await adminClient
          .from("user_profiles")
          .update({ role: "tenant_admin" })
          .eq("id", userId)
          .eq("tenant_id", targetTenantId);

        return NextResponse.json(
          {
            success: false,
            error: "Mindestens ein Administrator muss im Mandanten verbleiben.",
          },
          { status: 400 }
        );
      }
    }

    // 10. Update app_metadata in Supabase Auth so the JWT reflects the new role
    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(
      userId,
      {
        app_metadata: { role: newRole },
      }
    );

    if (authUpdateError) {
      console.error("Failed to update auth metadata for role change:", authUpdateError.message);
      // Non-blocking — profile was updated successfully, JWT will catch up on next refresh
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error in change role route:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
