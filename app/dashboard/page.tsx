import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AutoRefresh } from "@/components/auto-refresh";
import { EmptyState } from "@/components/empty-state";
import { ProjectCard } from "@/components/project-card";
import { createClient } from "@/lib/supabase/server";
import type { MonitoredProject } from "@/lib/types";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

interface ProjectRow extends MonitoredProject {
  connected_accounts: { display_name: string } | null;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("monitored_projects")
    .select("*, connected_accounts(display_name)")
    .order("created_at", { ascending: false });

  const rows = (projects ?? []) as ProjectRow[];

  const counts = {
    healthy: rows.filter((p) => p.monitoring_enabled && p.last_status === "healthy").length,
    warning: rows.filter((p) => p.monitoring_enabled && p.last_status === "warning").length,
    offline: rows.filter((p) => p.monitoring_enabled && p.last_status === "offline").length,
    paused: rows.filter((p) => p.monitoring_enabled && p.last_status === "paused").length,
  };
  const hasCounts = counts.healthy + counts.warning + counts.offline + counts.paused > 0;

  return (
    <AppShell active="dashboard">
      <AutoRefresh />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900 sm:text-xl">
            Your Projects
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500 sm:text-sm">
            SupaSwift is watching them.
          </p>
        </div>
        <a
          href="/api/connect/supabase"
          className="btn btn-primary whitespace-nowrap !px-3 !py-1.5 text-xs sm:!px-3.5 sm:!py-2 sm:text-sm"
        >
          <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          Add Supabase
        </a>
      </div>

      {hasCounts && (
        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-500">
          {counts.healthy > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-inset ring-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {counts.healthy} healthy
            </span>
          )}
          {counts.warning > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-amber-700 ring-1 ring-inset ring-amber-200">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {counts.warning} warning
            </span>
          )}
          {counts.offline > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-red-700 ring-1 ring-inset ring-red-200">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              {counts.offline} offline
            </span>
          )}
          {counts.paused > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-600 ring-1 ring-inset ring-zinc-200">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
              {counts.paused} inactive
            </span>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing here yet."
          text="Connect a Supabase account and choose the projects you want SupaSwift to watch."
          action={{ label: "Connect Supabase", href: "/api/connect/supabase" }}
        />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              accountName={project.connected_accounts?.display_name}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}
