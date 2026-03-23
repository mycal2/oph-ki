import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";
import { changeUserRoleSchema } from "@/lib/validations";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/admin/tenants/[id]/users/[userId]/role
 *
 * Changes a user's role within a tenant.
 * Platform admin only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
): Promise<NextResponse> {
  try {
    const { id: tenantId, userId } = await params;

    if (!UUID_REGEX.test(tenantId) || !UUID_REGEX.test(userId)) {
      return NextResponse.json(
        { success: false, error: "Ungültige ID." },
        { status: 400 }
      );
    }

    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitResponse = checkAdminRateLimit(user.id);
    if (rateLimitResponse) return rateLimitResponse;

    // Validate input
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

    // Verify user belongs to the specified tenant
    const { data: profile, error: profileError } = await adminClient
      .from("user_profiles")
      .select("id, tenant_id, role, status")
      .eq("id", userId)
      .eq("tenant_id", tenantId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { success: false, error: "Benutzer nicht gefunden." },
        { status: 404 }
      );
    }

    // Guard: user must be active
    if (profile.status !== "active") {
      return NextResponse.json(
        { success: false, error: "Die Rolle von inaktiven Benutzern kann nicht geändert werden." },
        { status: 400 }
      );
    }

    // Guard: cannot change platform_admin role here
    if (profile.role === "platform_admin") {
      return NextResponse.json(
        { success: false, error: "Die Rolle von Platform-Admins kann hier nicht geändert werden." },
        { status: 400 }
      );
    }

    // Guard: cannot change own role
    if (userId === user.id) {
      return NextResponse.json(
        { success: false, error: "Sie können Ihre eigene Rolle nicht ändern." },
        { status: 400 }
      );
    }

    // Guard: last admin check when demoting
    if (newRole === "tenant_user" && profile.role === "tenant_admin") {
      const { count } = await adminClient
        .from("user_profiles")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
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

    // Update user role in user_profiles
    const { error: updateError } = await adminClient
      .from("user_profiles")
      .update({ role: newRole })
      .eq("id", userId)
      .eq("tenant_id", tenantId);

    if (updateError) {
      console.error("Failed to update user role:", updateError.message);
      return NextResponse.json(
        { success: false, error: "Benutzerrolle konnte nicht geändert werden." },
        { status: 500 }
      );
    }

    // BUG-3: Post-update verification for race condition on last-admin demotion
    if (newRole === "tenant_user") {
      const { count: postCount } = await adminClient
        .from("user_profiles")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("role", "tenant_admin")
        .eq("status", "active");

      if (postCount !== null && postCount === 0) {
        // Rollback: re-set the role back to tenant_admin
        await adminClient
          .from("user_profiles")
          .update({ role: "tenant_admin" })
          .eq("id", userId)
          .eq("tenant_id", tenantId);

        return NextResponse.json(
          {
            success: false,
            error: "Mindestens ein Administrator muss im Mandanten verbleiben.",
          },
          { status: 400 }
        );
      }
    }

    // Update app_metadata in Supabase Auth so the JWT reflects the new role
    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(
      userId,
      {
        app_metadata: { role: newRole },
      }
    );

    if (authUpdateError) {
      console.error("Failed to update auth metadata:", authUpdateError.message);
      // Non-blocking — profile was updated successfully, JWT will catch up on next refresh
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in PATCH /api/admin/tenants/[id]/users/[userId]/role:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
