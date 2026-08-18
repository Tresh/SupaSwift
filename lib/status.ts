import type { ProjectStatus } from "@/lib/types";

interface StatusMeta {
  label: string;
  /** small dot color */
  dot: string;
  /** muted text color for the label */
  text: string;
  /** soft pill treatment (ring + tinted bg) */
  pill: string;
}

export const STATUS_META: Record<ProjectStatus, StatusMeta> = {
  checking: {
    label: "Checking",
    dot: "bg-sky-500",
    text: "text-sky-700",
    pill: "bg-sky-50 text-sky-700 ring-sky-200",
  },
  healthy: {
    label: "Healthy",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  warning: {
    label: "Warning",
    dot: "bg-amber-500",
    text: "text-amber-700",
    pill: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  offline: {
    label: "Offline",
    dot: "bg-red-500",
    text: "text-red-700",
    pill: "bg-red-50 text-red-700 ring-red-200",
  },
  paused: {
    label: "Paused",
    dot: "bg-zinc-400",
    text: "text-zinc-600",
    pill: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  },
  unknown: {
    label: "Unknown",
    dot: "bg-zinc-400",
    text: "text-zinc-600",
    pill: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  },
};

export function statusLabel(status: ProjectStatus | null | undefined): string {
  if (!status) return "Unknown";
  return STATUS_META[status]?.label ?? "Unknown";
}

export function isFailureStatus(status: ProjectStatus | null | undefined): boolean {
  return status === "offline" || status === "warning";
}
