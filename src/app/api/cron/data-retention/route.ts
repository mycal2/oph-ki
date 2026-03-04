import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/cron/data-retention
 *
 * Nightly cron job for automatic data retention cleanup (DSGVO compliance).
 *
 * For each tenant, deletes orders older than the tenant's configured
 * `data_retention_days` that are in a terminal status (approved, exported, error).
 * Orders in active statuses (uploaded, processing, extracted, review) are never
 * auto-deleted to avoid disrupting work in progress.
 *
 * Secured via CRON_SECRET bearer token (Vercel Cron standard).
 *
 * NOTE: This cron job is code-only for now (development phase) and is not
 * registered in vercel.json.
 */

/** Statuses eligible for automatic retention-based deletion. */
const DELETABLE_STATUSES = ["approved", "exported", "error"];

export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const adminClient = createAdminClient();

    // 1. Fetch all tenants with their retention settings
    const { data: tenants, error: tenantsError } = await adminClient
      .from("tenants")
      .select("id, data_retention_days")
      .eq("status", "active");

    if (tenantsError) {
      console.error("Error fetching tenants for data retention:", tenantsError.message);
      return NextResponse.json(
        { success: false, error: "Failed to fetch tenants." },
        { status: 500 }
      );
    }

    if (!tenants || tenants.length === 0) {
      return NextResponse.json({
        success: true,
        data: { cleaned: 0, tenantsProcessed: 0 },
      });
    }

    let totalCleaned = 0;
    let tenantsProcessed = 0;

    // 2. Process each tenant
    for (const tenant of tenants) {
      const tenantId = tenant.id as string;
      const retentionDays = tenant.data_retention_days as number;

      // Calculate the cutoff date for this tenant
      const cutoff = new Date(
        Date.now() - retentionDays * 24 * 60 * 60 * 1000
      ).toISOString();

      // 3. Find orders eligible for deletion
      const { data: expiredOrders, error: queryError } = await adminClient
        .from("orders")
        .select("id, tenant_id, created_at")
        .eq("tenant_id", tenantId)
        .in("status", DELETABLE_STATUSES)
        .lt("created_at", cutoff);

      if (queryError) {
        console.error(
          `Error querying expired orders for tenant ${tenantId}:`,
          queryError.message
        );
        continue;
      }

      if (!expiredOrders || expiredOrders.length === 0) {
        continue;
      }

      tenantsProcessed++;

      // 4. Delete storage files and order records for each expired order
      for (const order of expiredOrders) {
        const orderId = order.id as string;
        const dirPath = `${tenantId}/${orderId}`;

        // Count files for the deletion log
        let fileCount = 0;

        // Delete storage files
        const { data: files } = await adminClient.storage
          .from("order-files")
          .list(dirPath);

        if (files && files.length > 0) {
          fileCount = files.length;
          const filePaths = files.map((f) => `${dirPath}/${f.name}`);
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

        // Delete the order record (order_files cascade via FK)
        const { error: deleteError } = await adminClient
          .from("orders")
          .delete()
          .eq("id", orderId);

        if (deleteError) {
          console.error(
            `Error deleting order ${orderId}:`,
            deleteError.message
          );
          continue;
        }

        // 5. Insert deletion log entry (append-only audit trail)
        const { error: logError } = await adminClient
          .from("data_deletion_log")
          .insert({
            tenant_id: tenantId,
            order_id: orderId,
            order_created_at: order.created_at as string,
            file_count: fileCount,
            deleted_by: null, // automatic deletion, no user
            deletion_type: "automatic",
          });

        if (logError) {
          console.error(
            `Error inserting deletion log for order ${orderId}:`,
            logError.message
          );
        }

        totalCleaned++;
      }
    }

    console.log(
      `Data retention cleanup: ${totalCleaned} orders deleted across ${tenantsProcessed} tenants.`
    );

    return NextResponse.json({
      success: true,
      data: { cleaned: totalCleaned, tenantsProcessed },
    });
  } catch (error) {
    console.error("Unexpected error in data retention cron:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 500 }
    );
  }
}
