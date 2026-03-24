import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppMetadata } from "@/lib/types";

/**
 * GET /api/customers/export
 *
 * Exports the full customer catalog for the current tenant as a CSV download.
 * Uses semicolon separator and UTF-8 encoding with BOM (for Excel compatibility).
 */
export async function GET(
  _request: NextRequest
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

    const tenantId = appMetadata?.tenant_id;
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: "Kein Mandant zugewiesen." },
        { status: 403 }
      );
    }

    // Fetch tenant name for the export filename
    const adminClient = createAdminClient();
    const { data: tenant } = await adminClient
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .single();

    return await generateCustomerExportCsv(tenantId, tenant?.name ?? undefined);
  } catch (error) {
    console.error("Unexpected error in GET /api/customers/export:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * Shared export logic: generates a CSV string from customer_catalog rows.
 */
export async function generateCustomerExportCsv(
  tenantId: string,
  tenantName?: string
): Promise<NextResponse> {
  const adminClient = createAdminClient();

  const { data: customers, error: queryError } = await adminClient
    .from("customer_catalog")
    .select("customer_number, company_name, street, postal_code, city, country, email, phone, keywords, notes")
    .eq("tenant_id", tenantId)
    .order("customer_number", { ascending: true })
    .limit(50000);

  if (queryError) {
    console.error("Error exporting customers:", queryError.message);
    return NextResponse.json(
      { success: false, error: "Export fehlgeschlagen." },
      { status: 500 }
    );
  }

  /** Escape a CSV field: wrap in quotes if it contains semicolons, quotes, or newlines. */
  const esc = (val: string | null): string => {
    if (val === null || val === undefined) return "";
    if (/[;"\n\r]/.test(val)) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const header = "Kundennummer;Firma;Strasse;PLZ;Stadt;Land;E-Mail;Telefon;Suchbegriffe;Notizen";
  const rows = (customers ?? []).map((c) =>
    [
      esc(c.customer_number as string),
      esc(c.company_name as string),
      esc(c.street as string | null),
      esc(c.postal_code as string | null),
      esc(c.city as string | null),
      esc(c.country as string | null),
      esc(c.email as string | null),
      esc(c.phone as string | null),
      esc(c.keywords as string | null),
      esc(c.notes as string | null),
    ].join(";")
  );

  // UTF-8 BOM for Excel compatibility
  const bom = "\uFEFF";
  const csv = bom + [header, ...rows].join("\n");

  // Build filename: kundenstamm-{tenantName}-{date}.csv
  const datePart = new Date().toISOString().slice(0, 10);
  const namePart = tenantName
    ? `-${tenantName.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50)}`
    : "";
  const exportFilename = `kundenstamm${namePart}-${datePart}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename}"`,
    },
  });
}
