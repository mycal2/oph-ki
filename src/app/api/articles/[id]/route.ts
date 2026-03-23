import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateArticleSchema } from "@/lib/validations";
import type { AppMetadata, ApiResponse } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PUT /api/articles/[id]
 *
 * Updates a single article in the tenant's catalog.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id } = await params;

    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Artikel-ID." },
        { status: 400 }
      );
    }

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
    const parsed = updateArticleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Ungueltige Eingabe." },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Verify the article belongs to this tenant
    const { data: existing, error: fetchError } = await adminClient
      .from("article_catalog")
      .select("id, tenant_id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { success: false, error: "Artikel nicht gefunden." },
        { status: 404 }
      );
    }

    if (existing.tenant_id !== tenantId) {
      return NextResponse.json(
        { success: false, error: "Keine Berechtigung fuer diesen Artikel." },
        { status: 403 }
      );
    }

    // Build update data from parsed fields (only include provided fields)
    const updateData: Record<string, unknown> = {};
    const fields = parsed.data;
    if (fields.article_number !== undefined) updateData.article_number = fields.article_number;
    if (fields.name !== undefined) updateData.name = fields.name;
    if (fields.category !== undefined) updateData.category = fields.category;
    if (fields.color !== undefined) updateData.color = fields.color;
    if (fields.packaging !== undefined) updateData.packaging = fields.packaging;
    if (fields.size1 !== undefined) updateData.size1 = fields.size1;
    if (fields.size2 !== undefined) updateData.size2 = fields.size2;
    if (fields.ref_no !== undefined) updateData.ref_no = fields.ref_no;
    if (fields.gtin !== undefined) updateData.gtin = fields.gtin;
    if (fields.keywords !== undefined) updateData.keywords = fields.keywords;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: "Keine Felder zum Aktualisieren angegeben." },
        { status: 400 }
      );
    }

    const { error: updateError } = await adminClient
      .from("article_catalog")
      .update(updateData)
      .eq("id", id);

    if (updateError) {
      if (updateError.code === "23505") {
        return NextResponse.json(
          { success: false, error: "Artikel-Nr. bereits vorhanden." },
          { status: 409 }
        );
      }
      console.error("Error updating article:", updateError.message);
      return NextResponse.json(
        { success: false, error: "Artikel konnte nicht aktualisiert werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error in PUT /api/articles/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/articles/[id]
 *
 * Hard-deletes an article from the tenant's catalog.
 * Past orders are not affected (data is denormalized on extraction).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id } = await params;

    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Artikel-ID." },
        { status: 400 }
      );
    }

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

    const adminClient = createAdminClient();

    // Verify the article belongs to this tenant
    const { data: existing, error: fetchError } = await adminClient
      .from("article_catalog")
      .select("id, tenant_id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { success: false, error: "Artikel nicht gefunden." },
        { status: 404 }
      );
    }

    if (existing.tenant_id !== tenantId) {
      return NextResponse.json(
        { success: false, error: "Keine Berechtigung fuer diesen Artikel." },
        { status: 403 }
      );
    }

    const { error: deleteError } = await adminClient
      .from("article_catalog")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("Error deleting article:", deleteError.message);
      return NextResponse.json(
        { success: false, error: "Artikel konnte nicht geloescht werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error in DELETE /api/articles/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
