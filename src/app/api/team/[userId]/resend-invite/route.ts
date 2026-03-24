import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAdminRateLimit } from "@/lib/admin-auth";
import { sendResendInviteEmail } from "@/lib/postmark";
import type { AppMetadata, ApiResponse } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/team/[userId]/resend-invite
 *
 * OPH-48: Re-sends an invitation email to a platform team member
 * who has not yet confirmed their account.
 * Requires platform_admin role. Cannot act on own account.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { userId } = await params;

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

    const appMetadata = user.app_metadata as AppMetadata | undefined;

    if (appMetadata?.role !== "platform_admin") {
      return NextResponse.json(
        { success: false, error: "Keine Berechtigung. Nur Platform-Admins." },
        { status: 403 }
      );
    }

    // Self-action guard
    if (userId === user.id) {
      return NextResponse.json(
        { success: false, error: "Nicht auf eigenes Konto anwendbar." },
        { status: 400 }
      );
    }

    const rateLimitResponse = checkAdminRateLimit(user.id);
    if (rateLimitResponse) return rateLimitResponse;

    const adminClient = createAdminClient();
    const tenantId = appMetadata.tenant_id;

    // Verify target user belongs to the same team (same tenant_id)
    const { data: profile, error: profileError } = await adminClient
      .from("user_profiles")
      .select("id, tenant_id, status, role")
      .eq("id", userId)
      .eq("tenant_id", tenantId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { success: false, error: "Benutzer nicht gefunden." },
        { status: 404 }
      );
    }

    if (profile.status === "inactive") {
      return NextResponse.json(
        { success: false, error: "Benutzer ist deaktiviert. Einladung kann nicht erneut gesendet werden." },
        { status: 403 }
      );
    }

    // Get the auth user to check confirmation status
    const { data: authUserData, error: authUserError } =
      await adminClient.auth.admin.getUserById(userId);

    if (authUserError || !authUserData?.user) {
      return NextResponse.json(
        { success: false, error: "Auth-Benutzer nicht gefunden." },
        { status: 404 }
      );
    }

    const authUser = authUserData.user;

    if (authUser.email_confirmed_at) {
      return NextResponse.json(
        { success: false, error: "Benutzer hat sein Konto bereits bestätigt. Einladung nicht nötig." },
        { status: 400 }
      );
    }

    if (!authUser.email) {
      return NextResponse.json(
        { success: false, error: "Keine E-Mail-Adresse für diesen Benutzer vorhanden." },
        { status: 400 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    const { data: linkData, error: inviteError } =
      await adminClient.auth.admin.generateLink({
        type: "invite",
        email: authUser.email,
        options: {
          redirectTo: `${siteUrl}/auth/callback?next=/invite/accept`,
          data: {
            tenant_id: tenantId,
            role: authUser.app_metadata?.role ?? "platform_viewer",
          },
        },
      });

    if (inviteError) {
      console.error("Resend invite (team) error:", inviteError.message);
      if (inviteError.message?.includes("rate") || inviteError.status === 429) {
        return NextResponse.json(
          { success: false, error: "Zu viele Einladungen in kurzer Zeit. Bitte warten Sie einen Moment." },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { success: false, error: "Einladung konnte nicht erneut gesendet werden." },
        { status: 500 }
      );
    }

    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) {
      return NextResponse.json(
        { success: false, error: "Einladungslink konnte nicht generiert werden." },
        { status: 500 }
      );
    }

    const postmarkToken = process.env.POSTMARK_SERVER_API_TOKEN;
    if (!postmarkToken) {
      return NextResponse.json(
        { success: false, error: "E-Mail-Versand ist nicht konfiguriert." },
        { status: 500 }
      );
    }

    await sendResendInviteEmail({
      serverApiToken: postmarkToken,
      toEmail: authUser.email,
      inviteLink: actionLink,
      siteUrl,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in POST /api/team/[userId]/resend-invite:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
