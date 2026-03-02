import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/erp-configs/[tenantId]/copy-from/[sourceTenantId]
 *
 * Copies the active ERP config from the source tenant to the target tenant.
 * Creates a new version in the target tenant. Version history from the source
 * is NOT transferred (per AC-11).
 * Platform admin only.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; sourceTenantId: string }> }
): Promise<NextResponse> {
  try {
    const { tenantId, sourceTenantId } = await params;
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitError = checkAdminRateLimit(user.id);
    if (rateLimitError) return rateLimitError;

    if (!UUID_REGEX.test(tenantId) || !UUID_REGEX.test(sourceTenantId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige ID." },
        { status: 400 }
      );
    }

    if (tenantId === sourceTenantId) {
      return NextResponse.json(
        { success: false, error: "Quell- und Zielmandant duerfen nicht identisch sein." },
        { status: 400 }
      );
    }

    // Verify target tenant exists
    const { data: targetTenant } = await adminClient
      .from("tenants")
      .select("id")
      .eq("id", tenantId)
      .single();

    if (!targetTenant) {
      return NextResponse.json(
        { success: false, error: "Zielmandant nicht gefunden." },
        { status: 404 }
      );
    }

    // Fetch source config
    const { data: sourceConfig, error: sourceError } = await adminClient
      .from("erp_configs")
      .select("*")
      .eq("tenant_id", sourceTenantId)
      .single();

    if (sourceError || !sourceConfig) {
      return NextResponse.json(
        { success: false, error: "Quellmandant hat keine ERP-Konfiguration." },
        { status: 404 }
      );
    }

    // Build config payload from source
    const configPayload = {
      tenant_id: tenantId,
      format: sourceConfig.format,
      column_mappings: sourceConfig.column_mappings,
      separator: sourceConfig.separator,
      quote_char: sourceConfig.quote_char,
      encoding: sourceConfig.encoding,
      line_ending: sourceConfig.line_ending ?? "LF",
      decimal_separator: sourceConfig.decimal_separator ?? ".",
      fallback_mode: sourceConfig.fallback_mode ?? "block",
      xml_template: sourceConfig.xml_template ?? null,
      is_default: true,
      updated_at: new Date().toISOString(),
    };

    // Check if target already has a config
    const { data: existingConfig } = await adminClient
      .from("erp_configs")
      .select("id")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    let configId: string;

    if (existingConfig) {
      configId = existingConfig.id as string;
      const { error: updateError } = await adminClient
        .from("erp_configs")
        .update(configPayload)
        .eq("id", configId);

      if (updateError) {
        console.error("Error updating target config:", updateError.message);
        return NextResponse.json(
          { success: false, error: "Konfiguration konnte nicht kopiert werden." },
          { status: 500 }
        );
      }
    } else {
      const { data: newConfig, error: insertError } = await adminClient
        .from("erp_configs")
        .insert(configPayload)
        .select("id")
        .single();

      if (insertError || !newConfig) {
        console.error("Error inserting target config:", insertError?.message);
        return NextResponse.json(
          { success: false, error: "Konfiguration konnte nicht erstellt werden." },
          { status: 500 }
        );
      }
      configId = newConfig.id as string;
    }

    // Create version snapshot in target
    const { data: lastVersion } = await adminClient
      .from("erp_config_versions")
      .select("version_number")
      .eq("erp_config_id", configId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = ((lastVersion?.version_number as number) ?? 0) + 1;

    // Fetch source tenant name for comment
    const { data: sourceTenant } = await adminClient
      .from("tenants")
      .select("name")
      .eq("id", sourceTenantId)
      .single();

    const sourceName = (sourceTenant?.name as string) ?? sourceTenantId;

    const snapshot = {
      format: sourceConfig.format,
      column_mappings: sourceConfig.column_mappings,
      separator: sourceConfig.separator,
      quote_char: sourceConfig.quote_char,
      encoding: sourceConfig.encoding,
      line_ending: sourceConfig.line_ending ?? "LF",
      decimal_separator: sourceConfig.decimal_separator ?? ".",
      fallback_mode: sourceConfig.fallback_mode ?? "block",
      xml_template: sourceConfig.xml_template ?? null,
    };

    const { error: versionError } = await adminClient
      .from("erp_config_versions")
      .insert({
        erp_config_id: configId,
        version_number: nextVersion,
        snapshot,
        comment: `Kopiert von Mandant "${sourceName}"`,
        created_by: user.id,
      });

    if (versionError) {
      console.error("Error creating copy version:", versionError.message);
    }

    return NextResponse.json({
      success: true,
      data: {
        configId,
        copiedFrom: sourceTenantId,
        versionNumber: nextVersion,
      },
    });
  } catch (error) {
    console.error("Error in POST /api/admin/erp-configs/[tenantId]/copy-from/[sourceTenantId]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
