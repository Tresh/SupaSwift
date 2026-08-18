import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo, BOLT_PATH } from "@/components/logo";
import { Reveal } from "@/components/landing-reveal";
import { ArrowRight, Eye, Feather, Layers, Zap } from "lucide-react";

const APP_URL = (process.env.APP_URL ?? "http://localhost:8080").replace(/\/$/, "");

const SITE_NAME = "SupaSwift";
const TAGLINE = "Keep your Supabase projects awake";
const DESCRIPTION =
  "SupaSwift quietly checks your Supabase projects, monitors their health, and lets you know when something needs attention. Keep your Supabase projects awake.";

export const metadata: Metadata = {
  title: `${SITE_NAME}: ${TAGLINE}`,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    url: "/",
    title: `${SITE_NAME}: ${TAGLINE}`,
    description: DESCRIPTION,
  },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: SITE_NAME,
      url: APP_URL,
      description: DESCRIPTION,
      inLanguage: "en",
    },
    {
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      url: APP_URL,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      description: DESCRIPTION,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
  ],
};

const STEPS = [
  {
    title: "Connect",
    text: "Sign in with Supabase OAuth. SupaSwift gets read-only access to list your projects and their status. No API keys, no passwords, no service-role secrets.",
  },
  {
    title: "Choose",
    text: "See every project across every connected Supabase account. Pick the ones you care about and start watching in one click.",
  },
  {
    title: "Relax",
    text: "SupaSwift checks each project once a day and flags anything that looks off, from inactivity to downtime, before it becomes a surprise.",
  },
];

const WHY = [
  {
    icon: Eye,
    title: "Stay aware",
    text: "Get notified when a project becomes inactive or stops responding, with a clear next step to fix it.",
  },
  {
    icon: Feather,
    title: "Lightweight",
    text: "One quiet check per project per day. No aggressive polling, no surprise traffic, no noise.",
  },
  {
    icon: Layers,
    title: "One dashboard",
    text: "Every Supabase account and project in a single overview. Add or remove projects anytime.",
  },
];

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <header className="sticky top-0 z-10 border-b border-zinc-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Logo />
          <Link
            href="/auth"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4">
        {/* Hero */}
        <section className="pb-10 pt-10 text-center sm:pb-16 sm:pt-24">
          <Reveal>
            <h1 className="mx-auto max-w-2xl text-2xl font-semibold leading-tight tracking-tight text-zinc-900 sm:text-5xl">
              Keep your Supabase projects awake.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-500 sm:mt-5 sm:text-lg">
              SupaSwift quietly checks your Supabase projects, monitors their
              health, and tells you when something needs attention.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:mt-10 sm:flex-row sm:gap-3">
              <Link
                href="/api/connect/supabase"
                className="btn btn-primary w-full py-2 text-sm sm:w-auto sm:py-2.5 sm:text-[15px]"
              >
                <Zap className="h-4 w-4" fill="currentColor" strokeWidth={0} />
                Connect Supabase
              </Link>
              <a
                href="#how-it-works"
                className="btn btn-secondary w-full py-2 text-sm sm:w-auto sm:py-2.5 sm:text-[15px]"
              >
                How it works
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </Reveal>
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
          className="scroll-mt-8 border-t border-zinc-100 py-12 sm:py-20"
        >
          <Reveal>
            <div className="max-w-xl">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-900 sm:text-xl">
                How it works
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                About a minute of setup. After that, SupaSwift runs on its own.
              </p>
            </div>
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-3 sm:gap-5">
            {STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 100}>
                <div className="card flex h-full flex-col p-5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-sm font-semibold text-white">
                    {i + 1}
                  </div>
                  <h3 className="mt-4 text-sm font-semibold tracking-tight text-zinc-900">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
                    {step.text}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <p className="mt-6 max-w-xl text-xs leading-relaxed text-zinc-400">
              The connection happens through Supabase OAuth with read-only
              access. SupaSwift never sees your API keys or passwords.
            </p>
          </Reveal>
        </section>

        {/* Why SupaSwift */}
        <section id="why" className="border-t border-zinc-100 py-12 sm:py-20">
          <Reveal>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900 sm:text-xl">
              Why SupaSwift
            </h2>
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-3 sm:gap-5">
            {WHY.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} delay={i * 100}>
                <div className="card h-full p-5">
                  <Icon className="h-5 w-5 text-emerald-600" strokeWidth={1.75} />
                  <p className="mt-3 text-sm font-semibold tracking-tight text-zinc-900">
                    {title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                    {text}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* CTA */}
        <Reveal>
          <section className="mt-12 overflow-hidden rounded-xl bg-zinc-900 px-6 py-12 text-center sm:py-16">
            <svg viewBox="0 0 32 32" className="mx-auto h-10 w-10">
              <path d={BOLT_PATH} fill="#059669" />
            </svg>
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Free while we&apos;re building
            </span>
            <h2 className="mx-auto mt-5 max-w-xl text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Connect once, forget about it.
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
              Your projects stay awake, and you know when something needs
              attention.
            </p>
            <Link
              href="/api/connect/supabase"
              className="btn mt-7 bg-white px-6 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200 sm:text-[15px]"
            >
              Connect Supabase
              <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        </Reveal>
      </main>

      <footer className="mt-14 border-t border-zinc-100">
        <div className="mx-auto max-w-4xl px-4 py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xs">
              <Logo />
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                A lightweight health and activity checker for Supabase
                projects.
              </p>
            </div>
            <nav
              className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm sm:flex sm:gap-8"
              aria-label="Footer"
            >
              <Link href="/auth" className="text-zinc-500 hover:text-zinc-900">
                Sign in
              </Link>
              <a
                href="/api/connect/supabase"
                className="text-zinc-500 hover:text-zinc-900"
              >
                Connect Supabase
              </a>
              <a
                href="#how-it-works"
                className="text-zinc-500 hover:text-zinc-900"
              >
                How it works
              </a>
              <a href="#why" className="text-zinc-500 hover:text-zinc-900">
                Why SupaSwift
              </a>
            </nav>
          </div>
          <div className="mt-8 flex flex-col gap-2 border-t border-zinc-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-zinc-400">
              © {new Date().getFullYear()} SupaSwift
            </p>
            <p className="max-w-md text-[11px] leading-relaxed text-zinc-400">
              SupaSwift performs lightweight scheduled checks and monitoring.
              It can&apos;t guarantee that Supabase will never pause a Free
              project.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
