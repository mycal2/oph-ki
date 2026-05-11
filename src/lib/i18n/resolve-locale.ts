/**
 * OPH-98: Locale resolution.
 *
 * `resolveLocale(preferences)` accepts an ordered preference list and returns
 * the first valid locale, falling back to `defaultLocale` if no entry matches.
 *
 * OPH-99 (tenant default) and OPH-100 (user override) supply values to this
 * list; this function does not own the storage logic.
 */

import { defaultLocale, isLocale, type Locale } from "@/i18n/routing";

export function resolveLocale(
  preferences: readonly (string | null | undefined)[]
): Locale {
  for (const candidate of preferences) {
    if (isLocale(candidate)) {
      return candidate;
    }
  }
  return defaultLocale;
}

/**
 * Parse a browser `Accept-Language` header into an ordered list of locale tags
 * (lowercased base language only — `en-US` becomes `en`).
 *
 * Returns an empty array for an empty/invalid header so the caller can chain
 * additional fallbacks safely.
 */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];

  return header
    .split(",")
    .map((entry) => {
      const [tag] = entry.trim().split(";");
      if (!tag) return null;
      const base = tag.split("-")[0]?.toLowerCase().trim();
      return base || null;
    })
    .filter((value): value is string => Boolean(value));
}
