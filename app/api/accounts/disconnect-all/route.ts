import { NextRequest } from "next/server";
import { json } from "@/lib/api";
import { decryptSecret } from "@/lib/encryption";
import { revokeOAuthTokens } from "@/lib/oauth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

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

  const { error } = await supabase
    .from("connected_accounts")
    .delete()
    .eq("user_id", user.id);

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
