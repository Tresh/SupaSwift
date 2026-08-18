import { NextRequest, NextResponse } from "next/server";
import { checkProjectNow } from "@/lib/checks/run-due-checks";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // health checks hit external APIs

/**
 * Run one check for a project right now (the "Check now" button).
 * The user-scoped client + RLS guarantees the project belongs to the
 * signed-in user before we run anything.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: project } = await supabase
    .from("monitored_projects")
    .select("id")
    .eq("project_ref", ref)
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const result = await checkProjectNow(project.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[check-now] failed for ${ref}:`, err);
    return NextResponse.json(
      { error: "Check failed. Try again in a moment." },
      { status: 500 }
    );
  }
}
