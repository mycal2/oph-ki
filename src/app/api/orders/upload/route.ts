import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadPresignSchema } from "@/lib/validations";
import type { AppMetadata, ApiResponse } from "@/lib/types";

/**
 * Upload rate limiting: max 50 requests per 15 minutes per IP.
 * Reuses auth_rate_limits table with identifier_type = 'upload_ip'.
 */
const UPLOAD_MAX_REQUESTS = 50;
const UPLOAD_WINDOW_MS    = 15 * 60 * 1000;

async function checkAndRecordUploadRateLimit(ip: string): Promise<boolean> {
  const adminClient = createAdminClient();

  const { data: record } = await adminClient
    .from("auth_rate_limits")
    .select("id, attempt_count, first_attempt_at")
    .eq("identifier", ip)
    .eq("identifier_type", "upload_ip")
    .maybeSingle();

  const now = Date.now();

  if (!record) {
    await adminClient.from("auth_rate_limits").insert({
      identifier: ip,
      identifier_type: "upload_ip",
      attempt_count: 1,
      first_attempt_at: new Date().toISOString(),
    });
    return true;
  }

  const windowExpiry =
    new Date(record.first_attempt_at as string).getTime() + UPLOAD_WINDOW_MS;

  if (now > windowExpiry) {
    await adminClient
      .from("auth_rate_limits")
      .update({ attempt_count: 1, first_attempt_at: new Date().toISOString(), locked_until: null })
      .eq("id", record.id as string);
    return true;
  }

  if ((record.attempt_count as number) >= UPLOAD_MAX_REQUESTS) {
    return false;
  }

  await adminClient
    .from("auth_rate_limits")
    .update({ attempt_count: (record.attempt_count as number) + 1 })
    .eq("id", record.id as string);

  return true;
}

/**
 * POST /api/orders/upload
 *
 * Step 1 of the two-step upload flow.
 * Accepts file metadata as JSON, validates it, creates an order record,
 * and returns a short-lived Supabase Storage signed upload URL.
 *
 * The client then uploads the file DIRECTLY to Supabase Storage using
 * the signed URL (bypassing the Next.js server body size limit).
 *
 * After the upload completes, the client calls POST /api/orders/upload/confirm
 * to register the file metadata in the database.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ orderId: string; signedUrl: string; storagePath: string; token: string }>>> {
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

    // 3. Parse and validate JSON body (moved up for OPH-34 tenantId extraction)
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Ungültiges JSON im Anfrage-Body." },
        { status: 400 }
      );
    }

    // OPH-34: Resolve tenant — admin override or JWT tenant
    const bodyObj = body as Record<string, unknown>;
    const adminTenantOverride = typeof bodyObj?.tenantId === "string" ? bodyObj.tenantId : null;

    let tenantId: string;
    if (adminTenantOverride) {
      // Only platform_admin may override the tenant
      if (appMetadata?.role !== "platform_admin") {
        return NextResponse.json(
          { success: false, error: "Nur Plattform-Admins dürfen einen Mandanten überschreiben." },
          { status: 403 }
        );
      }
      tenantId = adminTenantOverride;
    } else {
      const jwtTenantId = appMetadata?.tenant_id;
      if (!jwtTenantId) {
        return NextResponse.json(
          { success: false, error: "Kein Mandant zugewiesen." },
          { status: 403 }
        );
      }
      tenantId = jwtTenantId;
    }

    // 3. IP-based upload rate limiting
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const rateLimitAllowed = await checkAndRecordUploadRateLimit(ip);
    if (!rateLimitAllowed) {
      return NextResponse.json(
        { success: false, error: "Zu viele Uploads. Bitte warten Sie einen Moment und versuchen Sie es erneut." },
        { status: 429 }
      );
    }

    // 4. Validate body against schema
    const parsed = uploadPresignSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungültige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const { filename, fileSize, mimeType, sha256Hash, subject } = parsed.data;

    const adminClient = createAdminClient();

    // 5. Create the order record
    // OPH-25: Store optional subject if provided by the user
    const orderInsert: Record<string, unknown> = {
      tenant_id: tenantId,
      uploaded_by: user.id,
      status: "uploaded",
    };
    if (subject && subject.trim().length > 0) {
      orderInsert.subject = subject.trim();
    }

    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .insert(orderInsert)
      .select("id")
      .single();

    if (orderError || !order) {
      console.error("Error creating order:", orderError?.message);
      return NextResponse.json(
        { success: false, error: "Bestellung konnte nicht erstellt werden." },
        { status: 500 }
      );
    }

    const orderId = order.id as string;

    // 6. Generate a signed upload URL (valid for 120 seconds)
    // Path: {tenant_id}/{order_id}/{sanitized_filename}
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._\-()\u00C0-\u024F]/g, "_");
    const storagePath = `${tenantId}/${orderId}/${sanitizedFilename}`;

    const { data: signedData, error: signedError } = await adminClient.storage
      .from("order-files")
      .createSignedUploadUrl(storagePath);

    if (signedError || !signedData) {
      // Rollback: delete the order record
      await adminClient.from("orders").delete().eq("id", orderId);
      console.error("Error creating signed upload URL:", signedError?.message);
      return NextResponse.json(
        { success: false, error: "Upload-URL konnte nicht erstellt werden. Bitte erneut versuchen." },
        { status: 500 }
      );
    }

    // Log for debugging (remove in production)
    void fileSize; void mimeType; void sha256Hash; // used in confirm step

    return NextResponse.json({
      success: true,
      data: {
        orderId,
        signedUrl: signedData.signedUrl,
        storagePath,
        token: signedData.token,
      },
    });
  } catch (error) {
    console.error("Unexpected error in upload presign route:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
