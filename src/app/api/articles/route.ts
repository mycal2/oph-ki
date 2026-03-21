import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createArticleSchema } from "@/lib/validations";
import type {
  AppMetadata,
  ApiResponse,
  ArticleCatalogItem,
  ArticleCatalogPageResponse,
} from "@/lib/types";

/**
 * GET /api/articles?page=1&pageSize=50&search=...
 *
 * Returns a paginated list of articles for the current user's tenant.
 * Supports text search across article_number, name, and keywords.
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResponse<ArticleCatalogPageResponse>>> {
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

    // Parse query params
    const url = new URL(request.url);
    const pageParam = parseInt(url.searchParams.get("page") ?? "1", 10);
    const pageSizeParam = parseInt(url.searchParams.get("pageSize") ?? "50", 10);
    const page = Math.max(1, pageParam);
    const pageSize = Math.min(Math.max(1, pageSizeParam), 200);
    const offset = (page - 1) * pageSize;
    const search = url.searchParams.get("search")?.trim() ?? "";

    const adminClient = createAdminClient();

    // Build query
    let query = adminClient
      .from("article_catalog")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("article_number", { ascending: true })
      .range(offset, offset + pageSize - 1);

    // Apply text search if provided
    if (search.length > 0) {
      const escaped = search.replace(/%/g, "\\%").replace(/_/g, "\\_");
      query = query.or(
        `article_number.ilike.%${escaped}%,name.ilike.%${escaped}%,keywords.ilike.%${escaped}%`
      );
    }

    const { data: articles, count, error: queryError } = await query;

    if (queryError) {
      console.error("Error fetching articles:", queryError.message);
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
    console.error("Unexpected error in GET /api/articles:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/articles
 *
 * Creates a single article in the tenant's catalog.
 * Returns 409 if article_number already exists for this tenant.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ id: string }>>> {
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
    const parsed = createArticleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Ungueltige Eingabe." },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    const { data: newArticle, error: insertError } = await adminClient
      .from("article_catalog")
      .insert({
        tenant_id: tenantId,
        article_number: parsed.data.article_number,
        name: parsed.data.name,
        category: parsed.data.category ?? null,
        color: parsed.data.color ?? null,
        packaging: parsed.data.packaging ?? null,
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
      console.error("Error creating article:", insertError.message);
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
    console.error("Unexpected error in POST /api/articles:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
