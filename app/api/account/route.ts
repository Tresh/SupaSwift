import { NextRequest } from "next/server";
import { json } from "@/lib/api";
import { decryptSecret } from "@/lib/encryption";
import { revokeOAuthTokens } from "@/lib/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function DELETE(_request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  // Revoke all Supabase authorizations (best-effort).
  const { data: accounts } = await supabase
    .from("connected_accounts")
    .select("*");
  for (const account of accounts ?? []) {
    try {
      await revokeOAuthTokens(decryptSecret(account.encrypted_refresh_token));
    } catch {
      // best-effort
    }
  }

  // Deleting the auth user cascades to profiles, connected_accounts,
  // monitored_projects and health_checks (all FK on delete cascade).
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
}
