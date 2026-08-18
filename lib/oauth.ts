import { createHash, randomBytes } from "crypto";

/**
 * Supabase OAuth 2.0 (third-party integration) helpers.
 * Docs: https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration
 *
 * The minimum read-only scopes we ever request. The OAuth app must be
 * created with at least these scopes (Dashboard -> Account -> OAuth Apps).
 */
export const OAUTH_SCOPES = "projects:read organizations:read";

export const MANAGEMENT_API_BASE = "https://api.supabase.com";

export function generateState(): string {
  return randomBytes(16).toString("hex");
}

export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  state: string;
  codeVerifier: string;
  scopes?: string;
}

export function buildAuthorizeUrl({
  clientId,
  redirectUri,
  state,
  codeVerifier,
  scopes = OAUTH_SCOPES,
}: AuthorizeParams): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
    scope: scopes,
    code_challenge: codeChallenge(codeVerifier),
    code_challenge_method: "S256",
  });
  return `${MANAGEMENT_API_BASE}/v1/oauth/authorize?${params.toString()}`;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

/**
 * Normalize a token response. The OpenAPI spec documents snake_case
 * (access_token, refresh_token, expires_in), but Supabase's token endpoint
 * has returned camelCase (accessToken, refreshToken, expiresIn) - the
 * official example reads `tokens.accessToken ?? tokens.access_token` for
 * exactly this reason. Accept both shapes.
 */
function normalizeTokens(json: Record<string, unknown>): OAuthTokens {
  return {
    access_token: String(json.access_token ?? json.accessToken ?? ""),
    refresh_token:
      json.refresh_token !== undefined
        ? String(json.refresh_token)
        : json.refreshToken !== undefined
          ? String(json.refreshToken)
          : undefined,
    expires_in: Number(json.expires_in ?? json.expiresIn ?? 0),
    token_type: String(json.token_type ?? json.tokenType ?? "Bearer"),
  };
}

/** Thrown when Supabase rejects our refresh token (user revoked access). */
export class OAuthTokenError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "OAuthTokenError";
  }
}

function basicAuthHeader(): string {
  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("SUPABASE_OAUTH_CLIENT_ID / SUPABASE_OAUTH_CLIENT_SECRET are not set.");
  }
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

async function tokenRequest(body: URLSearchParams): Promise<OAuthTokens> {
  const res = await fetch(`${MANAGEMENT_API_BASE}/v1/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: basicAuthHeader(),
    },
    body: body.toString(),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    // 400/401 here means the code or refresh token is invalid/revoked.
    console.warn(
      `[oauth] token request failed (${res.status}) for grant ` +
        `${body.get("grant_type")}: ${text.slice(0, 200)}`
    );
    throw new OAuthTokenError(res.status, text || `Token request failed (${res.status})`);
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new OAuthTokenError(res.status, "Invalid token response");
  }
  return normalizeTokens(json);
}

export async function exchangeCodeForTokens(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });
  return tokenRequest(body);
}

export async function refreshOAuthTokens(refreshToken: string): Promise<OAuthTokens> {
  // The OpenAPI schema for /v1/oauth/token (OAuthTokenBody) lists client_id
  // and client_secret as form body parameters (additionalProperties: false).
  // Send them in the body as well as the Basic header so the refresh grant
  // always authenticates the same way.
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET;
  if (clientId) body.set("client_id", clientId);
  if (clientSecret) body.set("client_secret", clientSecret);
  return tokenRequest(body);
}

/** Best-effort revocation when a user disconnects an account. */
export async function revokeOAuthTokens(refreshToken: string): Promise<void> {
  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return;

  await fetch(`${MANAGEMENT_API_BASE}/v1/oauth/revoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  }).catch(() => undefined);
}
