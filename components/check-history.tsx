"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { CheckDetailRow } from "@/components/check-detail";
import { StatusPill } from "@/components/status-dot";
import { formatCheckTime, formatResponseMs } from "@/lib/time";
import type { HealthCheck } from "@/lib/types";

const MOBILE_SHOW = 5;

export function CheckHistory({ checks }: { checks: HealthCheck[] }) {
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!showAll) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowAll(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAll]);

  if (checks.length === 0) {
    return (
      <div className="card mt-3 px-4 py-8 text-center text-sm text-zinc-400">
        No checks yet. The first one runs shortly after you start watching.
      </div>
    );
  }

  return (
    <>
      <div className="card mt-3 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-[11px] uppercase tracking-wide text-zinc-400">
              <th className="px-4 py-2.5 font-medium">Time</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Response</th>
              <th className="px-4 py-2.5 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {checks.map((check, i) => (
              <CheckDetailRow
                key={check.id}
                check={check}
                className={i >= MOBILE_SHOW ? "hidden sm:table-row" : ""}
              />
            ))}
          </tbody>
        </table>
      </div>

      {checks.length > MOBILE_SHOW && (
        <button
          onClick={() => setShowAll(true)}
          className="btn btn-secondary mt-3 w-full sm:hidden"
        >
          Show all {checks.length} checks
        </button>
      )}

      {showAll &&
        createPortal(
          <div
            className="fixed inset-0 z-40 flex items-end justify-center bg-zinc-950/40 sm:items-center sm:p-4"
            onClick={() => setShowAll(false)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl bg-white shadow-xl ring-1 ring-zinc-200 sm:rounded-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
                <h3 className="text-sm font-semibold tracking-tight text-zinc-900">
                  All checks
                </h3>
                <button
                  onClick={() => setShowAll(false)}
                  className="rounded-md p-1 text-zinc-400 transition-colors hover:text-zinc-700"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="overflow-y-auto">
                <ul className="divide-y divide-zinc-100">
                  {checks.map((check) => (
                    <li
                      key={check.id}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-zinc-500">
                        {formatCheckTime(check.checked_at)}
                      </span>
                      <StatusPill status={check.status} />
                      <span className="shrink-0 text-sm text-zinc-500">
                        {formatResponseMs(check.response_ms)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
