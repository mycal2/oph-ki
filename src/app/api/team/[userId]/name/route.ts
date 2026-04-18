import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateUserNameSchema } from "@/lib/validations";
import type { AppMetadata, ApiResponse } from "@/lib/types";

/**
 * PATCH /api/team/[userId]/name
 * Update a user's first_name and last_name in user_profiles.
 * Requires tenant_admin or platform_admin role.
 * Tenant admins are scoped to their own tenant.
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
        { success: false, error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    // 3. Validate input
    const body = await request.json();
    const parsed = updateUserNameSchema.safeParse(body);

    if (!parsed.success) {
      const firstError =
        parsed.error.issues[0]?.message ?? "Ungültige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const { first_name, last_name } = parsed.data;
    const tenantId = appMetadata.tenant_id;

    // 4. Verify the target user exists
    const adminClient = createAdminClient();

    const { data: targetProfile, error: profileError } = await adminClient
      .from("user_profiles")
      .select("id, tenant_id")
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

    // 5. Update the user's name
    const { error: updateError } = await adminClient
      .from("user_profiles")
      .update({ first_name, last_name })
      .eq("id", userId);

    if (updateError) {
      console.error("Error updating user name:", updateError.message);
      return NextResponse.json(
        { success: false, error: "Name konnte nicht geändert werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error in update name route:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
