import { NextRequest, NextResponse } from "next/server";
import {
  buildAuthorizeUrl,
  generateCodeVerifier,
  generateState,
} from "@/lib/oauth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = new URL("/auth", request.url);
    url.searchParams.set("next", "/api/connect/supabase");
    return NextResponse.redirect(url);
  }

  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "SupaSwift isn't configured for Supabase OAuth yet." },
      { status: 500 }
    );
  }

  const origin = process.env.APP_URL ?? new URL(request.url).origin;
  const requestOrigin = new URL(request.url).origin;
  if (process.env.APP_URL && origin !== requestOrigin) {
    // Cookies are host-scoped. If APP_URL (used for the OAuth redirect URI)
    // doesn't match the host the browser is on, the state/session cookies
    // won't be sent back to the callback and the connect flow loops.
    console.warn(
      `[oauth] APP_URL (${origin}) differs from the request origin (${requestOrigin}). ` +
        `Browse the app at the APP_URL host, or set APP_URL to match. ` +
        `otherwise the OAuth callback will keep failing.`
    );
  }
  const redirectUri = `${origin}/api/connect/supabase/callback`;
  const state = generateState();
  const codeVerifier = generateCodeVerifier();

  const authorizeUrl = buildAuthorizeUrl({
    clientId,
    redirectUri,
    state,
    codeVerifier,
  });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(
    "supaswift_oauth",
    JSON.stringify({ state, code_verifier: codeVerifier }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10 * 60, // 10 minutes to complete the flow
    }
  );
  return response;
}
