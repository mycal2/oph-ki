import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse } from "@/lib/admin-auth";
import { createArticleSchema } from "@/lib/validations";
import type { ArticleCatalogItem } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/tenants/[id]/articles?page=1&pageSize=50&search=...
 *
 * Platform admin: returns a paginated list of articles for a specific tenant.
 */
export async function GET(
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

    // Parse query params
    const url = new URL(request.url);
    const pageParam = parseInt(url.searchParams.get("page") ?? "1", 10);
    const pageSizeParam = parseInt(url.searchParams.get("pageSize") ?? "50", 10);
    const page = Math.max(1, pageParam);
    const pageSize = Math.min(Math.max(1, pageSizeParam), 200);
    const offset = (page - 1) * pageSize;
    const search = url.searchParams.get("search")?.trim() ?? "";

    // Build query
    let query = adminClient
      .from("article_catalog")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("article_number", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (search.length > 0) {
      const escaped = search.replace(/%/g, "\\%").replace(/_/g, "\\_");
      query = query.or(
        `article_number.ilike.%${escaped}%,name.ilike.%${escaped}%,keywords.ilike.%${escaped}%`
      );
    }

    const { data: articles, count, error: queryError } = await query;

    if (queryError) {
      console.error("Error fetching articles for admin:", queryError.message);
      return NextResponse.json(
        { success: false, error: "Artikelstamm konnte nicht geladen werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        articles: (articles ?? []) as unknown as ArticleCatalogItem[],
        total: count ?? 0,
        page,
        pageSize,
      },
    });
  } catch (error) {
    console.error("Unexpected error in GET /api/admin/tenants/[id]/articles:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/tenants/[id]/articles
 *
 * Platform admin: creates a single article for a specific tenant.
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

    // Verify tenant exists
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

    const body = await request.json();
    const parsed = createArticleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Ungueltige Eingabe." },
        { status: 400 }
      );
    }

    const { data: newArticle, error: insertError } = await adminClient
      .from("article_catalog")
      .insert({
        tenant_id: tenantId,
        article_number: parsed.data.article_number,
        name: parsed.data.name,
        category: parsed.data.category ?? null,
        color: parsed.data.color ?? null,
        packaging: parsed.data.packaging ?? null,
        size1: parsed.data.size1 ?? null,
        size2: parsed.data.size2 ?? null,
        ref_no: parsed.data.ref_no ?? null,
        gtin: parsed.data.gtin ?? null,
        keywords: parsed.data.keywords ?? null,
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json(
          { success: false, error: "Artikel-Nr. bereits vorhanden." },
          { status: 409 }
        );
      }
      console.error("Error creating article for admin:", insertError.message);
      return NextResponse.json(
        { success: false, error: "Artikel konnte nicht erstellt werden." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, data: { id: newArticle.id as string } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Unexpected error in POST /api/admin/tenants/[id]/articles:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/tenants/[id]/articles
 *
 * Platform admin: deletes ALL articles for a specific tenant (full catalog reset).
 * Returns: { success: true, data: { deleted: number } }
 */
export async function DELETE(
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

    // Verify tenant exists
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

    // Check current count to guard against empty catalog
    const { count, error: countError } = await adminClient
      .from("article_catalog")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    if (countError) {
      console.error("Error counting articles for reset:", countError.message);
      return NextResponse.json(
        { success: false, error: "Artikelstamm konnte nicht geprueft werden." },
        { status: 500 }
      );
    }

    if ((count ?? 0) === 0) {
      return NextResponse.json(
        { success: false, error: "Der Artikelstamm ist bereits leer." },
        { status: 400 }
      );
    }

    // Delete all articles for this tenant
    const { data: deletedRows, error: deleteError } = await adminClient
      .from("article_catalog")
      .delete()
      .eq("tenant_id", tenantId)
      .select("id");

    if (deleteError) {
      console.error("Error resetting article catalog:", deleteError.message);
      return NextResponse.json(
        { success: false, error: "Artikelstamm konnte nicht geloescht werden." },
        { status: 500 }
      );
    }

    const deleted = deletedRows?.length ?? 0;

    return NextResponse.json({
      success: true,
      data: { deleted },
    });
  } catch (error) {
    console.error("Unexpected error in DELETE /api/admin/tenants/[id]/articles:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
