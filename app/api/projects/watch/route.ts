import { NextRequest } from "next/server";
import { checkProjectNow } from "@/lib/checks/run-due-checks";
import { encryptSecret } from "@/lib/encryption";
import { json } from "@/lib/api";
import { listOrganizations, listProjects } from "@/lib/management";
import { createClient } from "@/lib/supabase/server";
import type { ConnectedAccount } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // initial checks hit external APIs

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await request.json().catch(() => null);

  const refs = Array.isArray(body?.refs)
    ? body.refs.filter(
        (r: unknown): r is string => typeof r === "string" && r.length > 0,
      )
    : [];

  if (refs.length === 0) {
    return json({ error: "Select at least one project." }, 400);
  }

  const { data: accounts, error: accountsError } = await supabase
    .from("connected_accounts")
    .select("*")
    .eq("user_id", user.id);

  if (accountsError) {
    console.error("[watch] failed to load connected accounts:", accountsError);
    return json({ error: "Failed to load connected accounts." }, 500);
  }

  let inserted = 0;

  for (const account of (accounts ?? []) as ConnectedAccount[]) {
    if (account.revoked_at) continue;

    try {
      const onRotated = async (token: string) => {
        await supabase
          .from("connected_accounts")
          .update({
            encrypted_refresh_token: encryptSecret(token),
          })
          .eq("id", account.id);
      };
      const reloadAccount = async (): Promise<ConnectedAccount | null> => {
        const { data } = await supabase
          .from("connected_accounts")
          .select("*")
          .eq("id", account.id)
          .maybeSingle();
        return (data as ConnectedAccount | null) ?? null;
      };

      // Only fetch projects here. Organizations are optional metadata.
      const projects = await listProjects(account, onRotated, reloadAccount);

      const wanted = projects.filter((p) => refs.includes(p.ref));

      if (wanted.length === 0) continue;

      // Organizations are only used for display names.
      // Failure here should never prevent watching a project.
      let nameBySlug = new Map<string, string>();

      try {
        const orgs = await listOrganizations(account, onRotated, reloadAccount);
        nameBySlug = new Map(orgs.map((o) => [o.slug, o.name]));
      } catch (err) {
        console.warn(
          `[watch] organizations lookup failed for account ${account.id}:`,
          err instanceof Error ? err.message : err,
        );
      }

      for (const p of wanted) {
        const { error } = await supabase.from("monitored_projects").upsert(
          {
            user_id: user.id,
            connected_account_id: account.id,
            project_ref: p.ref,
            project_name: p.name,
            organization_slug: p.organization_slug,
            organization_name: nameBySlug.get(p.organization_slug) ?? null,
            region: p.region,
            monitoring_enabled: true,
            next_check_at: new Date().toISOString(),
          },
          {
            onConflict: "user_id,project_ref",
          },
        );

        if (error) {
          console.error(`[watch] failed to save project ${p.ref}:`, error);
          continue;
        }

        inserted++;
      }
    } catch (err) {
      console.error(
        `[watch] account ${account.id} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (inserted === 0) {
    return json(
      {
        error: "No projects were added. Check the server console for details.",
      },
      400,
    );
  }

  // Run an initial check for every project the user just started watching
  // (plus any already-watched ones in the selection) so their status shows
  // immediately instead of waiting for the next scheduled cycle. This also
  // sets a proper next_check_at for the scheduler.
  if (inserted > 0) {
    const { data: saved } = await supabase
      .from("monitored_projects")
      .select("id")
      .in("project_ref", refs);

    await Promise.allSettled(
      (saved ?? []).map(async (row) => {
        try {
          await checkProjectNow((row as { id: string }).id);
        } catch (err) {
          console.error(
            `[watch] initial check failed for ${(row as { id: string }).id}:`,
            err,
          );
        }
      }),
    );
  }

  return json({
    ok: true,
    inserted,
  });
}
