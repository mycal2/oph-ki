import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";
import { erpConfigSaveSchema } from "@/lib/validations";
import { validateHandlebarsTemplate } from "@/lib/erp-transformations";
import type {
  ErpConfigAdmin,
  ErpConfigVersion,
  ErpConfigDetail,
} from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/erp-configs/[configId]
 *
 * OPH-29: Returns a named ERP config + version history + assigned tenants.
 * Platform admin only.
 */
export async function GET(
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

    // Fetch config
    const { data: config, error: configError } = await adminClient
      .from("erp_configs")
      .select("*")
      .eq("id", configId)
      .single();

    if (configError || !config) {
      return NextResponse.json(
        { success: false, error: "ERP-Konfiguration nicht gefunden." },
        { status: 404 }
      );
    }

    // Fetch version history and assigned tenants in parallel
    const [versionsResult, tenantsResult] = await Promise.all([
      adminClient
        .from("erp_config_versions")
        .select("id, erp_config_id, version_number, snapshot, comment, created_by, created_at")
        .eq("erp_config_id", configId)
        .order("version_number", { ascending: false })
        .limit(100),
      adminClient
        .from("tenants")
        .select("id, name")
        .eq("erp_config_id", configId)
        .order("name", { ascending: true }),
    ]);

    // Resolve created_by emails
    let versions: ErpConfigVersion[] = [];
    if (versionsResult.data) {
      const userIds = [...new Set(
        versionsResult.data
          .map((v) => v.created_by as string | null)
          .filter(Boolean) as string[]
      )];

      const emailMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: users } = await adminClient
          .from("user_profiles")
          .select("id")
          .in("id", userIds);

        if (users) {
          for (const u of users) {
            const { data: authData } = await adminClient.auth.admin.getUserById(u.id as string);
            if (authData?.user?.email) {
              emailMap.set(u.id as string, authData.user.email);
            }
          }
        }
      }

      versions = versionsResult.data.map((v) => ({
        id: v.id as string,
        erp_config_id: v.erp_config_id as string,
        version_number: v.version_number as number,
        snapshot: v.snapshot as Record<string, unknown>,
        comment: v.comment as string | null,
        created_by: v.created_by as string | null,
        created_by_email: v.created_by
          ? (emailMap.get(v.created_by as string) ?? null)
          : null,
        created_at: v.created_at as string,
      }));
    }

    const result: ErpConfigDetail = {
      config: {
        id: config.id as string,
        name: config.name as string,
        description: (config.description as string) ?? null,
        format: config.format as ErpConfigAdmin["format"],
        column_mappings: ((config.column_mappings ?? []) as ErpConfigAdmin["column_mappings"]).map(
          (m) => ({ ...m, transformations: m.transformations ?? [], required: m.required ?? false })
        ),
        separator: config.separator as string,
        quote_char: config.quote_char as string,
        encoding: ((config.encoding as string)?.toLowerCase() as ErpConfigAdmin["encoding"]) ?? "utf-8",
        line_ending: (config.line_ending as ErpConfigAdmin["line_ending"]) ?? "LF",
        decimal_separator: (config.decimal_separator as ErpConfigAdmin["decimal_separator"]) ?? ".",
        fallback_mode: (config.fallback_mode as ErpConfigAdmin["fallback_mode"]) ?? "block",
        xml_template: (config.xml_template as string) ?? null,
        header_column_mappings: config.header_column_mappings
          ? ((config.header_column_mappings as ErpConfigAdmin["column_mappings"]).map(
              (m) => ({ ...m, transformations: m.transformations ?? [], required: m.required ?? false })
            ))
          : null,
        empty_value_placeholder: (config.empty_value_placeholder as string) ?? "",
        created_at: config.created_at as string,
        updated_at: config.updated_at as string,
      },
      versions,
      assigned_tenants: (tenantsResult.data ?? []).map((t) => ({
        id: t.id as string,
        name: t.name as string,
      })),
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error in GET /api/admin/erp-configs/[configId]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/erp-configs/[configId]
 *
 * OPH-29: Updates a named ERP configuration. Creates a new version snapshot.
 * Platform admin only.
 */
export async function PUT(
  request: NextRequest,
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

    // Verify config exists
    const { data: existing, error: fetchError } = await adminClient
      .from("erp_configs")
      .select("id, name")
      .eq("id", configId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { success: false, error: "ERP-Konfiguration nicht gefunden." },
        { status: 404 }
      );
    }

    // Parse and validate body
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

    const data = parsed.data;

    // Check unique name (if changed)
    if (data.name !== (existing.name as string)) {
      const { data: nameConflict } = await adminClient
        .from("erp_configs")
        .select("id")
        .eq("name", data.name)
        .neq("id", configId)
        .maybeSingle();

      if (nameConflict) {
        return NextResponse.json(
          { success: false, error: `Eine ERP-Konfiguration mit dem Namen "${data.name}" existiert bereits.` },
          { status: 409 }
        );
      }
    }

    // Validate Handlebars template if XML format
    if (data.format === "xml" && data.xml_template) {
      const templateError = validateHandlebarsTemplate(data.xml_template);
      if (templateError) {
        return NextResponse.json(
          { success: false, error: `Ungültige XML-Template-Syntax: ${templateError}` },
          { status: 400 }
        );
      }
    }

    // Update config
    const { error: updateError } = await adminClient
      .from("erp_configs")
      .update({
        name: data.name,
        description: data.description,
        format: data.format,
        column_mappings: data.column_mappings,
        separator: data.separator,
        quote_char: data.quote_char,
        encoding: data.encoding,
        line_ending: data.line_ending,
        decimal_separator: data.decimal_separator,
        fallback_mode: data.fallback_mode,
        xml_template: data.xml_template,
        header_column_mappings: data.header_column_mappings ?? null,
        empty_value_placeholder: data.empty_value_placeholder ?? "",
        updated_at: new Date().toISOString(),
      })
      .eq("id", configId);

    if (updateError) {
      console.error("Error updating erp_config:", updateError.message);
      return NextResponse.json(
        { success: false, error: "Konfiguration konnte nicht gespeichert werden." },
        { status: 500 }
      );
    }

    // Create version snapshot
    const { data: lastVersion } = await adminClient
      .from("erp_config_versions")
      .select("version_number")
      .eq("erp_config_id", configId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = ((lastVersion?.version_number as number) ?? 0) + 1;

    await adminClient.from("erp_config_versions").insert({
      erp_config_id: configId,
      version_number: nextVersion,
      snapshot: {
        name: data.name, description: data.description, format: data.format,
        column_mappings: data.column_mappings, separator: data.separator,
        quote_char: data.quote_char, encoding: data.encoding,
        line_ending: data.line_ending, decimal_separator: data.decimal_separator,
        fallback_mode: data.fallback_mode, xml_template: data.xml_template,
        header_column_mappings: data.header_column_mappings ?? null,
        empty_value_placeholder: data.empty_value_placeholder ?? "",
      },
      comment: data.comment ?? null,
      created_by: user.id,
    });

    // Count affected tenants for response
    const { count } = await adminClient
      .from("tenants")
      .select("id", { count: "exact", head: true })
      .eq("erp_config_id", configId);

    return NextResponse.json({
      success: true,
      data: { configId, versionNumber: nextVersion, affectedTenants: count ?? 0 },
    });
  } catch (error) {
    console.error("Error in PUT /api/admin/erp-configs/[configId]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/erp-configs/[configId]
 *
 * OPH-29: Deletes an ERP configuration. Fails if any tenants are assigned.
 * Platform admin only.
 */
export async function DELETE(
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

    // Verify config exists
    const { data: existing, error: fetchError } = await adminClient
      .from("erp_configs")
      .select("id, name")
      .eq("id", configId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { success: false, error: "ERP-Konfiguration nicht gefunden." },
        { status: 404 }
      );
    }

    // Check for assigned tenants
    const { count } = await adminClient
      .from("tenants")
      .select("id", { count: "exact", head: true })
      .eq("erp_config_id", configId);

    if (count && count > 0) {
      return NextResponse.json(
        { success: false, error: `Kann nicht gelöscht werden – ${count} Mandant(en) zugewiesen.` },
        { status: 409 }
      );
    }

    // Delete config (cascades to versions and output formats)
    const { error: deleteError } = await adminClient
      .from("erp_configs")
      .delete()
      .eq("id", configId);

    if (deleteError) {
      console.error("Error deleting erp_config:", deleteError.message);
      return NextResponse.json(
        { success: false, error: "Konfiguration konnte nicht gelöscht werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/admin/erp-configs/[configId]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
