import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateMappingSchema } from "@/lib/validations";
import type { AppMetadata, ApiResponse } from "@/lib/types";

/**
 * PATCH /api/dealer-mappings/[id]
 *
 * Updates a dealer data mapping. Only the owner (by tenant_id) or platform_admin can update.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id } = await params;
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

    const role = appMetadata?.role;
    const tenantId = appMetadata?.tenant_id;

    if (role !== "tenant_admin" && role !== "platform_admin") {
      return NextResponse.json(
        { success: false, error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = updateMappingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Fetch existing mapping to check ownership
    const { data: existing, error: fetchError } = await adminClient
      .from("dealer_data_mappings")
      .select("id, tenant_id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { success: false, error: "Zuordnung nicht gefunden." },
        { status: 404 }
      );
    }

    // Authorization: platform_admin can edit any, tenant_admin only their own
    if (role === "tenant_admin" && existing.tenant_id !== tenantId) {
      return NextResponse.json(
        { success: false, error: "Keine Berechtigung für diese Zuordnung." },
        { status: 403 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.dealerValue !== undefined) updateData.dealer_value = parsed.data.dealerValue;
    if (parsed.data.erpValue !== undefined) updateData.erp_value = parsed.data.erpValue;
    if (parsed.data.conversionFactor !== undefined)
      updateData.conversion_factor = parsed.data.conversionFactor;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.active !== undefined) updateData.active = parsed.data.active;

    const { error: updateError } = await adminClient
      .from("dealer_data_mappings")
      .update(updateData)
      .eq("id", id);

    if (updateError) {
      if (updateError.code === "23505") {
        return NextResponse.json(
          { success: false, error: "Diese Zuordnung existiert bereits." },
          { status: 409 }
        );
      }
      console.error("Error updating mapping:", updateError.message);
      return NextResponse.json(
        { success: false, error: "Zuordnung konnte nicht aktualisiert werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error in PATCH /api/dealer-mappings/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/dealer-mappings/[id]
 *
 * Soft-deletes a mapping by setting active = false.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id } = await params;
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

    const role = appMetadata?.role;
    const tenantId = appMetadata?.tenant_id;

    if (role !== "tenant_admin" && role !== "platform_admin") {
      return NextResponse.json(
        { success: false, error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const adminClient = createAdminClient();

    // Fetch existing mapping to check ownership
    const { data: existing, error: fetchError } = await adminClient
      .from("dealer_data_mappings")
      .select("id, tenant_id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { success: false, error: "Zuordnung nicht gefunden." },
        { status: 404 }
      );
    }

    if (role === "tenant_admin" && existing.tenant_id !== tenantId) {
      return NextResponse.json(
        { success: false, error: "Keine Berechtigung für diese Zuordnung." },
        { status: 403 }
      );
    }

    const { error: deleteError } = await adminClient
      .from("dealer_data_mappings")
      .update({ active: false })
      .eq("id", id);

    if (deleteError) {
      console.error("Error deleting mapping:", deleteError.message);
      return NextResponse.json(
        { success: false, error: "Zuordnung konnte nicht gelöscht werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error in DELETE /api/dealer-mappings/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
