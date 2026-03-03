import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse } from "@/lib/admin-auth";
import { quarantineActionSchema } from "@/lib/validations";
import type { ApiResponse } from "@/lib/types";

/**
 * PATCH /api/admin/email-quarantine/[id]
 *
 * Approve or reject a quarantined email.
 * Platform admin only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;

    const { user, adminClient } = auth;
    const { id } = await params;

    // Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Ungueltiges JSON." },
        { status: 400 }
      );
    }

    const parsed = quarantineActionSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungueltige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const { action } = parsed.data;

    // Verify the quarantine entry exists and is pending
    const { data: entry, error: fetchError } = await adminClient
      .from("email_quarantine")
      .select("id, review_status")
      .eq("id", id)
      .single();

    if (fetchError || !entry) {
      return NextResponse.json(
        { success: false, error: "Quarantaene-Eintrag nicht gefunden." },
        { status: 404 }
      );
    }

    if (entry.review_status !== "pending") {
      return NextResponse.json(
        { success: false, error: "Eintrag wurde bereits bearbeitet." },
        { status: 409 }
      );
    }

    // Update the quarantine entry
    const { error: updateError } = await adminClient
      .from("email_quarantine")
      .update({
        review_status: action,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error("Failed to update quarantine entry:", updateError.message);
      return NextResponse.json(
        { success: false, error: "Aktualisierung fehlgeschlagen." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error in quarantine action:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
