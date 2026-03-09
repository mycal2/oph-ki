import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";
import { updateDealerSchema } from "@/lib/validations";
import { checkRuleConflicts } from "@/lib/dealer-rule-conflicts";
import type { Dealer, DealerAuditAction } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/dealers/[id]
 *
 * Returns the full dealer record. Platform admin only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: "Ungültige Händler-ID." },
        { status: 400 }
      );
    }

    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { adminClient } = auth;

    const { data: dealer, error } = await adminClient
      .from("dealers")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !dealer) {
      return NextResponse.json(
        { success: false, error: "Händler nicht gefunden." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: dealer as unknown as Dealer });
  } catch (error) {
    console.error("Error in GET /api/admin/dealers/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/dealers/[id]
 *
 * Updates a dealer. Computes a diff and writes to the audit log.
 * Returns the updated dealer and any rule conflict warnings.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: "Ungültige Händler-ID." },
        { status: 400 }
      );
    }

    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitResponse = checkAdminRateLimit(user.id);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const parsed = updateDealerSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungültige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const input = parsed.data;

    // Fetch current state for diff
    const { data: current, error: fetchError } = await adminClient
      .from("dealers")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !current) {
      return NextResponse.json(
        { success: false, error: "Händler nicht gefunden." },
        { status: 404 }
      );
    }

    // Check for rule conflicts
    const warnings = await checkRuleConflicts(adminClient, input, id);

    // Build update payload (only defined fields)
    const updatePayload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        updatePayload[key] = value;
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { success: false, error: "Keine Änderungen angegeben." },
        { status: 400 }
      );
    }

    // Compute diff for audit log
    const changedFields: Record<string, { old: unknown; new: unknown }> = {};
    for (const [key, newValue] of Object.entries(updatePayload)) {
      const oldValue = (current as Record<string, unknown>)[key];
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changedFields[key] = { old: oldValue, new: newValue };
      }
    }

    // Determine audit action
    let action: DealerAuditAction = "updated";
    if ("active" in updatePayload) {
      if (updatePayload.active === false && current.active === true) {
        action = "deactivated";
      } else if (updatePayload.active === true && current.active === false) {
        action = "reactivated";
      }
    }

    // Update the dealer
    const { data: updated, error: updateError } = await adminClient
      .from("dealers")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updated) {
      console.error("Failed to update dealer:", updateError?.message);
      return NextResponse.json(
        { success: false, error: "Händler konnte nicht aktualisiert werden." },
        { status: 500 }
      );
    }

    // Write audit log (only if something actually changed)
    if (Object.keys(changedFields).length > 0) {
      const { error: auditError } = await adminClient.from("dealer_audit_log").insert({
        dealer_id: id,
        changed_by: user.id,
        admin_email: user.email ?? "unknown",
        action,
        changed_fields: changedFields,
        snapshot_before: current,
      });
      if (auditError) {
        console.error("Failed to write dealer audit log:", auditError.message);
      }
    }

    return NextResponse.json({
      success: true,
      data: { dealer: updated as unknown as Dealer, warnings },
    });
  } catch (error) {
    console.error("Error in PATCH /api/admin/dealers/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/dealers/[id]
 *
 * Soft-deletes a dealer (sets active = false). Writes audit log.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: "Ungültige Händler-ID." },
        { status: 400 }
      );
    }

    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitResponse = checkAdminRateLimit(user.id);
    if (rateLimitResponse) return rateLimitResponse;

    // Fetch current state
    const { data: current, error: fetchError } = await adminClient
      .from("dealers")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !current) {
      return NextResponse.json(
        { success: false, error: "Händler nicht gefunden." },
        { status: 404 }
      );
    }

    // Soft-delete
    const { error: updateError } = await adminClient
      .from("dealers")
      .update({ active: false })
      .eq("id", id);

    if (updateError) {
      console.error("Failed to deactivate dealer:", updateError.message);
      return NextResponse.json(
        { success: false, error: "Händler konnte nicht deaktiviert werden." },
        { status: 500 }
      );
    }

    // Write audit log
    const { error: auditError } = await adminClient.from("dealer_audit_log").insert({
      dealer_id: id,
      changed_by: user.id,
      admin_email: user.email ?? "unknown",
      action: "deactivated",
      changed_fields: { active: { old: true, new: false } },
      snapshot_before: current,
    });
    if (auditError) {
      console.error("Failed to write dealer audit log:", auditError.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/admin/dealers/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

