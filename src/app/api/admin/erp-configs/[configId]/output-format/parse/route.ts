import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";
import {
  parseOutputFormatSample,
  detectFileType,
  MAX_FILE_SIZE,
} from "@/lib/output-format-parser";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/erp-configs/[configId]/output-format/parse
 *
 * OPH-29: Accepts a sample file upload, parses it, and returns the detected schema
 * for admin review. Does NOT save to database or storage.
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
    const { user } = auth;

    const rateLimitError = checkAdminRateLimit(user.id);
    if (rateLimitError) return rateLimitError;

    if (!UUID_REGEX.test(configId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Konfigurations-ID." },
        { status: 400 }
      );
    }

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

    const buffer = await file.arrayBuffer();
    const result = await parseOutputFormatSample(buffer, file.name, fileType);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Interner Serverfehler.";
    console.error("Error in POST /api/admin/erp-configs/[configId]/output-format/parse:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }
}
