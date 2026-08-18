"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { Toggle } from "@/components/toggle";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

// ---------------------------------------------------------------- notifications

export function NotificationToggles({
  initial,
}: {
  initial: { email_alerts: boolean; recovery_alerts: boolean };
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function update(key: "email_alerts" | "recovery_alerts", value: boolean) {
    const previous = values;
    setValues((v) => ({ ...v, [key]: value }));
    setError(null);
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error("Failed to save");
    } catch {
      setValues(previous);
      setError("Couldn't save. Try again.");
    }
  }

  const rows: Array<{
    key: "email_alerts" | "recovery_alerts";
    title: string;
    text: string;
  }> = [
    {
      key: "email_alerts",
      title: "Email alerts",
      text: "Email me when a project keeps failing (once per incident, not on every check).",
    },
    {
      key: "recovery_alerts",
      title: "Recovery alerts",
      text: "Email me when a failing project is healthy again.",
    },
  ];

  return (
    <div>
      <ul className="divide-y divide-zinc-100">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-zinc-900">{row.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                {row.text}
              </p>
            </div>
            <Toggle
              checked={values[row.key]}
              onChange={(v) => update(row.key, v)}
              label={row.title}
            />
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- connections

export interface ConnectionItem {
  id: string;
  display_name: string;
  revoked_at: string | null;
  project_count: number;
}

export function ConnectionList({ accounts }: { accounts: ConnectionItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function disconnect(id: string) {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    if (!res.ok) setError("Couldn't disconnect. Try again.");
    setBusyId(null);
    router.refresh();
  }

  return (
    <div>
      <ul className="divide-y divide-zinc-100">
        {accounts.map((account) => (
          <li
            key={account.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-3.5"
          >
            <div className="flex min-w-0 flex-1 basis-52 items-center gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-900">
                  {account.display_name}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {account.project_count} project
                  {account.project_count === 1 ? "" : "s"} watched
                </p>
              </div>
              {account.revoked_at ? (
                <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
                  Expired
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  Connected
                </span>
              )}
            </div>
            <ConfirmButton
              label="Disconnect"
              confirmLabel="Disconnect"
              confirmText="Stop watching projects from this account?"
              busy={busyId === account.id}
              onConfirm={() => disconnect(account.id)}
            />
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- danger zone

export function DangerZone() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function disconnectAll() {
    setBusy("all");
    setError(null);
    const res = await fetch("/api/accounts/disconnect-all", { method: "POST" });
    if (!res.ok) setError("Couldn't disconnect. Try again.");
    setBusy(null);
    router.refresh();
  }

  async function deleteAccount() {
    setBusy("delete");
    setError(null);
    const res = await fetch("/api/account", { method: "DELETE" });
    if (!res.ok) {
      setError("Couldn't delete the account. Try again.");
      setBusy(null);
      return;
    }
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-900">Disconnect Supabase</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Remove every connected Supabase account and stop all monitoring.
            You can reconnect later.
          </p>
        </div>
        <ConfirmButton
          label="Disconnect Supabase"
          confirmLabel="Disconnect all"
          confirmText="Disconnect every Supabase account?"
          busy={busy === "all"}
          onConfirm={disconnectAll}
          variant="btn-secondary"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4">
        <div>
          <p className="text-sm font-medium text-zinc-900">
            Delete SupaSwift account
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Permanently deletes your account, connections, and check history.
          </p>
        </div>
        <ConfirmButton
          label="Delete account"
          confirmLabel="Delete forever"
          confirmText="This can't be undone."
          busy={busy === "delete"}
          onConfirm={deleteAccount}
        />
      </div>
    </div>
  );
}
