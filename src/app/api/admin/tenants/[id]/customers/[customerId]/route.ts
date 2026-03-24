import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse } from "@/lib/admin-auth";
import { updateCustomerSchema } from "@/lib/validations";
import type { ApiResponse } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PUT /api/admin/tenants/[id]/customers/[customerId]
 *
 * Platform admin: updates a single customer for a specific tenant.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; customerId: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id: tenantId, customerId } = await params;

    if (!UUID_REGEX.test(tenantId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Mandanten-ID." },
        { status: 400 }
      );
    }

    if (!UUID_REGEX.test(customerId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Kunden-ID." },
        { status: 400 }
      );
    }

    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { adminClient } = auth;

    // Verify the customer exists and belongs to this tenant
    const { data: existing, error: fetchError } = await adminClient
      .from("customer_catalog")
      .select("id, tenant_id")
      .eq("id", customerId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { success: false, error: "Kunde nicht gefunden." },
        { status: 404 }
      );
    }

    if (existing.tenant_id !== tenantId) {
      return NextResponse.json(
        { success: false, error: "Kunde gehoert nicht zu diesem Mandanten." },
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
      .eq("id", customerId);

    if (updateError) {
      if (updateError.code === "23505") {
        return NextResponse.json(
          { success: false, error: "Kundennummer bereits vorhanden." },
          { status: 409 }
        );
      }
      console.error("Error updating customer for admin:", updateError.message);
      return NextResponse.json(
        { success: false, error: "Kunde konnte nicht aktualisiert werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error in PUT /api/admin/tenants/[id]/customers/[customerId]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/tenants/[id]/customers/[customerId]
 *
 * Platform admin: deletes a single customer for a specific tenant.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; customerId: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id: tenantId, customerId } = await params;

    if (!UUID_REGEX.test(tenantId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Mandanten-ID." },
        { status: 400 }
      );
    }

    if (!UUID_REGEX.test(customerId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Kunden-ID." },
        { status: 400 }
      );
    }

    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { adminClient } = auth;

    // Verify the customer exists and belongs to this tenant
    const { data: existing, error: fetchError } = await adminClient
      .from("customer_catalog")
      .select("id, tenant_id")
      .eq("id", customerId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { success: false, error: "Kunde nicht gefunden." },
        { status: 404 }
      );
    }

    if (existing.tenant_id !== tenantId) {
      return NextResponse.json(
        { success: false, error: "Kunde gehoert nicht zu diesem Mandanten." },
        { status: 403 }
      );
    }

    const { error: deleteError } = await adminClient
      .from("customer_catalog")
      .delete()
      .eq("id", customerId);

    if (deleteError) {
      console.error("Error deleting customer for admin:", deleteError.message);
      return NextResponse.json(
        { success: false, error: "Kunde konnte nicht geloescht werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error in DELETE /api/admin/tenants/[id]/customers/[customerId]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
