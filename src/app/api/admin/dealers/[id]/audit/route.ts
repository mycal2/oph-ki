import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse } from "@/lib/admin-auth";
import type { DealerAuditLogEntry } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/dealers/[id]/audit
 *
 * Returns the audit log entries for a specific dealer, newest first.
 * Platform admin only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Haendler-ID." },
        { status: 400 }
      );
    }

    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { adminClient } = auth;

    // Verify dealer exists
    const { data: dealer, error: dealerError } = await adminClient
      .from("dealers")
      .select("id")
      .eq("id", id)
      .single();

    if (dealerError || !dealer) {
      return NextResponse.json(
        { success: false, error: "Haendler nicht gefunden." },
        { status: 404 }
      );
    }

    // Fetch audit log entries
    const { data: entries, error: auditError } = await adminClient
      .from("dealer_audit_log")
      .select("*")
      .eq("dealer_id", id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (auditError) {
      console.error("Failed to fetch dealer audit log:", auditError.message);
      return NextResponse.json(
        { success: false, error: "Audit-Log konnte nicht geladen werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: (entries ?? []) as unknown as DealerAuditLogEntry[],
    });
  } catch (error) {
    console.error("Error in GET /api/admin/dealers/[id]/audit:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
