/**
 * Standalone scheduler worker for self-hosted deployments.
 *
 * Scans for due checks every 60 seconds and processes them. Most scans
 * claim nothing. Projects are only checked once per 24h by default.
 *
 * Run with: npm run worker
 * (loads .env.local via --env-file)
 */
import { runDueChecks } from "../lib/checks/run-due-checks";

const SCAN_INTERVAL_MS = 60_000;

async function tick() {
  try {
    const result = await runDueChecks();
    if (result.claimed > 0) {
      console.log(
        `[worker] claimed ${result.claimed}, completed ${result.completed}, failed ${result.failed}`
      );
    }
  } catch (err) {
    console.error("[worker] tick failed:", err);
  }
}

console.log("[worker] SupaSwift worker started, scanning every 60s");
void tick();
setInterval(tick, SCAN_INTERVAL_MS);
