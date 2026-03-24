import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCustomerSchema } from "@/lib/validations";
import type {
  AppMetadata,
  ApiResponse,
  CustomerCatalogItem,
  CustomerCatalogPageResponse,
} from "@/lib/types";

/**
 * GET /api/customers?page=1&pageSize=50&search=...
 *
 * Returns a paginated list of customers for the current user's tenant.
 * Supports text search across customer_number, company_name, and keywords.
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResponse<CustomerCatalogPageResponse>>> {
  try {
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

    const tenantId = appMetadata?.tenant_id;
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: "Kein Mandant zugewiesen." },
        { status: 403 }
      );
    }

    // Parse query params
    const url = new URL(request.url);
    const pageParam = parseInt(url.searchParams.get("page") ?? "1", 10);
    const pageSizeParam = parseInt(url.searchParams.get("pageSize") ?? "50", 10);
    const page = Math.max(1, pageParam);
    const pageSize = Math.min(Math.max(1, pageSizeParam), 200);
    const offset = (page - 1) * pageSize;
    const search = url.searchParams.get("search")?.trim() ?? "";

    const adminClient = createAdminClient();

    // Build query
    let query = adminClient
      .from("customer_catalog")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("customer_number", { ascending: true })
      .range(offset, offset + pageSize - 1);

    // Apply text search if provided
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
      console.error("Error fetching customers:", queryError.message);
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
    console.error("Unexpected error in GET /api/customers:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/customers
 *
 * Creates a single customer in the tenant's catalog.
 * Returns 409 if customer_number already exists for this tenant.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ id: string }>>> {
  try {
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
    const parsed = createCustomerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Ungueltige Eingabe." },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

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
      console.error("Error creating customer:", insertError.message);
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
    console.error("Unexpected error in POST /api/customers:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
