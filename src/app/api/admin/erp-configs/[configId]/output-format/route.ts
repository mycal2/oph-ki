import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";
import {
  parseOutputFormatSample,
  detectFileType,
  MAX_FILE_SIZE,
} from "@/lib/output-format-parser";
import { calculateConfidenceScore } from "@/lib/confidence-score";
import type {
  ApiResponse,
  TenantOutputFormat,
  ErpColumnMappingExtended,
  CanonicalOrderData,
  OutputFormatSchemaColumn,
} from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/erp-configs/[configId]/output-format
 *
 * OPH-29: Returns the output format assigned to this ERP config.
 * Returns 404 if none is assigned.
 * Platform admin only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ configId: string }> }
): Promise<NextResponse> {
  try {
    const { configId } = await params;
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitError = checkAdminRateLimit(user.id);
    if (rateLimitError) return rateLimitError;

    if (!UUID_REGEX.test(configId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Konfigurations-ID." },
        { status: 400 }
      );
    }

    const { data, error } = await adminClient
      .from("tenant_output_formats")
      .select("*")
      .eq("erp_config_id", configId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching output format:", error);
      return NextResponse.json(
        { success: false, error: "Fehler beim Laden des Output-Formats." },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: "Kein Output-Format zugewiesen." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: data as TenantOutputFormat });
  } catch (error) {
    console.error("Error in GET /api/admin/erp-configs/[configId]/output-format:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/erp-configs/[configId]/output-format
 *
 * OPH-29: Saves a sample output format for an ERP config.
 * Platform admin only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ configId: string }> }
): Promise<NextResponse> {
  try {
    const { configId } = await params;
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitError = checkAdminRateLimit(user.id);
    if (rateLimitError) return rateLimitError;

    if (!UUID_REGEX.test(configId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Konfigurations-ID." },
        { status: 400 }
      );
    }

    // Verify config exists
    const { data: config, error: configError } = await adminClient
      .from("erp_configs")
      .select("id, column_mappings")
      .eq("id", configId)
      .single();

    if (configError || !config) {
      return NextResponse.json(
        { success: false, error: "ERP-Konfiguration nicht gefunden." },
        { status: 404 }
      );
    }

    // Parse multipart form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { success: false, error: "Ungueltige Anfrage. Bitte senden Sie eine Datei." },
        { status: 400 }
      );
    }

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Keine Datei hochgeladen." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "Datei ist zu gross. Maximal 10 MB erlaubt." },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { success: false, error: "Die hochgeladene Datei ist leer." },
        { status: 400 }
      );
    }

    const fileType = detectFileType(file.type, file.name);
    if (!fileType) {
      return NextResponse.json(
        { success: false, error: "Nicht unterstuetzter Dateityp. Erlaubt: CSV, Excel (.xlsx), XML, JSON." },
        { status: 400 }
      );
    }

    // Parse the file to extract schema
    const buffer = await file.arrayBuffer();
    const parseResult = await parseOutputFormatSample(buffer, file.name, fileType);

    // Upload file to Supabase Storage
    const sanitizedName = file.name.replace(/[/\\]/g, "_").replace(/\.\./g, "_");
    const timestamp = Date.now();
    const storagePath = `configs/${configId}/${timestamp}-${sanitizedName}`;

    const { error: uploadError } = await adminClient.storage
      .from("tenant-output-formats")
      .upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json(
        { success: false, error: "Fehler beim Hochladen der Datei." },
        { status: 500 }
      );
    }

    // Check for existing format (optimistic locking)
    const { data: existing } = await adminClient
      .from("tenant_output_formats")
      .select("id, file_path, version")
      .eq("erp_config_id", configId)
      .maybeSingle();

    let savedFormat: TenantOutputFormat;

    if (existing) {
      const { data: updated, error: updateError } = await adminClient
        .from("tenant_output_formats")
        .update({
          file_name: file.name,
          file_path: storagePath,
          file_type: fileType,
          detected_schema: parseResult.detected_schema,
          column_count: parseResult.column_count,
          required_column_count: parseResult.required_column_count,
          xml_structure: parseResult.xml_structure ?? null,
          uploaded_at: new Date().toISOString(),
          uploaded_by: user.id,
          version: (existing.version as number) + 1,
        })
        .eq("id", existing.id as string)
        .eq("version", existing.version as number)
        .select("*")
        .single();

      if (updateError || !updated) {
        await adminClient.storage.from("tenant-output-formats").remove([storagePath]);
        return NextResponse.json(
          { success: false, error: "Das Format wurde gleichzeitig von einem anderen Admin geaendert. Bitte laden Sie die Seite neu." },
          { status: 409 }
        );
      }

      if (existing.file_path) {
        await adminClient.storage.from("tenant-output-formats").remove([existing.file_path as string]);
      }

      savedFormat = updated as TenantOutputFormat;
    } else {
      const { data: inserted, error: insertError } = await adminClient
        .from("tenant_output_formats")
        .insert({
          erp_config_id: configId,
          file_name: file.name,
          file_path: storagePath,
          file_type: fileType,
          detected_schema: parseResult.detected_schema,
          column_count: parseResult.column_count,
          required_column_count: parseResult.required_column_count,
          xml_structure: parseResult.xml_structure ?? null,
          uploaded_by: user.id,
        })
        .select("*")
        .single();

      if (insertError || !inserted) {
        console.error("Insert error:", insertError);
        await adminClient.storage.from("tenant-output-formats").remove([storagePath]);
        return NextResponse.json(
          { success: false, error: "Fehler beim Speichern des Output-Formats." },
          { status: 500 }
        );
      }

      savedFormat = inserted as TenantOutputFormat;
    }

    // Recalculate confidence scores for orders of all tenants assigned to this config
    await recalculateConfidenceScoresForConfig(
      adminClient,
      configId,
      config.column_mappings as ErpColumnMappingExtended[] | null,
      parseResult.detected_schema
    );

    return NextResponse.json({ success: true, data: savedFormat });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Interner Serverfehler.";
    console.error("Error in POST /api/admin/erp-configs/[configId]/output-format:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/erp-configs/[configId]/output-format
 *
 * OPH-29: Removes the output format for an ERP config.
 * Platform admin only.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ configId: string }> }
): Promise<NextResponse> {
  try {
    const { configId } = await params;
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitError = checkAdminRateLimit(user.id);
    if (rateLimitError) return rateLimitError;

    if (!UUID_REGEX.test(configId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Konfigurations-ID." },
        { status: 400 }
      );
    }

    const { data: existing, error: fetchError } = await adminClient
      .from("tenant_output_formats")
      .select("id, file_path")
      .eq("erp_config_id", configId)
      .maybeSingle();

    if (fetchError) {
      console.error("Error fetching format for delete:", fetchError);
      return NextResponse.json(
        { success: false, error: "Fehler beim Laden des Output-Formats." },
        { status: 500 }
      );
    }

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Kein Output-Format zum Loeschen vorhanden." },
        { status: 404 }
      );
    }

    const { error: deleteError } = await adminClient
      .from("tenant_output_formats")
      .delete()
      .eq("id", existing.id as string);

    if (deleteError) {
      console.error("Error deleting format:", deleteError);
      return NextResponse.json(
        { success: false, error: "Fehler beim Loeschen des Output-Formats." },
        { status: 500 }
      );
    }

    if (existing.file_path) {
      await adminClient.storage.from("tenant-output-formats").remove([existing.file_path as string]);
    }

    // Clear confidence scores for orders of all tenants assigned to this config
    const { data: tenants } = await adminClient
      .from("tenants")
      .select("id")
      .eq("erp_config_id", configId);

    if (tenants && tenants.length > 0) {
      const tenantIds = tenants.map((t) => t.id as string);
      await adminClient
        .from("orders")
        .update({
          output_format_confidence_score: null,
          output_format_missing_columns: null,
        })
        .in("tenant_id", tenantIds)
        .in("status", ["extracted", "approved"]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/admin/erp-configs/[configId]/output-format:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

// ---------- Helper: Recalculate confidence scores ----------

/**
 * Recalculates confidence scores for all orders across all tenants
 * assigned to a given ERP config.
 */
async function recalculateConfidenceScoresForConfig(
  adminClient: SupabaseClient,
  configId: string,
  erpMappings: ErpColumnMappingExtended[] | null,
  outputSchema: OutputFormatSchemaColumn[]
): Promise<void> {
  try {
    // Find all tenant IDs assigned to this config
    const { data: tenants } = await adminClient
      .from("tenants")
      .select("id")
      .eq("erp_config_id", configId);

    if (!tenants || tenants.length === 0) return;

    const tenantIds = tenants.map((t) => t.id as string);

    // Fetch orders with extracted data
    const { data: orders } = await adminClient
      .from("orders")
      .select("id, extracted_data, reviewed_data")
      .in("tenant_id", tenantIds)
      .in("status", ["extracted", "approved"]);

    if (!orders || orders.length === 0) return;

    for (const order of orders) {
      const orderData = (order.reviewed_data ?? order.extracted_data) as CanonicalOrderData | null;
      const scoreData = calculateConfidenceScore(orderData, outputSchema, erpMappings);

      await adminClient
        .from("orders")
        .update({
          output_format_confidence_score: scoreData.score,
          output_format_missing_columns: scoreData.missing_columns,
        })
        .eq("id", order.id as string);
    }
  } catch (error) {
    console.error("Error recalculating confidence scores:", error);
  }
}
