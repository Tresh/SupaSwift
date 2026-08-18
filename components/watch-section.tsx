"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { StatusDot } from "@/components/status-dot";
import type { AvailableAccountInfo } from "@/lib/available-projects";
import type { ProjectStatus } from "@/lib/types";

function remoteStatusToLocal(status: string): ProjectStatus {
  if (status === "ACTIVE_HEALTHY") return "healthy";
  if (status === "ACTIVE_UNHEALTHY") return "warning";
  if (status === "INACTIVE") return "paused";
  if (status === "UNKNOWN") return "unknown";
  return "checking";
}

export function WatchSection({ accounts }: { accounts: AvailableAccountInfo[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(ref: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  }

  async function watchSelected() {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refs: [...selected] }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to start watching");
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function stopWatching(ref: string, projectId: string) {
    setRemoving(ref);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${ref}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove project");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setRemoving(null);
    }
  }

  const totalProjects = accounts.reduce((n, a) => n + a.projects.length, 0);

  if (accounts.length === 0) {
    return (
      <div className="card mt-8 px-6 py-10 text-center">
        <p className="text-sm font-medium text-zinc-900">
          No Supabase accounts connected yet.
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
          Connect a Supabase account and its projects will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          {totalProjects} project{totalProjects === 1 ? "" : "s"} across{" "}
          {accounts.length} account{accounts.length === 1 ? "" : "s"}.
          {selected.size > 0 &&
            ` ${selected.size} selected`}
        </p>
        <div className="flex items-center gap-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={watchSelected}
            disabled={selected.size === 0 || busy}
            className="btn btn-primary"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Start watching
          </button>
        </div>
      </div>

      {accounts.map((account) => (
        <section key={account.id} className="card overflow-hidden">
          <header className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/60 px-5 py-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">
                {account.display_name}
              </h2>
              {account.organization_names.length > 0 && (
                <p className="mt-0.5 text-xs text-zinc-500">
                  {account.organization_names.join(" · ")}
                </p>
              )}
            </div>
            {account.revoked_at ? (
              <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
                Expired
              </span>
            ) : (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                Connected
              </span>
            )}
          </header>

          {account.error && (
            <p className="border-b border-zinc-100 px-5 py-3 text-sm text-amber-700">
              {account.error}
            </p>
          )}

          {account.projects.length === 0 && !account.error && (
            <p className="px-5 py-6 text-center text-sm text-zinc-400">
              No projects in this account.
            </p>
          )}

          <ul className="divide-y divide-zinc-100">
            {account.projects.map((project) => {
              const isSelected = selected.has(project.ref);
              const isWatching = project.watched;
              const status = remoteStatusToLocal(project.status);
              return (
                <li
                  key={project.ref}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isWatching || busy}
                      onChange={() => toggle(project.ref)}
                      className="h-4 w-4 shrink-0 rounded border-zinc-300 accent-zinc-900 disabled:opacity-40"
                    />
                    <StatusDot status={status} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-zinc-900">
                        {project.name}
                      </span>
                      <span className="block truncate text-xs text-zinc-400">
                        {project.organization_name ?? project.organization_slug}
                        {project.region ? ` · ${project.region}` : ""}
                      </span>
                    </span>
                  </label>

                  {isWatching ? (
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                        <Check className="h-3 w-3" />
                        Watching
                      </span>
                      <button
                        onClick={() => stopWatching(project.ref, project.project_id!)}
                        disabled={removing === project.ref}
                        className="rounded-md px-2 py-1 text-xs font-medium text-zinc-400 hover:text-zinc-700"
                        title="Stop watching"
                      >
                        {removing === project.ref ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => toggle(project.ref)}
                      className={`btn shrink-0 !px-2.5 !py-1 text-xs ${
                        isSelected ? "btn-primary" : "btn-secondary"
                      }`}
                    >
                      {isSelected ? "Selected" : "Watch"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <p className="kbd-note flex items-center gap-1.5">
        <RefreshCw className="h-3 w-3" />
        Project list refreshes when you visit this page.
      </p>
    </div>
  );
}
