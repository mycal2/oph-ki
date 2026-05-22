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
  /**
   * OPH-113: Recipient email. Included so that if the wrapped link's token is
   * already consumed (Defender URL detonation), the server can redirect the
   * user to `/auth/code` with email pre-filled for the OTP-code fallback.
   * Optional for backwards compatibility, but should always be passed for new
   * code paths.
   */
  email?: string;
}

export function wrapConfirmLink({
  siteUrl,
  hashedToken,
  type,
  next,
  email,
}: WrapConfirmLinkOptions): string {
  const params = new URLSearchParams({
    token_hash: hashedToken,
    type,
    next,
  });
  if (email) {
    params.set("email", email);
  }
  return `${siteUrl}/auth/confirm?${params.toString()}`;
}

interface WrapCodeLinkOptions {
  /** Public base URL, e.g. https://oph-ki.ids.online — no trailing slash. */
  siteUrl: string;
  /** Recipient email (pre-fills the code page so user only types the 6-digit code). */
  email: string;
  /** Supabase OTP type — must match what was used when generating the code. */
  type: ConfirmLinkType;
  /** Path the user is redirected to after successful code verification. Should start with `/`. */
  next: string;
}

/**
 * OPH-113: Build a "Defender-resistant" link to the 6-digit code page.
 *
 * Used as a FALLBACK in invite/recovery/magic-link emails: when corporate
 * URL-detonation (Microsoft Defender Plan 2) burns the primary `/auth/confirm`
 * link before the user can click, the user can paste the 6-digit code from
 * the email body into `/auth/code` and complete the flow.
 *
 * The page reads `email` and `type` from query params and pre-fills the form,
 * so the user only needs to type the 6-digit code.
 */
export function wrapCodeLink({
  siteUrl,
  email,
  type,
  next,
}: WrapCodeLinkOptions): string {
  const params = new URLSearchParams({
    email,
    type,
    next,
  });
  return `${siteUrl}/auth/code?${params.toString()}`;
}
