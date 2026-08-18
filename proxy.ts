import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PAGES = ["/dashboard", "/projects", "/settings"];

const PROTECTED_API_PREFIXES = [
  "/api/connect/supabase", // (callback is exempt below)
  "/api/accounts",
  "/api/projects",
  "/api/settings",
  "/api/account",
];

// Endpoints that must stay reachable without a session:
const PUBLIC_API = ["/api/connect/supabase/callback", "/api/cron/checks"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session if it exists (no-op when signed out).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  const isProtectedPage = PROTECTED_PAGES.some(
    (p) => path === p || path.startsWith(`${p}/`)
  );
  const isProtectedApi =
    PROTECTED_API_PREFIXES.some(
      (p) => path === p || path.startsWith(`${p}/`)
    ) && !PUBLIC_API.includes(path);

  if ((isProtectedPage || isProtectedApi) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    // Preserve the query string (e.g. ?connected=1) through the auth bounce.
    url.search = `next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  if (user && path === "/auth") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
