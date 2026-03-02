import { NextResponse } from "next/server";
import { requirePlatformAdmin, isErrorResponse } from "@/lib/admin-auth";

/**
 * GET /api/admin/tenants/export
 *
 * Exports all tenants as a CSV file (metadata only: name, slug, status, erp_type, contact_email, created_at).
 * Platform admin only. Limited to 1000 tenants.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { adminClient } = auth;

    const { data: tenants, error } = await adminClient
      .from("tenants")
      .select("name, slug, status, erp_type, contact_email, created_at")
      .order("name", { ascending: true })
      .limit(1000);

    if (error) {
      console.error("Error fetching tenants for export:", error.message);
      return NextResponse.json(
        { success: false, error: "Export fehlgeschlagen." },
        { status: 500 }
      );
    }

    // Build CSV
    const headers = ["Name", "Slug", "Status", "ERP-Typ", "Kontakt-E-Mail", "Erstellt am"];
    const rows = (tenants ?? []).map((t) => [
      escapeCsvField(t.name as string),
      escapeCsvField(t.slug as string),
      escapeCsvField(t.status as string),
      escapeCsvField(t.erp_type as string),
      escapeCsvField(t.contact_email as string),
      escapeCsvField(t.created_at as string),
    ]);

    const csvContent = [
      headers.join(";"),
      ...rows.map((row) => row.join(";")),
    ].join("\r\n");

    // Add BOM for Excel UTF-8 compatibility
    const bom = "\uFEFF";
    const csvWithBom = bom + csvContent;

    const filename = `mandanten-export-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csvWithBom, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/admin/tenants/export:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/** Escapes a CSV field value (wraps in quotes if it contains separator, quotes, or newlines). */
function escapeCsvField(value: string): string {
  if (value.includes(";") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
