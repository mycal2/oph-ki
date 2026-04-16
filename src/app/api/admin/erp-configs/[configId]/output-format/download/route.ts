import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";
import type { ApiResponse } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** OPH-59: Valid slot values. */
function parseSlot(raw: string | null): "lines" | "header" {
  return raw === "header" ? "header" : "lines";
}

/**
 * GET /api/admin/erp-configs/[configId]/output-format/download
 *
 * OPH-29: Downloads the original sample file from Supabase Storage.
 * OPH-59: Supports ?slot=lines|header query param.
 * Platform admin only.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ configId: string }> }
): Promise<NextResponse<ApiResponse> | NextResponse> {
  try {
    const { configId } = await params;
    const slot = parseSlot(request.nextUrl.searchParams.get("slot"));
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitError = checkAdminRateLimit(user.id);
    if (rateLimitError) return rateLimitError;

    if (!UUID_REGEX.test(configId)) {
      return NextResponse.json(
        { success: false, error: "Ungültige Konfigurations-ID." },
        { status: 400 }
      );
    }

    const { data: format, error: fetchError } = await adminClient
      .from("tenant_output_formats")
      .select("file_name, file_path")
      .eq("erp_config_id", configId)
      .eq("slot", slot)
      .maybeSingle();

    if (fetchError || !format) {
      return NextResponse.json(
        { success: false, error: "Kein Output-Format zugewiesen." },
        { status: 404 }
      );
    }

    const { data: fileData, error: downloadError } = await adminClient.storage
      .from("tenant-output-formats")
      .download(format.file_path as string);

    if (downloadError || !fileData) {
      console.error("Storage download error:", downloadError);
      return NextResponse.json(
        { success: false, error: "Datei konnte nicht heruntergeladen werden." },
        { status: 500 }
      );
    }

    const buffer = await fileData.arrayBuffer();
    const fileName = format.file_name as string;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": fileData.type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (error) {
    console.error("Error in GET /api/admin/erp-configs/[configId]/output-format/download:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
