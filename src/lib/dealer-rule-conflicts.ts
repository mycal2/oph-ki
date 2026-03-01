import type { SupabaseClient } from "@supabase/supabase-js";
import type { DealerRuleConflict } from "@/lib/types";

/**
 * Checks for rule conflicts between the given input and existing active dealers.
 * Returns an array of conflict warnings (not errors — save still succeeds).
 */
export async function checkRuleConflicts(
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
