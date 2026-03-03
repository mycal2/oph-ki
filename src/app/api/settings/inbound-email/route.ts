import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppMetadata, ApiResponse, InboundEmailSettingsResponse } from "@/lib/types";

/**
 * GET /api/settings/inbound-email
 *
 * Returns the tenant's dedicated inbound email address.
 * If no address is set yet, generates one from the tenant slug.
 */
export async function GET(): Promise<NextResponse<ApiResponse<InboundEmailSettingsResponse>>> {
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

    const adminClient = createAdminClient();

    // 2. Get tenant with inbound_email_address
    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .select("slug, inbound_email_address")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { success: false, error: "Mandant nicht gefunden." },
        { status: 404 }
      );
    }

    let inboundEmailAddress = tenant.inbound_email_address;

    // 3. If no address set yet, generate and save it
    if (!inboundEmailAddress) {
      const domain = process.env.INBOUND_EMAIL_DOMAIN;
      if (domain) {
        inboundEmailAddress = `${tenant.slug}@${domain}`;

        // Save for future lookups
        await adminClient
          .from("tenants")
          .update({ inbound_email_address: inboundEmailAddress })
          .eq("id", tenantId);
      }
    }

    return NextResponse.json({
      success: true,
      data: { inboundEmailAddress: inboundEmailAddress || null },
    });
  } catch (error) {
    console.error("Error in inbound-email settings:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
