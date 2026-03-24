import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteUserSchema } from "@/lib/validations";
import type { AppMetadata, ApiResponse } from "@/lib/types";

/**
 * POST /api/team/invite
 * Invite a new user to the current tenant.
 * Requires tenant_admin or platform_admin role.
 * Uses the service role key to call supabase.auth.admin.inviteUserByEmail().
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

    // 5. Use service role to invite the user
    const adminClient = createAdminClient();

    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        data: {
          tenant_id: appMetadata.tenant_id,
          role: role,
        },
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/invite/accept`,
      });

    if (inviteError) {
      // Handle duplicate user
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

    // Set app_metadata so getUser() returns tenant_id and role
    // (inviteUserByEmail `data` only sets user_metadata, not app_metadata)
    await adminClient.auth.admin.updateUserById(inviteData.user.id, {
      app_metadata: {
        tenant_id: appMetadata.tenant_id,
        role: role,
        user_status: "active",
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: { userId: inviteData.user.id, email },
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
