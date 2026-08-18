# SupaSwift

**Keep your Supabase projects awake. Know when they're healthy.**

SupaSwift is a free, lightweight health and activity checker for Supabase
projects. It periodically checks your projects (once per 24h by default) using
the documented Supabase Management API - no service-role keys pasted into the
app, just a read-only OAuth connection.

> **Honest note:** SupaSwift performs lightweight scheduled checks and
> monitoring. It cannot *guarantee* Supabase will never pause a Free project -
> that depends on database activity (see
> [Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)).
> SupaSwift will tell you when a project has gone inactive and how to resume it.

## Stack

- **Next.js (App Router) + TypeScript + Tailwind CSS v4**
- **Supabase** for SupaSwift's own backend (Auth + Postgres)
- **Supabase OAuth** (OAuth 2.0 with PKCE) for connecting users' Supabase accounts
- **Supabase Management API** (`projects:read organizations:read`, read-only)
- **Server-side scheduler** - cron endpoint + standalone worker script
- **AES-256-GCM** encryption for refresh tokens at rest
- **Resend** for email notifications (optional - works without it)

## How it works

1. User clicks **Connect Supabase** → redirected to Supabase OAuth (PKCE).
2. Supabase authorizes SupaSwift (read-only scopes: `projects:read organizations:read`).
3. Back in SupaSwift, the user picks which projects to watch.
4. The server-side scheduler checks each project once per 24h:
   - fetches the project's status (`GET /v1/projects`)
   - runs the documented health check (`GET /v1/projects/{ref}/health`)
   - records status, response time, error, and schedules the next check
5. On failure: small retries with backoff (15m, then 45m), then the failure is
   recorded and it waits for the next scheduled cycle.
6. Email alert after a *persistent* failure (3rd consecutive), once per
   incident. Optional recovery email when it's healthy again.

Nothing runs in the browser - the browser only displays results.

## Setup

### 1. Supabase project for SupaSwift itself

Create a Supabase project (this one hosts SupaSwift's own data).

Run `supabase/migrations/0001_init.sql` in the SQL editor (or `supabase db push`).
It creates:

- `profiles` (notification prefs, created automatically on signup)
- `connected_accounts` (one per connected Supabase login; refresh token encrypted)
- `monitored_projects` (what's being watched + scheduling state)
- `health_checks` (bounded history - pruned to the last 500 per project)
- RLS policies (users only see their own data) and worker functions
  (`claim_due_checks`, `prune_health_history`)

Enable **Email** auth provider (email/password + magic link) in
Authentication → Providers. If you want password resets, enable the "Confirm
email" settings you prefer.

### 2. Supabase OAuth app (the "Connect Supabase" integration)

1. In Supabase, go to **Account → OAuth Apps** (or an organization's
   settings → OAuth Apps) → **Add application**.
2. Add your redirect URI:
   - dev: `http://localhost:8080/api/connect/supabase/callback`
   - prod: `https://your-domain.com/api/connect/supabase/callback`
3. When asked for scopes, request the **minimum**: `projects:read organizations:read` (both read-only).
4. Note the **Client ID** and **Client Secret**.

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | SupaSwift's own Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key (public, safe for the browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only; used by the scheduler & account deletion |
| `SUPABASE_OAUTH_CLIENT_ID` / `SUPABASE_OAUTH_CLIENT_SECRET` | the OAuth app from step 2 |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -hex 32` - encrypts refresh tokens at rest |
| `APP_URL` | e.g. `http://localhost:8080` / `https://supaswift.app` |
| `CRON_SECRET` | `openssl rand -hex 32` - protects `/api/cron/checks` |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | optional; without them notifications are logged, checks still run |

Never commit `.env.local`. Secrets never reach the browser - refresh tokens are
encrypted at rest and only decrypted server-side.

### 4. Run

```bash
npm install
npm run dev        # http://localhost:8080
```

### 5. The scheduler (choose one)

Checks are due at most once per 24h per project, so the scheduler itself only
needs to run every few minutes to *find* due checks.

- **Vercel Cron** - the repo includes `crons.json` (every 5 minutes →
  `/api/cron/checks`). Vercel's `x-vercel-cron` header is accepted
  automatically.
- **Any cron service** (GitHub Actions, cron-job.org, UptimeRobot, …) -
  `POST /api/cron/checks` with header `x-cron-secret: <CRON_SECRET>`.
- **Self-hosted worker** - `npm run worker` runs the same logic in-process
  (scans every 60s, loads `.env.local`).

The scheduler claims due rows atomically (`FOR UPDATE SKIP LOCKED`), so
multiple workers can run without duplicating checks.

## Pages

- `/` - landing (redirects to `/dashboard` when signed in)
- `/auth` - sign in / sign up / magic link (modal-free, single page)
- `/dashboard` - "Your Projects" cards with status, last check, response, next check
- `/projects` - all projects across connected accounts; pick what to watch
- `/projects/[ref]` - details, recent checks, **Check now**, pause / resume / remove
- `/settings` - account, connections (disconnect), notifications, danger zone

### Manual check ("Check now")

On a project's details page you can run a check immediately instead of waiting
for the next scheduled one. It runs the exact same server-side logic as the
scheduler (status mapping, failure/backoff handling, history recording) via
`POST /api/projects/[ref]/check`, so results are identical to scheduled checks.


## Architecture notes

- **Multiple Supabase accounts**: one SupaSwift account can connect several
  Supabase logins. Each connection is its own row in `connected_accounts`;
  projects are grouped by connection and organization.
- **Plans later**: `profiles.plan` exists (`'free'` default) so billing can be
  added without a migration. Nothing else is billing-shaped.
- **Configurable intervals later**: `monitored_projects.check_interval_hours`
  already drives scheduling (default 24).
- **More notification channels later**: `lib/notify.ts` is the only place
  that knows about email; Telegram/Discord slots in there.
- **Scaling**: the worker claims due rows in bounded batches (`p_limit`), so
  thousands of projects don't require a rewrite - just run more workers or
  raise the limit.

## Security checklist

- [x] OAuth client secret, refresh tokens, encryption keys: server-side only
- [x] Refresh tokens encrypted at rest (AES-256-GCM)
- [x] Tokens never logged, never sent to the browser, never in analytics
- [x] Read-only OAuth scopes only (`projects:read organizations:read`)
- [x] RLS on every table - users only see their own data
- [x] `CRON_SECRET` gate on the scheduler endpoint
- [x] Disconnect revokes the OAuth authorization and deletes stored tokens
- [x] Delete account removes the auth user (cascades all data)

## Troubleshooting

### The connect flow loops - I keep getting sent to Supabase OAuth / back to sign-in

Cookies are **host-scoped**. The OAuth redirect URI is built from `APP_URL`, so
if you browse the app on a different host than `APP_URL`, the state and session
cookies never make it back to the callback and the flow restarts.

- Pick **one host** and use it everywhere:
  - `APP_URL` in `.env.local`
  - the URL you type in the browser
  - the redirect URI registered in the OAuth app
- If you run `next dev` on a custom host/port (e.g. `-H 127.0.0.1 -p 8080`),
  set `APP_URL` to exactly that (e.g. `http://127.0.0.1:8080`) and register
  `http://127.0.0.1:8080/api/connect/supabase/callback` in the OAuth app.

### Connected, but no projects show up

SupaSwift now lists projects even if the organizations call fails, but two
things still matter:

- The OAuth app must be granted the scopes `projects:read` **and**
  `organizations:read`. Without `organizations:read`, project names display
  without their organization, and without `projects:read` the project list is
  empty.
- Check the server console: SupaSwift logs the real Management API error
  (`[available-projects] ...`), e.g. a 401/403 means the token/scope is wrong,
  a 5xx means a transient Supabase API issue.

### Hydration mismatch warning mentioning `data-mbtss-nonce`

That attribute is injected by a **browser extension**, not by SupaSwift. It's
harmless - ignore it, or test in an incognito window with extensions disabled.

### "Failed to fetch RSC payload for /api/connect/supabase"

Dev-mode noise from the old client-side Connect links. The buttons now use
plain links, so this should be gone. If it persists, hard-refresh the page.

## Development

```bash
npm run dev        # dev server
npm run typecheck  # tsc --noEmit
npm run build      # production build
npm run worker     # standalone scheduler worker (self-hosted)
```
