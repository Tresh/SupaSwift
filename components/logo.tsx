/**
 * SupaSwift mark: a flash bolt mirrored to face left, the opposite of
 * Supabase's right-facing bolt. Same emerald green, no background box.
 */
export const BOLT_PATH = "M13.8 4.5 23.5 17.5h-5.8l2.1 10-9.7-13h5.8l-2.1-10z";

export function BoltMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d={BOLT_PATH} fill="#059669" />
    </svg>
  );
}

export function Logo({
  size = "md",
}: {
  size?: "sm" | "md";
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <BoltMark className={size === "sm" ? "h-7 w-7" : "h-9 w-9"} />
      <span
        className={`font-semibold tracking-tight text-zinc-900 ${
          size === "sm" ? "text-sm" : "text-[15px]"
        }`}
      >
        SupaSwift
      </span>
    </span>
  );
}
