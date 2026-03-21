import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppMetadata } from "@/lib/types";

/**
 * GET /api/articles/export
 *
 * Exports the full article catalog for the current tenant as a CSV download.
 * Uses semicolon separator and UTF-8 encoding with BOM (for Excel compatibility).
 */
export async function GET(
  _request: NextRequest
): Promise<NextResponse> {
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

    return await generateArticleExportCsv(tenantId);
  } catch (error) {
    console.error("Unexpected error in GET /api/articles/export:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * Shared export logic: generates a CSV string from article_catalog rows.
 */
export async function generateArticleExportCsv(
  tenantId: string
): Promise<NextResponse> {
  const adminClient = createAdminClient();

  const { data: articles, error: queryError } = await adminClient
    .from("article_catalog")
    .select("article_number, name, category, color, packaging, size1, size2, ref_no, gtin, keywords")
    .eq("tenant_id", tenantId)
    .order("article_number", { ascending: true })
    .limit(50000);

  if (queryError) {
    console.error("Error exporting articles:", queryError.message);
    return NextResponse.json(
      { success: false, error: "Export fehlgeschlagen." },
      { status: 500 }
    );
  }

  /** Escape a CSV field: wrap in quotes if it contains semicolons, quotes, or newlines. */
  const esc = (val: string | null): string => {
    if (val === null || val === undefined) return "";
    if (/[;"\n\r]/.test(val)) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const header = "Herst.-Art.-Nr.;Artikelbezeichnung;Kategorie;Farbe;Verpackungseinheit;Groesse 1;Groesse 2;Ref.-Nr.;GTIN;Suchbegriffe";
  const rows = (articles ?? []).map((a) =>
    [
      esc(a.article_number as string),
      esc(a.name as string),
      esc(a.category as string | null),
      esc(a.color as string | null),
      esc(a.packaging as string | null),
      esc(a.size1 as string | null),
      esc(a.size2 as string | null),
      esc(a.ref_no as string | null),
      esc(a.gtin as string | null),
      esc(a.keywords as string | null),
    ].join(";")
  );

  // UTF-8 BOM for Excel compatibility
  const bom = "\uFEFF";
  const csv = bom + [header, ...rows].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="artikelstamm.csv"`,
    },
  });
}
