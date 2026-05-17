import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppMetadata, ApiResponse } from "@/lib/types";

/**
 * OPH-104: Tenant Price Lookup Feature Flag — read-only endpoint.
 *
 * GET → returns whether the price-lookup add-on is enabled for the caller's
 * tenant. Used by the tenant settings page to render a read-only badge.
 *
 * Tenant admins cannot change this value themselves — only platform admins
 * can toggle it via PATCH /api/admin/tenants/[id].
 */

interface PriceLookupSettingsResponse {
  price_lookup_enabled: boolean;
}

export async function GET(): Promise<
  NextResponse<ApiResponse<PriceLookupSettingsResponse>>
> {
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

    const adminClient = createAdminClient();
    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .select("price_lookup_enabled")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { success: false, error: "Mandant nicht gefunden." },
        { status: 404 }
      );
    }

    const value = (tenant as { price_lookup_enabled: boolean | null })
      .price_lookup_enabled;

    return NextResponse.json({
      success: true,
      data: {
        price_lookup_enabled: value === true,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/settings/price-lookup:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
