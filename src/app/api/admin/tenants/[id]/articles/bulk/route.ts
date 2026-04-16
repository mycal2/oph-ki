import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin, isErrorResponse } from "@/lib/admin-auth";
import type { ApiResponse } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bulkDeleteSchema = z.object({
  ids: z
    .array(z.string().regex(UUID_REGEX, "Ungueltige Artikel-ID."))
    .min(1, "Mindestens eine Artikel-ID erforderlich.")
    .max(10000, "Maximal 10.000 Artikel auf einmal."),
});

/**
 * DELETE /api/admin/tenants/[id]/articles/bulk
 *
 * Platform admin: bulk-deletes articles for a specific tenant.
 * Body: { ids: string[] }
 * Returns: { success: true, data: { deleted: number } }
 */
export async function DELETE(
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

    const body = await request.json();
    const parsed = bulkDeleteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Ungueltige Eingabe." },
        { status: 400 }
      );
    }

    // Delete articles that belong to this tenant only
    const { data: deletedRows, error: deleteError } = await adminClient
      .from("article_catalog")
      .delete()
      .in("id", parsed.data.ids)
      .eq("tenant_id", tenantId)
      .select("id");

    if (deleteError) {
      console.error("Error bulk-deleting articles for admin:", deleteError.message);
      return NextResponse.json(
        { success: false, error: "Artikel konnten nicht geloescht werden." },
        { status: 500 }
      );
    }

    const deleted = deletedRows?.length ?? 0;

    return NextResponse.json({
      success: true,
      data: { deleted },
    });
  } catch (error) {
    console.error("Unexpected error in DELETE /api/admin/tenants/[id]/articles/bulk:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
