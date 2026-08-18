import { NextRequest } from "next/server";
import { json } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ ref: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { ref } = await params;

  const { error } = await supabase
    .from("monitored_projects")
    .update({
      monitoring_enabled: true,
      next_check_at: new Date().toISOString(),
      consecutive_failures: 0,
      failure_notified_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("project_ref", ref)
    .eq("user_id", user.id);

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
