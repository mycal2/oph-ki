import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";
import { updateTenantSchema } from "@/lib/validations";
import type { Tenant } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/tenants/[id]
 *
 * Returns the full tenant record. Platform admin only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: "Ungültige Mandanten-ID." },
        { status: 400 }
      );
    }

    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { adminClient } = auth;

    const { data: tenant, error } = await adminClient
      .from("tenants")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !tenant) {
      return NextResponse.json(
        { success: false, error: "Mandant nicht gefunden." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: tenant as unknown as Tenant });
  } catch (error) {
    console.error("Error in GET /api/admin/tenants/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/tenants/[id]
 *
 * Updates a tenant. Slug is immutable after creation.
 * Platform admin only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: "Ungültige Mandanten-ID." },
        { status: 400 }
      );
    }

    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitResponse = checkAdminRateLimit(user.id);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const parsed = updateTenantSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungültige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const input = parsed.data;

    // Verify tenant exists
    const { data: current, error: fetchError } = await adminClient
      .from("tenants")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !current) {
      return NextResponse.json(
        { success: false, error: "Mandant nicht gefunden." },
        { status: 404 }
      );
    }

    // Build update payload (only defined fields)
    const updatePayload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        updatePayload[key] = value;
      }
    }

    // OPH-16: Auto-set trial dates when status changes to 'trial'
    if (
      input.status === "trial" &&
      (current as { status: string }).status !== "trial"
    ) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000);
      updatePayload.trial_started_at = now.toISOString();
      updatePayload.trial_expires_at = expiresAt.toISOString();
    }

    // OPH-73: Check salesforce_slug uniqueness before saving
    if (input.salesforce_slug && input.salesforce_slug !== (current as Record<string, unknown>).salesforce_slug) {
      const { data: existingSlug } = await adminClient
        .from("tenants")
        .select("id")
        .eq("salesforce_slug", input.salesforce_slug)
        .neq("id", id)
        .maybeSingle();

      if (existingSlug) {
        return NextResponse.json(
          { success: false, error: `Der Slug "${input.salesforce_slug}" wird bereits von einem anderen Mandanten verwendet.` },
          { status: 409 }
        );
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { success: false, error: "Keine Änderungen angegeben." },
        { status: 400 }
      );
    }

    // Update the tenant
    const { data: updated, error: updateError } = await adminClient
      .from("tenants")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updated) {
      console.error("Failed to update tenant:", updateError?.message);
      return NextResponse.json(
        { success: false, error: "Mandant konnte nicht aktualisiert werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: updated as unknown as Tenant });
  } catch (error) {
    console.error("Error in PATCH /api/admin/tenants/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
