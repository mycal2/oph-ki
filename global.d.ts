/**
 * OPH-98: TypeScript type safety for translation keys.
 *
 * `next-intl` reads these declarations to make accessing a missing key a
 * compile-time error. We use the German bundle as the source of truth
 * because it must contain every key (English may fall back to German).
 */

import type messages from "./messages/de.json";

declare module "next-intl" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AppConfig {
    Messages: typeof messages;
  }
}
