import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";
import { adminInviteUserSchema } from "@/lib/validations";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/tenants/[id]/users/invite
 *
 * Invites a user on behalf of a specific tenant.
 * The platform admin can invite into any tenant, not just their own.
 * Uses Supabase inviteUserByEmail() with the target tenant_id.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: tenantId } = await params;
    if (!UUID_REGEX.test(tenantId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Mandanten-ID." },
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
    const parsed = adminInviteUserSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungueltige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const { email, role } = parsed.data;

    // Verify tenant exists and is active/trial
    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .select("id, status")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { success: false, error: "Mandant nicht gefunden." },
        { status: 404 }
      );
    }

    if (tenant.status === "inactive") {
      return NextResponse.json(
        { success: false, error: "Mandant ist deaktiviert. Einladungen sind nicht moeglich." },
        { status: 403 }
      );
    }

    // OPH-16: Trial tenants cannot have team members
    if (tenant.status === "trial") {
      return NextResponse.json(
        { success: false, error: "Team-Einladungen sind waehrend der Testphase nicht verfuegbar." },
        { status: 403 }
      );
    }

    // Invite user via Supabase Auth, setting the target tenant_id in metadata
    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        data: {
          tenant_id: tenantId,
          role: role,
        },
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback?next=/dashboard`,
      });

    if (inviteError) {
      if (inviteError.message?.includes("already been registered")) {
        return NextResponse.json(
          { success: false, error: "Diese E-Mail-Adresse ist bereits registriert." },
          { status: 409 }
        );
      }

      console.error("Invite error:", inviteError.message);
      return NextResponse.json(
        { success: false, error: "Einladung konnte nicht gesendet werden." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: { userId: inviteData.user.id, email },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in POST /api/admin/tenants/[id]/users/invite:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
