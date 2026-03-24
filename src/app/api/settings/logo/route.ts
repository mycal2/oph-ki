import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppMetadata, ApiResponse } from "@/lib/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ALLOWED_LOGO_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/tenant-logos/`;

const updateLogoSchema = z.object({
  logo_url: z
    .string()
    .url("Ungültige Logo-URL.")
    .refine(
      (url) => url.startsWith(ALLOWED_LOGO_PREFIX),
      "Logo-URL muss aus dem Supabase-Storage stammen."
    )
    .nullable(),
});

/**
 * GET /api/settings/logo
 *
 * Returns the tenant's current logo_url.
 * Auth required: any authenticated user in an active tenant.
 */
export async function GET(): Promise<NextResponse<ApiResponse<{ logo_url: string | null }>>> {
  try {
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

    if (appMetadata?.user_status === "inactive") {
      return NextResponse.json(
        { success: false, error: "Ihr Konto ist deaktiviert." },
        { status: 403 }
      );
    }

    const tenantId = appMetadata?.tenant_id;
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: "Kein Mandant zugewiesen." },
        { status: 403 }
      );
    }

    const adminClient = createAdminClient();
    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .select("logo_url")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { success: false, error: "Mandant nicht gefunden." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { logo_url: (tenant.logo_url as string | null) ?? null },
    });
  } catch (error) {
    console.error("Error in GET /api/settings/logo:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/settings/logo
 *
 * Updates the tenant's logo_url. Tenant admin only.
 */
export async function PATCH(
  request: Request
): Promise<NextResponse<ApiResponse<{ logo_url: string | null }>>> {
  try {
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
    const role = appMetadata?.role;

    if (role !== "tenant_admin" && role !== "platform_admin") {
      return NextResponse.json(
        { success: false, error: "Keine Berechtigung. Nur Administratoren können das Logo ändern." },
        { status: 403 }
      );
    }

    const tenantId = appMetadata?.tenant_id;
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: "Kein Mandant zugewiesen." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = updateLogoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const { data: updated, error: updateError } = await adminClient
      .from("tenants")
      .update({ logo_url: parsed.data.logo_url })
      .eq("id", tenantId)
      .select("logo_url")
      .single();

    if (updateError) {
      console.error("Error updating tenant logo:", updateError.message);
      return NextResponse.json(
        { success: false, error: "Logo konnte nicht aktualisiert werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { logo_url: (updated.logo_url as string | null) ?? null },
    });
  } catch (error) {
    console.error("Error in PATCH /api/settings/logo:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
