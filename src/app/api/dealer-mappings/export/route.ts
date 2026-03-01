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
    /** Escape a CSV field: wrap in quotes if it contains semicolons, quotes, or newlines. */
    const esc = (val: string): string => {
      if (/[;\"\n\r]/.test(val)) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const header = "dealer_value;erp_value;conversion_factor;description;source";
    const rows = (mappings ?? []).map((m) => {
      const source = m.tenant_id === null ? "global" : "tenant";
      const factor = m.conversion_factor != null ? String(m.conversion_factor) : "";
      const desc = (m.description as string) ?? "";
      return `${esc(m.dealer_value as string)};${esc(m.erp_value as string)};${factor};${esc(desc)};${source}`;
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
