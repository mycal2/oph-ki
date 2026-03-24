import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseCustomerFile } from "@/lib/customer-import";
import type { AppMetadata, ApiResponse, CustomerImportResult } from "@/lib/types";

/** Batch size for upsert calls to avoid timeouts on large imports. */
const UPSERT_BATCH_SIZE = 500;

/**
 * POST /api/customers/import
 *
 * Accepts FormData with a file field containing a CSV or Excel file.
 * Parses the file, validates rows, and upserts customers into the tenant's catalog.
 * Duplicate customer_numbers within the same tenant are updated (upsert).
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<CustomerImportResult>>> {
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

    return await processCustomerImport(request, tenantId);
  } catch (error) {
    console.error("Unexpected error in POST /api/customers/import:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * Shared import logic used by both tenant and admin import endpoints.
 */
export async function processCustomerImport(
  request: NextRequest,
  tenantId: string
): Promise<NextResponse<ApiResponse<CustomerImportResult>>> {
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

  // Validate file size (max 10 MB for customer imports)
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { success: false, error: "Datei ist zu gross. Maximum: 10 MB." },
      { status: 400 }
    );
  }

  // Read file buffer and parse
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const { rows, errors } = parseCustomerFile(buffer, file.name);

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

  const adminClient = createAdminClient();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  // Process in batches of UPSERT_BATCH_SIZE
  for (let batchStart = 0; batchStart < rows.length; batchStart += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(batchStart, batchStart + UPSERT_BATCH_SIZE);

    const upsertData = batch.map((row) => ({
      tenant_id: tenantId,
      customer_number: row.customer_number,
      company_name: row.company_name,
      street: row.street,
      postal_code: row.postal_code,
      city: row.city,
      country: row.country,
      email: row.email,
      phone: row.phone,
      keywords: row.keywords,
      notes: row.notes,
    }));

    // Use upsert with the unique constraint to handle duplicates
    const { data: upsertResult, error: upsertError } = await adminClient
      .from("customer_catalog")
      .upsert(upsertData, {
        onConflict: "tenant_id,customer_number",
        ignoreDuplicates: false,
      })
      .select("id, created_at, updated_at");

    if (upsertError) {
      console.error("Error upserting customers batch:", upsertError.message);
      errors.push(`Batch-Fehler ab Zeile ${batchStart + 2}: ${upsertError.message}`);
      skipped += batch.length;
      continue;
    }

    // Count created vs updated: if created_at === updated_at, it was newly created
    for (const row of upsertResult ?? []) {
      const createdAt = new Date(row.created_at as string).getTime();
      const updatedAt = new Date(row.updated_at as string).getTime();
      // Allow 1 second tolerance for timestamp comparison
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
      skipped,
      errors,
    },
  });
}
