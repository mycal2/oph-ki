import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Application-level rate limiter using the auth_rate_limits table.
 * Tracks failed attempts per identifier (email or IP) and blocks
 * after MAX_ATTEMPTS failures for LOCKOUT_MINUTES.
 */

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;
const WINDOW_MINUTES = 15; // Reset counter after this window

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  remainingAttempts?: number;
}

/**
 * Check if the given identifier is rate-limited.
 * Returns whether the request is allowed.
 */
export async function checkRateLimit(
  identifier: string,
  identifierType: "email" | "ip"
): Promise<RateLimitResult> {
  const supabase = createAdminClient();

  const { data: record } = await supabase
    .from("auth_rate_limits")
    .select("*")
    .eq("identifier", identifier)
    .eq("identifier_type", identifierType)
    .single();

  if (!record) {
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
  }

  // Check if currently locked
  if (record.locked_until) {
    const lockedUntil = new Date(record.locked_until);
    const now = new Date();

    if (now < lockedUntil) {
      const retryAfterSeconds = Math.ceil(
        (lockedUntil.getTime() - now.getTime()) / 1000
      );
      return { allowed: false, retryAfterSeconds };
    }

    // Lock expired, reset the record
    await supabase
      .from("auth_rate_limits")
      .delete()
      .eq("id", record.id);

    return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
  }

  // Check if the window has expired
  const firstAttempt = new Date(record.first_attempt_at);
  const windowExpiry = new Date(
    firstAttempt.getTime() + WINDOW_MINUTES * 60 * 1000
  );

  if (new Date() > windowExpiry) {
    // Window expired, reset
    await supabase
      .from("auth_rate_limits")
      .delete()
      .eq("id", record.id);

    return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
  }

  const remaining = MAX_ATTEMPTS - record.attempt_count;
  return {
    allowed: remaining > 0,
    remainingAttempts: Math.max(0, remaining),
    retryAfterSeconds:
      remaining <= 0 ? LOCKOUT_MINUTES * 60 : undefined,
  };
}

/**
 * Record a failed attempt for the given identifier.
 * If MAX_ATTEMPTS is reached, locks the identifier for LOCKOUT_MINUTES.
 */
export async function recordFailedAttempt(
  identifier: string,
  identifierType: "email" | "ip"
): Promise<void> {
  const supabase = createAdminClient();

  const { data: record } = await supabase
    .from("auth_rate_limits")
    .select("*")
    .eq("identifier", identifier)
    .eq("identifier_type", identifierType)
    .single();

  if (!record) {
    // First failed attempt
    await supabase.from("auth_rate_limits").insert({
      identifier,
      identifier_type: identifierType,
      attempt_count: 1,
      first_attempt_at: new Date().toISOString(),
    });
    return;
  }

  const newCount = record.attempt_count + 1;
  const updateData: Record<string, unknown> = {
    attempt_count: newCount,
  };

  // Lock if we've reached the limit
  if (newCount >= MAX_ATTEMPTS) {
    const lockedUntil = new Date(
      Date.now() + LOCKOUT_MINUTES * 60 * 1000
    );
    updateData.locked_until = lockedUntil.toISOString();
  }

  await supabase
    .from("auth_rate_limits")
    .update(updateData)
    .eq("id", record.id);
}

/**
 * Clear rate limit records for the given identifier (on successful login).
 */
export async function clearRateLimit(
  identifier: string,
  identifierType: "email" | "ip"
): Promise<void> {
  const supabase = createAdminClient();

  await supabase
    .from("auth_rate_limits")
    .delete()
    .eq("identifier", identifier)
    .eq("identifier_type", identifierType);
}
