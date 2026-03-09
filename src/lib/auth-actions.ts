"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, recordFailedAttempt, clearRateLimit } from "@/lib/rate-limit";

/**
 * Server actions for OPH-1: Multi-Tenant Auth.
 * Uses Supabase Auth via the server-side SSR client.
 *
 * NOTE: Team management operations (invite, get members, toggle status)
 * are handled by the API routes (/api/team/*) and called directly
 * from the frontend via fetch with credentials.
 */

export interface AuthResult {
  success: boolean;
  error?: string;
}

/**
 * Login with email and password.
 */
export async function loginAction(
  email: string,
  password: string
): Promise<AuthResult> {
  if (!email || !password) {
    return { success: false, error: "E-Mail und Passwort sind erforderlich." };
  }

  // Read IP from request headers (available in server actions via next/headers)
  const headersList = await headers();
  const ipAddress =
    headersList.get("x-forwarded-for")?.split(",")[0].trim() ??
    headersList.get("x-real-ip") ??
    undefined;

  // Check rate limit by email (always) and IP (if available)
  const emailLimit = await checkRateLimit(email.toLowerCase(), "email");
  if (!emailLimit.allowed) {
    const minutes = Math.ceil((emailLimit.retryAfterSeconds ?? 300) / 60);
    return {
      success: false,
      error: `Zu viele fehlgeschlagene Anmeldeversuche. Bitte versuchen Sie es in ${minutes} Minuten erneut.`,
    };
  }

  if (ipAddress) {
    const ipLimit = await checkRateLimit(ipAddress, "ip");
    if (!ipLimit.allowed) {
      const minutes = Math.ceil((ipLimit.retryAfterSeconds ?? 300) / 60);
      return {
        success: false,
        error: `Zu viele fehlgeschlagene Anmeldeversuche. Bitte versuchen Sie es in ${minutes} Minuten erneut.`,
      };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Record the failed attempt for rate limiting
    await recordFailedAttempt(email.toLowerCase(), "email");
    if (ipAddress) {
      await recordFailedAttempt(ipAddress, "ip");
    }

    if (error.message.includes("Invalid login credentials")) {
      return {
        success: false,
        error: "Ungültige Anmeldedaten. Bitte versuchen Sie es erneut.",
      };
    }
    if (error.message.includes("Email not confirmed")) {
      return {
        success: false,
        error: "E-Mail-Adresse nicht bestätigt. Bitte prüfen Sie Ihr Postfach.",
      };
    }
    return {
      success: false,
      error: "Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.",
    };
  }

  if (!data.session) {
    await recordFailedAttempt(email.toLowerCase(), "email");
    return { success: false, error: "Keine Sitzung erstellt." };
  }

  // Check if user or tenant is inactive (from JWT app_metadata)
  const appMetadata = data.user?.app_metadata;
  if (appMetadata?.user_status === "inactive") {
    await supabase.auth.signOut();
    return {
      success: false,
      error:
        "Ihr Konto ist deaktiviert. Bitte kontaktieren Sie Ihren Administrator.",
    };
  }

  if (appMetadata?.tenant_status === "inactive") {
    await supabase.auth.signOut();
    return {
      success: false,
      error:
        "Ihr Mandant ist deaktiviert. Bitte kontaktieren Sie den Plattform-Support.",
    };
  }

  // Successful login — clear rate limit records
  await clearRateLimit(email.toLowerCase(), "email");
  if (ipAddress) {
    await clearRateLimit(ipAddress, "ip");
  }

  return { success: true };
}

/**
 * Send password reset email.
 * Always returns success to avoid revealing whether the email exists.
 */
export async function forgotPasswordAction(
  email: string
): Promise<AuthResult> {
  if (!email) {
    return { success: false, error: "E-Mail-Adresse ist erforderlich." };
  }

  const supabase = await createClient();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });

  // Always return success to not leak whether the email exists
  return { success: true };
}

/**
 * Reset password (user already has a valid session from the reset link).
 */
export async function resetPasswordAction(
  password: string,
  confirmPassword: string
): Promise<AuthResult> {
  if (!password || !confirmPassword) {
    return { success: false, error: "Beide Passwortfelder sind erforderlich." };
  }

  if (password !== confirmPassword) {
    return { success: false, error: "Passwörter stimmen nicht überein." };
  }

  if (password.length < 8) {
    return {
      success: false,
      error: "Passwort muss mindestens 8 Zeichen lang sein.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error("Password reset error:", error.message);
    return {
      success: false,
      error: "Passwort konnte nicht geändert werden. Bitte versuchen Sie es erneut.",
    };
  }

  return { success: true };
}

/**
 * Accept invite and set password.
 * The user arrives with a valid session from the invite link callback.
 */
export async function acceptInviteAction(
  password: string,
  confirmPassword: string
): Promise<AuthResult> {
  if (!password || !confirmPassword) {
    return { success: false, error: "Beide Passwortfelder sind erforderlich." };
  }

  if (password !== confirmPassword) {
    return { success: false, error: "Passwörter stimmen nicht überein." };
  }

  if (password.length < 8) {
    return {
      success: false,
      error: "Passwort muss mindestens 8 Zeichen lang sein.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error("Accept invite error:", error.message);
    return {
      success: false,
      error: "Konto konnte nicht eingerichtet werden. Bitte versuchen Sie es erneut.",
    };
  }

  return { success: true };
}

/**
 * Sign out the current user.
 */
export async function logoutAction(): Promise<AuthResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Logout error:", error.message);
    return {
      success: false,
      error: "Abmeldung fehlgeschlagen.",
    };
  }

  return { success: true };
}
