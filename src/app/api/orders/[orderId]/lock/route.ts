import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppMetadata, ApiResponse } from "@/lib/types";

const LOCK_DURATION_MINUTES = 15;

export interface OrderLockInfo {
  orderId: string;
  lockedByUserId: string;
  lockedByName: string;
  lockedAt: string;
  expiresAt: string;
  isOwnLock: boolean;
}

/** Helper: authenticate and return user + tenant info. */
async function authenticate() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const meta = user.app_metadata as AppMetadata | undefined;
  if (meta?.user_status === "inactive" || meta?.tenant_status === "inactive") return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    tenantId: meta?.tenant_id ?? null,
    isPlatformAdmin: meta?.role === "platform_admin",
    isTenantAdmin: meta?.role === "tenant_admin",
  };
}

/**
 * GET /api/orders/[orderId]/lock
 * Check current lock status.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
): Promise<NextResponse<ApiResponse<OrderLockInfo | null>>> {
  const auth = await authenticate();
  if (!auth) {
    return NextResponse.json({ success: false, error: "Nicht authentifiziert." }, { status: 401 });
  }

  const { orderId } = await params;
  const adminClient = createAdminClient();

  // Verify order exists and user has access
  let orderQuery = adminClient.from("orders").select("id, tenant_id").eq("id", orderId);
  if (!auth.isPlatformAdmin && auth.tenantId) {
    orderQuery = orderQuery.eq("tenant_id", auth.tenantId);
  }
  const { data: order } = await orderQuery.single();
  if (!order) {
    return NextResponse.json({ success: false, error: "Bestellung nicht gefunden." }, { status: 404 });
  }

  // Fetch active lock
  const { data: lock } = await adminClient
    .from("order_locks")
    .select("order_id, locked_by_user_id, locked_by_name, locked_at, expires_at")
    .eq("order_id", orderId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!lock) {
    return NextResponse.json({ success: true, data: null });
  }

  return NextResponse.json({
    success: true,
    data: {
      orderId: lock.order_id as string,
      lockedByUserId: lock.locked_by_user_id as string,
      lockedByName: lock.locked_by_name as string,
      lockedAt: lock.locked_at as string,
      expiresAt: lock.expires_at as string,
      isOwnLock: (lock.locked_by_user_id as string) === auth.userId,
    },
  });
}

/**
 * POST /api/orders/[orderId]/lock
 * Acquire lock. Fails with 409 if order is already locked by another user.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
): Promise<NextResponse<ApiResponse<OrderLockInfo>>> {
  const auth = await authenticate();
  if (!auth) {
    return NextResponse.json({ success: false, error: "Nicht authentifiziert." }, { status: 401 });
  }

  const { orderId } = await params;
  const adminClient = createAdminClient();

  // Verify order exists and get tenant_id
  let orderQuery = adminClient.from("orders").select("id, tenant_id, status").eq("id", orderId);
  if (!auth.isPlatformAdmin && auth.tenantId) {
    orderQuery = orderQuery.eq("tenant_id", auth.tenantId);
  }
  const { data: order } = await orderQuery.single();
  if (!order) {
    return NextResponse.json({ success: false, error: "Bestellung nicht gefunden." }, { status: 404 });
  }

  if ((order.status as string) === "exported") {
    return NextResponse.json(
      { success: false, error: "Exportierte Bestellungen können nicht bearbeitet werden." },
      { status: 409 }
    );
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_DURATION_MINUTES * 60 * 1000);

  // Check for existing active lock
  const { data: existingLock } = await adminClient
    .from("order_locks")
    .select("locked_by_user_id, locked_by_name, locked_at, expires_at")
    .eq("order_id", orderId)
    .gt("expires_at", now.toISOString())
    .maybeSingle();

  // If locked by someone else, return 409
  if (existingLock && (existingLock.locked_by_user_id as string) !== auth.userId) {
    return NextResponse.json(
      {
        success: false,
        error: `Wird gerade von ${existingLock.locked_by_name} bearbeitet.`,
        data: {
          orderId,
          lockedByUserId: existingLock.locked_by_user_id as string,
          lockedByName: existingLock.locked_by_name as string,
          lockedAt: existingLock.locked_at as string,
          expiresAt: existingLock.expires_at as string,
          isOwnLock: false,
        },
      },
      { status: 409 }
    );
  }

  // Fetch user's display name
  const { data: profile } = await adminClient
    .from("user_profiles")
    .select("first_name, last_name")
    .eq("id", auth.userId)
    .single();

  const fullName = profile
    ? `${profile.first_name} ${profile.last_name}`.trim()
    : "";
  const displayName = fullName || auth.email || "Unbekannt";

  // Delete any expired lock for this order, then insert
  await adminClient.from("order_locks").delete().eq("order_id", orderId);

  const { error: insertError } = await adminClient.from("order_locks").insert({
    order_id: orderId,
    tenant_id: order.tenant_id as string,
    locked_by_user_id: auth.userId,
    locked_by_name: displayName,
    locked_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  if (insertError) {
    console.error("Error acquiring lock:", insertError.message);
    return NextResponse.json(
      { success: false, error: "Sperre konnte nicht gesetzt werden." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      orderId,
      lockedByUserId: auth.userId,
      lockedByName: displayName,
      lockedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      isOwnLock: true,
    },
  });
}

/**
 * PUT /api/orders/[orderId]/lock
 * Heartbeat — extend lock expiry. Only the lock holder can extend.
 */
export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
): Promise<NextResponse<ApiResponse<{ expiresAt: string }>>> {
  const auth = await authenticate();
  if (!auth) {
    return NextResponse.json({ success: false, error: "Nicht authentifiziert." }, { status: 401 });
  }

  const { orderId } = await params;
  const adminClient = createAdminClient();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_DURATION_MINUTES * 60 * 1000);

  const { data, error } = await adminClient
    .from("order_locks")
    .update({ expires_at: expiresAt.toISOString() })
    .eq("order_id", orderId)
    .eq("locked_by_user_id", auth.userId)
    .select("expires_at")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { success: false, error: "Sperre nicht gefunden oder abgelaufen." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: { expiresAt: data.expires_at as string },
  });
}

/**
 * DELETE /api/orders/[orderId]/lock
 * Release lock. Lock holder, tenant admins, and platform admins can release.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
): Promise<NextResponse<ApiResponse<null>>> {
  const auth = await authenticate();
  if (!auth) {
    return NextResponse.json({ success: false, error: "Nicht authentifiziert." }, { status: 401 });
  }

  const { orderId } = await params;
  const adminClient = createAdminClient();

  // Check who holds the lock
  const { data: lock } = await adminClient
    .from("order_locks")
    .select("locked_by_user_id")
    .eq("order_id", orderId)
    .maybeSingle();

  if (!lock) {
    // Already unlocked — success
    return NextResponse.json({ success: true, data: null });
  }

  const isLockHolder = (lock.locked_by_user_id as string) === auth.userId;
  const canOverride = auth.isPlatformAdmin || auth.isTenantAdmin;

  if (!isLockHolder && !canOverride) {
    return NextResponse.json(
      { success: false, error: "Nur der Bearbeiter oder ein Admin kann die Sperre aufheben." },
      { status: 403 }
    );
  }

  await adminClient.from("order_locks").delete().eq("order_id", orderId);

  return NextResponse.json({ success: true, data: null });
}
