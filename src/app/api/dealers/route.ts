import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppMetadata, ApiResponse, DealerListItem } from "@/lib/types";

/**
 * GET /api/dealers
 *
 * Returns all active dealers (id, name, format_type) for dropdown lists.
 * Global data — no tenant filtering, but requires authentication.
 */
export async function GET(): Promise<NextResponse<ApiResponse<DealerListItem[]>>> {
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

    // 2. Check user status
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

    // 3. Fetch active dealers
    const adminClient = createAdminClient();
    const { data: dealers, error: dealersError } = await adminClient
      .from("dealers")
      .select("id, name, format_type, city, country")
      .eq("active", true)
      .order("name", { ascending: true })
      .limit(500);

    if (dealersError) {
      console.error("Error fetching dealers:", dealersError.message);
      return NextResponse.json(
        { success: false, error: "Händler konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: (dealers ?? []) as DealerListItem[],
    });
  } catch (error) {
    console.error("Unexpected error in GET /api/dealers:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
