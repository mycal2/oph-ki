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

  if (!tokenHash || !type) {
    redirect("/login?error=invalid_invite_link");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    redirect("/login?error=invite_link_expired");
  }

  redirect(next);
}
