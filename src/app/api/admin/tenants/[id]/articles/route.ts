import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse } from "@/lib/admin-auth";
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
