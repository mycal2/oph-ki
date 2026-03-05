import { NextResponse } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";
import { updateNotificationEmailsSchema } from "@/lib/validations";

/**
 * GET /api/admin/settings/notifications
 *
 * Returns the current platform error notification email list.
 * Only accessible to platform admins.
 */
export async function GET(): Promise<NextResponse> {
  const authResult = await requirePlatformAdmin();
  if (isErrorResponse(authResult)) return authResult;

  const { adminClient } = authResult;

  const { data, error } = await adminClient
    .from("platform_settings")
    .select("error_notification_emails, updated_at")
    .eq("id", "singleton")
    .single();

  if (error) {
    console.error("Failed to fetch platform settings:", error.message);
    return NextResponse.json(
      { success: false, error: "Einstellungen konnten nicht geladen werden." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      emails: (data.error_notification_emails as string[]) ?? [],
      updatedAt: data.updated_at as string,
    },
  });
}

/**
 * PUT /api/admin/settings/notifications
 *
 * Updates the platform error notification email list (max 3).
 * Only accessible to platform admins.
 */
export async function PUT(request: Request): Promise<NextResponse> {
  const authResult = await requirePlatformAdmin();
  if (isErrorResponse(authResult)) return authResult;

  const { user, adminClient } = authResult;

  // Rate limit
  const rateLimitResponse = checkAdminRateLimit(user.id);
  if (rateLimitResponse) return rateLimitResponse;

  // Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Ungueltiger Request-Body." },
      { status: 400 }
    );
  }

  const parsed = updateNotificationEmailsSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Validierungsfehler.";
    return NextResponse.json(
      { success: false, error: firstError },
      { status: 400 }
    );
  }

  // Filter out empty strings and deduplicate
  const emails = [...new Set(parsed.data.emails.filter((e) => e.length > 0))];

  if (emails.length > 3) {
    return NextResponse.json(
      { success: false, error: "Maximal 3 Benachrichtigungs-E-Mails erlaubt." },
      { status: 400 }
    );
  }

  const { error } = await adminClient
    .from("platform_settings")
    .update({
      error_notification_emails: emails,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", "singleton");

  if (error) {
    console.error("Failed to update notification emails:", error.message);
    return NextResponse.json(
      { success: false, error: "Einstellungen konnten nicht gespeichert werden." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: { emails },
  });
}
