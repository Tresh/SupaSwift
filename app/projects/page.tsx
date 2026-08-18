import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { WatchSection } from "@/components/watch-section";
import { getAvailableProjects } from "@/lib/available-projects";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Projects",
  robots: { index: false, follow: false },
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const [accounts, params] = await Promise.all([
    getAvailableProjects(supabase),
    searchParams,
  ]);

  return (
    <AppShell active="projects">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900 sm:text-xl">
            Projects
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500 sm:text-sm">
            Choose what SupaSwift should watch.
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

      {params.connected && (
        <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Connected! Pick the projects you want SupaSwift to watch.
        </p>
      )}
      {params.error === "connect_failed" && (
        <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t complete the connection. Please try again.
        </p>
      )}

      <WatchSection accounts={accounts} />
    </AppShell>
  );
}
