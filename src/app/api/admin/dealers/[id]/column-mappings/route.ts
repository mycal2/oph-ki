import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse } from "@/lib/admin-auth";
import type { ColumnMappingProfile } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/dealers/[id]/column-mappings
 *
 * Returns all column mapping profiles for a dealer.
 * Platform admin only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Haendler-ID." },
        { status: 400 }
      );
    }

    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { adminClient } = auth;

    // Verify dealer exists
    const { data: dealer, error: dealerError } = await adminClient
      .from("dealers")
      .select("id")
      .eq("id", id)
      .single();

    if (dealerError || !dealer) {
      return NextResponse.json(
        { success: false, error: "Haendler nicht gefunden." },
        { status: 404 }
      );
    }

    // Fetch all column mapping profiles for this dealer
    const { data: profiles, error: profilesError } = await adminClient
      .from("dealer_column_mapping_profiles")
      .select("*")
      .eq("dealer_id", id)
      .order("format_type", { ascending: true });

    if (profilesError) {
      console.error("Error fetching column mapping profiles:", profilesError.message);
      return NextResponse.json(
        { success: false, error: "Spalten-Mappings konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: (profiles ?? []) as unknown as ColumnMappingProfile[],
    });
  } catch (error) {
    console.error("Error in GET /api/admin/dealers/[id]/column-mappings:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
