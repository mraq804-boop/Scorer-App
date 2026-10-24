import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocalDb } from "@/lib/local/db";
import { PENDING_CLAIM_KEY } from "@/lib/sync/sync";

const CLAIM_INVALID = "claim_invalid";

export async function startGoogleSignIn(client: SupabaseClient, db: LocalDb, siteUrl: string): Promise<void> {
  const { data } = await client.auth.getSession();
  if (data.session?.user.is_anonymous === true && (await db.matches.count()) > 0) {
    const { data: token, error } = await client.rpc("create_claim_token");
    if (error !== null) throw new Error(error.message);
    if (typeof token !== "string") throw new Error("Unexpected claim token response");
    await db.meta.put({ key: PENDING_CLAIM_KEY, value: token });
  }
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${siteUrl}/auth/callback?next=/account` },
  });
  if (error !== null) throw error;
}

export async function completeClaim(client: SupabaseClient, db: LocalDb): Promise<number> {
  const pending = await db.meta.get(PENDING_CLAIM_KEY);
  if (typeof pending?.value !== "string") return 0;

  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError !== null) throw sessionError;
  const user = sessionData.session?.user;
  if (user === undefined || user.is_anonymous === true) return 0;

  const { data, error } = await client.rpc("claim_matches", { p_token: pending.value });
  if (error !== null) {
    if (error.message !== CLAIM_INVALID) throw new Error(error.message);
    await db.meta.delete(PENDING_CLAIM_KEY);
    return 0;
  }
  if (typeof data !== "number") throw new Error("Unexpected claim response");
  await db.meta.delete(PENDING_CLAIM_KEY);
  return data;
}
