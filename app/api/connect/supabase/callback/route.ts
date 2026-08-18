import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { encryptSecret } from "@/lib/encryption";
import {
  exchangeCodeForTokens,
  MANAGEMENT_API_BASE,
} from "@/lib/oauth";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseOrganization } from "@/lib/types";

export const dynamic = "force-dynamic";

function fail(request: NextRequest, target = "/projects?error=connect_failed") {
  return NextResponse.redirect(new URL(target, request.url));
}

export async function GET(request: NextRequest) {
  const { code, state, error: oauthError } = Object.fromEntries(
    request.nextUrl.searchParams
  );

  const cookie = request.cookies.get("supaswift_oauth")?.value;
  let verifier: string | null = null;
  if (cookie) {
    try {
      const parsed = JSON.parse(cookie) as { state?: string; code_verifier?: string };
      if (parsed.state === state) verifier = parsed.code_verifier ?? null;
    } catch {
      // ignore malformed cookie
    }
  }

  if (oauthError) return fail(request);
  if (!code || !verifier) return fail(request);

  const origin = process.env.APP_URL ?? new URL(request.url).origin;
  const redirectUri = `${origin}/api/connect/supabase/callback`;

  let tokens;
  try {
    tokens = await exchangeCodeForTokens({ code, codeVerifier: verifier, redirectUri });
  } catch (err) {
    console.error("[oauth] code exchange failed:", err);
    return fail(request);
  }

  // Debug metadata only - never log the tokens themselves.
  console.log(
    "[oauth] token exchange succeeded:",
    JSON.stringify({
      token_type: tokens.token_type,
      expires_in: tokens.expires_in,
      has_access_token: Boolean(tokens.access_token),
      has_refresh_token: Boolean(tokens.refresh_token),
    })
  );

  if (!tokens.refresh_token) {
    console.error(
      "[oauth] token response contained no refresh_token, connection aborted."
    );
    return fail(request);
  }

  // Identify the connected login by its organizations
  // (the Management API has no /user endpoint).
  let orgs: SupabaseOrganization[] = [];
  try {
    const res = await fetch(`${MANAGEMENT_API_BASE}/v1/organizations`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      cache: "no-store",
    });
    if (res.ok) {
      orgs = (await res.json()) as SupabaseOrganization[];
    } else {
      console.warn(
        `[oauth] organizations fetch failed with status ${res.status} ` +
          `(${res.statusText}). Check the OAuth app has the ` +
          "`organizations:read` scope."
      );
    }
  } catch {
    // non-fatal - display name falls back to "Supabase"
  }

  const identifier = orgs.map((o) => o.slug).sort().join(",");
  const displayName = orgs[0]?.name ?? "Supabase";

  // If we couldn't fetch orgs, fall back to a stable identifier derived from
  // the refresh token, so re-connecting the same login updates the same row
  // instead of creating a duplicate account on every attempt.
  const fallbackIdentifier = `login-${createHash("sha256")
    .update(tokens.refresh_token ?? "")
    .digest("hex")
    .slice(0, 16)}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return fail(request, "/auth?next=/api/connect/supabase");
  }

  const { error: upsertError } = await supabase
    .from("connected_accounts")
    .upsert(
      {
        user_id: user.id,
        provider: "supabase",
        account_identifier: identifier || fallbackIdentifier,
        display_name: displayName,
        encrypted_refresh_token: encryptSecret(tokens.refresh_token ?? ""),
        revoked_at: null,
      },
      { onConflict: "user_id,account_identifier" }
    );

  if (upsertError) {
    console.error("[oauth] could not store connection:", upsertError.message);
    return fail(request);
  }

  const response = NextResponse.redirect(
    new URL("/projects?connected=1", request.url)
  );
  response.cookies.delete("supaswift_oauth");
  return response;
}
