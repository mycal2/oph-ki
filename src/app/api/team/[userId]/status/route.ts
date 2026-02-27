import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toggleUserStatusSchema } from "@/lib/validations";
import type { AppMetadata, ApiResponse } from "@/lib/types";

/**
 * PATCH /api/team/[userId]/status
 * Toggle a user's active/inactive status.
 * Requires tenant_admin or platform_admin role.
 * Checks: cannot deactivate the last admin of a tenant.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { userId } = await params;

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

    // 3. Validate input
    const body = await request.json();
    const parsed = toggleUserStatusSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungueltige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const { status: newStatus } = parsed.data;
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
        { success: false, error: "Keine Berechtigung fuer diesen Benutzer." },
        { status: 403 }
      );
    }

    // 5. Prevent deactivating the last admin
    if (
      newStatus === "inactive" &&
      targetProfile.role === "tenant_admin"
    ) {
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
            error:
              "Der letzte Administrator eines Mandanten kann nicht deaktiviert werden.",
          },
          { status: 400 }
        );
      }
    }

    // 6. Prevent self-deactivation
    if (userId === user.id && newStatus === "inactive") {
      return NextResponse.json(
        {
          success: false,
          error: "Sie koennen sich nicht selbst deaktivieren.",
        },
        { status: 400 }
      );
    }

    // 7. Update the user's status
    const { error: updateError } = await adminClient
      .from("user_profiles")
      .update({ status: newStatus })
      .eq("id", userId);

    if (updateError) {
      console.error("Error updating user status:", updateError.message);
      return NextResponse.json(
        { success: false, error: "Status konnte nicht geaendert werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error in toggle status route:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
