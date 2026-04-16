import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppMetadata, ApiResponse } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bulkDeleteSchema = z.object({
  ids: z
    .array(z.string().regex(UUID_REGEX, "Ungueltige Artikel-ID."))
    .min(1, "Mindestens eine Artikel-ID erforderlich.")
    .max(10000, "Maximal 10.000 Artikel auf einmal."),
});

/**
 * DELETE /api/articles/bulk
 *
 * Bulk-deletes articles from the current tenant's catalog.
 * Body: { ids: string[] }
 * Returns: { success: true, data: { deleted: number } }
 */
export async function DELETE(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ deleted: number }>>> {
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
    if (role !== "tenant_admin" && role !== "platform_admin") {
      return NextResponse.json(
        { success: false, error: "Keine Berechtigung." },
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
    const parsed = bulkDeleteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Ungueltige Eingabe." },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Delete articles that belong to this tenant only (tenant_id filter ensures isolation)
    const { data: deletedRows, error: deleteError } = await adminClient
      .from("article_catalog")
      .delete()
      .in("id", parsed.data.ids)
      .eq("tenant_id", tenantId)
      .select("id");

    if (deleteError) {
      console.error("Error bulk-deleting articles:", deleteError.message);
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
    console.error("Unexpected error in DELETE /api/articles/bulk:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
