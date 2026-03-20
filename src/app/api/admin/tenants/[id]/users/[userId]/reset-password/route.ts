import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";
import { sendPasswordResetEmail } from "@/lib/postmark";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/tenants/[id]/users/[userId]/reset-password
 *
 * OPH-38: Triggers a password reset email for a confirmed, active user.
 * Uses Supabase Admin SDK to generate a recovery link, then sends it via Postmark.
 * Platform admin only.
 */
export async function POST(
  _request: NextRequest,
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
        { success: false, error: "Benutzer ist deaktiviert. Passwort-Reset nicht möglich." },
        { status: 403 }
      );
    }

    // Get the auth user to retrieve their email
    const { data: authUserData, error: authUserError } =
      await adminClient.auth.admin.getUserById(userId);

    if (authUserError || !authUserData?.user) {
      return NextResponse.json(
        { success: false, error: "Auth-Benutzer nicht gefunden." },
        { status: 404 }
      );
    }

    const authUser = authUserData.user;

    if (!authUser.email) {
      return NextResponse.json(
        { success: false, error: "Keine E-Mail-Adresse für diesen Benutzer vorhanden." },
        { status: 400 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    // Generate a recovery link via Supabase Admin SDK.
    // generateLink returns the link but does NOT send an email — we send it via Postmark.
    const { data: linkData, error: resetError } =
      await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: authUser.email,
        options: {
          redirectTo: `${siteUrl}/reset-password`,
        },
      });

    if (resetError) {
      console.error("Password reset link generation error:", resetError.message);

      if (resetError.message?.includes("rate") || resetError.status === 429) {
        return NextResponse.json(
          { success: false, error: "Zu viele Anfragen in kurzer Zeit. Bitte warten Sie einen Moment." },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { success: false, error: "Passwort-Reset konnte nicht ausgelöst werden." },
        { status: 500 }
      );
    }

    // The generated action_link points to Supabase's verify endpoint.
    // We need to extract the token and build a link through our auth callback.
    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) {
      console.error("Password reset: No action_link returned from generateLink.");
      return NextResponse.json(
        { success: false, error: "Passwort-Reset-Link konnte nicht generiert werden." },
        { status: 500 }
      );
    }

    // Send the recovery email via Postmark
    const postmarkToken = process.env.POSTMARK_SERVER_API_TOKEN;
    if (!postmarkToken) {
      console.error("Password reset: POSTMARK_SERVER_API_TOKEN not configured.");
      return NextResponse.json(
        { success: false, error: "E-Mail-Versand ist nicht konfiguriert." },
        { status: 500 }
      );
    }

    await sendPasswordResetEmail({
      serverApiToken: postmarkToken,
      toEmail: authUser.email,
      resetLink: actionLink,
      siteUrl,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in POST /api/admin/tenants/[id]/users/[userId]/reset-password:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
