import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMappingSchema } from "@/lib/validations";
import type { AppMetadata, ApiResponse, DealerDataMappingListItem } from "@/lib/types";

/**
 * GET /api/dealer-mappings?dealerId=XXX&mappingType=article_number
 *
 * Returns all active mappings for a dealer, merging global and tenant-specific.
 * Tenant-specific entries take priority over global for the same key.
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResponse<DealerDataMappingListItem[]>>> {
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

    const tenantId = appMetadata?.tenant_id;
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: "Kein Mandant zugewiesen." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const dealerId = searchParams.get("dealerId");

    if (!dealerId) {
      return NextResponse.json(
        { success: false, error: "dealerId ist erforderlich." },
        { status: 400 }
      );
    }

    const mappingType = searchParams.get("mappingType");
    const adminClient = createAdminClient();

    // Fetch all mappings for this dealer (global + tenant-specific)
    let query = adminClient
      .from("dealer_data_mappings")
      .select("*, dealers ( name )")
      .eq("dealer_id", dealerId)
      .eq("active", true)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .order("mapping_type")
      .order("dealer_value")
      .limit(1000);

    if (mappingType) {
      query = query.eq("mapping_type", mappingType);
    }

    const { data: rawMappings, error: queryError } = await query;

    if (queryError) {
      console.error("Error fetching dealer mappings:", queryError.message);
      return NextResponse.json(
        { success: false, error: "Zuordnungen konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    // Apply priority: tenant-specific wins over global
    const seen = new Map<string, DealerDataMappingListItem>();
    for (const raw of rawMappings ?? []) {
      const rawDealer = raw.dealers as unknown;
      const dealerData = Array.isArray(rawDealer)
        ? (rawDealer[0] as { name: string } | undefined)
        : (rawDealer as { name: string } | null);

      const mapping: DealerDataMappingListItem = {
        id: raw.id as string,
        dealer_id: raw.dealer_id as string,
        tenant_id: raw.tenant_id as string | null,
        mapping_type: raw.mapping_type as DealerDataMappingListItem["mapping_type"],
        dealer_value: raw.dealer_value as string,
        erp_value: raw.erp_value as string,
        conversion_factor: raw.conversion_factor as number | null,
        description: raw.description as string | null,
        active: raw.active as boolean,
        created_by: raw.created_by as string | null,
        created_at: raw.created_at as string,
        updated_at: raw.updated_at as string,
        dealer_name: dealerData?.name ?? "",
        is_global: raw.tenant_id === null,
      };

      const key = `${mapping.mapping_type}|${mapping.dealer_value.toLowerCase().trim()}`;
      const existing = seen.get(key);
      if (!existing || (mapping.tenant_id && !existing.tenant_id)) {
        seen.set(key, mapping);
      }
    }

    return NextResponse.json({
      success: true,
      data: Array.from(seen.values()),
    });
  } catch (error) {
    console.error("Unexpected error in GET /api/dealer-mappings:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dealer-mappings
 *
 * Creates a new dealer data mapping.
 * tenant_admin: creates tenant-specific mapping (tenant_id = own).
 * platform_admin: creates global mapping (tenant_id = null).
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
    const role = appMetadata?.role;

    if (role !== "tenant_admin" && role !== "platform_admin") {
      return NextResponse.json(
        { success: false, error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const tenantId = appMetadata?.tenant_id;
    if (!tenantId && role !== "platform_admin") {
      return NextResponse.json(
        { success: false, error: "Kein Mandant zugewiesen." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = createMappingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Ungueltige Eingabe." },
        { status: 400 }
      );
    }

    const { dealerId, mappingType, dealerValue, erpValue, conversionFactor, description } =
      parsed.data;

    // Determine tenant_id: platform_admin can create global (null), tenant_admin uses own
    const isGlobal = body.isGlobal === true && role === "platform_admin";
    const mappingTenantId = isGlobal ? null : tenantId;

    const adminClient = createAdminClient();

    const { data: newMapping, error: insertError } = await adminClient
      .from("dealer_data_mappings")
      .insert({
        dealer_id: dealerId,
        tenant_id: mappingTenantId,
        mapping_type: mappingType,
        dealer_value: dealerValue,
        erp_value: erpValue,
        conversion_factor: mappingType === "unit_conversion" ? conversionFactor ?? null : null,
        description: description ?? null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json(
          { success: false, error: "Diese Zuordnung existiert bereits." },
          { status: 409 }
        );
      }
      console.error("Error creating mapping:", insertError.message);
      return NextResponse.json(
        { success: false, error: "Zuordnung konnte nicht erstellt werden." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, data: { id: newMapping.id as string } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Unexpected error in POST /api/dealer-mappings:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
