/**
 * OPH-99 BUG-6: Shared cookie options for the tenant_locale (and future
 * user_locale) cookies.
 *
 * Production hosts share the apex `ids.online` so the cookie should be
 * scoped to `.ids.online` to cover both `oph-ki(-env).ids.online` and the
 * per-tenant Salesforce App subdomains (e.g. `meisinger.ids.online`).
 *
 * On localhost we omit the Domain attribute so the cookie behaves as a
 * host-only cookie (browsers reject `Domain=localhost`).
 */

const SHARED_DOMAIN = ".ids.online";

/** One year — refreshed routinely by middleware on every authenticated page. */
export const TENANT_LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

interface BaseCookieOptions {
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  domain?: string;
}

export function localeCookieDomain(host: string | null | undefined): string | undefined {
  if (!host) return undefined;
  // `host` includes port for localhost; strip if present.
  const bareHost = host.split(":")[0];
  return bareHost.endsWith(SHARED_DOMAIN) ? SHARED_DOMAIN : undefined;
}

/** Cookie options for setting the tenant_locale cookie. */
export function tenantLocaleCookieOptions(
  host: string | null | undefined
): BaseCookieOptions & { maxAge: number } {
  const domain = localeCookieDomain(host);
  return {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TENANT_LOCALE_COOKIE_MAX_AGE,
    ...(domain ? { domain } : {}),
  };
}

/** Cookie options for clearing the tenant_locale cookie (must match domain used when set). */
export function tenantLocaleClearOptions(
  host: string | null | undefined
): BaseCookieOptions & { maxAge: 0 } {
  const domain = localeCookieDomain(host);
  return {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    ...(domain ? { domain } : {}),
  };
}
