import { NextRequest } from "next/server";
import { json } from "@/lib/api";
import { decryptSecret } from "@/lib/encryption";
import { revokeOAuthTokens } from "@/lib/oauth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { id } = await params;

  const { data: account } = await supabase
    .from("connected_accounts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (account) {
    // Ask Supabase to revoke the authorization (best-effort).
    try {
      await revokeOAuthTokens(decryptSecret(account.encrypted_refresh_token));
    } catch {
      // token may already be revoked - fine
    }
  }

  const { error } = await supabase
    .from("connected_accounts")
    .delete()
    .eq("id", id);

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
