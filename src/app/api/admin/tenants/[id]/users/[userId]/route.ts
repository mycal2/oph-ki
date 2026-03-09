import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";
import { toggleUserStatusSchema } from "@/lib/validations";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/admin/tenants/[id]/users/[userId]
 *
 * Toggles a user's status (active/inactive) within a tenant.
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
    const parsed = toggleUserStatusSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungültige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const { status } = parsed.data;

    // Verify user belongs to the specified tenant
    const { data: profile, error: profileError } = await adminClient
      .from("user_profiles")
      .select("id, tenant_id, status")
      .eq("id", userId)
      .eq("tenant_id", tenantId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { success: false, error: "Benutzer nicht gefunden." },
        { status: 404 }
      );
    }

    // Update user status in user_profiles (tenant_id filter for defense-in-depth)
    const { error: updateError } = await adminClient
      .from("user_profiles")
      .update({ status })
      .eq("id", userId)
      .eq("tenant_id", tenantId);

    if (updateError) {
      console.error("Failed to update user status:", updateError.message);
      return NextResponse.json(
        { success: false, error: "Benutzerstatus konnte nicht geändert werden." },
        { status: 500 }
      );
    }

    // Update app_metadata in Supabase Auth so the JWT reflects the new status
    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(
      userId,
      {
        app_metadata: { user_status: status },
      }
    );

    if (authUpdateError) {
      console.error("Failed to update auth metadata:", authUpdateError.message);
      // Non-blocking — profile was updated successfully, JWT will catch up on next refresh
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in PATCH /api/admin/tenants/[id]/users/[userId]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
