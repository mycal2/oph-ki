import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse } from "@/lib/admin-auth";
import { updateArticleSchema } from "@/lib/validations";
import type { ApiResponse } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PUT /api/admin/tenants/[id]/articles/[articleId]
 *
 * Platform admin: updates a single article for a specific tenant.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; articleId: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id: tenantId, articleId } = await params;

    if (!UUID_REGEX.test(tenantId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Mandanten-ID." },
        { status: 400 }
      );
    }

    if (!UUID_REGEX.test(articleId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Artikel-ID." },
        { status: 400 }
      );
    }

    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { adminClient } = auth;

    // Verify the article exists and belongs to this tenant
    const { data: existing, error: fetchError } = await adminClient
      .from("article_catalog")
      .select("id, tenant_id")
      .eq("id", articleId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { success: false, error: "Artikel nicht gefunden." },
        { status: 404 }
      );
    }

    if (existing.tenant_id !== tenantId) {
      return NextResponse.json(
        { success: false, error: "Artikel gehoert nicht zu diesem Mandanten." },
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
      .eq("id", articleId);

    if (updateError) {
      if (updateError.code === "23505") {
        return NextResponse.json(
          { success: false, error: "Artikel-Nr. bereits vorhanden." },
          { status: 409 }
        );
      }
      console.error("Error updating article for admin:", updateError.message);
      return NextResponse.json(
        { success: false, error: "Artikel konnte nicht aktualisiert werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error in PUT /api/admin/tenants/[id]/articles/[articleId]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/tenants/[id]/articles/[articleId]
 *
 * Platform admin: deletes a single article for a specific tenant.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; articleId: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id: tenantId, articleId } = await params;

    if (!UUID_REGEX.test(tenantId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Mandanten-ID." },
        { status: 400 }
      );
    }

    if (!UUID_REGEX.test(articleId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Artikel-ID." },
        { status: 400 }
      );
    }

    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { adminClient } = auth;

    // Verify the article exists and belongs to this tenant
    const { data: existing, error: fetchError } = await adminClient
      .from("article_catalog")
      .select("id, tenant_id")
      .eq("id", articleId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { success: false, error: "Artikel nicht gefunden." },
        { status: 404 }
      );
    }

    if (existing.tenant_id !== tenantId) {
      return NextResponse.json(
        { success: false, error: "Artikel gehoert nicht zu diesem Mandanten." },
        { status: 403 }
      );
    }

    const { error: deleteError } = await adminClient
      .from("article_catalog")
      .delete()
      .eq("id", articleId);

    if (deleteError) {
      console.error("Error deleting article for admin:", deleteError.message);
      return NextResponse.json(
        { success: false, error: "Artikel konnte nicht geloescht werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error in DELETE /api/admin/tenants/[id]/articles/[articleId]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
