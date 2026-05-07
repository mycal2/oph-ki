/**
 * OPH-98: next-intl request configuration.
 *
 * Runs on every server request. Resolves the active locale via the
 * `preferred_locale` cookie + Accept-Language fallback, loads the matching
 * messages JSON, and deep-merges the German bundle as a fallback so a missing
 * key in a non-default bundle renders the German string instead of the raw key.
 */

import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, LOCALE_COOKIE_NAME } from "./routing";
import { parseAcceptLanguage, resolveLocale } from "@/lib/i18n/resolve-locale";
import deMessages from "../../messages/de.json";

type MessagesShape = typeof deMessages;
type AnyMessages = Record<string, unknown>;

/**
 * Recursively merge two message objects. Values from `override` win; missing
 * keys are filled from `base`. Used so any missing translation in a non-default
 * locale falls back to German rather than showing the raw key.
 */
function mergeMessages(base: AnyMessages, override: AnyMessages): AnyMessages {
  const result: AnyMessages = { ...base };
  for (const key of Object.keys(override)) {
    const baseVal = base[key];
    const overrideVal = override[key];
    if (
      overrideVal &&
      typeof overrideVal === "object" &&
      !Array.isArray(overrideVal) &&
      baseVal &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal)
    ) {
      result[key] = mergeMessages(
        baseVal as AnyMessages,
        overrideVal as AnyMessages
      );
    } else {
      result[key] = overrideVal;
    }
  }
  return result;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const cookieValue = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const acceptLanguage = parseAcceptLanguage(headerStore.get("accept-language"));

  const locale = resolveLocale([cookieValue, ...acceptLanguage]);

  let messages: MessagesShape;
  if (locale === defaultLocale) {
    messages = deMessages;
  } else {
    const overrideModule = (await import(`../../messages/${locale}.json`)) as {
      default: AnyMessages;
    };
    messages = mergeMessages(
      deMessages as AnyMessages,
      overrideModule.default
    ) as MessagesShape;
  }

  return {
    locale,
    messages,
    // Format dates/numbers using the resolved locale by default.
    timeZone: "Europe/Berlin",
    now: new Date(),
  };
});
