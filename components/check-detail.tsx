"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, X } from "lucide-react";
import { StatusPill } from "@/components/status-dot";
import { TimeText } from "@/components/time-text";
import { formatResponseMs } from "@/lib/time";
import type { HealthCheck } from "@/lib/types";

interface Props {
  check: HealthCheck;
  /** Extra classes for the table row (e.g. responsive hiding). */
  className?: string;
}

interface ServiceHealthEntry {
  name?: string;
  status?: string;
  error?: string | null;
}

function serviceDotClass(status?: string): string {
  if (status === "ACTIVE_HEALTHY") return "bg-emerald-500";
  if (status === "UNHEALTHY") return "bg-red-500";
  if (status === "COMING_UP") return "bg-amber-500";
  return "bg-zinc-300";
}

/**
 * A recent-checks table row that opens an expandable report popup on click.
 * The popup shows the full check report and a "Copy raw" button.
 */
export function CheckDetailRow({ check, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const rawServices =
    check.details && Array.isArray(check.details.services)
      ? (check.details.services as ServiceHealthEntry[])
      : null;

  async function copyRaw() {
    const raw = JSON.stringify(check, null, 2);
    try {
      await navigator.clipboard.writeText(raw);
    } catch {
      // Fallback for browsers without clipboard permissions.
      const ta = document.createElement("textarea");
      ta.value = raw;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <tr
        onClick={() => setOpen(true)}
        className={`cursor-pointer transition-colors hover:bg-zinc-50 ${className}`}
        title="View report"
      >
        <td className="whitespace-nowrap px-4 py-2.5 text-zinc-600">
          <TimeText value={check.checked_at} />
        </td>
        <td className="px-4 py-2.5">
          <StatusPill status={check.status} />
        </td>
        <td className="whitespace-nowrap px-4 py-2.5 text-zinc-600">
          {formatResponseMs(check.response_ms)}
        </td>
        <td className="max-w-[220px] truncate px-4 py-2.5 text-zinc-400">
          {check.error_message ?? ""}
        </td>
      </tr>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
          >
          <div
            className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-zinc-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
              <h3 className="text-sm font-semibold tracking-tight text-zinc-900">
                Check report
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-zinc-400 transition-colors hover:text-zinc-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <StatusPill status={check.status} />
                  <span className="text-sm text-zinc-500">
                    <TimeText value={check.checked_at} />
                  </span>
                </div>
                <span className="text-sm text-zinc-500">
                  Response {formatResponseMs(check.response_ms)}
                </span>
              </div>

              {check.error_message && (
                <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {check.error_message}
                </p>
              )}

              {rawServices && rawServices.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                    Services
                  </p>
                  <ul className="mt-2 divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-100">
                    {rawServices.map((s, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <span className="font-medium text-zinc-800">
                          {s.name ?? "service"}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${serviceDotClass(s.status)}`}
                          />
                          <span className="text-zinc-600">
                            {s.status?.replace(/_/g, " ") ?? "unknown"}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button onClick={copyRaw} className="btn btn-secondary mt-4 w-full">
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied ? "Copied" : "Copy raw"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
