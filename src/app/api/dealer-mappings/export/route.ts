import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppMetadata } from "@/lib/types";

/**
 * GET /api/dealer-mappings/export?dealerId=XXX&mappingType=article_number
 *
 * Exports dealer data mappings as CSV download.
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse> {
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
    const tenantId = appMetadata?.tenant_id;

    if (role !== "tenant_admin" && role !== "platform_admin") {
      return NextResponse.json(
        { success: false, error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const dealerId = searchParams.get("dealerId");
    const mappingType = searchParams.get("mappingType");

    if (!dealerId) {
      return NextResponse.json(
        { success: false, error: "dealerId ist erforderlich." },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    let query = adminClient
      .from("dealer_data_mappings")
      .select("dealer_value, erp_value, conversion_factor, description, tenant_id")
      .eq("dealer_id", dealerId)
      .eq("active", true)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .order("mapping_type")
      .order("dealer_value")
      .limit(5000);

    if (mappingType) {
      query = query.eq("mapping_type", mappingType);
    }

    const { data: mappings, error: queryError } = await query;

    if (queryError) {
      console.error("Error exporting mappings:", queryError.message);
      return NextResponse.json(
        { success: false, error: "Export fehlgeschlagen." },
        { status: 500 }
      );
    }

    // Build CSV with semicolon separator
    const header = "dealer_value;erp_value;conversion_factor;description;source";
    const rows = (mappings ?? []).map((m) => {
      const source = m.tenant_id === null ? "global" : "tenant";
      const factor = m.conversion_factor != null ? String(m.conversion_factor) : "";
      const desc = ((m.description as string) ?? "").replace(/;/g, ",");
      return `${m.dealer_value};${m.erp_value};${factor};${desc};${source}`;
    });

    const csv = [header, ...rows].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="dealer-mappings-${dealerId.slice(0, 8)}.csv"`,
      },
    });
  } catch (error) {
    console.error("Unexpected error in GET /api/dealer-mappings/export:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
