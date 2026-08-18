import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AutoRefresh } from "@/components/auto-refresh";
import { CheckHistory } from "@/components/check-history";
import { ProjectActions } from "@/components/project-actions";
import { StatusPill } from "@/components/status-dot";
import { TimeText } from "@/components/time-text";
import { createClient } from "@/lib/supabase/server";
import { statusLabel } from "@/lib/status";
import {
  formatNextCheck,
  formatRelative,
  formatResponseMs,
} from "@/lib/time";
import type { HealthCheck, MonitoredProject } from "@/lib/types";

interface ProjectRow extends MonitoredProject {
  connected_accounts: { display_name: string } | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("monitored_projects")
    .select("project_name")
    .eq("project_ref", ref)
    .maybeSingle();

  return {
    title: project?.project_name ?? "Project",
    robots: { index: false, follow: false },
  };
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-zinc-800">{value}</dd>
    </div>
  );
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("monitored_projects")
    .select("*, connected_accounts(display_name)")
    .eq("project_ref", ref)
    .maybeSingle();

  if (!project) notFound();

  const { data: checks } = await supabase
    .from("health_checks")
    .select("*")
    .eq("project_id", project.id)
    .order("checked_at", { ascending: false })
    .limit(15);

  const { data: cronState } = await supabase
    .from("app_state")
    .select("value")
    .eq("key", "last_cron_run_at")
    .maybeSingle();
  const cronRanAt =
    (cronState?.value as { at?: string } | null)?.at ?? null;

  const row = project as ProjectRow;
  const checkList = (checks ?? []) as HealthCheck[];
  // The newest check row is the source of truth for the "last check"
  // snapshot, so these fields can never disagree with the Recent checks
  // table below (even if a project-row update was lost mid-write).
  const lastCheck = checkList[0] ?? null;
  const lastCheckedAt = lastCheck?.checked_at ?? row.last_checked_at;
  const lastResponseMs = lastCheck?.response_ms ?? row.last_response_ms;
  const lastCheckStatus = lastCheck?.status ?? row.last_status;
  const status = row.last_status ?? "unknown";
  const paused = status === "paused";

  return (
    <AppShell active="projects">
      <AutoRefresh />
      <Link
        href="/dashboard"
        className="text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        ← Your projects
      </Link>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
            {row.project_name}
          </h1>
          <StatusPill status={row.monitoring_enabled ? status : null} />
          {!row.monitoring_enabled && (
            <span className="text-xs font-medium text-zinc-400">
              Monitoring paused
            </span>
          )}
        </div>
        <ProjectActions project={row} />
      </div>

      {paused && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              Project appears inactive
            </p>
            <p className="mt-0.5 text-sm text-amber-800">
              Resume it from the Supabase dashboard to keep using it.
            </p>
          </div>
          <a
            href={`https://supabase.com/dashboard/project/${row.project_ref}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn !bg-amber-900 !text-white hover:!bg-amber-800"
          >
            Open Supabase
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      )}

      <div className="card mt-6 p-6">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
          <Field label="Project" value={row.project_name} />
          <Field
            label="Supabase account"
            value={row.connected_accounts?.display_name ?? "-"}
          />
          <Field label="Last check" value={<TimeText value={lastCheckedAt} />} />
          <Field
            label="Response time"
            value={formatResponseMs(lastResponseMs)}
          />
          <Field label="Status" value={statusLabel(lastCheckStatus)} />
          <Field
            label="Next scheduled check"
            value={
              row.monitoring_enabled
                ? formatNextCheck(row.next_check_at)
                : "Paused. Resume monitoring"
            }
          />
          <Field
            label="Scheduler last ran"
            value={cronRanAt ? formatRelative(cronRanAt) : "-"}
          />
        </dl>
        {row.last_error && (
          <p className="mt-5 border-t border-zinc-100 pt-4 text-sm text-zinc-500">
            <span className="font-medium text-zinc-700">Last error:</span>{" "}
            {row.last_error}
          </p>
        )}
      </div>

      <h2 className="mt-9 text-sm font-semibold tracking-tight text-zinc-900">
        Recent checks
      </h2>
      <CheckHistory checks={checkList} />
      <p className="kbd-note mt-3">
        SupaSwift keeps the most recent 500 checks per project.
      </p>
    </AppShell>
  );
}
