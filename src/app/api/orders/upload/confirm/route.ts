import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadConfirmSchema } from "@/lib/validations";
import { recognizeDealer } from "@/lib/dealer-recognition";
import type { AppMetadata, ApiResponse, UploadOrderResponse } from "@/lib/types";

/**
 * POST /api/orders/upload/confirm
 *
 * Step 2 of the two-step upload flow.
 * Called after the client has successfully uploaded a file directly to
 * Supabase Storage via the signed URL from POST /api/orders/upload.
 *
 * This endpoint:
 *  1. Verifies authentication and tenant
 *  2. Validates the orderId belongs to this user's tenant
 *  3. Checks for cross-session duplicate (same SHA-256 hash already in tenant)
 *  4. Inserts the order_files metadata record
 *  5. Returns orderId, duplicate status, and prior upload date (if duplicate)
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<UploadOrderResponse>>> {
  try {
    // 1. Verify authentication
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

    // 2. Check user/tenant status from JWT app_metadata
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

    // 3. Parse and validate JSON body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Ungültiges JSON im Anfrage-Body." },
        { status: 400 }
      );
    }

    const parsed = uploadConfirmSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungültige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const { orderId, storagePath, sha256Hash, originalFilename } = parsed.data;

    const adminClient = createAdminClient();

    // 4. Verify the order belongs to this user's tenant (prevent cross-tenant injection)
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("id, tenant_id, status")
      .eq("id", orderId)
      .eq("tenant_id", tenantId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { success: false, error: "Bestellung nicht gefunden." },
        { status: 404 }
      );
    }

    // 5. Verify the storage path is safe and belongs to this tenant
    // (prevents path traversal and cross-tenant injection)
    if (storagePath.includes("..") || storagePath.includes("//") || storagePath.startsWith("/")) {
      return NextResponse.json(
        { success: false, error: "Ungültiger Speicherpfad." },
        { status: 400 }
      );
    }

    const expectedPrefix = `${tenantId}/`;
    if (!storagePath.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { success: false, error: "Ungültiger Speicherpfad." },
        { status: 400 }
      );
    }

    const pathSegments = storagePath.split("/");

    // 6. Check for cross-session duplicate within the same tenant
    const { data: existingFile } = await adminClient
      .from("order_files")
      .select("id, created_at, original_filename")
      .eq("sha256_hash", sha256Hash)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const isDuplicate = !!existingFile;
    const duplicateDate = existingFile
      ? (existingFile.created_at as string)
      : undefined;

    // 8. Get the file size from Supabase Storage metadata
    // We list the directory to find the file and get its size
    const dirPath = pathSegments.slice(0, -1).join("/");
    const fileName = pathSegments[pathSegments.length - 1] ?? "";
    const { data: storageList } = await adminClient.storage
      .from("order-files")
      .list(dirPath, { search: fileName, limit: 1 });

    const storedFile = storageList?.[0];
    const fileSizeBytes = storedFile?.metadata?.size ?? 0;
    const mimeType = storedFile?.metadata?.mimetype ?? "application/octet-stream";

    // 9. Insert the order_files metadata record
    const { error: fileRecordError } = await adminClient.from("order_files").insert({
      order_id: orderId,
      tenant_id: tenantId,
      original_filename: originalFilename,
      storage_path: storagePath,
      file_size_bytes: fileSizeBytes > 0 ? fileSizeBytes : 1, // fallback: 1 byte if metadata unavailable
      mime_type: mimeType,
      sha256_hash: sha256Hash,
    });

    if (fileRecordError) {
      console.error("Error inserting order_files record:", fileRecordError.message);
      // Not rolling back the storage file since it's already uploaded —
      // orphaned storage files can be cleaned up by a background job.
      return NextResponse.json(
        { success: false, error: "Datei-Metadaten konnten nicht gespeichert werden." },
        { status: 500 }
      );
    }

    // 10. Run dealer recognition (synchronous — inspects file metadata and .eml headers)
    const dealerResult = await recognizeDealer(
      adminClient,
      orderId,
      storagePath,
      originalFilename
    );

    return NextResponse.json({
      success: true,
      data: {
        orderId,
        filename: originalFilename,
        isDuplicate,
        duplicateDate,
        dealer: {
          dealerId: dealerResult.dealerId,
          dealerName: dealerResult.dealerName,
          recognitionMethod: dealerResult.recognitionMethod,
          recognitionConfidence: dealerResult.recognitionConfidence,
        },
      },
    });
  } catch (error) {
    console.error("Unexpected error in upload confirm route:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
