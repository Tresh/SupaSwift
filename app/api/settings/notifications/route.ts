import { NextRequest } from "next/server";
import { json } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = await request.json().catch(() => null);
  const emailAlerts =
    typeof body?.email_alerts === "boolean" ? body.email_alerts : undefined;
  const recoveryAlerts =
    typeof body?.recovery_alerts === "boolean" ? body.recovery_alerts : undefined;

  if (emailAlerts === undefined && recoveryAlerts === undefined) {
    return json({ error: "Nothing to update." }, 400);
  }

  const updates: Record<string, boolean> = {};
  if (emailAlerts !== undefined) updates.email_alerts = emailAlerts;
  if (recoveryAlerts !== undefined) updates.recovery_alerts = recoveryAlerts;

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id);

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
