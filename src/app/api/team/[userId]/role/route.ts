import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAdminRateLimit } from "@/lib/admin-auth";
import { changeUserRoleSchema, changePlatformRoleSchema } from "@/lib/validations";
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

    const tenantId = appMetadata.tenant_id;
    const adminClient = createAdminClient();

    // 3. Fetch the target user profile
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

    // Guard: cannot change own role
    if (userId === user.id) {
      return NextResponse.json(
        { success: false, error: "Sie können Ihre eigene Rolle nicht ändern." },
        { status: 400 }
      );
    }

    // Determine if this is a platform role change or a tenant role change
    const isPlatformTarget =
      targetProfile.role === "platform_admin" || targetProfile.role === "platform_viewer";

    // 4. Validate input with the appropriate schema
    const body = await request.json();

    if (isPlatformTarget) {
      // OPH-48: Platform role changes require platform_admin
      if (appMetadata.role !== "platform_admin") {
        return NextResponse.json(
          { success: false, error: "Nur Platform-Admins können Platform-Rollen ändern." },
          { status: 403 }
        );
      }

      const parsed = changePlatformRoleSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." },
          { status: 400 }
        );
      }

      const newRole = parsed.data.role;

      // Guard: user must be active
      if (targetProfile.status !== "active") {
        return NextResponse.json(
          { success: false, error: "Die Rolle von inaktiven Benutzern kann nicht geändert werden." },
          { status: 400 }
        );
      }

      // Guard: last platform_admin check when demoting
      if (newRole === "platform_viewer" && targetProfile.role === "platform_admin") {
        const { count } = await adminClient
          .from("user_profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "platform_admin")
          .eq("status", "active");

        if (count !== null && count <= 1) {
          return NextResponse.json(
            { success: false, error: "Mindestens ein Platform-Admin muss verbleiben." },
            { status: 400 }
          );
        }
      }

      // Update role
      const targetTenantId = targetProfile.tenant_id;
      const { error: updateError } = await adminClient
        .from("user_profiles")
        .update({ role: newRole })
        .eq("id", userId)
        .eq("tenant_id", targetTenantId);

      if (updateError) {
        console.error("Error updating platform user role:", updateError.message);
        return NextResponse.json(
          { success: false, error: "Rolle konnte nicht geändert werden." },
          { status: 500 }
        );
      }

      // Post-update verification for last-admin demotion
      if (newRole === "platform_viewer") {
        const { count: postCount } = await adminClient
          .from("user_profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "platform_admin")
          .eq("status", "active");

        if (postCount !== null && postCount === 0) {
          await adminClient
            .from("user_profiles")
            .update({ role: "platform_admin" })
            .eq("id", userId)
            .eq("tenant_id", targetTenantId);

          return NextResponse.json(
            { success: false, error: "Mindestens ein Platform-Admin muss verbleiben." },
            { status: 400 }
          );
        }
      }

      // Update auth metadata
      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(
        userId,
        { app_metadata: { role: newRole } }
      );
      if (authUpdateError) {
        console.error("Failed to update auth metadata for platform role change:", authUpdateError.message);
      }

      return NextResponse.json({ success: true });
    }

    // --- Tenant role change (existing logic) ---

    const parsed = changeUserRoleSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungültige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const { role: newRole } = parsed.data;

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

    // Guard: user must be active
    if (targetProfile.status !== "active") {
      return NextResponse.json(
        { success: false, error: "Die Rolle von inaktiven Benutzern kann nicht geändert werden." },
        { status: 400 }
      );
    }

    // Guard: last admin check when demoting
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

    // Update the user's role in user_profiles (scoped to tenant_id for defense-in-depth)
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

    // Post-update verification for race condition on last-admin demotion
    if (newRole === "tenant_user") {
      const { count: postCount } = await adminClient
        .from("user_profiles")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", targetTenantId)
        .eq("role", "tenant_admin")
        .eq("status", "active");

      if (postCount !== null && postCount === 0) {
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

    // Update app_metadata in Supabase Auth so the JWT reflects the new role
    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(
      userId,
      {
        app_metadata: { role: newRole },
      }
    );

    if (authUpdateError) {
      console.error("Failed to update auth metadata for role change:", authUpdateError.message);
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
