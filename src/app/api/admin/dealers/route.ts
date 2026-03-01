import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePlatformAdmin, isErrorResponse } from "@/lib/admin-auth";
import { createDealerSchema } from "@/lib/validations";
import type { DealerAdminListItem, Dealer, DealerRuleConflict } from "@/lib/types";

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

    // Fetch all dealers with order stats via a single raw query
    const { data, error } = await adminClient.rpc("get_dealer_admin_list");

    if (error) {
      // Fallback: if RPC doesn't exist yet, use a simpler approach
      console.error("RPC get_dealer_admin_list failed, using fallback:", error.message);

      const { data: dealers, error: dealersError } = await adminClient
        .from("dealers")
        .select("id, name, description, format_type, city, country, active, created_at")
        .order("name", { ascending: true })
        .limit(1000);

      if (dealersError) {
        return NextResponse.json(
          { success: false, error: "Haendler konnten nicht geladen werden." },
          { status: 500 }
        );
      }

      // Get order counts per dealer in a second query
      const { data: orderStats } = await adminClient
        .from("orders")
        .select("dealer_id, created_at")
        .not("dealer_id", "is", null);

      const statsByDealer = new Map<string, { count: number; lastAt: string | null }>();
      if (orderStats) {
        for (const row of orderStats) {
          const did = row.dealer_id as string;
          const existing = statsByDealer.get(did);
          const createdAt = row.created_at as string;
          if (!existing) {
            statsByDealer.set(did, { count: 1, lastAt: createdAt });
          } else {
            existing.count++;
            if (!existing.lastAt || createdAt > existing.lastAt) {
              existing.lastAt = createdAt;
            }
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
          created_at: d.created_at as string,
        };
      });

      return NextResponse.json({ success: true, data: result });
    }

    return NextResponse.json({ success: true, data: data as DealerAdminListItem[] });
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

    const body = await request.json();
    const parsed = createDealerSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Ungueltige Eingabe.";
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
        { success: false, error: "Haendler konnte nicht erstellt werden." },
        { status: 500 }
      );
    }

    // Write audit log
    await adminClient.from("dealer_audit_log").insert({
      dealer_id: dealer.id,
      changed_by: user.id,
      admin_email: user.email ?? "unknown",
      action: "created",
      changed_fields: null,
      snapshot_before: null,
    });

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

/**
 * Checks for rule conflicts between the given input and existing active dealers.
 * Returns an array of conflict warnings (not errors — save still succeeds).
 */
async function checkRuleConflicts(
  adminClient: SupabaseClient,
  input: {
    known_domains?: string[];
    known_sender_addresses?: string[];
    subject_patterns?: string[];
    filename_patterns?: string[];
  },
  excludeDealerId: string | null
): Promise<DealerRuleConflict[]> {
  const warnings: DealerRuleConflict[] = [];

  // Fetch all active dealers for comparison
  const { data: dealers } = await adminClient
    .from("dealers")
    .select("id, name, known_domains, known_sender_addresses, subject_patterns, filename_patterns")
    .eq("active", true);

  if (!dealers) return warnings;

  for (const dealer of dealers) {
    if (excludeDealerId && dealer.id === excludeDealerId) continue;

    const dealerId = dealer.id as string;
    const dealerName = dealer.name as string;

    // Check domain overlaps
    for (const domain of input.known_domains ?? []) {
      if ((dealer.known_domains as string[]).some(
        (d) => d.toLowerCase() === domain.toLowerCase()
      )) {
        warnings.push({
          field: "known_domains",
          value: domain,
          conflicting_dealer_id: dealerId,
          conflicting_dealer_name: dealerName,
        });
      }
    }

    // Check sender address overlaps
    for (const addr of input.known_sender_addresses ?? []) {
      if ((dealer.known_sender_addresses as string[]).some(
        (a) => a.toLowerCase() === addr.toLowerCase()
      )) {
        warnings.push({
          field: "known_sender_addresses",
          value: addr,
          conflicting_dealer_id: dealerId,
          conflicting_dealer_name: dealerName,
        });
      }
    }

    // Check subject pattern overlaps
    for (const pattern of input.subject_patterns ?? []) {
      if ((dealer.subject_patterns as string[]).some(
        (p) => p.toLowerCase() === pattern.toLowerCase()
      )) {
        warnings.push({
          field: "subject_patterns",
          value: pattern,
          conflicting_dealer_id: dealerId,
          conflicting_dealer_name: dealerName,
        });
      }
    }

    // Check filename pattern overlaps
    for (const pattern of input.filename_patterns ?? []) {
      if ((dealer.filename_patterns as string[]).some(
        (p) => p.toLowerCase() === pattern.toLowerCase()
      )) {
        warnings.push({
          field: "filename_patterns",
          value: pattern,
          conflicting_dealer_id: dealerId,
          conflicting_dealer_name: dealerName,
        });
      }
    }
  }

  return warnings;
}

export { checkRuleConflicts };
