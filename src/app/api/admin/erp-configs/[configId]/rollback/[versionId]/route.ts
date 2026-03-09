import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/erp-configs/[configId]/rollback/[versionId]
 *
 * OPH-29: Restores a previous version as the new active config.
 * Creates a new version entry (copy of the old snapshot) so history is preserved.
 * Platform admin only.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ configId: string; versionId: string }> }
): Promise<NextResponse> {
  try {
    const { configId, versionId } = await params;
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitError = checkAdminRateLimit(user.id);
    if (rateLimitError) return rateLimitError;

    if (!UUID_REGEX.test(configId) || !UUID_REGEX.test(versionId)) {
      return NextResponse.json(
        { success: false, error: "Ungueltige ID." },
        { status: 400 }
      );
    }

    // Verify config exists
    const { data: config, error: configError } = await adminClient
      .from("erp_configs")
      .select("id")
      .eq("id", configId)
      .single();

    if (configError || !config) {
      return NextResponse.json(
        { success: false, error: "ERP-Konfiguration nicht gefunden." },
        { status: 404 }
      );
    }

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

    // Apply snapshot to active config (including name/description if present)
    const { error: updateError } = await adminClient
      .from("erp_configs")
      .update({
        name: snapshot.name ?? undefined,
        description: snapshot.description ?? null,
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

    await adminClient.from("erp_config_versions").insert({
      erp_config_id: configId,
      version_number: nextVersion,
      snapshot,
      comment: `Wiederhergestellt von Version ${version.version_number}`,
      created_by: user.id,
    });

    return NextResponse.json({
      success: true,
      data: {
        configId,
        restoredFromVersion: version.version_number,
        newVersionNumber: nextVersion,
      },
    });
  } catch (error) {
    console.error("Error in POST /api/admin/erp-configs/[configId]/rollback/[versionId]:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}
