"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

const NAV = [
  { href: "/dashboard", label: "Overview", id: "dashboard" },
  { href: "/projects", label: "Projects", id: "projects" },
  { href: "/settings", label: "Settings", id: "settings" },
] as const;

export function SiteNav({
  active,
}: {
  active: "dashboard" | "projects" | "settings";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Desktop: inline text links */}
      <nav className="hidden items-center gap-0.5 sm:flex sm:gap-1" aria-label="Main">
        {NAV.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active === item.id
                ? "bg-zinc-100 text-zinc-900"
                : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Mobile: menu button with dropdown */}
      <div className="relative sm:hidden">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
              {NAV.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`block px-4 py-2.5 text-sm font-medium transition-colors ${
                    active === item.id
                      ? "bg-zinc-100 text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <div className="border-t border-zinc-100">
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
                >
                  <LogOut className="h-4 w-4" strokeWidth={1.75} />
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
