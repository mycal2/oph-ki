"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * OPH-111: Token-consuming server action invoked when the user clicks the
 * "Bestätigen" button on the `/auth/confirm` page.
 *
 * This is the ONLY place `verifyOtp` runs for invite / reset flows. The GET
 * on the page itself never touches the token — so email-prefetch scanners
 * (Defender, Mimecast, etc.) hitting the URL beforehand don't burn it.
 */
export async function confirmAuthToken(formData: FormData): Promise<void> {
  const tokenHash = String(formData.get("token_hash") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim() as EmailOtpType | "";
  // `next` defaults to `/` so a stripped form still lands somewhere sane.
  const next = String(formData.get("next") ?? "/").trim() || "/";
  // OPH-113: email is included in the wrapped URL so we can hand it off to
  // /auth/code if the token has already been consumed (Defender detonation).
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!tokenHash || !type) {
    redirect("/login?error=invalid_invite_link");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    // OPH-113: When the token is already consumed (most often because a
    // corporate URL detonator hit the link before the human's click), bounce
    // the user to /auth/code where they can complete the flow by typing the
    // 6-digit code from the email body. We need an email + type for the code
    // path to work — if either is missing, fall back to the original error.
    if (email && type) {
      const params = new URLSearchParams({
        email,
        type,
        next,
        error: "token_already_used",
      });
      redirect(`/auth/code?${params.toString()}`);
    }
    redirect("/login?error=invite_link_expired");
  }

  redirect(next);
}
