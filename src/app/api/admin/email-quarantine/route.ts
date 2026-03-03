import { NextResponse } from "next/server";
import { requirePlatformAdmin, isErrorResponse } from "@/lib/admin-auth";
import type { ApiResponse, EmailQuarantineListItem } from "@/lib/types";

/**
 * GET /api/admin/email-quarantine
 *
 * Lists quarantined emails for admin review.
 * Platform admin only.
 */
export async function GET(): Promise<
  NextResponse<ApiResponse<{ entries: EmailQuarantineListItem[] }>> | NextResponse<ApiResponse>
> {
  try {
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;

    const { adminClient } = auth;

    // Fetch quarantined emails with tenant name, ordered by newest first
    const { data, error } = await adminClient
      .from("email_quarantine")
      .select(`
        id,
        tenant_id,
        sender_email,
        sender_name,
        subject,
        message_id,
        received_at,
        storage_path,
        review_status,
        reviewed_by,
        reviewed_at,
        order_id,
        created_at,
        tenants ( name )
      `)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Failed to fetch quarantine entries:", error.message);
      return NextResponse.json(
        { success: false, error: "Quarantaene-Eintraege konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    const entries: EmailQuarantineListItem[] = (data ?? []).map((row) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      sender_email: row.sender_email,
      sender_name: row.sender_name,
      subject: row.subject,
      message_id: row.message_id,
      received_at: row.received_at,
      storage_path: row.storage_path,
      review_status: row.review_status,
      reviewed_by: row.reviewed_by,
      reviewed_at: row.reviewed_at,
      order_id: row.order_id,
      created_at: row.created_at,
      tenant_name: (row.tenants as unknown as { name: string })?.name ?? "Unbekannt",
    }));

    return NextResponse.json({ success: true, data: { entries } });
  } catch (error) {
    console.error("Unexpected error in quarantine list:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
