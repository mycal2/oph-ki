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
} from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/output-formats/[tenantId]
 *
 * Returns the currently assigned output format for a tenant.
 * Returns 404 if none is assigned (frontend treats this as valid "no format" state).
 * Platform admin only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
): Promise<NextResponse> {
  try {
    const { tenantId } = await params;
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitError = checkAdminRateLimit(user.id);
    if (rateLimitError) return rateLimitError;

    if (!UUID_REGEX.test(tenantId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Mandanten-ID." },
        { status: 400 }
      );
    }

    const { data, error } = await adminClient
      .from("tenant_output_formats")
      .select("*")
      .eq("tenant_id", tenantId)
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
    console.error("Error in GET /api/admin/output-formats/[tenantId]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/output-formats/[tenantId]
 *
 * Saves a sample output format for a tenant: parses the file, stores the
 * original in Supabase Storage, and saves the detected schema to the database.
 * If a format already exists, it is replaced (optimistic locking via version).
 * Platform admin only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
): Promise<NextResponse> {
  try {
    const { tenantId } = await params;
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitError = checkAdminRateLimit(user.id);
    if (rateLimitError) return rateLimitError;

    if (!UUID_REGEX.test(tenantId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Mandanten-ID." },
        { status: 400 }
      );
    }

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
    const timestamp = Date.now();
    const storagePath = `${tenantId}/${timestamp}-${file.name}`;

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
      .eq("tenant_id", tenantId)
      .maybeSingle();

    let savedFormat: TenantOutputFormat;

    if (existing) {
      // Replace existing: update with version increment
      const { data: updated, error: updateError } = await adminClient
        .from("tenant_output_formats")
        .update({
          file_name: file.name,
          file_path: storagePath,
          file_type: fileType,
          detected_schema: parseResult.detected_schema,
          column_count: parseResult.column_count,
          required_column_count: parseResult.required_column_count,
          uploaded_at: new Date().toISOString(),
          uploaded_by: user.id,
          version: (existing.version as number) + 1,
        })
        .eq("id", existing.id as string)
        .eq("version", existing.version as number)
        .select("*")
        .single();

      if (updateError || !updated) {
        // Version conflict — another admin updated concurrently
        // Clean up uploaded file
        await adminClient.storage.from("tenant-output-formats").remove([storagePath]);
        return NextResponse.json(
          { success: false, error: "Das Format wurde gleichzeitig von einem anderen Admin geaendert. Bitte laden Sie die Seite neu." },
          { status: 409 }
        );
      }

      // Delete old file from storage
      if (existing.file_path) {
        await adminClient.storage.from("tenant-output-formats").remove([existing.file_path as string]);
      }

      savedFormat = updated as TenantOutputFormat;
    } else {
      // Insert new
      const { data: inserted, error: insertError } = await adminClient
        .from("tenant_output_formats")
        .insert({
          tenant_id: tenantId,
          file_name: file.name,
          file_path: storagePath,
          file_type: fileType,
          detected_schema: parseResult.detected_schema,
          column_count: parseResult.column_count,
          required_column_count: parseResult.required_column_count,
          uploaded_by: user.id,
        })
        .select("*")
        .single();

      if (insertError || !inserted) {
        console.error("Insert error:", insertError);
        // Clean up uploaded file
        await adminClient.storage.from("tenant-output-formats").remove([storagePath]);
        return NextResponse.json(
          { success: false, error: "Fehler beim Speichern des Output-Formats." },
          { status: 500 }
        );
      }

      savedFormat = inserted as TenantOutputFormat;
    }

    // Recalculate confidence scores for current orders of this tenant
    // Only for orders in "extracted" or "approved" status
    await recalculateConfidenceScores(adminClient, tenantId, parseResult.detected_schema);

    return NextResponse.json({ success: true, data: savedFormat });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Interner Serverfehler.";
    console.error("Error in POST /api/admin/output-formats/[tenantId]:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/output-formats/[tenantId]
 *
 * Removes the assigned output format for a tenant. Deletes the record
 * from the database and the file from Supabase Storage.
 * Platform admin only.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
): Promise<NextResponse> {
  try {
    const { tenantId } = await params;
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitError = checkAdminRateLimit(user.id);
    if (rateLimitError) return rateLimitError;

    if (!UUID_REGEX.test(tenantId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Mandanten-ID." },
        { status: 400 }
      );
    }

    // Fetch existing format
    const { data: existing, error: fetchError } = await adminClient
      .from("tenant_output_formats")
      .select("id, file_path")
      .eq("tenant_id", tenantId)
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

    // Delete from database
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

    // Delete file from storage
    if (existing.file_path) {
      await adminClient.storage.from("tenant-output-formats").remove([existing.file_path as string]);
    }

    // Clear confidence scores for current orders of this tenant
    await adminClient
      .from("orders")
      .update({
        output_format_confidence_score: null,
        output_format_missing_columns: null,
      })
      .eq("tenant_id", tenantId)
      .in("status", ["extracted", "approved"]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/admin/output-formats/[tenantId]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

// ---------- Helper: Recalculate confidence scores ----------

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OutputFormatSchemaColumn } from "@/lib/types";

/**
 * Recalculates confidence scores for all current orders of a tenant
 * that are in "extracted" or "approved" status.
 */
async function recalculateConfidenceScores(
  adminClient: SupabaseClient,
  tenantId: string,
  outputSchema: OutputFormatSchemaColumn[]
): Promise<void> {
  try {
    // Get ERP config for the tenant
    const { data: erpConfig } = await adminClient
      .from("erp_configs")
      .select("column_mappings")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const erpMappings = erpConfig
      ? (erpConfig.column_mappings as ErpColumnMappingExtended[])
      : null;

    // Fetch orders with extracted data
    const { data: orders } = await adminClient
      .from("orders")
      .select("id, extracted_data, reviewed_data")
      .eq("tenant_id", tenantId)
      .in("status", ["extracted", "approved"]);

    if (!orders || orders.length === 0) return;

    // Calculate and update each order
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
    // Non-critical: log but don't fail the main operation
    console.error("Error recalculating confidence scores:", error);
  }
}
