import { NextRequest, NextResponse } from "next/server";
import { runDueChecks } from "@/lib/checks/run-due-checks";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // checks hit external APIs; allow headroom

/**
 * Scheduler entry point. Trigger this periodically (e.g. every 5 minutes
 * via Vercel Cron, GitHub Actions, cron-job.org, or the bundled worker
 * script) with the `x-cron-secret` header.
 *
 * The route only *finds due* projects - with a 24h default interval most
 * runs claim nothing and do zero work.
 */
export async function POST(request: NextRequest) {
  // Vercel Cron sends an x-vercel-cron header; self-hosted setups send
  // x-cron-secret. Either is accepted.
  const isVercelCron = request.headers.get("x-vercel-cron") !== null;
  const secret = request.headers.get("x-cron-secret");
  const authorized = isVercelCron ||
    (!!process.env.CRON_SECRET && secret === process.env.CRON_SECRET);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDueChecks();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron] runDueChecks failed:", err);
    return NextResponse.json({ ok: false, error: "Worker failed" }, { status: 500 });
  }
}
