import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { StatusPill } from "@/components/status-dot";
import { TimeText } from "@/components/time-text";
import { formatNextCheck, formatResponseMs } from "@/lib/time";
import type { MonitoredProject } from "@/lib/types";

interface Props {
  project: MonitoredProject;
  accountName?: string | null;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 sm:block">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </p>
      <p className="truncate text-sm text-zinc-800 sm:mt-0.5">{value}</p>
    </div>
  );
}

export function ProjectCard({ project, accountName }: Props) {
  const status = project.last_status ?? "unknown";
  const paused = status === "paused";
  const notWatching = !project.monitoring_enabled;

  return (
    <div className="card flex h-full flex-col p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-zinc-900">
            {project.project_name}
          </h3>
          <p className="mt-0.5 truncate text-sm text-zinc-500">
            {project.organization_name ?? accountName ?? "Supabase"}
          </p>
        </div>
        <StatusPill status={notWatching ? null : status} />
      </div>

      {paused && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
          <p className="min-w-0 flex-1 truncate text-xs text-zinc-600">
            Project appears inactive
          </p>
          <a
            href={`https://supabase.com/dashboard/project/${project.project_ref}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
          >
            Open
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      {notWatching && !paused && (
        <p className="mt-3 text-xs font-medium text-zinc-400">
          Monitoring paused
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-y-2.5 border-t border-zinc-100 pt-4 sm:grid-cols-3 sm:gap-3">
        <Stat label="Last check" value={<TimeText value={project.last_checked_at} />} />
        <Stat label="Response" value={formatResponseMs(project.last_response_ms)} />
        <Stat
          label="Next check"
          value={notWatching ? "Paused" : formatNextCheck(project.next_check_at)}
        />
      </div>

      {status === "unknown" && project.last_error && (
        <p
          className="mt-3 text-xs leading-relaxed text-zinc-400"
          title={project.last_error}
        >
          {project.last_error}
        </p>
      )}

      <div className="mt-auto flex items-center justify-end gap-3 pt-4">
        <Link
          href={`/projects/${project.project_ref}`}
          className="btn btn-secondary !px-3 !py-1.5 text-xs"
        >
          View
        </Link>
      </div>
    </div>
  );
}
