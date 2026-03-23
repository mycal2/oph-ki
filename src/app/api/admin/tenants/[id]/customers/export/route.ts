import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse } from "@/lib/admin-auth";
import { generateCustomerExportCsv } from "@/app/api/customers/export/route";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/tenants/[id]/customers/export
 *
 * Platform admin: exports the full customer catalog for a specific tenant as CSV.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: tenantId } = await params;

    if (!UUID_REGEX.test(tenantId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Mandanten-ID." },
        { status: 400 }
      );
    }

    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { adminClient } = auth;

    // Verify the tenant exists and get its name for the filename
    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .select("id, name")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { success: false, error: "Mandant nicht gefunden." },
        { status: 404 }
      );
    }

    return await generateCustomerExportCsv(tenantId, (tenant.name as string) ?? undefined);
  } catch (error) {
    console.error("Unexpected error in GET /api/admin/tenants/[id]/customers/export:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
