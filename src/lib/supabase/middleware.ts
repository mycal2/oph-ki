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

  // Public routes that do not require authentication
  const publicRoutes = [
    "/login",
    "/forgot-password",
    "/reset-password",
    "/invite/accept",
    "/auth/callback",
    "/orders/preview", // OPH-16: Public magic-link preview page
  ];
  const isPublicRoute = publicRoutes.some((route) =>
    url.pathname.startsWith(route)
  );

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
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  // --- Authenticated user on public route ---
  // Allow preview pages even when logged in (users may click email links while authenticated)
  if (
    user &&
    isPublicRoute &&
    url.pathname !== "/reset-password" &&
    url.pathname !== "/auth/callback" &&
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

    // /admin/* -> platform_admin only
    if (url.pathname.startsWith("/admin")) {
      if (role !== "platform_admin") {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/dashboard";
        return NextResponse.redirect(redirectUrl);
      }
    }

    // /settings/team -> tenant_admin or platform_admin
    if (url.pathname.startsWith("/settings/team")) {
      if (role !== "tenant_admin" && role !== "platform_admin") {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/dashboard";
        return NextResponse.redirect(redirectUrl);
      }
    }
  }

  return supabaseResponse;
}
