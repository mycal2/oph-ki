import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dataRetentionSchema } from "@/lib/validations";
import type { AppMetadata, ApiResponse, DataRetentionSettings } from "@/lib/types";

/**
 * GET /api/settings/data-retention
 *
 * Returns the tenant's data retention period in days.
 * Auth required: any authenticated user in an active tenant.
 */
export async function GET(): Promise<NextResponse<ApiResponse<DataRetentionSettings>>> {
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

    const tenantId = appMetadata?.tenant_id;
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: "Kein Mandant zugewiesen." },
        { status: 403 }
      );
    }

    // 2. Fetch tenant's data retention setting
    const adminClient = createAdminClient();
    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .select("data_retention_days")
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
      data: { dataRetentionDays: tenant.data_retention_days as number },
    });
  } catch (error) {
    console.error("Error in GET /api/settings/data-retention:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/settings/data-retention
 *
 * Updates the tenant's data retention period.
 * Auth required: tenant_admin or platform_admin only.
 */
export async function PATCH(
  request: Request
): Promise<NextResponse<ApiResponse<DataRetentionSettings>>> {
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

    const tenantId = appMetadata?.tenant_id;
    const role = appMetadata?.role;

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: "Kein Mandant zugewiesen." },
        { status: 403 }
      );
    }

    // 2. Authorize: tenant_admin or platform_admin only
    if (role !== "tenant_admin" && role !== "platform_admin") {
      return NextResponse.json(
        { success: false, error: "Nur Administratoren können die Aufbewahrungsdauer ändern." },
        { status: 403 }
      );
    }

    // 3. Validate request body
    const body = await request.json();
    const parseResult = dataRetentionSchema.safeParse(body);

    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]?.message ?? "Ungültige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const { dataRetentionDays } = parseResult.data;

    // 4. Update tenant's data retention setting
    const adminClient = createAdminClient();
    const { data: updated, error: updateError } = await adminClient
      .from("tenants")
      .update({ data_retention_days: dataRetentionDays })
      .eq("id", tenantId)
      .select("data_retention_days")
      .single();

    if (updateError || !updated) {
      console.error("Failed to update data retention days:", updateError?.message);
      return NextResponse.json(
        { success: false, error: "Aufbewahrungsdauer konnte nicht aktualisiert werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { dataRetentionDays: updated.data_retention_days as number },
    });
  } catch (error) {
    console.error("Error in PATCH /api/settings/data-retention:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
