import type { SupabaseClient } from "@supabase/supabase-js";
import { MY_TEAM_KEY, rememberTeamCode } from "@/lib/app/frame";
import type { LocalDb } from "@/lib/local/db";
import { clearCachedTeam } from "@/lib/team/local";

export const SIGNED_OUT_KEY = "signed-out";

async function currentUser(client: SupabaseClient) {
  try {
    const { data } = await client.auth.getSession();
    return data.session?.user;
  } catch {
    return undefined;
  }
}

export async function signOutHere(client: SupabaseClient, db: LocalDb): Promise<boolean> {
  const user = await currentUser(client);
  await db.meta.put({ key: SIGNED_OUT_KEY, value: user?.id ?? "" });
  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  if ((await currentUser(client)) !== undefined) {
    await db.meta.delete(SIGNED_OUT_KEY);
    return false;
  }
  await clearCachedTeam(db);
  rememberTeamCode(MY_TEAM_KEY, null);
  return true;
}

export async function resumeAfterSignIn(client: SupabaseClient, db: LocalDb): Promise<number> {
  if ((await db.meta.get(SIGNED_OUT_KEY)) === undefined) return 0;
  const user = await currentUser(client);
  if (user === undefined || user.is_anonymous === true) return 0;
  return db.transaction("rw", db.matches, db.meta, async () => {
    const refused = await db.matches.filter((match) => match.syncState === "blocked" && match.blockedReason === "not_owner").toArray();
    for (const match of refused) await db.matches.update(match.id, { syncState: "pending", blockedReason: null });
    await db.meta.delete(SIGNED_OUT_KEY);
    return refused.length;
  });
}
