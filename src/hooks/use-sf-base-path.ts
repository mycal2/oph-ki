"use client";

/**
 * Returns the correct base path for Salesforce App links.
 *
 * On localhost (direct /sf/[slug]/ access): returns "/sf/{slug}"
 * On a real subdomain (meisinger-dev.ids.online): returns "" (empty string)
 * because the middleware rewrites / → /sf/{slug}/ automatically.
 *
 * Usage: `<Link href={`${basePath}/basket`}>` works in both environments.
 */
export function useSfBasePath(slug: string): string {
  if (typeof window === "undefined") return `/sf/${slug}`;
  const isLocalhost = window.location.hostname === "localhost";
  return isLocalhost ? `/sf/${slug}` : "";
}
