import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-zinc-100">
        <div className="mx-auto flex h-14 max-w-4xl items-center px-4">
          <Logo />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-4 py-20 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          404
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
          Page not found
        </h1>
        <p className="mt-2 max-w-md text-sm text-zinc-500">
          The page you&apos;re looking for doesn&apos;t exist or was moved.
        </p>
        <Link href="/" className="btn btn-primary mt-6">
          Back home
        </Link>
      </main>
    </div>
  );
}
