import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppMetadata, ApiResponse, PreviewUrlResponse, FilePreviewUrl } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Signed URL validity: 1 hour. */
const SIGNED_URL_EXPIRY_SECONDS = 3600;

/**
 * GET /api/orders/[orderId]/preview-url
 *
 * Returns signed URLs (1-hour validity) for each file attached to the order.
 * Used by the review page to show PDF previews in an iframe.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
): Promise<NextResponse<ApiResponse<PreviewUrlResponse>>> {
  try {
    const { orderId } = await params;

    // 1. Authenticate
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

    // 2. Check user/tenant status
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
    const isPlatformAdmin = appMetadata?.role === "platform_admin";

    if (!tenantId && !isPlatformAdmin) {
      return NextResponse.json(
        { success: false, error: "Kein Mandant zugewiesen." },
        { status: 403 }
      );
    }

    // 3. Validate orderId
    if (!UUID_REGEX.test(orderId)) {
      return NextResponse.json(
        { success: false, error: "Ungültige Bestellungs-ID." },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // 4. Verify order exists and belongs to the user's tenant
    let orderQuery = adminClient
      .from("orders")
      .select("id, tenant_id")
      .eq("id", orderId);

    if (!isPlatformAdmin && tenantId) {
      orderQuery = orderQuery.eq("tenant_id", tenantId);
    }

    const { data: order, error: orderError } = await orderQuery.single();

    if (orderError || !order) {
      return NextResponse.json(
        { success: false, error: "Bestellung nicht gefunden." },
        { status: 404 }
      );
    }

    // 5. Fetch files for this order
    const { data: files, error: filesError } = await adminClient
      .from("order_files")
      .select("id, original_filename, storage_path, mime_type")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });

    if (filesError) {
      console.error("Error fetching order files:", filesError.message);
      return NextResponse.json(
        { success: false, error: "Dateien konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    if (!files || files.length === 0) {
      return NextResponse.json({
        success: true,
        data: { files: [] },
      });
    }

    // 6. Generate signed URLs for each file
    const previewFiles: FilePreviewUrl[] = [];
    const expiresAt = new Date(
      Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000
    ).toISOString();

    for (const file of files) {
      const mimeType = file.mime_type as string;
      const filename = file.original_filename as string;
      const lowerFilename = filename.toLowerCase();
      // Render PDFs, images, text files, spreadsheets, and XML inline; force download for other file types
      const isInlineViewable =
        mimeType === "application/pdf" ||
        lowerFilename.endsWith(".pdf") ||
        mimeType.startsWith("image/") ||
        mimeType === "text/plain" ||
        filename === "email_body.txt" ||
        mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        mimeType === "application/vnd.ms-excel" ||
        mimeType === "text/csv" ||
        lowerFilename.endsWith(".xlsx") ||
        lowerFilename.endsWith(".xls") ||
        lowerFilename.endsWith(".csv") ||
        mimeType === "application/xml" ||
        mimeType === "text/xml" ||
        lowerFilename.endsWith(".xml");
      const urlOptions = isInlineViewable
        ? undefined
        : { download: filename };

      const { data: signedUrlData, error: signedUrlError } =
        await adminClient.storage
          .from("order-files")
          .createSignedUrl(file.storage_path as string, SIGNED_URL_EXPIRY_SECONDS, urlOptions);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.error(
          `Error creating signed URL for ${file.storage_path}:`,
          signedUrlError?.message
        );
        // Skip this file but don't fail the entire request
        continue;
      }

      previewFiles.push({
        fileId: file.id as string,
        filename: file.original_filename as string,
        mimeType: file.mime_type as string,
        signedUrl: signedUrlData.signedUrl,
        expiresAt,
      });
    }

    return NextResponse.json({
      success: true,
      data: { files: previewFiles },
    });
  } catch (error) {
    console.error("Unexpected error in GET /api/orders/[orderId]/preview-url:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
