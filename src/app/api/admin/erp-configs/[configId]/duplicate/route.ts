import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/erp-configs/[configId]/duplicate
 *
 * OPH-29: Duplicates an ERP configuration with "Kopie von " prefix.
 * Not automatically assigned to any tenant.
 * Platform admin only.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ configId: string }> }
): Promise<NextResponse> {
  try {
    const { configId } = await params;
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitError = checkAdminRateLimit(user.id);
    if (rateLimitError) return rateLimitError;

    if (!UUID_REGEX.test(configId)) {
      return NextResponse.json(
        { success: false, error: "Ungültige Konfigurations-ID." },
        { status: 400 }
      );
    }

    // Fetch source config
    const { data: source, error: sourceError } = await adminClient
      .from("erp_configs")
      .select("*")
      .eq("id", configId)
      .single();

    if (sourceError || !source) {
      return NextResponse.json(
        { success: false, error: "Quell-Konfiguration nicht gefunden." },
        { status: 404 }
      );
    }

    // Generate unique name
    let newName = `Kopie von ${source.name as string}`;
    let suffix = 2;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: nameExists } = await adminClient
        .from("erp_configs")
        .select("id")
        .eq("name", newName)
        .maybeSingle();

      if (!nameExists) break;
      newName = `Kopie von ${source.name as string} (${suffix})`;
      suffix++;
      if (suffix > 100) break; // Safety valve
    }

    // Insert duplicate
    const { data: newConfig, error: insertError } = await adminClient
      .from("erp_configs")
      .insert({
        name: newName,
        description: source.description,
        format: source.format,
        column_mappings: source.column_mappings,
        separator: source.separator,
        quote_char: source.quote_char,
        encoding: source.encoding,
        line_ending: source.line_ending,
        decimal_separator: source.decimal_separator,
        fallback_mode: source.fallback_mode,
        xml_template: source.xml_template,
      })
      .select("id")
      .single();

    if (insertError || !newConfig) {
      console.error("Error duplicating ERP config:", insertError?.message);
      return NextResponse.json(
        { success: false, error: "Konfiguration konnte nicht dupliziert werden." },
        { status: 500 }
      );
    }

    // Create initial version
    await adminClient.from("erp_config_versions").insert({
      erp_config_id: newConfig.id,
      version_number: 1,
      snapshot: {
        name: newName, description: source.description, format: source.format,
        column_mappings: source.column_mappings, separator: source.separator,
        quote_char: source.quote_char, encoding: source.encoding,
        line_ending: source.line_ending, decimal_separator: source.decimal_separator,
        fallback_mode: source.fallback_mode, xml_template: source.xml_template,
      },
      comment: `Dupliziert von "${source.name as string}"`,
      created_by: user.id,
    });

    return NextResponse.json(
      { success: true, data: { configId: newConfig.id, name: newName } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in POST /api/admin/erp-configs/[configId]/duplicate:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
