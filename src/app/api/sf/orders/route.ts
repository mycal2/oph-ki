import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sfOrderSubmitSchema } from "@/lib/validations";
import type {
  AppMetadata,
  ApiResponse,
  SalesforceOrderResponse,
  SalesforceOrderListResponse,
  SalesforceOrderListItem,
  CanonicalOrderData,
  CanonicalLineItem,
  CanonicalSender,
  CanonicalAddress,
  OrderStatus,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// GET /api/sf/orders — Order history list for the current sales rep
// ---------------------------------------------------------------------------

/**
 * OPH-81: GET /api/sf/orders?page=1
 *
 * Returns a paginated list of orders submitted by the current sales rep
 * via the Salesforce App (source = "salesforce_app"). Sorted newest first.
 * 20 items per page.
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResponse<SalesforceOrderListResponse>>> {
  try {
    // 1. Verify authentication
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

    // 2. Check user/tenant status
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

    if (appMetadata?.role !== "sales_rep") {
      return NextResponse.json(
        { success: false, error: "Nur Aussendienst-Mitarbeiter koennen Bestellungen einsehen." },
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

    // 3. Parse and validate query params (BUG-3: Zod validation)
    const querySchema = z.object({
      page: z.coerce.number().int().min(1).default(1),
      search: z.string().max(200).default(""),
      datePreset: z.enum(["thisMonth", "last3Months", "thisYear", ""]).default(""),
    });

    const url = new URL(request.url);
    const queryResult = querySchema.safeParse({
      page: url.searchParams.get("page") ?? "1",
      search: url.searchParams.get("search") ?? "",
      datePreset: url.searchParams.get("datePreset") ?? "",
    });

    if (!queryResult.success) {
      return NextResponse.json(
        { success: false, error: "Ungültige Abfrageparameter." },
        { status: 400 }
      );
    }

    const { page, search: rawSearch, datePreset: datePresetParam } = queryResult.data;
    const pageSize = 20;
    const offset = (page - 1) * pageSize;

    const searchParam = rawSearch.trim();

    // OPH-88: Compute date range from preset
    let dateFrom: string | null = null;
    if (datePresetParam) {
      const now = new Date();
      switch (datePresetParam) {
        case "thisMonth": {
          const start = new Date(now.getFullYear(), now.getMonth(), 1);
          dateFrom = start.toISOString();
          break;
        }
        case "last3Months": {
          // BUG-2 fix: use day 1 to avoid month-length overflow (e.g. May 31 → Feb 31)
          const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
          dateFrom = start.toISOString();
          break;
        }
        case "thisYear": {
          const start = new Date(now.getFullYear(), 0, 1);
          dateFrom = start.toISOString();
          break;
        }
        // Unknown preset: ignore (no filter)
      }
    }

    // 4. Query orders
    const adminClient = createAdminClient();
    let query = adminClient
      .from("orders")
      .select("id, status, created_at, extracted_data, dealer_id", { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("uploaded_by", user.id)
      .eq("source", "salesforce_app");

    // OPH-88: Apply date filter
    if (dateFrom) {
      query = query.gte("created_at", dateFrom);
    }

    // OPH-88: Apply search filter on JSONB fields (dealer name or customer number).
    // PostgREST supports nested JSONB arrow operators in filters.
    // We search: extracted_data->order->dealer->>name ILIKE %term%
    //         OR extracted_data->order->sender->>company_name ILIKE %term%
    //         OR extracted_data->order->sender->>customer_number ILIKE %term%
    if (searchParam) {
      // BUG-1 fix: Sanitize PostgREST filter syntax chars (commas, parentheses, backslashes)
      // to prevent filter injection, then escape LIKE wildcards (% and _)
      const sanitized = searchParam.replace(/[,()\\]/g, "");
      const escaped = sanitized.replace(/%/g, "\\%").replace(/_/g, "\\_");
      const pattern = `%${escaped}%`;
      query = query.or(
        [
          `extracted_data->order->dealer->>name.ilike.${pattern}`,
          `extracted_data->order->sender->>company_name.ilike.${pattern}`,
          `extracted_data->order->sender->>customer_number.ilike.${pattern}`,
        ].join(",")
      );
    }

    const { data: orders, count, error: queryError } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (queryError) {
      console.error("Error fetching SF order history:", queryError.message);
      return NextResponse.json(
        { success: false, error: "Bestellungen konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    // 5. Map to response format
    const items: SalesforceOrderListItem[] = (orders ?? []).map((order) => {
      const data = order.extracted_data as CanonicalOrderData | null;
      const dealerName = data?.order?.dealer?.name ?? data?.order?.sender?.company_name ?? null;
      const customerNumber = data?.order?.sender?.customer_number ?? null;
      const lineItemCount = data?.order?.line_items?.length ?? 0;

      return {
        id: order.id as string,
        status: order.status as OrderStatus,
        createdAt: order.created_at as string,
        dealerName,
        customerNumber,
        lineItemCount,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        orders: items,
        total: count ?? 0,
        page,
        pageSize,
      },
    });
  } catch (error) {
    console.error("Unexpected error in GET /api/sf/orders:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/sf/orders — Create a new order
// ---------------------------------------------------------------------------

/**
 * OPH-80: POST /api/sf/orders
 *
 * Creates a new order from the Salesforce App checkout.
 * Builds the canonical extracted_data JSON in the same format used by
 * AI extraction (OPH-4) so the order flows through the standard
 * OPH review/export pipeline.
 *
 * Confidence score is set based on dealer identification method:
 *   - customer_number: 99%
 *   - dropdown (dealer selected): 95%
 *   - manual (new dealer, no match): 60%
 *   - (no customer data at all would be 40%, but the checkout requires
 *     at least one method, so this case should not occur in practice)
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<SalesforceOrderResponse>>> {
  try {
    // 1. Verify authentication
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

    // 2. Check user/tenant status
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

    if (appMetadata?.role !== "sales_rep") {
      return NextResponse.json(
        { success: false, error: "Nur Aussendienst-Mitarbeiter koennen Bestellungen aufgeben." },
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

    // 3. Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Ungueltiges JSON im Anfrage-Body." },
        { status: 400 }
      );
    }

    const parsed = sfOrderSubmitSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path?.join(".") ?? "";
      const msg = issue?.message ?? "Ungültige Eingabe.";
      const errorDetail = path ? `${path}: ${msg}` : msg;
      console.error("SF order validation failed:", JSON.stringify(parsed.error.issues));
      return NextResponse.json(
        { success: false, error: errorDetail },
        { status: 400 }
      );
    }

    const { lineItems, dealer, deliveryAddress, notes } = parsed.data;

    // 4. Determine confidence score based on dealer identification method
    let confidenceScore: number;
    switch (dealer.method) {
      case "customer_number":
        confidenceScore = 99;
        break;
      case "dropdown":
        confidenceScore = 95;
        break;
      case "manual":
        confidenceScore = 60;
        break;
      default:
        confidenceScore = 40;
    }

    // 5. Resolve dealer_id for customer_number and dropdown methods
    let dealerId: string | null = null;
    let dealerName: string | null = null;

    if (dealer.method === "customer_number" || dealer.method === "dropdown") {
      // Look up the customer catalog entry to get the linked dealer_id
      const adminClient = createAdminClient();
      const { data: customerEntry } = await adminClient
        .from("customer_catalog")
        .select("id, dealer_id, company_name")
        .eq("id", dealer.customerId)
        .eq("tenant_id", tenantId)
        .single();

      if (customerEntry) {
        dealerId = customerEntry.dealer_id as string | null;
        dealerName = customerEntry.company_name as string;
      }
    }

    // 6. Build canonical extracted_data (same format as AI extraction)
    const canonicalLineItems: CanonicalLineItem[] = lineItems.map(
      (item, index) => ({
        position: index + 1,
        article_number: item.articleNumber,
        dealer_article_number: null,
        description: item.name,
        quantity: item.quantity,
        unit: "Stk",
        unit_price: null,
        total_price: null,
        currency: null,
        article_number_source: "extracted" as const,
        article_number_match_reason: null,
      })
    );

    // Build sender info based on dealer method
    let sender: CanonicalSender | null = null;
    if (dealer.method === "customer_number" || dealer.method === "dropdown") {
      sender = {
        company_name: dealer.companyName,
        street: null,
        city: null,
        postal_code: null,
        country: null,
        email: null,
        phone: null,
        customer_number: dealer.customerNumber,
        customer_number_source: "extracted",
        customer_number_match_reason: null,
      };
    } else if (dealer.method === "manual") {
      sender = {
        company_name: dealer.companyName,
        street: null,
        city: null,
        postal_code: null,
        country: null,
        email: dealer.email || null,
        phone: dealer.phone || null,
        customer_number: null,
        customer_number_source: null,
        customer_number_match_reason: null,
      };
    }

    // Build delivery address if provided
    let canonicalDeliveryAddress: CanonicalAddress | null = null;
    if (deliveryAddress) {
      const hasAnyField =
        deliveryAddress.companyName ||
        deliveryAddress.street ||
        deliveryAddress.zipCode ||
        deliveryAddress.city ||
        deliveryAddress.country;
      if (hasAnyField) {
        canonicalDeliveryAddress = {
          company: deliveryAddress.companyName || null,
          street: deliveryAddress.street || null,
          city: deliveryAddress.city || null,
          postal_code: deliveryAddress.zipCode || null,
          country: deliveryAddress.country || null,
        };
      }
    }

    const now = new Date().toISOString();
    const extractedData: CanonicalOrderData = {
      order: {
        order_number: null,
        order_date: now.split("T")[0],
        dealer: {
          id: dealerId,
          name: dealerName ?? (dealer.method === "manual" ? dealer.companyName : null),
        },
        sender,
        delivery_address: canonicalDeliveryAddress,
        billing_address: null,
        line_items: canonicalLineItems,
        total_amount: null,
        currency: null,
        notes: notes || null,
        email_subject: null,
      },
      extraction_metadata: {
        schema_version: "1.0",
        confidence_score: confidenceScore,
        model: "salesforce_app",
        extracted_at: now,
        source_files: [],
        dealer_hints_applied: false,
        column_mapping_applied: false,
        input_tokens: 0,
        output_tokens: 0,
      },
    };

    // 7. Create the order in the database
    const adminClient = createAdminClient();
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .insert({
        tenant_id: tenantId,
        uploaded_by: user.id,
        status: "extracted",
        source: "salesforce_app",
        extraction_status: "extracted",
        extracted_data: extractedData,
        extraction_error: null,
        recognition_confidence: confidenceScore,
        ...(dealerId ? { dealer_id: dealerId } : {}),
        recognition_method: dealerId ? "manual" : "none",
      })
      .select("id")
      .single();

    if (orderError || !order) {
      console.error("Error creating Salesforce App order:", orderError?.message);
      return NextResponse.json(
        { success: false, error: "Bestellung konnte nicht erstellt werden. Bitte erneut versuchen." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        orderId: order.id as string,
        confidenceScore,
      },
    });
  } catch (error) {
    console.error("Unexpected error in Salesforce order submission:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
