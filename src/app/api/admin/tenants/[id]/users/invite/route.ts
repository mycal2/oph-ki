import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";
import { adminInviteUserSchema } from "@/lib/validations";
import { sendInviteEmail } from "@/lib/postmark";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/tenants/[id]/users/invite
 *
 * Invites a user on behalf of a specific tenant.
 * Uses generateLink (no Supabase email) + Postmark for reliable delivery.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: tenantId } = await params;
    if (!UUID_REGEX.test(tenantId)) {
      return NextResponse.json(
        { success: false, error: "Ungültige Mandanten-ID." },
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
      const firstError = parsed.error.issues[0]?.message ?? "Ungültige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const { email, role } = parsed.data;

    // Verify tenant exists and is active/trial
    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .select("id, name, status")
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
        { success: false, error: "Mandant ist deaktiviert. Einladungen sind nicht möglich." },
        { status: 403 }
      );
    }

    // OPH-16: Trial tenants cannot have team members
    if (tenant.status === "trial") {
      return NextResponse.json(
        { success: false, error: "Team-Einladungen sind während der Testphase nicht verfügbar." },
        { status: 403 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    // Generate invite link without sending Supabase's built-in email.
    // generateLink creates the user + token but does NOT send email.
    const { data: linkData, error: inviteError } =
      await adminClient.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          redirectTo: `${siteUrl}/invite/accept`,
          data: {
            tenant_id: tenantId,
            role,
          },
        },
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

    const invitedUserId = linkData?.user?.id;
    if (!invitedUserId) {
      return NextResponse.json(
        { success: false, error: "Benutzer konnte nicht erstellt werden." },
        { status: 500 }
      );
    }

    // Set app_metadata so getUser() returns tenant_id and role
    // (generateLink `data` only sets user_metadata, not app_metadata)
    await adminClient.auth.admin.updateUserById(invitedUserId, {
      app_metadata: {
        tenant_id: tenantId,
        role,
        user_status: "active",
      },
    });

    // Send invite email via Postmark
    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) {
      console.error("Invite: No action_link returned from generateLink.");
      return NextResponse.json(
        { success: false, error: "Einladungslink konnte nicht generiert werden." },
        { status: 500 }
      );
    }

    const postmarkToken = process.env.POSTMARK_SERVER_API_TOKEN;
    if (!postmarkToken) {
      console.error("Invite: POSTMARK_SERVER_API_TOKEN not configured.");
      // User was created but email couldn't be sent — still return success
      // so the admin can use "Resend Invite" later
      return NextResponse.json(
        {
          success: true,
          data: { userId: invitedUserId, email },
          warning: "Benutzer erstellt, aber E-Mail konnte nicht gesendet werden. Nutzen Sie 'Erneut einladen'.",
        },
        { status: 201 }
      );
    }

    await sendInviteEmail({
      serverApiToken: postmarkToken,
      toEmail: email,
      inviteLink: actionLink,
      tenantName: tenant.name as string,
      siteUrl,
    });

    return NextResponse.json(
      {
        success: true,
        data: { userId: invitedUserId, email },
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
