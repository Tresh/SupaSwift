import { encryptSecret } from "@/lib/encryption";
import {
  checkProjectHealth,
  listProjects,
  ManagementApiError,
  type OnTokenRotated,
  type ReloadAccount,
} from "@/lib/management";
import { sendEmail } from "@/lib/notify";
import { OAuthTokenError } from "@/lib/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isFailureStatus,
  statusLabel,
} from "@/lib/status";
import type {
  ConnectedAccount,
  MonitoredProject,
  Profile,
  ProjectStatus,
  SupabaseProject,
} from "@/lib/types";

/**
 * Server-side scheduler. Never runs in the browser.
 *
 * Strategy (intentionally conservative):
 *  - 1 check per project per 24h by default
 *  - on failure: small retries with exponential-ish backoff (15m, 45m),
 *    then record the failure and wait until the next scheduled cycle
 *  - notify by email only after a *persistent* failure (3rd consecutive),
 *    once per incident - never on every failed request
 */

const RETRY_BACKOFF_MINUTES = [15, 45];
const FAILURE_NOTIFY_THRESHOLD = 3;
const PRUNE_KEEP = 500;
const PRUNE_MIN_INTERVAL_MS = 60 * 60 * 1000;

const TRANSITIONAL_STATUSES = new Set([
  "COMING_UP",
  "GOING_DOWN",
  "RESTORING",
  "UPGRADING",
  "PAUSING",
  "RESTARTING",
  "RESIZING",
  "INIT_FAILED",
  "RESTORE_FAILED",
  "PAUSE_FAILED",
]);

export interface RunResult {
  claimed: number;
  completed: number;
  failed: number;
}

interface ResultInput {
  status: ProjectStatus;
  responseMs: number | null;
  error?: string | null;
  isFailure?: boolean;
  /** Raw payload stored per check (e.g. service-level health report). */
  details?: Record<string, unknown> | null;
}

/**
 * Claim due checks and process them. Safe to call concurrently from
 * multiple workers - rows are claimed atomically (SKIP LOCKED).
 */
export async function runDueChecks(limit = 25): Promise<RunResult> {
  const admin = createAdminClient();

  const { data: claimed, error } = await admin.rpc("claim_due_checks", {
    p_limit: limit,
  });
  if (error) throw new Error(`claim_due_checks failed: ${error.message}`);
  const projects: MonitoredProject[] = claimed ?? [];

  // Group by connected account so we fetch the remote project list once
  // per account instead of once per project.
  const byAccount = new Map<string, MonitoredProject[]>();
  for (const project of projects) {
    const list = byAccount.get(project.connected_account_id) ?? [];
    list.push(project);
    byAccount.set(project.connected_account_id, list);
  }

  const profileCache = new Map<string, Profile | null>();
  let completed = 0;
  let failed = 0;

  for (const [accountId, accountProjects] of byAccount) {
    const { data: account } = await admin
      .from("connected_accounts")
      .select("*")
      .eq("id", accountId)
      .single();

    if (!account) continue; // account deleted -> projects cascade-deleted too

    let remoteMap = new Map<string, SupabaseProject>();
    let connectionBroken = false;

    if (!account.revoked_at) {
      try {
        const remote = await listProjects(
          account,
          rotatedHandler(admin, account),
          reloadHandler(admin, account)
        );
        remoteMap = new Map(remote.map((p) => [p.ref, p]));
      } catch (err) {
        if (isConnectionError(err)) {
          await markAccountRevoked(admin, account);
          connectionBroken = true;
        } else {
          // Transient API failure - treat every project in this account
          // as unreachable for this cycle.
          connectionBroken = true;
        }
      }
    } else {
      connectionBroken = true;
    }

    const brokenReason = account.revoked_at
      ? "Connection expired. Reconnect this Supabase account."
      : "Couldn't reach Supabase right now.";

    for (const project of accountProjects) {
      try {
        await checkProject(admin, account, project, remoteMap, connectionBroken, brokenReason, profileCache);
        completed++;
      } catch (err) {
        failed++;
        console.error(`[worker] check failed for ${project.project_ref}:`, err);
      }
    }
  }

  await pruneOldHistory(admin);

  // Heartbeat so the UI can show when the scheduler last ran. The cron
  // fires every few minutes; per-project checks are at most daily.
  await admin.from("app_state").upsert({
    key: "last_cron_run_at",
    value: { at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  });

  return { claimed: projects.length, completed, failed };
}

export interface ManualCheckResult {
  ok: boolean;
  status?: ProjectStatus | null;
  responseMs?: number | null;
  error?: string | null;
}

/**
 * Run one check for a single project right now (the "Check now" button).
 * Reuses the exact same logic as the scheduler - same status mapping, same
 * failure/backoff handling, same history recording. The project's ownership
 * must already be verified by the caller (the route checks it via RLS).
 */
export async function checkProjectNow(projectId: string): Promise<ManualCheckResult> {
  const admin = createAdminClient();

  const { data: project } = await admin
    .from("monitored_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return { ok: false, error: "Project not found." };

  const { data: account } = await admin
    .from("connected_accounts")
    .select("*")
    .eq("id", project.connected_account_id)
    .maybeSingle();
  if (!account) return { ok: false, error: "Supabase account no longer connected." };

  const profileCache = new Map<string, Profile | null>();
  let remoteMap = new Map<string, SupabaseProject>();
  let connectionBroken = false;
  let brokenReason = "Couldn't reach Supabase right now.";

  if (!account.revoked_at) {
    try {
      const remote = await listProjects(
        account,
        rotatedHandler(admin, account),
        reloadHandler(admin, account)
      );
      remoteMap = new Map(remote.map((p) => [p.ref, p]));
    } catch (err) {
      if (isConnectionError(err)) {
        await markAccountRevoked(admin, account);
        brokenReason = "Connection expired. Reconnect this Supabase account.";
      }
      connectionBroken = true;
    }
  } else {
    connectionBroken = true;
    brokenReason = "Connection expired. Reconnect this Supabase account.";
  }

  await checkProject(
    admin,
    account,
    project,
    remoteMap,
    connectionBroken,
    brokenReason,
    profileCache
  );

  const { data: updated } = await admin
    .from("monitored_projects")
    .select("last_status, last_response_ms, last_error")
    .eq("id", projectId)
    .maybeSingle();

  return {
    ok: true,
    status: updated?.last_status ?? null,
    responseMs: updated?.last_response_ms ?? null,
    error: updated?.last_error ?? null,
  };
}

function rotatedHandler(
  admin: ReturnType<typeof createAdminClient>,
  account: ConnectedAccount
): OnTokenRotated {
  return async (newRefreshToken: string) => {
    await admin
      .from("connected_accounts")
      .update({ encrypted_refresh_token: encryptSecret(newRefreshToken) })
      .eq("id", account.id);
  };
}

function reloadHandler(
  admin: ReturnType<typeof createAdminClient>,
  account: ConnectedAccount
): ReloadAccount {
  return async () => {
    const { data } = await admin
      .from("connected_accounts")
      .select("*")
      .eq("id", account.id)
      .maybeSingle();
    return (data as ConnectedAccount | null) ?? null;
  };
}

async function markAccountRevoked(
  admin: ReturnType<typeof createAdminClient>,
  account: ConnectedAccount
): Promise<void> {
  await admin
    .from("connected_accounts")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", account.id);
  console.warn(`[worker] connection revoked for account ${account.id}`);
}

function isConnectionError(err: unknown): boolean {
  if (err instanceof OAuthTokenError) return true;
  if (err instanceof ManagementApiError) {
    return err.status === 401 || err.status === 403;
  }
  return false;
}

async function checkProject(
  admin: ReturnType<typeof createAdminClient>,
  account: ConnectedAccount,
  project: MonitoredProject,
  remoteMap: Map<string, SupabaseProject>,
  connectionBroken: boolean,
  brokenReason: string,
  profileCache: Map<string, Profile | null>
): Promise<void> {
  // Connection is gone (revoked or unreachable) - record it once, don't spam.
  if (connectionBroken || account.revoked_at) {
    await recordResult(admin, project, profileCache, {
      status: "unknown",
      responseMs: null,
      error: brokenReason,
    });
    return;
  }

  const remote = remoteMap.get(project.project_ref);

  if (!remote) {
    await recordResult(admin, project, profileCache, {
      status: "offline",
      responseMs: null,
      error: "We couldn't reach this project.",
      isFailure: true,
    });
    return;
  }

  // Supabase paused the project (Free plan inactivity) or the user did.
  if (remote.status === "INACTIVE") {
    await recordResult(admin, project, profileCache, {
      status: "paused",
      responseMs: null,
      error: "Project appears inactive. Resume it from the Supabase dashboard.",
    });
    return;
  }

  if (TRANSITIONAL_STATUSES.has(remote.status)) {
    await recordResult(admin, project, profileCache, {
      status: "warning",
      responseMs: null,
      error: `Project is ${remote.status.replace(/_/g, " ").toLowerCase()}.`,
    });
    return;
  }

  // Reachable and active - run the documented health check.
  try {
    const { durationMs, services } = await checkProjectHealth(
      account,
      project.project_ref,
      rotatedHandler(admin, account),
      reloadHandler(admin, account)
    );

    const unhealthy = services.filter((s) => s.status === "UNHEALTHY");
    const comingUp = services.filter((s) => s.status === "COMING_UP");
    const report = { services, responseMs: durationMs };

    if (unhealthy.length > 0) {
      await recordResult(admin, project, profileCache, {
        status: "warning",
        responseMs: durationMs,
        error: `${unhealthy.map((s) => s.name).join(", ")} unhealthy`,
        isFailure: true,
        details: report,
      });
      return;
    }
    if (comingUp.length > 0) {
      await recordResult(admin, project, profileCache, {
        status: "warning",
        responseMs: durationMs,
        error: "Services are still coming up.",
        isFailure: true,
        details: report,
      });
      return;
    }

    await recordResult(admin, project, profileCache, {
      status: "healthy",
      responseMs: durationMs,
      details: report,
    });
  } catch (err) {
    if (isConnectionError(err)) {
      await markAccountRevoked(admin, account);
      await recordResult(admin, project, profileCache, {
        status: "unknown",
        responseMs: null,
        error: "Connection expired. Reconnect this Supabase account.",
      });
      return;
    }
    // The health request itself failed (timeout, Management API error, or
    // transient network problem). That says nothing about the project's
    // actual health - never claim it's offline. Record the real reason.
    console.error(`[worker] health API failed for ${project.project_ref}:`, err);
    await recordResult(admin, project, profileCache, {
      status: "unknown",
      responseMs: null,
      error:
        err instanceof Error
          ? `Health check failed: ${err.message}`
          : "Health check failed.",
    });
  }
}

function nextCheckAfterFailure(failures: number, intervalHours: number): Date {
  const now = Date.now();
  if (failures === 1) return new Date(now + RETRY_BACKOFF_MINUTES[0] * 60_000);
  if (failures === 2) return new Date(now + RETRY_BACKOFF_MINUTES[1] * 60_000);
  return new Date(now + intervalHours * 3_600_000);
}

function nextCheckAfterSuccess(intervalHours: number): Date {
  return new Date(Date.now() + intervalHours * 3_600_000);
}

async function loadProfile(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  cache: Map<string, Profile | null>
): Promise<Profile | null> {
  if (cache.has(userId)) return cache.get(userId) ?? null;
  const { data } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  cache.set(userId, (data as Profile | null) ?? null);
  return data ?? null;
}

async function recordResult(
  admin: ReturnType<typeof createAdminClient>,
  project: MonitoredProject,
  profileCache: Map<string, Profile | null>,
  input: ResultInput
): Promise<void> {
  const failures = input.isFailure ? project.consecutive_failures + 1 : 0;
  const intervalHours = project.check_interval_hours || 24;

  let failureNotifiedAt = project.failure_notified_at;
  let recoveryEmail = false;

  if (input.isFailure) {
    if (failures === FAILURE_NOTIFY_THRESHOLD && !failureNotifiedAt) {
      failureNotifiedAt = new Date().toISOString();
      const profile = await loadProfile(admin, project.user_id, profileCache);
      if (profile?.email_alerts) {
        await sendFailureEmail(profile, project, input).catch((err) =>
          console.error("[worker] failure email failed:", err)
        );
      }
    }
  } else {
    const wasInIncident =
      project.consecutive_failures >= FAILURE_NOTIFY_THRESHOLD ||
      isFailureStatus(project.last_status);
    if (wasInIncident) recoveryEmail = true;
    failureNotifiedAt = null;
  }

  const nextCheckAt = input.isFailure
    ? nextCheckAfterFailure(failures, intervalHours)
    : nextCheckAfterSuccess(intervalHours);

  const now = new Date().toISOString();

  // Insert the check. If the `details` column is missing (migration 0002
  // not yet applied), fall back to inserting without it so checks still
  // record instead of failing silently.
  const checkRow = {
    project_id: project.id,
    status: input.status,
    response_ms: input.responseMs,
    error_message: input.error ?? null,
    checked_at: now,
  } as Record<string, unknown>;
  if (input.details !== undefined) checkRow.details = input.details;

  const { error: insertError } = await admin.from("health_checks").insert(checkRow);
  if (insertError && /details/i.test(insertError.message)) {
    delete checkRow.details;
    const { error: retryError } = await admin.from("health_checks").insert(checkRow);
    if (retryError) {
      throw new Error(`health_checks insert failed: ${retryError.message}`);
    }
  } else if (insertError) {
    throw new Error(`health_checks insert failed: ${insertError.message}`);
  }

  await admin
    .from("monitored_projects")
    .update({
      last_checked_at: now,
      last_status: input.status,
      last_response_ms: input.responseMs,
      last_error: input.error ?? null,
      consecutive_failures: failures,
      failure_notified_at: failureNotifiedAt,
      next_check_at: nextCheckAt.toISOString(),
      updated_at: now,
    })
    .eq("id", project.id);

  if (recoveryEmail && input.status === "healthy") {
    const profile = await loadProfile(admin, project.user_id, profileCache);
    if (profile?.recovery_alerts) {
      await sendRecoveryEmail(profile, project).catch((err) =>
        console.error("[worker] recovery email failed:", err)
      );
    }
  }
}

function sendFailureEmail(
  profile: Profile,
  project: MonitoredProject,
  input: ResultInput
): Promise<void> {
  return sendEmail({
    to: profile.email ?? "",
    subject: `[SupaSwift] ${project.project_name} needs attention`,
    text: [
      `SupaSwift couldn't reach "${project.project_name}" (${project.project_ref}).`,
      ``,
      `Status: ${statusLabel(input.status)}`,
      input.error ? `Details: ${input.error}` : null,
      `Last checked: ${new Date().toISOString()}`,
      ``,
      `If Supabase paused this project for inactivity, open the Supabase dashboard and resume it:`,
      `https://supabase.com/dashboard/project/${project.project_ref}`,
      ``,
      `SupaSwift performs lightweight scheduled checks and monitoring. It can't guarantee that Supabase will never pause a Free project.`,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
  });
}

function sendRecoveryEmail(profile: Profile, project: MonitoredProject): Promise<void> {
  return sendEmail({
    to: profile.email ?? "",
    subject: `[SupaSwift] ${project.project_name} is healthy again`,
    text: [
      `Good news: "${project.project_name}" (${project.project_ref}) responded to the latest check.`,
      ``,
      `Status: Healthy`,
      `https://supabase.com/dashboard/project/${project.project_ref}`,
    ].join("\n"),
  });
}

async function pruneOldHistory(
  admin: ReturnType<typeof createAdminClient>
): Promise<void> {
  const key = "last_history_prune_at";
  const { data: state } = await admin
    .from("app_state")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  const last = state?.value ? new Date((state.value as { at: string }).at).getTime() : 0;
  if (Date.now() - last < PRUNE_MIN_INTERVAL_MS) return;

  const { data: pruned } = await admin.rpc("prune_health_history", {
    p_keep: PRUNE_KEEP,
  });
  console.log(`[worker] pruned ${pruned ?? 0} old health check rows`);

  await admin
    .from("app_state")
    .upsert({ key, value: { at: new Date().toISOString() }, updated_at: new Date().toISOString() });
}
