"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, recordFailedAttempt, clearRateLimit } from "@/lib/rate-limit";

const SUPPORTED_TYPES = new Set<EmailOtpType>([
  "invite",
  "recovery",
  "email_change",
  "email",
  "signup",
  "magiclink",
]);

export interface VerifyCodeResult {
  ok: boolean;
  error?: string;
  retryAfterSeconds?: number;
}

/**
 * OPH-113: Verify a 6-digit OTP code as a fallback for the link-based
 * `/auth/confirm` flow. Used when corporate email URL detonation (Microsoft
 * Defender Plan 2) has burned the link before the human's click.
 *
 * Rate-limited per email (5 attempts before a 5-minute lockout) via the
 * existing `checkRateLimit` infrastructure. Generic error messages — no
 * distinction between "wrong code" and "rate-limited" to prevent enumeration
 * and brute-force optimisation.
 */
export async function verifyCodeAction(formData: FormData): Promise<VerifyCodeResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const type = String(formData.get("type") ?? "").trim() as EmailOtpType | "";
  const next = String(formData.get("next") ?? "/").trim() || "/";
  const codeRaw = String(formData.get("code") ?? "").trim();
  // Strip spaces, dashes, dots — users may paste "482 159" or "482-159".
  const code = codeRaw.replace(/[\s\-.]+/g, "");

  if (!email || !type || !SUPPORTED_TYPES.has(type)) {
    return { ok: false, error: "Ungültige Anfrage." };
  }
  if (code.length === 0) {
    return { ok: false, error: "Bitte geben Sie den 6-stelligen Code ein." };
  }
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "Der Code muss aus 6 Ziffern bestehen." };
  }

  // Rate limit per email — 5 attempts then 5-minute lockout.
  const rate = await checkRateLimit(email, "email");
  if (!rate.allowed) {
    return {
      ok: false,
      error: "Zu viele Versuche. Bitte warten Sie einen Moment, bevor Sie es erneut versuchen.",
      retryAfterSeconds: rate.retryAfterSeconds,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    email,
    token: code,
  });

  if (error) {
    await recordFailedAttempt(email, "email");
    // Generic message: don't reveal "wrong code" vs "expired" vs "user not found"
    // to keep brute-force and enumeration costs uniform.
    return {
      ok: false,
      error: "Der Code ist ungültig oder abgelaufen. Bitte prüfen Sie die E-Mail oder fordern Sie einen neuen Link an.",
    };
  }

  // Success — clear failed-attempt counter and redirect to the intended next URL.
  await clearRateLimit(email, "email");
  redirect(next);
}
