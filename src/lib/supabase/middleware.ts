import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase session middleware with role-based and status-based access control.
 *
 * Layer 1 of the security architecture:
 * - Refreshes the Supabase session
 * - Redirects unauthenticated users to /login
 * - Blocks inactive users and deactivated tenants
 * - Enforces route-level role restrictions:
 *   - /admin/* -> platform_admin only
 *   - /settings/team -> tenant_admin or platform_admin
 *   - All other protected routes -> any authenticated, active user
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = request.nextUrl;
  const hostname = request.headers.get("host") ?? "";

  // OPH-73: Detect Salesforce App subdomain (*.ids.online)
  // Extract the subdomain from the host header. Ignore known OPH domains.
  // Supports environment-suffixed subdomains: meisinger-dev.ids.online, meisinger-staging.ids.online
  const OPH_HOSTS = new Set([
    "localhost:3003", "localhost:3000",
    "oph-ki.ids.online", "oph-ki-dev.ids.online", "oph-ki-staging.ids.online",
  ]);
  const isSalesforceSubdomain = !OPH_HOSTS.has(hostname) &&
    (hostname.endsWith(".ids.online") || hostname.match(/^localhost:\d+$/) !== null && false);

  // Detect environment suffix from hostname (works for both OPH and SF subdomains)
  const envSuffix = hostname.includes("-dev.ids.online") ? "-dev"
    : hostname.includes("-staging.ids.online") ? "-staging"
    : "";

  // Strip environment suffix to get canonical slug: meisinger-dev → meisinger
  const salesforceSubdomain = isSalesforceSubdomain
    ? hostname.replace(".ids.online", "").replace(/-(dev|staging)$/, "").toLowerCase()
    : null;

  // Public routes that do not require authentication
  const publicRoutes = [
    "/login",
    "/forgot-password",
    "/reset-password",
    "/invite/accept",
    "/auth/callback",
    "/orders/preview", // OPH-16: Public magic-link preview page
  ];
  // Salesforce App login and auth callback are also public
  const isSfPublicRoute =
    url.pathname.match(/^\/sf\/[^/]+\/login/) !== null ||
    url.pathname.match(/^\/sf\/[^/]+\/auth\/callback/) !== null;
  const isPublicRoute = isSfPublicRoute || publicRoutes.some((route) =>
    url.pathname.startsWith(route)
  );

  // OPH-72: Block direct access to /sf/ from non-Salesforce hosts
  // Allow localhost for local development testing
  const isLocalhost = hostname.startsWith("localhost:");
  if (url.pathname.startsWith("/sf") && !isSalesforceSubdomain && !isLocalhost) {
    return NextResponse.rewrite(new URL("/not-found", request.url));
  }

  // API routes handle their own auth
  const isApiRoute = url.pathname.startsWith("/api/");
  if (isApiRoute) {
    return supabaseResponse;
  }

  // --- Session inactivity timeout ---
  // Configurable via NEXT_PUBLIC_SESSION_TIMEOUT_HOURS (default: 8 hours)
  // Skip for public routes (e.g. preview pages should always be accessible)
  const SESSION_TIMEOUT_MS =
    parseInt(process.env.NEXT_PUBLIC_SESSION_TIMEOUT_HOURS ?? "8") * 60 * 60 * 1000;
  const LAST_ACTIVE_COOKIE = "last_active_at";

  if (user && !isPublicRoute) {
    const lastActiveCookie = request.cookies.get(LAST_ACTIVE_COOKIE)?.value;
    const now = Date.now();

    if (lastActiveCookie) {
      const lastActive = parseInt(lastActiveCookie, 10);
      if (!isNaN(lastActive) && now - lastActive > SESSION_TIMEOUT_MS) {
        // Session has exceeded the inactivity timeout — sign out and redirect
        await supabase.auth.signOut();
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/login";
        redirectUrl.searchParams.set("error", "session_expired");
        const response = NextResponse.redirect(redirectUrl);
        response.cookies.delete(LAST_ACTIVE_COOKIE);
        return response;
      }
    }

    // Update the last_active_at cookie on every request
    supabaseResponse.cookies.set(LAST_ACTIVE_COOKIE, String(now), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: Math.floor(SESSION_TIMEOUT_MS / 1000),
      path: "/",
    });
  }

  // --- Unauthenticated user handling ---
  if (!user && !isPublicRoute) {
    const redirectUrl = request.nextUrl.clone();
    // Salesforce paths redirect to the Salesforce login, not OPH login
    const sfMatch = url.pathname.match(/^\/sf\/([^/]+)/);
    redirectUrl.pathname = sfMatch ? `/sf/${sfMatch[1]}/login` : "/login";
    return NextResponse.redirect(redirectUrl);
  }

  // --- Authenticated user on public route ---
  // Allow preview pages even when logged in (users may click email links while authenticated)
  if (
    user &&
    isPublicRoute &&
    url.pathname !== "/reset-password" &&
    url.pathname !== "/auth/callback" &&
    url.pathname !== "/invite/accept" &&
    !url.pathname.startsWith("/orders/preview")
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  // --- For authenticated users on protected routes, check status and roles ---
  if (user && !isPublicRoute) {
    const appMetadata = user.app_metadata as {
      tenant_id?: string;
      role?: string;
      user_status?: string;
      tenant_status?: string;
    } | undefined;

    // Check user status: inactive users are blocked
    if (appMetadata?.user_status === "inactive") {
      // Sign the user out and redirect to login with message
      await supabase.auth.signOut();
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("error", "account_inactive");
      return NextResponse.redirect(redirectUrl);
    }

    // Check tenant status: inactive tenants block all their users
    if (appMetadata?.tenant_status === "inactive") {
      await supabase.auth.signOut();
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("error", "tenant_inactive");
      return NextResponse.redirect(redirectUrl);
    }

    // Route-level role enforcement
    const role = appMetadata?.role;

    // /admin/* -> platform_admin or platform_viewer (OPH-48: viewers can see, API enforces write permissions)
    if (url.pathname.startsWith("/admin")) {
      if (role !== "platform_admin" && role !== "platform_viewer") {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/dashboard";
        return NextResponse.redirect(redirectUrl);
      }
    }

    // /settings/team -> tenant_admin, platform_admin, or platform_viewer
    if (url.pathname.startsWith("/settings/team")) {
      if (role !== "tenant_admin" && role !== "platform_admin" && role !== "platform_viewer") {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/dashboard";
        return NextResponse.redirect(redirectUrl);
      }
    }

    // OPH-74: /settings/aussendienstler -> tenant_admin or platform_admin only
    if (url.pathname.startsWith("/settings/aussendienstler")) {
      if (role !== "tenant_admin" && role !== "platform_admin") {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/dashboard";
        return NextResponse.redirect(redirectUrl);
      }
    }

    // OPH-73: Salesforce App subdomain routing enforcement
    const userSalesforceSlug = (appMetadata as Record<string, unknown>)?.salesforce_slug as string | undefined;

    if (role === "sales_rep") {
      // Sales reps on the OPH domain → redirect to their Salesforce subdomain
      // Uses environment suffix so dev→dev, staging→staging, prod→prod
      // Skip all sales_rep redirects on localhost (allows testing both OPH and SF locally)
      if (!isSalesforceSubdomain && !isLocalhost) {
        if (userSalesforceSlug) {
          return NextResponse.redirect(
            new URL(`https://${userSalesforceSlug}${envSuffix}.ids.online/`)
          );
        }
        // No slug configured → sign out with error
        await supabase.auth.signOut();
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/login";
        redirectUrl.searchParams.set("error", "salesforce_not_configured");
        return NextResponse.redirect(redirectUrl);
      }

      // Sales rep on a Salesforce subdomain that doesn't match their tenant's slug → reject
      if (salesforceSubdomain && userSalesforceSlug !== salesforceSubdomain) {
        await supabase.auth.signOut();
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/login";
        redirectUrl.searchParams.set("error", "wrong_tenant");
        return NextResponse.redirect(redirectUrl);
      }
    } else if (isSalesforceSubdomain) {
      // Non-sales_rep user on a Salesforce subdomain → redirect to OPH (environment-aware)
      return NextResponse.redirect(
        new URL(`https://oph-ki${envSuffix}.ids.online/dashboard`)
      );
    }
  }

  // OPH-72: Rewrite Salesforce subdomain requests to /sf/[slug]/...
  // e.g. meisinger.ids.online/basket → /sf/meisinger/basket (internal rewrite)
  // If the path already starts with /sf/{slug}/ (from client-side links or server redirects),
  // strip the prefix first to avoid double-prefixing.
  // This runs after all auth checks so cookies are properly set.
  if (isSalesforceSubdomain && salesforceSubdomain) {
    let sfPath = url.pathname === "/" ? "" : url.pathname;
    // Strip existing /sf/{slug} prefix to prevent double-rewrite
    const sfPrefix = `/sf/${salesforceSubdomain}`;
    if (sfPath.startsWith(sfPrefix)) {
      sfPath = sfPath.slice(sfPrefix.length) || "";
    }
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/sf/${salesforceSubdomain}${sfPath}`;

    const response = NextResponse.rewrite(rewriteUrl);
    // Carry over any cookies set by Supabase auth refresh
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie.name, cookie.value);
    });
    return response;
  }

  return supabaseResponse;
}
