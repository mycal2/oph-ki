import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppMetadata, ApiResponse } from "@/lib/types";

interface ExcelSheetFilterResponse {
  excel_sheet_name: string | null;
}

/**
 * GET /api/settings/excel-sheet-filter
 *
 * Returns the tenant's configured Excel sheet name filter (OPH-94).
 * Read-only for all authenticated tenant users (including tenant_admin).
 * Platform admins edit this via PATCH /api/admin/tenants/[id].
 */
export async function GET(): Promise<NextResponse<ApiResponse<ExcelSheetFilterResponse>>> {
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
      .select("excel_sheet_name")
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
      data: {
        excel_sheet_name: (tenant.excel_sheet_name as string) ?? null,
      },
    });
  } catch (error) {
    console.error("Error in excel-sheet-filter settings:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
