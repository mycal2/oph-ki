/**
 * OPH-98: Supported locales and default for the i18n infrastructure.
 *
 * No URL prefix is used — locale is determined by cookies at request time
 * (see `src/i18n/request.ts`).
 */

export const locales = ["de", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "de";

/**
 * OPH-99: Tenant-level locale cookie. Written by the protected layout on every
 * authenticated request from `tenants.preferred_locale`. Acts as the default
 * for all tenant users who have not configured a personal preference.
 */
export const TENANT_LOCALE_COOKIE_NAME = "tenant_locale";

/**
 * OPH-100: User-level locale cookie. Written when an individual user picks
 * their own preferred language. Always wins over the tenant-level cookie.
 */
export const USER_LOCALE_COOKIE_NAME = "user_locale";

/**
 * @deprecated OPH-98 originally used a single cookie. Kept exported for
 * backwards-compatibility with code that already imported the symbol; new
 * code should reference `TENANT_LOCALE_COOKIE_NAME` or
 * `USER_LOCALE_COOKIE_NAME` directly.
 */
export const LOCALE_COOKIE_NAME = TENANT_LOCALE_COOKIE_NAME;

export function isLocale(value: string | undefined | null): value is Locale {
  return value !== null && value !== undefined && (locales as readonly string[]).includes(value);
}
