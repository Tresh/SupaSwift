import { STATUS_META } from "@/lib/status";
import type { ProjectStatus } from "@/lib/types";

export function StatusDot({
  status,
  className = "",
}: {
  status: ProjectStatus | null | undefined;
  className?: string;
}) {
  const meta = STATUS_META[status ?? "unknown"];
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${meta.dot} ${
        status === "checking" ? "animate-pulse" : ""
      } ${className}`}
      aria-hidden
    />
  );
}

export function StatusPill({
  status,
}: {
  status: ProjectStatus | null | undefined;
}) {
  const meta = STATUS_META[status ?? "unknown"];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium leading-none ring-1 ring-inset sm:gap-1.5 sm:px-2.5 sm:text-xs ${meta.pill}`}
    >
      <StatusDot status={status} className="h-1.5 w-1.5 sm:h-2 sm:w-2" />
      {meta.label}
    </span>
  );
}
