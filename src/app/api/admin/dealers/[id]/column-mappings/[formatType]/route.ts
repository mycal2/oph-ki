import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";
import { columnMappingProfileSchema } from "@/lib/validations";
import type { ColumnMappingProfile, ColumnMappingFormatType } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_FORMAT_TYPES: ColumnMappingFormatType[] = ["pdf_table", "excel", "email_text"];

/**
 * PUT /api/admin/dealers/[id]/column-mappings/[formatType]
 *
 * Upserts a column mapping profile for a dealer + format type.
 * Full replacement: the entire mappings array is replaced.
 * Platform admin only.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; formatType: string }> }
): Promise<NextResponse> {
  try {
    const { id, formatType } = await params;

    // Validate dealer ID
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Haendler-ID." },
        { status: 400 }
      );
    }

    // Validate format type
    if (!VALID_FORMAT_TYPES.includes(formatType as ColumnMappingFormatType)) {
      return NextResponse.json(
        {
          success: false,
          error: `Ungueltiger Format-Typ. Erlaubt: ${VALID_FORMAT_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitResponse = checkAdminRateLimit(user.id);
    if (rateLimitResponse) return rateLimitResponse;

    // Parse and validate request body
    const body = await request.json();
    const parsed = columnMappingProfileSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungueltige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const { mappings } = parsed.data;

    // Additional validation: no duplicate positions within the same profile
    const positionEntries = mappings.filter(
      (m) => m.match_type === "position" || m.match_type === "both"
    );
    const positions = positionEntries.map((m) => m.position);
    const positionSet = new Set(positions);
    if (positionSet.size !== positions.length) {
      // Find the duplicate position
      const seen = new Set<number | null>();
      for (const pos of positions) {
        if (seen.has(pos)) {
          return NextResponse.json(
            {
              success: false,
              error: `Position ${pos} ist doppelt vergeben.`,
            },
            { status: 400 }
          );
        }
        seen.add(pos);
      }
    }

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

    // Upsert the profile (ON CONFLICT on dealer_id + format_type unique index)
    const { data: profile, error: upsertError } = await adminClient
      .from("dealer_column_mapping_profiles")
      .upsert(
        {
          dealer_id: id,
          format_type: formatType,
          mappings: mappings as unknown as Record<string, unknown>[],
        },
        { onConflict: "dealer_id,format_type" }
      )
      .select()
      .single();

    if (upsertError || !profile) {
      console.error("Error upserting column mapping profile:", upsertError?.message);
      return NextResponse.json(
        { success: false, error: "Spalten-Mapping konnte nicht gespeichert werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: profile as unknown as ColumnMappingProfile,
    });
  } catch (error) {
    console.error("Error in PUT /api/admin/dealers/[id]/column-mappings/[formatType]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/dealers/[id]/column-mappings/[formatType]
 *
 * Removes a column mapping profile for a dealer + format type.
 * Platform admin only.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; formatType: string }> }
): Promise<NextResponse> {
  try {
    const { id, formatType } = await params;

    // Validate dealer ID
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Haendler-ID." },
        { status: 400 }
      );
    }

    // Validate format type
    if (!VALID_FORMAT_TYPES.includes(formatType as ColumnMappingFormatType)) {
      return NextResponse.json(
        {
          success: false,
          error: `Ungueltiger Format-Typ. Erlaubt: ${VALID_FORMAT_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitResponse = checkAdminRateLimit(user.id);
    if (rateLimitResponse) return rateLimitResponse;

    // Delete the profile
    const { error: deleteError, count } = await adminClient
      .from("dealer_column_mapping_profiles")
      .delete({ count: "exact" })
      .eq("dealer_id", id)
      .eq("format_type", formatType);

    if (deleteError) {
      console.error("Error deleting column mapping profile:", deleteError.message);
      return NextResponse.json(
        { success: false, error: "Spalten-Mapping konnte nicht geloescht werden." },
        { status: 500 }
      );
    }

    if (count === 0) {
      return NextResponse.json(
        { success: false, error: "Spalten-Mapping nicht gefunden." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/admin/dealers/[id]/column-mappings/[formatType]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
