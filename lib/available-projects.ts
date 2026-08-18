import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptSecret } from "@/lib/encryption";
import {
  listOrganizations,
  listProjects,
  ManagementApiError,
} from "@/lib/management";
import { OAuthTokenError } from "@/lib/oauth";
import type {
  ConnectedAccount,
  SupabaseOrganization,
  SupabaseProject,
} from "@/lib/types";

/**
 * Loads every project the user can see across their connected Supabase
 * accounts, plus whether each project is already being watched.
 *
 * Runs entirely on the server - Management API tokens never reach the
 * browser. The returned shape is sanitized (no tokens).
 */

export interface AvailableProjectInfo extends SupabaseProject {
  organization_name: string | null;
  watched: boolean;
  project_id: string | null;
  monitoring_enabled: boolean;
}

export interface AvailableAccountInfo {
  id: string;
  display_name: string;
  revoked_at: string | null;
  organization_names: string[];
  projects: AvailableProjectInfo[];
  error?: string;
}

function isAuthError(err: unknown): boolean {
  return (
    err instanceof OAuthTokenError ||
    (err instanceof ManagementApiError &&
      (err.status === 401 || err.status === 403))
  );
}

export async function getAvailableProjects(
  supabase: SupabaseClient
): Promise<AvailableAccountInfo[]> {
  const { data } = await supabase.from("connected_accounts").select("*");
  const accounts = (data ?? []) as ConnectedAccount[];

  const result: AvailableAccountInfo[] = [];

  for (let account of accounts) {
    const info: AvailableAccountInfo = {
      id: account.id,
      display_name: account.display_name,
      revoked_at: account.revoked_at,
      organization_names: [],
      projects: [],
    };

    if (account.revoked_at) {
      info.error = "Connection expired. Reconnect this Supabase account.";
      result.push(info);
      continue;
    }

    try {
      const onRotated = async (token: string) => {
        await supabase
          .from("connected_accounts")
          .update({ encrypted_refresh_token: encryptSecret(token) })
          .eq("id", account.id);
      };

      // Refresh tokens are single-use and rotate; a sibling request may have
      // already persisted a rotated token while we were reading ours. When a
      // refresh/API call fails, management.ts re-reads the row through this
      // callback and retries once with the freshest token.
      const reloadAccount = async (): Promise<ConnectedAccount | null> => {
        const { data } = await supabase
          .from("connected_accounts")
          .select("*")
          .eq("id", account.id)
          .maybeSingle();
        return (data as ConnectedAccount | null) ?? null;
      };

      // Projects are the important payload. Organizations only supply display
      // names - a missing `organizations:read` scope or a transient orgs
      // failure must never hide the projects. (A previous Promise.all here
      // meant a 403 on /v1/organizations made the whole account show as
      // "Connection expired" with zero projects.)
      let projects: SupabaseProject[] = [];
      let listError: unknown = null;
      try {
        projects = await listProjects(account, onRotated, reloadAccount);
      } catch (err) {
        listError = err;
      }
      if (listError) {
        const where =
          listError instanceof OAuthTokenError
            ? "token refresh"
            : listError instanceof ManagementApiError
              ? `GET /v1/projects (status ${listError.status})`
              : "unknown";
        console.error(
          `[available-projects] listing projects failed for account ${account.id} (at ${where}):`,
          listError instanceof Error ? listError.message : listError
        );
        info.error = isAuthError(listError)
          ? "Connection expired. Reconnect this Supabase account."
          : "Couldn't reach Supabase right now. Try again in a moment.";
        result.push(info);
        continue;
      }

      let orgs: SupabaseOrganization[] = [];
      try {
        orgs = await listOrganizations(account, onRotated, reloadAccount);
      } catch (err) {
        console.warn(
          `[available-projects] organizations lookup failed for account ${account.id}:`,
          err instanceof Error ? err.message : err
        );
      }

      const nameByKey = new Map<string, string>();
      for (const o of orgs) {
        nameByKey.set(o.slug, o.name);
        nameByKey.set(o.id, o.name); // v1 projects reference organizations by id
      }
      info.organization_names = orgs.map((o) => o.name);

      const { data: monitored } = await supabase
        .from("monitored_projects")
        .select("project_ref, id, monitoring_enabled");
      const monitoredByRef = new Map(
        (monitored ?? []).map((m) => [
          (m as { project_ref: string }).project_ref,
          m as { project_ref: string; id: string; monitoring_enabled: boolean },
        ])
      );

      info.projects = projects.map((p) => {
        const watched = monitoredByRef.get(p.ref);
        return {
          ...p,
          organization_name: nameByKey.get(p.organization_slug) ?? null,
          watched: Boolean(watched),
          project_id: watched?.id ?? null,
          monitoring_enabled: watched?.monitoring_enabled ?? true,
        };
      });
    } catch (err) {
      console.error(
        `[available-projects] unexpected error for account ${account.id}:`,
        err instanceof Error ? err.message : err
      );
      info.error = "Couldn't reach Supabase right now. Try again in a moment.";
    }

    result.push(info);
  }

  return result;
}
