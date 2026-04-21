import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppMetadata, ApiResponse, OrderWithDealer, OrderForReview, OrderDeleteResponse, CanonicalOrderData } from "@/lib/types";

/**
 * GET /api/orders/[orderId]
 *
 * Returns a single order with dealer recognition info and associated files.
 * Tenant-scoped: users can only access their own tenant's orders.
 * Platform admins can access all orders.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
): Promise<NextResponse<ApiResponse<OrderForReview>>> {
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

    // 4. Fetch the order with dealer join + extraction fields + review fields
    let query = adminClient
      .from("orders")
      .select(`
        id,
        tenant_id,
        uploaded_by,
        status,
        created_at,
        updated_at,
        dealer_id,
        recognition_method,
        recognition_confidence,
        dealer_overridden_by,
        dealer_overridden_at,
        override_reason,
        extraction_status,
        extracted_data,
        extraction_error,
        reviewed_data,
        reviewed_at,
        reviewed_by,
        last_exported_at,
        has_unmapped_articles,
        subject,
        source,
        clarification_note,
        dealer_reset_by,
        dealer_reset_at,
        dealers ( id, name, street, postal_code, city, country ),
        uploader:user_profiles!orders_uploaded_by_fkey ( first_name, last_name ),
        overrider:user_profiles!orders_dealer_overridden_by_fkey ( first_name, last_name ),
        resetter:user_profiles!orders_dealer_reset_by_fkey ( first_name, last_name )
      `)
      .eq("id", orderId);

    // Tenant scoping (platform admins see all)
    if (!isPlatformAdmin && tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data: order, error: orderError } = await query.single();

    if (orderError || !order) {
      return NextResponse.json(
        { success: false, error: "Bestellung nicht gefunden." },
        { status: 404 }
      );
    }

    // 5. Fetch files for the order
    const { data: files, error: filesError } = await adminClient
      .from("order_files")
      .select("id, order_id, tenant_id, original_filename, storage_path, file_size_bytes, mime_type, sha256_hash, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });

    if (filesError) {
      console.error("Error fetching order files:", filesError.message);
    }

    // 6. Map to the OrderWithDealer shape
    // Supabase returns joined data as arrays when using generated types without a schema.
    // Since dealer_id is a FK to a single row, we extract the first element.
    const rawDealer = order.dealers as unknown;
    const dealerData = Array.isArray(rawDealer) ? (rawDealer[0] as { id: string; name: string; street: string | null; postal_code: string | null; city: string | null; country: string | null } | undefined) ?? null : rawDealer as { id: string; name: string; street: string | null; postal_code: string | null; city: string | null; country: string | null } | null;
    const rawUploader = order.uploader as unknown;
    const uploaderData = Array.isArray(rawUploader) ? (rawUploader[0] as { first_name: string; last_name: string } | undefined) ?? null : rawUploader as { first_name: string; last_name: string } | null;
    const rawOverrider = order.overrider as unknown;
    const overriderData = Array.isArray(rawOverrider) ? (rawOverrider[0] as { first_name: string; last_name: string } | undefined) ?? null : rawOverrider as { first_name: string; last_name: string } | null;
    const rawResetter = order.resetter as unknown;
    const resetterData = Array.isArray(rawResetter) ? (rawResetter[0] as { first_name: string; last_name: string } | undefined) ?? null : rawResetter as { first_name: string; last_name: string } | null;

    const result: OrderForReview = {
      id: order.id as string,
      tenant_id: order.tenant_id as string,
      uploaded_by: order.uploaded_by as string | null,
      status: order.status as OrderWithDealer["status"],
      created_at: order.created_at as string,
      updated_at: order.updated_at as string,
      dealer_id: order.dealer_id as string | null,
      dealer_name: dealerData?.name ?? null,
      dealer_street: dealerData?.street ?? null,
      dealer_postal_code: dealerData?.postal_code ?? null,
      dealer_city: dealerData?.city ?? null,
      dealer_country: dealerData?.country ?? null,
      recognition_method: (order.recognition_method as OrderWithDealer["recognition_method"]) ?? "none",
      recognition_confidence: (order.recognition_confidence as number) ?? 0,
      dealer_overridden_by: order.dealer_overridden_by as string | null,
      dealer_overridden_at: order.dealer_overridden_at as string | null,
      override_reason: (order.override_reason as string | null) ?? null,
      overridden_by_name: overriderData
        ? `${overriderData.first_name} ${overriderData.last_name}`.trim()
        : null,
      uploaded_by_name: uploaderData
        ? `${uploaderData.first_name} ${uploaderData.last_name}`.trim()
        : null,
      files: (files ?? []).map((f) => ({
        id: f.id as string,
        order_id: f.order_id as string,
        tenant_id: f.tenant_id as string,
        original_filename: f.original_filename as string,
        storage_path: f.storage_path as string,
        file_size_bytes: f.file_size_bytes as number,
        mime_type: f.mime_type as string,
        sha256_hash: f.sha256_hash as string,
        created_at: f.created_at as string,
      })),
      extraction_status: (order.extraction_status as OrderWithDealer["extraction_status"]) ?? null,
      extracted_data: (order.extracted_data as CanonicalOrderData) ?? null,
      extraction_error: (order.extraction_error as string) ?? null,
      has_unmapped_articles: (order.has_unmapped_articles as boolean) ?? false,
      // OPH-25: Email subject
      subject: (order.subject as string | null) ?? null,
      // OPH-83: Order source
      source: (order.source as string | null) ?? null,
      // OPH-66: Dealer reset fields
      dealer_reset_by: (order.dealer_reset_by as string | null) ?? null,
      dealer_reset_at: (order.dealer_reset_at as string | null) ?? null,
      reset_by_name: resetterData
        ? `${resetterData.first_name} ${resetterData.last_name}`.trim()
        : null,
      // OPH-93: Clarification note
      clarification_note: (order.clarification_note as string | null) ?? null,
      // OPH-5: Review fields
      reviewed_data: (order.reviewed_data as CanonicalOrderData) ?? null,
      reviewed_at: (order.reviewed_at as string) ?? null,
      reviewed_by: (order.reviewed_by as string) ?? null,
      // OPH-6: Export fields
      last_exported_at: (order.last_exported_at as string) ?? null,
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Unexpected error in GET /api/orders/[orderId]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/orders/[orderId]
 *
 * Hard-deletes an order and all its associated files (storage + DB).
 * Inserts an entry into the data_deletion_log for DSGVO audit trail.
 *
 * Auth required: tenant_admin or platform_admin only.
 * Orders in "processing" status cannot be deleted (409 Conflict).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
): Promise<NextResponse<ApiResponse<OrderDeleteResponse>>> {
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

    // 2. Check user/tenant status and authorization
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
    const role = appMetadata?.role;
    const isPlatformAdmin = role === "platform_admin";

    if (!tenantId && !isPlatformAdmin) {
      return NextResponse.json(
        { success: false, error: "Kein Mandant zugewiesen." },
        { status: 403 }
      );
    }

    // Only tenant_admin or platform_admin can delete orders
    if (role !== "tenant_admin" && role !== "platform_admin") {
      return NextResponse.json(
        { success: false, error: "Nur Administratoren können Bestellungen löschen." },
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

    // 4. Fetch the order and verify tenant access
    let orderQuery = adminClient
      .from("orders")
      .select("id, tenant_id, status, created_at")
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

    // 5. Orders in "processing" status cannot be deleted
    if (order.status === "processing") {
      return NextResponse.json(
        {
          success: false,
          error: "Bestellungen im Status 'Verarbeitung' können nicht gelöscht werden.",
        },
        { status: 409 }
      );
    }

    const effectiveTenantId = order.tenant_id as string;

    // 6. Delete storage files from "order-files" bucket
    const dirPath = `${effectiveTenantId}/${orderId}`;
    let filesDeleted = 0;

    const { data: storageFiles } = await adminClient.storage
      .from("order-files")
      .list(dirPath);

    if (storageFiles && storageFiles.length > 0) {
      filesDeleted = storageFiles.length;
      const filePaths = storageFiles.map((f) => `${dirPath}/${f.name}`);
      const { error: storageError } = await adminClient.storage
        .from("order-files")
        .remove(filePaths);

      if (storageError) {
        console.error(
          `Error deleting storage files for order ${orderId}:`,
          storageError.message
        );
        // Continue with DB deletion even if storage cleanup fails
      }
    }

    // 7. Delete from order_files table (explicit, even though FK cascades)
    const { error: filesDeleteError } = await adminClient
      .from("order_files")
      .delete()
      .eq("order_id", orderId);

    if (filesDeleteError) {
      console.error(
        `Error deleting order_files for order ${orderId}:`,
        filesDeleteError.message
      );
    }

    // 8. Delete from orders table
    const { error: orderDeleteError } = await adminClient
      .from("orders")
      .delete()
      .eq("id", orderId);

    if (orderDeleteError) {
      console.error(
        `Error deleting order ${orderId}:`,
        orderDeleteError.message
      );
      return NextResponse.json(
        { success: false, error: "Bestellung konnte nicht gelöscht werden." },
        { status: 500 }
      );
    }

    // 9. Insert into data_deletion_log (append-only audit trail)
    const deletedAt = new Date().toISOString();
    const { error: logError } = await adminClient
      .from("data_deletion_log")
      .insert({
        tenant_id: effectiveTenantId,
        order_id: orderId,
        order_created_at: order.created_at as string,
        file_count: filesDeleted,
        deleted_by: user.id,
        deletion_type: "manual",
      });

    if (logError) {
      console.error(
        `Error inserting deletion log for order ${orderId}:`,
        logError.message
      );
      // Non-fatal: the order is already deleted, log failure should not roll back
    }

    // 10. Return success
    return NextResponse.json({
      success: true,
      data: {
        orderId,
        filesDeleted,
        deletedAt,
      },
    });
  } catch (error) {
    console.error("Unexpected error in DELETE /api/orders/[orderId]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
