import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";
import { sendResendInviteEmail } from "@/lib/postmark";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/tenants/[id]/users/[userId]/resend-invite
 *
 * OPH-38: Re-sends an invitation email to a user who has not yet confirmed their account.
 * OPH-97: Supports `?mode=link` to skip the email and return the raw invite link
 * so the platform admin can forward it through their own channel.
 * Platform admin only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
): Promise<NextResponse> {
  try {
    const { id: tenantId, userId } = await params;
    const generateLinkOnly = request.nextUrl.searchParams.get("mode") === "link";

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

    if (profile.status === "inactive") {
      return NextResponse.json(
        { success: false, error: "Benutzer ist deaktiviert. Einladung kann nicht erneut gesendet werden." },
        { status: 403 }
      );
    }

    // Get the auth user to check confirmation status and email
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

    // Generate a new invite link via Supabase Admin SDK.
    // generateLink returns the link but does NOT send an email — we send it via Postmark.
    const { data: linkData, error: inviteError } =
      await adminClient.auth.admin.generateLink({
        type: "invite",
        email: authUser.email,
        options: {
          redirectTo: `${siteUrl}/auth/callback?next=/invite/accept`,
          data: {
            tenant_id: tenantId,
            role: authUser.app_metadata?.role ?? "tenant_user",
          },
        },
      });

    if (inviteError) {
      console.error("Resend invite link generation error:", inviteError.message);

      // Handle rate limit from Supabase
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
    const hashedToken = linkData?.properties?.hashed_token;
    if (!actionLink || !hashedToken) {
      console.error("Resend invite: Missing action_link or hashed_token from generateLink.");
      return NextResponse.json(
        { success: false, error: "Einladungslink konnte nicht generiert werden." },
        { status: 500 }
      );
    }

    // Wrap the Supabase token in a URL on our own domain — see /auth/confirm.
    const wrappedInviteLink =
      `${siteUrl}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}` +
      `&type=invite&next=${encodeURIComponent("/invite/accept")}`;

    // OPH-97: Skip email and return the link for the admin to forward manually.
    if (generateLinkOnly) {
      return NextResponse.json(
        {
          success: true,
          data: { inviteLink: wrappedInviteLink, email: authUser.email },
        },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            Pragma: "no-cache",
          },
        }
      );
    }

    // Send the invite email via Postmark
    const postmarkToken = process.env.POSTMARK_SERVER_API_TOKEN;
    if (!postmarkToken) {
      console.error("Resend invite: POSTMARK_SERVER_API_TOKEN not configured.");
      return NextResponse.json(
        { success: false, error: "E-Mail-Versand ist nicht konfiguriert." },
        { status: 500 }
      );
    }

    await sendResendInviteEmail({
      serverApiToken: postmarkToken,
      toEmail: authUser.email,
      inviteLink: wrappedInviteLink,
      siteUrl,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in POST /api/admin/tenants/[id]/users/[userId]/resend-invite:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
