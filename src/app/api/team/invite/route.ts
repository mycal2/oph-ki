import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteUserSchema } from "@/lib/validations";
import { sendInviteEmail } from "@/lib/postmark";
import type { AppMetadata, ApiResponse } from "@/lib/types";

/**
 * POST /api/team/invite
 * Invite a new user to the current tenant.
 * Requires tenant_admin or platform_admin role.
 * Uses generateLink (no Supabase email) + Postmark for reliable delivery.
 */
export async function POST(
  request: Request
): Promise<NextResponse<ApiResponse<{ userId: string; email: string } | undefined>>> {
  try {
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

    // 2. Check role from JWT app_metadata
    const appMetadata = user.app_metadata as AppMetadata | undefined;

    // Block deactivated users or tenants (JWT may still be valid after deactivation)
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
          error: "Keine Berechtigung. Nur Administratoren können Benutzer einladen.",
        },
        { status: 403 }
      );
    }

    // 3. Check that the tenant is active for invites
    if (appMetadata.tenant_status !== "active" && appMetadata.tenant_status !== "trial") {
      return NextResponse.json(
        {
          success: false,
          error: "Mandant ist deaktiviert. Einladungen sind nicht möglich.",
        },
        { status: 403 }
      );
    }

    // 4. Validate input with Zod
    const body = await request.json();
    const parsed = inviteUserSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungültige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const { email, role } = parsed.data;
    const tenantId = appMetadata.tenant_id;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    // 5. Use service role to generate invite link (does NOT send Supabase email)
    const adminClient = createAdminClient();

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
          {
            success: false,
            error: "Diese E-Mail-Adresse ist bereits registriert.",
          },
          { status: 409 }
        );
      }

      console.error("Invite error:", inviteError.message);
      return NextResponse.json(
        {
          success: false,
          error: "Einladung konnte nicht gesendet werden. Bitte versuchen Sie es erneut.",
        },
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

    // Fetch tenant name for the email
    const { data: tenant } = await adminClient
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .single();

    const tenantName = (tenant?.name as string) ?? "Ihr Unternehmen";

    const postmarkToken = process.env.POSTMARK_SERVER_API_TOKEN;
    if (postmarkToken) {
      await sendInviteEmail({
        serverApiToken: postmarkToken,
        toEmail: email,
        inviteLink: actionLink,
        tenantName,
        siteUrl,
      });
    } else {
      console.warn("POSTMARK_SERVER_API_TOKEN not configured — invite email not sent.");
    }

    return NextResponse.json(
      {
        success: true,
        data: { userId: invitedUserId, email },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Unexpected error in invite route:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
