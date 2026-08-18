const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function clock(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "12 minutes ago", "3 hours ago", "Yesterday", "Aug 14" */
export function formatRelative(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return "Never";
  const date = toDate(value);
  const diff = now.getTime() - date.getTime();
  if (diff < 0) return "just now";
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) {
    const m = Math.floor(diff / MINUTE);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (diff < DAY && sameDay(date, now)) {
    const h = Math.floor(diff / HOUR);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  const yesterday = new Date(now.getTime() - DAY);
  if (sameDay(date, yesterday)) return "Yesterday";
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** "Today, 08:42" | "Yesterday, 08:42" | "Aug 15, 08:42" */
export function formatCheckTime(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return "-";
  const date = toDate(value);
  const time = clock(date);
  if (sameDay(date, now)) return `Today, ${time}`;
  const yesterday = new Date(now.getTime() - DAY);
  if (sameDay(date, yesterday)) return `Yesterday, ${time}`;
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${time}`;
}

/** "08:42" */
export function formatClockTime(value: string | Date): string {
  return clock(toDate(value));
}

/** "184 ms" */
export function formatResponseMs(ms: number | null | undefined): string {
  if (ms == null) return "-";
  return `${Math.round(ms)} ms`;
}

/**
 * Countdown to the next scheduled check: "11h 48m", "in 2 days", "any moment".
 * Pass null/undefined to get "-" (e.g. monitoring is paused).
 */
export function formatNextCheck(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return "-";
  const date = toDate(value);
  const diff = date.getTime() - now.getTime();
  if (diff <= 0) return "any moment";
  if (diff < HOUR) {
    const m = Math.max(1, Math.floor(diff / MINUTE));
    return `${m}m`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    const m = Math.floor((diff % HOUR) / MINUTE);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `in ${Math.ceil(diff / DAY)} days`;
}
