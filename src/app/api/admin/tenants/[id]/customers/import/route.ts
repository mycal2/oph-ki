import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse } from "@/lib/admin-auth";
import { processCustomerImport } from "@/app/api/customers/import/route";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/tenants/[id]/customers/import
 *
 * Platform admin: bulk import customers for a specific tenant.
 * Delegates to the shared processCustomerImport() function.
 */
export async function POST(
  request: NextRequest,
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

    // Verify the tenant exists
    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .select("id")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { success: false, error: "Mandant nicht gefunden." },
        { status: 404 }
      );
    }

    return await processCustomerImport(request, tenantId);
  } catch (error) {
    console.error("Unexpected error in POST /api/admin/tenants/[id]/customers/import:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
