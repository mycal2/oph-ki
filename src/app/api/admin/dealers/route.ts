import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin, isErrorResponse, checkAdminRateLimit } from "@/lib/admin-auth";
import { createDealerSchema } from "@/lib/validations";
import { checkRuleConflicts } from "@/lib/dealer-rule-conflicts";
import type { DealerAdminListItem, Dealer } from "@/lib/types";

/**
 * GET /api/admin/dealers
 *
 * Returns all dealers (including inactive) with order counts and last order date.
 * Platform admin only.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { adminClient } = auth;

    // Fetch all dealers
    const { data: dealers, error: dealersError } = await adminClient
      .from("dealers")
      .select("id, name, description, format_type, city, country, active, created_at")
      .order("name", { ascending: true })
      .limit(1000);

    if (dealersError) {
      return NextResponse.json(
        { success: false, error: "Händler konnten nicht geladen werden." },
        { status: 500 }
      );
    }

    // Get order stats per dealer. Try RPC first (efficient), fall back to limited query.
    const statsByDealer = new Map<string, { count: number; lastAt: string | null; tenantCount: number }>();

    const { data: rpcStats, error: rpcError } = await adminClient.rpc("get_dealer_order_stats");

    if (!rpcError && Array.isArray(rpcStats)) {
      for (const row of rpcStats as { dealer_id: string; order_count: number; last_order_at: string | null; tenant_count: number }[]) {
        statsByDealer.set(row.dealer_id, {
          count: row.order_count,
          lastAt: row.last_order_at,
          tenantCount: row.tenant_count ?? 0,
        });
      }
    } else {
      // Fallback: count per dealer_id with limited rows
      const { data: fallbackStats } = await adminClient
        .from("orders")
        .select("dealer_id, tenant_id")
        .not("dealer_id", "is", null)
        .limit(10000);

      if (fallbackStats) {
        const tenantSets = new Map<string, Set<string>>();
        for (const row of fallbackStats) {
          const did = row.dealer_id as string;
          const tid = row.tenant_id as string;
          const existing = statsByDealer.get(did);
          if (!existing) {
            statsByDealer.set(did, { count: 1, lastAt: null, tenantCount: 0 });
            tenantSets.set(did, new Set([tid]));
          } else {
            existing.count++;
            const ts = tenantSets.get(did)!;
            ts.add(tid);
          }
        }
        // Apply distinct tenant counts
        for (const [did, ts] of tenantSets) {
          const stats = statsByDealer.get(did);
          if (stats) stats.tenantCount = ts.size;
        }
      }
    }

    const result: DealerAdminListItem[] = (dealers ?? []).map((d) => {
      const stats = statsByDealer.get(d.id as string);
      return {
        id: d.id as string,
        name: d.name as string,
        description: (d.description as string) ?? null,
        format_type: d.format_type as DealerAdminListItem["format_type"],
        city: (d.city as string) ?? null,
        country: (d.country as string) ?? null,
        active: d.active as boolean,
        order_count: stats?.count ?? 0,
        last_order_at: stats?.lastAt ?? null,
        tenant_count: stats?.tenantCount ?? 0,
        created_at: d.created_at as string,
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error in GET /api/admin/dealers:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/dealers
 *
 * Creates a new dealer profile. Platform admin only.
 * Returns the created dealer and any rule conflict warnings.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    const auth = await requirePlatformAdmin();
    if (isErrorResponse(auth)) return auth;
    const { user, adminClient } = auth;

    const rateLimitResponse = checkAdminRateLimit(user.id);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const parsed = createDealerSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungültige Eingabe.";
      return NextResponse.json(
        { success: false, error: firstError },
        { status: 400 }
      );
    }

    const input = parsed.data;

    // Check for rule conflicts with existing dealers
    const warnings = await checkRuleConflicts(adminClient, input, null);

    // Insert the dealer
    const { data: dealer, error: insertError } = await adminClient
      .from("dealers")
      .insert({
        name: input.name,
        description: input.description ?? null,
        format_type: input.format_type,
        street: input.street ?? null,
        postal_code: input.postal_code ?? null,
        city: input.city ?? null,
        country: input.country ?? null,
        known_domains: input.known_domains,
        known_sender_addresses: input.known_sender_addresses,
        subject_patterns: input.subject_patterns,
        filename_patterns: input.filename_patterns,
        extraction_hints: input.extraction_hints ?? null,
        active: input.active,
      })
      .select()
      .single();

    if (insertError || !dealer) {
      console.error("Failed to create dealer:", insertError?.message);
      return NextResponse.json(
        { success: false, error: "Händler konnte nicht erstellt werden." },
        { status: 500 }
      );
    }

    // Write audit log (non-blocking — failure logged but does not abort the request)
    const { error: auditError } = await adminClient.from("dealer_audit_log").insert({
      dealer_id: dealer.id,
      changed_by: user.id,
      admin_email: user.email ?? "unknown",
      action: "created",
      changed_fields: null,
      snapshot_before: null,
    });
    if (auditError) {
      console.error("Failed to write dealer audit log:", auditError.message);
    }

    return NextResponse.json({
      success: true,
      data: { dealer: dealer as unknown as Dealer, warnings },
    });
  } catch (error) {
    console.error("Error in POST /api/admin/dealers:", error);
    return NextResponse.json(
      { success: false, error: "Interner Serverfehler." },
      { status: 500 }
    );
  }
}

