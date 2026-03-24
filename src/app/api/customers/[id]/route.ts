import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateCustomerSchema } from "@/lib/validations";
import type { AppMetadata, ApiResponse } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PUT /api/customers/[id]
 *
 * Updates a single customer in the tenant's catalog.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id } = await params;

    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Kunden-ID." },
        { status: 400 }
      );
    }

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
    if (role !== "tenant_admin" && role !== "platform_admin") {
      return NextResponse.json(
        { success: false, error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const tenantId = appMetadata?.tenant_id;
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: "Kein Mandant zugewiesen." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = updateCustomerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Ungueltige Eingabe." },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Verify the customer belongs to this tenant
    const { data: existing, error: fetchError } = await adminClient
      .from("customer_catalog")
      .select("id, tenant_id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { success: false, error: "Kunde nicht gefunden." },
        { status: 404 }
      );
    }

    if (existing.tenant_id !== tenantId) {
      return NextResponse.json(
        { success: false, error: "Keine Berechtigung fuer diesen Kunden." },
        { status: 403 }
      );
    }

    // Build update data from parsed fields (only include provided fields)
    const updateData: Record<string, unknown> = {};
    const fields = parsed.data;
    if (fields.customer_number !== undefined) updateData.customer_number = fields.customer_number;
    if (fields.company_name !== undefined) updateData.company_name = fields.company_name;
    if (fields.street !== undefined) updateData.street = fields.street;
    if (fields.postal_code !== undefined) updateData.postal_code = fields.postal_code;
    if (fields.city !== undefined) updateData.city = fields.city;
    if (fields.country !== undefined) updateData.country = fields.country;
    if (fields.email !== undefined) updateData.email = fields.email;
    if (fields.phone !== undefined) updateData.phone = fields.phone;
    if (fields.keywords !== undefined) updateData.keywords = fields.keywords;
    if (fields.notes !== undefined) updateData.notes = fields.notes;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: "Keine Felder zum Aktualisieren angegeben." },
        { status: 400 }
      );
    }

    const { error: updateError } = await adminClient
      .from("customer_catalog")
      .update(updateData)
      .eq("id", id);

    if (updateError) {
      if (updateError.code === "23505") {
        return NextResponse.json(
          { success: false, error: "Kundennummer bereits vorhanden." },
          { status: 409 }
        );
      }
      console.error("Error updating customer:", updateError.message);
      return NextResponse.json(
        { success: false, error: "Kunde konnte nicht aktualisiert werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error in PUT /api/customers/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/customers/[id]
 *
 * Hard-deletes a customer from the tenant's catalog.
 * Past orders are not affected (customer_number is stored in reviewed_data, not referenced by FK).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id } = await params;

    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Kunden-ID." },
        { status: 400 }
      );
    }

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
    if (role !== "tenant_admin" && role !== "platform_admin") {
      return NextResponse.json(
        { success: false, error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const tenantId = appMetadata?.tenant_id;
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: "Kein Mandant zugewiesen." },
        { status: 403 }
      );
    }

    const adminClient = createAdminClient();

    // Verify the customer belongs to this tenant
    const { data: existing, error: fetchError } = await adminClient
      .from("customer_catalog")
      .select("id, tenant_id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { success: false, error: "Kunde nicht gefunden." },
        { status: 404 }
      );
    }

    if (existing.tenant_id !== tenantId) {
      return NextResponse.json(
        { success: false, error: "Keine Berechtigung fuer diesen Kunden." },
        { status: 403 }
      );
    }

    const { error: deleteError } = await adminClient
      .from("customer_catalog")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("Error deleting customer:", deleteError.message);
      return NextResponse.json(
        { success: false, error: "Kunde konnte nicht geloescht werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error in DELETE /api/customers/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
