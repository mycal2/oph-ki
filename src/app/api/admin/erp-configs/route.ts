import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";
import { erpConfigSaveSchema } from "@/lib/validations";
import type { ErpConfigListItem } from "@/lib/types";

/**
 * GET /api/admin/erp-configs
 *
 * OPH-29: Lists all named ERP configurations with assigned tenant counts.
 * Platform admin only.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitError = checkAdminRateLimit(user.id);
    if (rateLimitError) return rateLimitError;

    // Fetch all ERP configs
    const { data: configs, error: configsError } = await adminClient
      .from("erp_configs")
      .select("id, name, description, format, fallback_mode, updated_at")
      .order("name", { ascending: true })
      .limit(1000);

    if (configsError) {
      console.error("Error fetching erp configs:", configsError.message);
      return NextResponse.json(
        { success: false, error: "ERP-Konfigurationen konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    const configIds = (configs ?? []).map((c) => c.id as string);

    // Fetch version counts and tenant counts in parallel
    let versionCounts = new Map<string, number>();
    let tenantCounts = new Map<string, number>();

    if (configIds.length > 0) {
      const [versionsResult, tenantsResult] = await Promise.all([
        adminClient
          .from("erp_config_versions")
          .select("erp_config_id")
          .in("erp_config_id", configIds),
        adminClient
          .from("tenants")
          .select("erp_config_id")
          .in("erp_config_id", configIds),
      ]);

      if (versionsResult.data) {
        for (const v of versionsResult.data) {
          const cid = v.erp_config_id as string;
          versionCounts.set(cid, (versionCounts.get(cid) ?? 0) + 1);
        }
      }

      if (tenantsResult.data) {
        for (const t of tenantsResult.data) {
          const cid = t.erp_config_id as string;
          tenantCounts.set(cid, (tenantCounts.get(cid) ?? 0) + 1);
        }
      }
    }

    // Build result
    const result: ErpConfigListItem[] = (configs ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      description: (c.description as string) ?? null,
      format: c.format as ErpConfigListItem["format"],
      fallback_mode: c.fallback_mode as ErpConfigListItem["fallback_mode"],
      assigned_tenant_count: tenantCounts.get(c.id as string) ?? 0,
      version_count: versionCounts.get(c.id as string) ?? 0,
      last_updated: c.updated_at as string,
    }));

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error in GET /api/admin/erp-configs:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/erp-configs
 *
 * OPH-29: Creates a new named ERP configuration.
 * Platform admin only.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitError = checkAdminRateLimit(user.id);
    if (rateLimitError) return rateLimitError;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Ungültiges JSON im Anfrage-Body." },
        { status: 400 }
      );
    }

    const parsed = erpConfigSaveSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungültige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const { name, description, format, column_mappings, separator, quote_char, encoding, line_ending, decimal_separator, fallback_mode, xml_template, header_column_mappings, empty_value_placeholder, split_output_mode, header_filename_template, lines_filename_template, zip_filename_template, comment } = parsed.data;

    // Check unique name
    const { data: existing } = await adminClient
      .from("erp_configs")
      .select("id")
      .eq("name", name)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { success: false, error: `Eine ERP-Konfiguration mit dem Namen "${name}" existiert bereits.` },
        { status: 409 }
      );
    }

    // Insert config
    const { data: config, error: insertError } = await adminClient
      .from("erp_configs")
      .insert({
        name,
        description,
        format,
        column_mappings,
        separator,
        quote_char,
        encoding,
        line_ending,
        decimal_separator,
        fallback_mode,
        xml_template,
        header_column_mappings: header_column_mappings ?? null,
        empty_value_placeholder: empty_value_placeholder ?? "",
        split_output_mode: split_output_mode ?? null,
        header_filename_template: header_filename_template ?? null,
        lines_filename_template: lines_filename_template ?? null,
        zip_filename_template: zip_filename_template ?? null,
      })
      .select("id")
      .single();

    if (insertError || !config) {
      console.error("Failed to create ERP config:", insertError?.message, insertError?.details, insertError?.hint);
      return NextResponse.json(
        { success: false, error: `ERP-Konfiguration konnte nicht erstellt werden: ${insertError?.message ?? "Unbekannter Fehler"}` },
        { status: 500 }
      );
    }

    // Create initial version
    await adminClient.from("erp_config_versions").insert({
      erp_config_id: config.id,
      version_number: 1,
      snapshot: {
        name, description, format, column_mappings, separator, quote_char,
        encoding, line_ending, decimal_separator, fallback_mode, xml_template,
        header_column_mappings: header_column_mappings ?? null,
        empty_value_placeholder: empty_value_placeholder ?? "",
        split_output_mode: split_output_mode ?? null,
        header_filename_template: header_filename_template ?? null,
        lines_filename_template: lines_filename_template ?? null,
        zip_filename_template: zip_filename_template ?? null,
      },
      comment: comment ?? "Erstellt",
      created_by: user.id,
    });

    return NextResponse.json(
      { success: true, data: { id: config.id, versionNumber: 1 } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in POST /api/admin/erp-configs:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
