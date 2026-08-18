import { decryptSecret } from "@/lib/encryption";
import {
  MANAGEMENT_API_BASE,
  refreshOAuthTokens,
  OAuthTokenError,
  type OAuthTokens,
} from "@/lib/oauth";
import type {
  ConnectedAccount,
  ServiceHealth,
  SupabaseOrganization,
  SupabaseProject,
} from "@/lib/types";

/**
 * Management API client (https://api.supabase.com/v1) acting on behalf of a
 * connected Supabase user via their OAuth access token.
 *
 * Access tokens are short-lived, so we cache them in memory and refresh
 * (rotating + persisting the refresh token) when near expiry. The refresh
 * token itself never leaves the server and is encrypted at rest.
 */

interface CacheEntry {
  accessToken: string;
  expiresAt: number;
  inFlight: Promise<string> | null;
}

const tokenCache = new Map<string, CacheEntry>();

export class ManagementApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public path?: string
  ) {
    super(message);
    this.name = "ManagementApiError";
  }
}

export type OnTokenRotated = (newRefreshToken: string) => Promise<void>;

/** Re-reads a connected account from the DB (used to survive rotation races). */
export type ReloadAccount = () => Promise<ConnectedAccount | null>;

/**
 * Refresh, and if the stored refresh token was rotated by a concurrent
 * request (single-use refresh tokens), reload the row and retry once with
 * the freshest token.
 */
async function refreshWithRotationRetry(
  account: ConnectedAccount,
  onRotated?: OnTokenRotated,
  reloadAccount?: ReloadAccount
): Promise<OAuthTokens> {
  const refreshToken = decryptSecret(account.encrypted_refresh_token);
  if (!refreshToken) {
    // Legacy rows stored an empty refresh token. Nothing to refresh with.
    // the user must reconnect.
    throw new OAuthTokenError(
      401,
      "No refresh token stored. Reconnect this Supabase account."
    );
  }

  console.log(
    `[oauth] refreshing access token for account ${account.id} (refresh token length ${refreshToken.length})`
  );
  try {
    const tokens = await refreshOAuthTokens(refreshToken);
    console.log(
      `[oauth] token refreshed for account ${account.id}: ` +
        `expires_in=${tokens.expires_in} rotated=${Boolean(tokens.refresh_token)}`
    );
    return tokens;
  } catch (err) {
    if (!(err instanceof OAuthTokenError) || !reloadAccount) throw err;
    console.warn(
      `[oauth] refresh failed for account ${account.id}, reloading row and retrying once`
    );
    const fresh = await reloadAccount().catch(() => null);
    if (!fresh || fresh.encrypted_refresh_token === account.encrypted_refresh_token) {
      throw err;
    }
    return refreshOAuthTokens(decryptSecret(fresh.encrypted_refresh_token));
  }
}

async function getAccessToken(
  account: ConnectedAccount,
  onRotated?: OnTokenRotated,
  reloadAccount?: ReloadAccount
): Promise<string> {
  const now = Date.now();
  const entry = tokenCache.get(account.id);

  // Cache hit - token still valid for a while.
  if (entry && !entry.inFlight && entry.expiresAt > now + 5 * 60_000) {
    return entry.accessToken;
  }

  // Another request is already refreshing - share that promise.
  if (entry?.inFlight) {
    return entry.inFlight;
  }

  const inFlight = (async (): Promise<string> => {
    const tokens = await refreshWithRotationRetry(account, onRotated, reloadAccount);
    const refreshToken = decryptSecret(account.encrypted_refresh_token);
    if (tokens.refresh_token && tokens.refresh_token !== refreshToken) {
      await onRotated?.(tokens.refresh_token);
    }
    tokenCache.set(account.id, {
      accessToken: tokens.access_token,
      expiresAt: now + tokens.expires_in * 1000,
      inFlight: null,
    });
    return tokens.access_token;
  })();

  tokenCache.set(account.id, {
    accessToken: entry?.accessToken ?? "",
    expiresAt: entry?.expiresAt ?? 0,
    inFlight,
  });

  try {
    return await inFlight;
  } catch (err) {
    tokenCache.delete(account.id);
    throw err;
  }
}

const MGMT_FETCH_TIMEOUT_MS = 10_000;

function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: string }).name === "AbortError"
  );
}

async function mgmtFetch(
  account: ConnectedAccount,
  path: string,
  onRotated?: OnTokenRotated,
  reloadAccount?: ReloadAccount,
  init?: RequestInit
): Promise<Response> {
  const doFetch = (accessToken: string, signal?: AbortSignal) =>
    fetch(`${MANAGEMENT_API_BASE}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
      signal,
    });

  // Our own hard timeout - `timeout_ms` passed to Supabase only bounds
  // their side; without this, a hanging request waits forever.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MGMT_FETCH_TIMEOUT_MS);

  try {
    let accessToken = await getAccessToken(account, onRotated, reloadAccount);
    let res: Response;
    try {
      res = await doFetch(accessToken, controller.signal);
    } catch (err) {
      if (isAbortError(err)) {
        throw new ManagementApiError(
          0,
          `Request timed out after ${MGMT_FETCH_TIMEOUT_MS / 1000}s: ${path}`,
          path
        );
      }
      throw err;
    }

    // A 401 means the access token we sent is no longer accepted (expired,
    // cached, or rotated elsewhere). Per Supabase's OAuth docs, refresh the
    // token and retry ONCE before treating the connection as broken.
    // A 403 is a permission/scope issue - refreshing won't fix that.
    if (res.status === 401) {
      tokenCache.delete(account.id);
      try {
        accessToken = await getAccessToken(account, onRotated, reloadAccount);
        res = await doFetch(accessToken, controller.signal);
      } catch (err) {
        if (err instanceof ManagementApiError) throw err; // retry timed out
        // Refresh itself failed - the connection is genuinely broken.
        const body = await res.text().catch(() => "");
        throw new ManagementApiError(401, body || "Management API 401", path);
      }
    }

    if (res.status === 401 || res.status === 403) {
      tokenCache.delete(account.id);
      const body = await res.text().catch(() => "");
      throw new ManagementApiError(
        res.status,
        body || `Management API ${res.status}`,
        path
      );
    }
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function mgmtJson<T>(
  account: ConnectedAccount,
  path: string,
  onRotated?: OnTokenRotated,
  reloadAccount?: ReloadAccount,
  init?: RequestInit
): Promise<T> {
  const res = await mgmtFetch(account, path, onRotated, reloadAccount, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ManagementApiError(
      res.status,
      body || `Request failed (${res.status})`,
      path
    );
  }
  return (await res.json()) as T;
}

export async function listOrganizations(
  account: ConnectedAccount,
  onRotated?: OnTokenRotated,
  reloadAccount?: ReloadAccount
): Promise<SupabaseOrganization[]> {
  return mgmtJson<SupabaseOrganization[]>(
    account,
    "/v1/organizations",
    onRotated,
    reloadAccount
  );
}

export async function listProjects(
  account: ConnectedAccount,
  onRotated?: OnTokenRotated,
  reloadAccount?: ReloadAccount
): Promise<SupabaseProject[]> {
  const projects = await mgmtJson<
    Array<{
      ref?: string;
      id?: string;
      organization_slug?: string;
      organization_id?: string;
      name: string;
      region: string;
      created_at: string;
      status: string;
      database?: { host: string; version: string };
    }>
  >(account, "/v1/projects", onRotated, reloadAccount);

  return projects.map((p) => ({
    ref: p.ref ?? p.id ?? "",
    organization_slug: p.organization_slug ?? p.organization_id ?? "",
    name: p.name,
    region: p.region,
    created_at: p.created_at,
    status: p.status,
    database: p.database,
  }));
}

export interface HealthResult {
  durationMs: number;
  services: ServiceHealth[];
}

// Comma-separated enums, all valid per the OpenAPI spec
// (auth, db, db_postgres_user, pooler, realtime, rest, storage, pg_bouncer).
const HEALTH_SERVICES = "db,auth,rest,storage,realtime,pooler";

export async function checkProjectHealth(
  account: ConnectedAccount,
  ref: string,
  onRotated?: OnTokenRotated,
  reloadAccount?: ReloadAccount
): Promise<HealthResult> {
  // `services` is REQUIRED by the endpoint. `timeout_ms` is optional in the
  // spec but the endpoint rejects it as a query string ("expected number,
  // received string"), so we omit it - our own fetch timeout in mgmtFetch
  // bounds the request instead.
  const params = new URLSearchParams({ services: HEALTH_SERVICES });
  const path = `/v1/projects/${encodeURIComponent(ref)}/health?${params.toString()}`;
  const started = Date.now();
  const res = await mgmtFetch(account, path, onRotated, reloadAccount);
  const durationMs = Date.now() - started;
  const body = await res.text();

  console.log(
    `[health] ${ref}: ${res.status} in ${durationMs}ms: ${body.slice(0, 500)}`
  );

  if (!res.ok) {
    throw new ManagementApiError(
      res.status,
      body || `Health check failed (${res.status})`,
      path
    );
  }

  let services: ServiceHealth[];
  try {
    services = JSON.parse(body) as ServiceHealth[];
  } catch {
    throw new Error(`Invalid health response from Supabase: ${body.slice(0, 500)}`);
  }
  return { durationMs, services };
}
