"use client";

import { useEffect, useState } from "react";
import { formatCheckTime } from "@/lib/time";

/**
 * Renders a timestamp in the viewer's local timezone. Server components
 * don't know the client's timezone, so we render a placeholder during SSR
 * and fill in the real, local time after mount (avoids hydration mismatches).
 */
export function TimeText({
  value,
  className = "",
}: {
  value: string | null | undefined;
  className?: string;
}) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    setText(formatCheckTime(value));
  }, [value]);

  return <span className={className}>{text ?? "…"}</span>;
}
