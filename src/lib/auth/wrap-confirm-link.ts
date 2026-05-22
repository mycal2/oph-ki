/**
 * OPH-111: Build an invite / password-reset link that goes through our own
 * `/auth/confirm` page instead of Supabase's verify endpoint or the raw
 * `action_link` returned by `generateLink`.
 *
 * Two reasons we wrap:
 *
 * 1. **Defender / safelink prefetch hardening.** Corporate email gateways
 *    (Microsoft Defender Safe Links, Mimecast URL Protect, Google Workspace,
 *    Proofpoint) GET every link before delivering. The Supabase verify
 *    endpoint consumes the single-use token on GET, so the human's click
 *    later finds it expired. Our `/auth/confirm` GET shows a "click to
 *    confirm" page instead — only the user-triggered POST consumes.
 *
 * 2. **Branded domain.** The wrapped link is rooted at the tenant's own
 *    site URL (e.g. https://oph-ki.ids.online) instead of a generic
 *    *.supabase.co URL, which is friendlier in inbox previews and harder
 *    for users to mistrust as phishing.
 *
 * Used by every `generateLink` caller — see OPH-111 spec for the full list.
 */
export type ConfirmLinkType =
  | "invite"
  | "recovery"
  | "email_change"
  | "email"
  | "signup"
  | "magiclink";

interface WrapConfirmLinkOptions {
  /** Public base URL, e.g. https://oph-ki.ids.online — no trailing slash. */
  siteUrl: string;
  /** The `hashed_token` field from `linkData.properties` on a `generateLink` response. */
  hashedToken: string;
  /** The Supabase OTP type for `verifyOtp` on the server. */
  type: ConfirmLinkType;
  /** Path the user is redirected to after successful confirmation. Should start with `/`. */
  next: string;
}

export function wrapConfirmLink({
  siteUrl,
  hashedToken,
  type,
  next,
}: WrapConfirmLinkOptions): string {
  const params = new URLSearchParams({
    token_hash: hashedToken,
    type,
    next,
  });
  return `${siteUrl}/auth/confirm?${params.toString()}`;
}
