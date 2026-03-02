import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/erp-configs/[tenantId]/rollback/[versionId]
 *
 * Restores a previous version as the new active config.
 * Creates a new version entry (copy of the old snapshot) so history is preserved.
 * Platform admin only.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; versionId: string }> }
): Promise<NextResponse> {
  try {
    const { tenantId, versionId } = await params;
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitError = checkAdminRateLimit(user.id);
    if (rateLimitError) return rateLimitError;

    if (!UUID_REGEX.test(tenantId) || !UUID_REGEX.test(versionId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige ID." },
        { status: 400 }
      );
    }

    // Fetch the config for this tenant
    const { data: config, error: configError } = await adminClient
      .from("erp_configs")
      .select("id")
      .eq("tenant_id", tenantId)
      .single();

    if (configError || !config) {
      return NextResponse.json(
        { success: false, error: "Keine ERP-Konfiguration fuer diesen Mandanten." },
        { status: 404 }
      );
    }

    const configId = config.id as string;

    // Fetch the version to restore
    const { data: version, error: versionError } = await adminClient
      .from("erp_config_versions")
      .select("id, version_number, snapshot")
      .eq("id", versionId)
      .eq("erp_config_id", configId)
      .single();

    if (versionError || !version) {
      return NextResponse.json(
        { success: false, error: "Version nicht gefunden." },
        { status: 404 }
      );
    }

    const snapshot = version.snapshot as Record<string, unknown>;

    // Apply snapshot to active config
    const { error: updateError } = await adminClient
      .from("erp_configs")
      .update({
        format: snapshot.format,
        column_mappings: snapshot.column_mappings,
        separator: snapshot.separator,
        quote_char: snapshot.quote_char,
        encoding: snapshot.encoding,
        line_ending: snapshot.line_ending,
        decimal_separator: snapshot.decimal_separator,
        fallback_mode: snapshot.fallback_mode,
        xml_template: snapshot.xml_template ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", configId);

    if (updateError) {
      console.error("Error restoring config:", updateError.message);
      return NextResponse.json(
        { success: false, error: "Konfiguration konnte nicht wiederhergestellt werden." },
        { status: 500 }
      );
    }

    // Create new version entry (copy of restored snapshot)
    const { data: lastVersion } = await adminClient
      .from("erp_config_versions")
      .select("version_number")
      .eq("erp_config_id", configId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = ((lastVersion?.version_number as number) ?? 0) + 1;

    const { error: newVersionError } = await adminClient
      .from("erp_config_versions")
      .insert({
        erp_config_id: configId,
        version_number: nextVersion,
        snapshot,
        comment: `Wiederhergestellt von Version ${version.version_number}`,
        created_by: user.id,
      });

    if (newVersionError) {
      console.error("Error creating rollback version:", newVersionError.message);
      // Non-fatal — config was restored, just version tracking failed
    }

    return NextResponse.json({
      success: true,
      data: {
        configId,
        restoredFromVersion: version.version_number,
        newVersionNumber: nextVersion,
      },
    });
  } catch (error) {
    console.error("Error in POST /api/admin/erp-configs/[tenantId]/rollback/[versionId]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
