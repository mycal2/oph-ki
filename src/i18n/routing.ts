/**
 * OPH-98: Supported locales and default for the i18n infrastructure.
 *
 * No URL prefix is used — locale is determined by the `preferred_locale`
 * cookie at request time (see `src/i18n/request.ts`).
 */

export const locales = ["de", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "de";

/**
 * Cookie name carrying the active locale across requests.
 * Written by OPH-99 (tenant default) and OPH-100 (user override).
 */
export const LOCALE_COOKIE_NAME = "preferred_locale";

export function isLocale(value: string | undefined | null): value is Locale {
  return value !== null && value !== undefined && (locales as readonly string[]).includes(value);
}
