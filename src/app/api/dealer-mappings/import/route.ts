import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppMetadata, ApiResponse } from "@/lib/types";

interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
}

/**
 * POST /api/dealer-mappings/import?dealerId=XXX&mappingType=article_number
 *
 * Imports dealer data mappings from CSV content.
 * Expected columns: dealer_value, erp_value, [conversion_factor], [description]
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<ImportResult>>> {
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
    const tenantId = appMetadata?.tenant_id;

    if (role !== "tenant_admin" && role !== "platform_admin") {
      return NextResponse.json(
        { success: false, error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const dealerId = searchParams.get("dealerId");
    const mappingType = searchParams.get("mappingType");

    if (!dealerId || !mappingType) {
      return NextResponse.json(
        { success: false, error: "dealerId und mappingType sind erforderlich." },
        { status: 400 }
      );
    }

    if (!["article_number", "unit_conversion", "field_label"].includes(mappingType)) {
      return NextResponse.json(
        { success: false, error: "Ungueltiger Mapping-Typ." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const csvContent = body.csvContent as string | undefined;

    if (!csvContent || typeof csvContent !== "string") {
      return NextResponse.json(
        { success: false, error: "csvContent ist erforderlich." },
        { status: 400 }
      );
    }

    // Parse CSV (simple server-side parsing)
    const lines = csvContent
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      return NextResponse.json(
        { success: false, error: "CSV muss mindestens eine Kopfzeile und eine Datenzeile enthalten." },
        { status: 400 }
      );
    }

    // Parse header to identify columns
    const header = lines[0].split(";").map((h) => h.trim().toLowerCase());
    const dealerValueIdx = header.findIndex((h) =>
      ["dealer_value", "haendler_wert", "artikelnummer", "einheit", "feld"].includes(h)
    );
    const erpValueIdx = header.findIndex((h) =>
      ["erp_value", "erp_wert", "erp_artikelnummer", "erp_einheit", "erp_feld"].includes(h)
    );

    if (dealerValueIdx === -1 || erpValueIdx === -1) {
      return NextResponse.json(
        {
          success: false,
          error:
            "CSV-Header muss 'dealer_value' und 'erp_value' (oder deutsche Varianten) enthalten. Trennzeichen: Semikolon (;).",
        },
        { status: 400 }
      );
    }

    const factorIdx = header.findIndex((h) =>
      ["conversion_factor", "umrechnungsfaktor", "faktor"].includes(h)
    );
    const descIdx = header.findIndex((h) =>
      ["description", "beschreibung", "notiz"].includes(h)
    );

    const isGlobal = body.isGlobal === true && role === "platform_admin";
    const mappingTenantId = isGlobal ? null : tenantId;

    const adminClient = createAdminClient();
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(";").map((c) => c.trim());
      const dealerValue = cols[dealerValueIdx]?.trim();
      const erpValue = cols[erpValueIdx]?.trim();

      if (!dealerValue || !erpValue) {
        errors.push(`Zeile ${i + 1}: dealer_value oder erp_value fehlt.`);
        continue;
      }

      if (dealerValue.length > 200 || erpValue.length > 200) {
        errors.push(`Zeile ${i + 1}: Wert zu lang (max. 200 Zeichen).`);
        continue;
      }

      const conversionFactor =
        factorIdx >= 0 && cols[factorIdx] ? parseFloat(cols[factorIdx]) : null;
      const description =
        descIdx >= 0 && cols[descIdx] ? cols[descIdx].substring(0, 500) : null;

      // Try to upsert: check if exists, then insert or update
      const { data: existingRows } = await adminClient
        .from("dealer_data_mappings")
        .select("id")
        .eq("dealer_id", dealerId)
        .eq("mapping_type", mappingType)
        .eq("active", true)
        .ilike("dealer_value", dealerValue);

      // Filter for matching tenant
      const existing = (existingRows ?? []).length > 0 ? existingRows : null;

      if (existing && existing.length > 0) {
        // Check if one matches our tenant scope
        const { data: scopedExisting } = await adminClient
          .from("dealer_data_mappings")
          .select("id")
          .eq("dealer_id", dealerId)
          .eq("mapping_type", mappingType)
          .eq("active", true)
          .ilike("dealer_value", dealerValue)
          .is("tenant_id", mappingTenantId === null ? null : undefined as unknown as null);

        const matchingId =
          mappingTenantId === null
            ? (scopedExisting ?? [])[0]?.id
            : null;

        if (matchingId) {
          await adminClient
            .from("dealer_data_mappings")
            .update({
              erp_value: erpValue,
              conversion_factor:
                mappingType === "unit_conversion" ? conversionFactor : null,
              description,
            })
            .eq("id", matchingId as string);
          updated++;
        } else {
          // Insert new tenant-specific entry
          const { error: insertError } = await adminClient
            .from("dealer_data_mappings")
            .insert({
              dealer_id: dealerId,
              tenant_id: mappingTenantId,
              mapping_type: mappingType,
              dealer_value: dealerValue,
              erp_value: erpValue,
              conversion_factor:
                mappingType === "unit_conversion" ? conversionFactor : null,
              description,
              created_by: user.id,
            });

          if (insertError) {
            if (insertError.code === "23505") {
              errors.push(`Zeile ${i + 1}: Duplikat fuer "${dealerValue}".`);
            } else {
              errors.push(`Zeile ${i + 1}: ${insertError.message}`);
            }
          } else {
            created++;
          }
        }
      } else {
        const { error: insertError } = await adminClient
          .from("dealer_data_mappings")
          .insert({
            dealer_id: dealerId,
            tenant_id: mappingTenantId,
            mapping_type: mappingType,
            dealer_value: dealerValue,
            erp_value: erpValue,
            conversion_factor:
              mappingType === "unit_conversion" ? conversionFactor : null,
            description,
            created_by: user.id,
          });

        if (insertError) {
          if (insertError.code === "23505") {
            errors.push(`Zeile ${i + 1}: Duplikat fuer "${dealerValue}".`);
          } else {
            errors.push(`Zeile ${i + 1}: ${insertError.message}`);
          }
        } else {
          created++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: { created, updated, errors },
    });
  } catch (error) {
    console.error("Unexpected error in POST /api/dealer-mappings/import:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
