import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppMetadata, ApiResponse } from "@/lib/types";

/**
 * GET /api/orders/[orderId]/email-body
 *
 * OPH-21: On-demand endpoint to fetch the email body text for an order.
 * Downloads `email_body.txt` from Supabase Storage and returns it as plain text.
 *
 * This is loaded lazily by the frontend when the user expands the
 * "Original E-Mail" collapsible panel on the order detail page.
 *
 * Auth: Standard Supabase auth, tenant-scoped. Platform admins can access all.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
): Promise<NextResponse<ApiResponse<{ emailBody: string }>>> {
  try {
    const { orderId } = await params;

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

    // 3. Validate orderId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(orderId)) {
      return NextResponse.json(
        { success: false, error: "Ungültige Bestellungs-ID." },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // 4. Fetch the order to verify tenant access and get tenant_id for storage path
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

    // 5. Check if email_body.txt exists in order_files
    const { data: emailBodyFile } = await adminClient
      .from("order_files")
      .select("storage_path")
      .eq("order_id", orderId)
      .eq("original_filename", "email_body.txt")
      .limit(1)
      .maybeSingle();

    if (!emailBodyFile) {
      return NextResponse.json(
        { success: false, error: "Kein E-Mail-Text für diese Bestellung vorhanden." },
        { status: 404 }
      );
    }

    // 6. Download the file from Supabase Storage
    const { data: blob, error: downloadError } = await adminClient.storage
      .from("order-files")
      .download(emailBodyFile.storage_path as string);

    if (downloadError || !blob) {
      console.error(
        `Error downloading email_body.txt for order ${orderId}:`,
        downloadError?.message
      );
      return NextResponse.json(
        { success: false, error: "E-Mail-Text konnte nicht geladen werden." },
        { status: 500 }
      );
    }

    // 7. Return the plain text content
    const emailBody = await blob.text();

    return NextResponse.json({
      success: true,
      data: { emailBody },
    });
  } catch (error) {
    console.error("Unexpected error in GET /api/orders/[orderId]/email-body:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
