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
 * GET /api/admin/erp-configs/[tenantId]
 *
 * Returns the active ERP config + full version history for a tenant.
 * Platform admin only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
): Promise<NextResponse> {
  try {
    const { tenantId } = await params;
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitError = checkAdminRateLimit(user.id);
    if (rateLimitError) return rateLimitError;

    if (!UUID_REGEX.test(tenantId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Mandanten-ID." },
        { status: 400 }
      );
    }

    // Fetch tenant
    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .select("id, name, erp_type")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { success: false, error: "Mandant nicht gefunden." },
        { status: 404 }
      );
    }

    // Fetch active config
    const { data: config } = await adminClient
      .from("erp_configs")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    // Fetch version history (if config exists)
    let versions: ErpConfigVersion[] = [];
    if (config) {
      const { data: versionRows } = await adminClient
        .from("erp_config_versions")
        .select("id, erp_config_id, version_number, snapshot, comment, created_by, created_at")
        .eq("erp_config_id", config.id as string)
        .order("version_number", { ascending: false })
        .limit(100);

      if (versionRows) {
        // Resolve created_by emails
        const userIds = [...new Set(
          versionRows
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
            // Get auth emails
            for (const u of users) {
              const { data: authData } = await adminClient.auth.admin.getUserById(u.id as string);
              if (authData?.user?.email) {
                emailMap.set(u.id as string, authData.user.email);
              }
            }
          }
        }

        versions = versionRows.map((v) => ({
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
    }

    const result: ErpConfigDetail = {
      config: config
        ? {
            id: config.id as string,
            tenant_id: config.tenant_id as string,
            format: config.format as ErpConfigAdmin["format"],
            column_mappings: (config.column_mappings ?? []) as ErpConfigAdmin["column_mappings"],
            separator: config.separator as string,
            quote_char: config.quote_char as string,
            encoding: (config.encoding as ErpConfigAdmin["encoding"]) ?? "utf-8",
            line_ending: (config.line_ending as ErpConfigAdmin["line_ending"]) ?? "LF",
            decimal_separator: (config.decimal_separator as ErpConfigAdmin["decimal_separator"]) ?? ".",
            fallback_mode: (config.fallback_mode as ErpConfigAdmin["fallback_mode"]) ?? "block",
            xml_template: (config.xml_template as string) ?? null,
            is_default: config.is_default as boolean,
            created_at: config.created_at as string,
            updated_at: config.updated_at as string,
          }
        : null,
      versions,
      tenant: {
        id: tenant.id as string,
        name: tenant.name as string,
        erp_type: tenant.erp_type as ErpConfigDetail["tenant"]["erp_type"],
      },
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error in GET /api/admin/erp-configs/[tenantId]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/erp-configs/[tenantId]
 *
 * Creates or updates the ERP config for a tenant.
 * Always creates a new version snapshot.
 * Platform admin only.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
): Promise<NextResponse> {
  try {
    const { tenantId } = await params;
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitError = checkAdminRateLimit(user.id);
    if (rateLimitError) return rateLimitError;

    if (!UUID_REGEX.test(tenantId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige Mandanten-ID." },
        { status: 400 }
      );
    }

    // Verify tenant exists
    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .select("id")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { success: false, error: "Mandant nicht gefunden." },
        { status: 404 }
      );
    }

    // Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Ungueltiges JSON im Anfrage-Body." },
        { status: 400 }
      );
    }

    const parsed = erpConfigSaveSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungueltige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Validate Handlebars template if XML format
    if (data.format === "xml" && data.xml_template) {
      const templateError = validateHandlebarsTemplate(data.xml_template);
      if (templateError) {
        return NextResponse.json(
          { success: false, error: `Ungueltige XML-Template-Syntax: ${templateError}` },
          { status: 400 }
        );
      }
    }

    // Check if config already exists for this tenant
    const { data: existingConfig } = await adminClient
      .from("erp_configs")
      .select("id")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const configPayload = {
      tenant_id: tenantId,
      format: data.format,
      column_mappings: data.column_mappings,
      separator: data.separator,
      quote_char: data.quote_char,
      encoding: data.encoding,
      line_ending: data.line_ending,
      decimal_separator: data.decimal_separator,
      fallback_mode: data.fallback_mode,
      xml_template: data.xml_template,
      is_default: true,
      updated_at: new Date().toISOString(),
    };

    let configId: string;

    if (existingConfig) {
      // Update existing
      configId = existingConfig.id as string;
      const { error: updateError } = await adminClient
        .from("erp_configs")
        .update(configPayload)
        .eq("id", configId);

      if (updateError) {
        console.error("Error updating erp_config:", updateError.message);
        return NextResponse.json(
          { success: false, error: "Konfiguration konnte nicht gespeichert werden." },
          { status: 500 }
        );
      }
    } else {
      // Insert new
      const { data: newConfig, error: insertError } = await adminClient
        .from("erp_configs")
        .insert(configPayload)
        .select("id")
        .single();

      if (insertError || !newConfig) {
        console.error("Error inserting erp_config:", insertError?.message);
        return NextResponse.json(
          { success: false, error: "Konfiguration konnte nicht erstellt werden." },
          { status: 500 }
        );
      }
      configId = newConfig.id as string;
    }

    // Determine next version number
    const { data: lastVersion } = await adminClient
      .from("erp_config_versions")
      .select("version_number")
      .eq("erp_config_id", configId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = ((lastVersion?.version_number as number) ?? 0) + 1;

    // Create version snapshot
    const snapshot = {
      format: data.format,
      column_mappings: data.column_mappings,
      separator: data.separator,
      quote_char: data.quote_char,
      encoding: data.encoding,
      line_ending: data.line_ending,
      decimal_separator: data.decimal_separator,
      fallback_mode: data.fallback_mode,
      xml_template: data.xml_template,
    };

    const { error: versionError } = await adminClient
      .from("erp_config_versions")
      .insert({
        erp_config_id: configId,
        version_number: nextVersion,
        snapshot,
        comment: data.comment ?? null,
        created_by: user.id,
      });

    if (versionError) {
      console.error("Error inserting version:", versionError.message);
      // Non-fatal — config was saved, just version tracking failed
    }

    return NextResponse.json({
      success: true,
      data: { configId, versionNumber: nextVersion },
    });
  } catch (error) {
    console.error("Error in PUT /api/admin/erp-configs/[tenantId]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
