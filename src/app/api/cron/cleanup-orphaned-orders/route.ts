import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/cron/cleanup-orphaned-orders
 *
 * Periodic cleanup of orphaned order records created during the two-step
 * upload flow. An order becomes orphaned when:
 *   1. The presign step creates the order record (status = 'uploaded')
 *   2. The client never completes the confirm step (browser closed, network error, etc.)
 *
 * This job finds orders older than 1 hour with status 'uploaded' and no
 * associated order_files, cleans up any storage objects, and deletes the records.
 *
 * Secured via CRON_SECRET bearer token (Vercel Cron standard).
 */

const ORPHAN_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

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
    const cutoff = new Date(Date.now() - ORPHAN_THRESHOLD_MS).toISOString();

    // Find candidate orders: status = 'uploaded' and older than threshold
    const { data: candidates, error: queryError } = await adminClient
      .from("orders")
      .select("id, tenant_id")
      .eq("status", "uploaded")
      .lt("created_at", cutoff);

    if (queryError) {
      console.error("Error querying orphaned orders:", queryError.message);
      return NextResponse.json(
        { success: false, error: "Database query failed." },
        { status: 500 }
      );
    }

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({
        success: true,
        data: { cleaned: 0, storageCleaned: 0 },
      });
    }

    // Filter to only orders with NO order_files (true orphans)
    const orderIds = candidates.map((o) => o.id as string);
    const { data: filesForOrders } = await adminClient
      .from("order_files")
      .select("order_id")
      .in("order_id", orderIds);

    const ordersWithFiles = new Set(
      (filesForOrders ?? []).map((f) => f.order_id as string)
    );

    const orphans = candidates.filter(
      (o) => !ordersWithFiles.has(o.id as string)
    );

    if (orphans.length === 0) {
      return NextResponse.json({
        success: true,
        data: { cleaned: 0, storageCleaned: 0 },
      });
    }

    // Clean up storage files for each orphaned order
    let storageCleaned = 0;

    for (const orphan of orphans) {
      const tenantId = orphan.tenant_id as string;
      const orderId = orphan.id as string;
      const dirPath = `${tenantId}/${orderId}`;

      const { data: files } = await adminClient.storage
        .from("order-files")
        .list(dirPath);

      if (files && files.length > 0) {
        const filePaths = files.map((f) => `${dirPath}/${f.name}`);
        const { error: storageError } = await adminClient.storage
          .from("order-files")
          .remove(filePaths);

        if (storageError) {
          console.error(
            `Error deleting storage files for order ${orderId}:`,
            storageError.message
          );
        } else {
          storageCleaned += filePaths.length;
        }
      }
    }

    // Delete orphaned order records (order_files cascade if any exist)
    const orphanIds = orphans.map((o) => o.id as string);
    const { error: deleteError } = await adminClient
      .from("orders")
      .delete()
      .in("id", orphanIds);

    if (deleteError) {
      console.error("Error deleting orphaned orders:", deleteError.message);
      return NextResponse.json(
        { success: false, error: "Failed to delete orphaned orders." },
        { status: 500 }
      );
    }

    console.log(
      `Cleaned up ${orphanIds.length} orphaned orders, ${storageCleaned} storage files.`
    );

    return NextResponse.json({
      success: true,
      data: { cleaned: orphanIds.length, storageCleaned },
    });
  } catch (error) {
    console.error("Unexpected error in orphaned order cleanup:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 500 }
    );
  }
}
