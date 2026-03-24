import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse } from "@/lib/admin-auth";
import { createCustomerSchema } from "@/lib/validations";
import type { CustomerCatalogItem, ApiResponse } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/tenants/[id]/customers?page=1&pageSize=50&search=...
 *
 * Platform admin: returns a paginated list of customers for a specific tenant.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: tenantId } = await params;

    if (!UUID_REGEX.test(tenantId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Mandanten-ID." },
        { status: 400 }
      );
    }

    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { adminClient } = auth;

    // Parse query params
    const url = new URL(request.url);
    const pageParam = parseInt(url.searchParams.get("page") ?? "1", 10);
    const pageSizeParam = parseInt(url.searchParams.get("pageSize") ?? "50", 10);
    const page = Math.max(1, pageParam);
    const pageSize = Math.min(Math.max(1, pageSizeParam), 200);
    const offset = (page - 1) * pageSize;
    const search = url.searchParams.get("search")?.trim() ?? "";

    // Build query
    let query = adminClient
      .from("customer_catalog")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("customer_number", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (search.length > 0) {
      // Escape LIKE wildcards and strip commas/dots that could break PostgREST .or() filter syntax
      const escaped = search
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_")
        .replace(/[,.()"]/g, "");
      if (escaped.length > 0) {
        query = query.or(
          `customer_number.ilike.%${escaped}%,company_name.ilike.%${escaped}%,keywords.ilike.%${escaped}%`
        );
      }
    }

    const { data: customers, count, error: queryError } = await query;

    if (queryError) {
      console.error("Error fetching customers for admin:", queryError.message);
      return NextResponse.json(
        { success: false, error: "Kundenstamm konnte nicht geladen werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        customers: (customers ?? []) as unknown as CustomerCatalogItem[],
        total: count ?? 0,
        page,
        pageSize,
      },
    });
  } catch (error) {
    console.error("Unexpected error in GET /api/admin/tenants/[id]/customers:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/tenants/[id]/customers
 *
 * Platform admin: creates a single customer for a specific tenant.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: tenantId } = await params;

    if (!UUID_REGEX.test(tenantId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Mandanten-ID." },
        { status: 400 }
      );
    }

    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { adminClient } = auth;

    // Verify tenant exists
    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .select("id")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { success: false, error: "Mandant nicht gefunden." },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = createCustomerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Ungueltige Eingabe." },
        { status: 400 }
      );
    }

    const { data: newCustomer, error: insertError } = await adminClient
      .from("customer_catalog")
      .insert({
        tenant_id: tenantId,
        customer_number: parsed.data.customer_number,
        company_name: parsed.data.company_name,
        street: parsed.data.street ?? null,
        postal_code: parsed.data.postal_code ?? null,
        city: parsed.data.city ?? null,
        country: parsed.data.country ?? null,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        keywords: parsed.data.keywords ?? null,
        notes: parsed.data.notes ?? null,
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json(
          { success: false, error: "Kundennummer bereits vorhanden." },
          { status: 409 }
        );
      }
      console.error("Error creating customer for admin:", insertError.message);
      return NextResponse.json(
        { success: false, error: "Kunde konnte nicht erstellt werden." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, data: { id: newCustomer.id as string } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Unexpected error in POST /api/admin/tenants/[id]/customers:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
