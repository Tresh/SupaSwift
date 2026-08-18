import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { SignOutButton } from "@/components/sign-out-button";
import {
  ConnectionList,
  DangerZone,
  NotificationToggles,
  type ConnectionItem,
} from "@/components/settings-sections";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("email_alerts, recovery_alerts, plan")
    .eq("id", user!.id)
    .maybeSingle();

  const { data: accounts } = await supabase
    .from("connected_accounts")
    .select("id, display_name, revoked_at")
    .order("created_at");

  const { data: monitored } = await supabase
    .from("monitored_projects")
    .select("connected_account_id");

  const projectCounts = new Map<string, number>();
  for (const m of monitored ?? []) {
    const id = (m as { connected_account_id: string }).connected_account_id;
    projectCounts.set(id, (projectCounts.get(id) ?? 0) + 1);
  }

  const connectionItems: ConnectionItem[] = (accounts ?? []).map((a) => ({
    id: (a as { id: string }).id,
    display_name: (a as { display_name: string }).display_name,
    revoked_at: (a as { revoked_at: string | null }).revoked_at,
    project_count: projectCounts.get((a as { id: string }).id) ?? 0,
  }));

  const notificationDefaults = {
    email_alerts: profile?.email_alerts ?? true,
    recovery_alerts: profile?.recovery_alerts ?? true,
  };

  return (
    <AppShell active="settings">
      <h1 className="text-lg font-semibold tracking-tight text-zinc-900 sm:text-xl">
        Settings
      </h1>

      {/* Account */}
      <section className="card mt-6 p-5 sm:p-6">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
          Account
        </h2>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-zinc-900">
            {profile?.plan === "free" ? "Free plan" : profile?.plan}
          </p>
          <SignOutButton />
        </div>
      </section>

      {/* Supabase Connections */}
      <section className="card mt-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
              Supabase Connections
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              One entry per connected Supabase account. Disconnecting removes
              its projects from monitoring.
            </p>
          </div>
          <a href="/api/connect/supabase" className="btn btn-secondary !py-1.5 text-xs">
            + Connect Supabase
          </a>
        </div>
        <div className="mt-2">
          {connectionItems.length === 0 ? (
            <p className="py-4 text-sm text-zinc-400">
              No Supabase accounts connected yet.
            </p>
          ) : (
            <ConnectionList accounts={connectionItems} />
          )}
        </div>
      </section>

      {/* Notifications */}
      <section className="card mt-4 p-6">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
          Notifications
        </h2>
        <div className="mt-2">
          <NotificationToggles initial={notificationDefaults} />
        </div>
      </section>

      {/* Danger Zone */}
      <section className="card mt-4 border-red-100 p-6">
        <h2 className="text-sm font-semibold tracking-tight text-red-700">
          Danger Zone
        </h2>
        <div className="mt-3">
          <DangerZone />
        </div>
      </section>
    </AppShell>
  );
}
