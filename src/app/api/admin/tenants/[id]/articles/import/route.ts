import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse } from "@/lib/admin-auth";
import { parseArticleFile } from "@/lib/article-import";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Batch size for upsert calls to avoid timeouts on large imports. */
const UPSERT_BATCH_SIZE = 500;

/**
 * POST /api/admin/tenants/[id]/articles/import
 *
 * Platform admin: bulk import articles for a specific tenant.
 * Accepts FormData with a file field containing a CSV or Excel file.
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

    // Parse FormData
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { success: false, error: "Ungueltige FormData. Bitte eine Datei hochladen." },
        { status: 400 }
      );
    }

    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { success: false, error: "Keine Datei hochgeladen. Feld 'file' ist erforderlich." },
        { status: 400 }
      );
    }

    // Validate file extension
    const filename = file.name.toLowerCase();
    if (!filename.endsWith(".csv") && !filename.endsWith(".xlsx") && !filename.endsWith(".xls")) {
      return NextResponse.json(
        { success: false, error: "Nur CSV- und Excel-Dateien (.csv, .xlsx, .xls) sind erlaubt." },
        { status: 400 }
      );
    }

    // Validate file size (max 10 MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "Datei ist zu gross. Maximum: 10 MB." },
        { status: 400 }
      );
    }

    // Read file buffer and parse
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const { rows, errors } = parseArticleFile(buffer, file.name);

    // EC-1: No valid rows
    if (rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: errors.length > 0
            ? `Keine gueltigen Zeilen gefunden. ${errors[0]}`
            : "Keine gueltigen Zeilen in der Datei gefunden.",
        },
        { status: 400 }
      );
    }

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let skipped = 0;

    const normStr = (v: unknown): string | null => {
      if (v === null || v === undefined || v === "") return null;
      return String(v);
    };
    const normNum = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };

    // Process in batches
    for (let batchStart = 0; batchStart < rows.length; batchStart += UPSERT_BATCH_SIZE) {
      const batch = rows.slice(batchStart, batchStart + UPSERT_BATCH_SIZE);

      const articleNumbers = batch.map((r) => r.article_number);
      const { data: existing, error: fetchError } = await adminClient
        .from("article_catalog")
        .select("article_number, name, category, color, packaging, size1, size2, ref_no, gtin, keywords, rrp")
        .eq("tenant_id", tenantId)
        .in("article_number", articleNumbers);

      if (fetchError) {
        console.error("Error fetching existing articles batch (admin):", fetchError.message);
        errors.push(`Batch-Fehler ab Zeile ${batchStart + 2}: ${fetchError.message}`);
        skipped += batch.length;
        continue;
      }

      const existingMap = new Map<string, Record<string, unknown>>();
      for (const e of existing ?? []) {
        existingMap.set(e.article_number as string, e);
      }

      const toUpsert: typeof batch = [];
      for (const row of batch) {
        const ex = existingMap.get(row.article_number);
        if (!ex) {
          toUpsert.push(row);
          continue;
        }
        const same =
          normStr(ex.name) === normStr(row.name) &&
          normStr(ex.category) === normStr(row.category) &&
          normStr(ex.color) === normStr(row.color) &&
          normStr(ex.packaging) === normStr(row.packaging) &&
          normStr(ex.size1) === normStr(row.size1) &&
          normStr(ex.size2) === normStr(row.size2) &&
          normStr(ex.ref_no) === normStr(row.ref_no) &&
          normStr(ex.gtin) === normStr(row.gtin) &&
          normStr(ex.keywords) === normStr(row.keywords) &&
          normNum(ex.rrp) === normNum(row.rrp);
        if (same) {
          unchanged++;
        } else {
          toUpsert.push(row);
        }
      }

      if (toUpsert.length === 0) continue;

      const upsertData = toUpsert.map((row) => ({
        tenant_id: tenantId,
        article_number: row.article_number,
        name: row.name,
        category: row.category,
        color: row.color,
        packaging: row.packaging,
        size1: row.size1,
        size2: row.size2,
        ref_no: row.ref_no,
        gtin: row.gtin,
        keywords: row.keywords,
        // OPH-105: optional UVP (recommended retail price); null when column absent
        rrp: row.rrp,
      }));

      const { data: upsertResult, error: upsertError } = await adminClient
        .from("article_catalog")
        .upsert(upsertData, {
          onConflict: "tenant_id,article_number",
          ignoreDuplicates: false,
        })
        .select("id, created_at, updated_at");

      if (upsertError) {
        console.error("Error upserting articles batch (admin):", upsertError.message);
        errors.push(`Batch-Fehler ab Zeile ${batchStart + 2}: ${upsertError.message}`);
        skipped += toUpsert.length;
        continue;
      }

      for (const row of upsertResult ?? []) {
        const createdAt = new Date(row.created_at as string).getTime();
        const updatedAt = new Date(row.updated_at as string).getTime();
        if (Math.abs(updatedAt - createdAt) < 1000) {
          created++;
        } else {
          updated++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        created,
        updated,
        unchanged,
        skipped,
        errors,
      },
    });
  } catch (error) {
    console.error("Unexpected error in POST /api/admin/tenants/[id]/articles/import:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
