import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocalDb, LocalMatch, StoredEvent } from "@/lib/local/db";
import { getDeviceId } from "@/lib/local/matches";
import { replay } from "@/lib/scoring";
import type { MatchEvent, Rules } from "@/lib/scoring";
import { summarize } from "@/lib/share/summary";

type OwnerMatchRow = { code: string; title: string; team_a: string; team_b: string; rules: Rules };

const PAGE_SIZE = 1000;

function orphanKey(matchId: string): string {
  return `orphaned:${matchId}`;
}

async function fetchOwnerMatch(client: SupabaseClient, matchId: string): Promise<OwnerMatchRow> {
  const { data, error } = await client
    .from("matches")
    .select("code, title, team_a, team_b, rules")
    .eq("id", matchId)
    .single();
  if (error !== null) throw new Error(error.message);
  return data as OwnerMatchRow;
}

async function fetchOwnerEvents(client: SupabaseClient, matchId: string): Promise<MatchEvent[]> {
  const events: MatchEvent[] = [];
  let after = 0;
  for (;;) {
    const { data, error } = await client.rpc("get_owner_events", { p_match: matchId, p_after: after });
    if (error !== null) throw new Error(error.message);
    if (!Array.isArray(data)) throw new Error("Unexpected events response");
    const page = data as MatchEvent[];
    events.push(...page);
    if (page.length < PAGE_SIZE) return events;
    after = page[page.length - 1].seq;
  }
}

async function keepUnsyncedEvents(db: LocalDb, local: LocalMatch): Promise<void> {
  const unsynced = await db.events
    .where("[matchId+seq]")
    .between([local.id, local.syncedSeq], [local.id, Infinity], false, true)
    .toArray();
  const earlier = await db.meta.get(orphanKey(local.id));
  const kept = Array.isArray(earlier?.value) ? earlier.value : [];
  await db.meta.put({ key: orphanKey(local.id), value: [...kept, ...unsynced] });
}

export async function takeOverScoring(client: SupabaseClient, db: LocalDb, matchId: string): Promise<void> {
  const device = await getDeviceId(db);
  const taken = await client.rpc("take_over_scoring", { p_match: matchId, p_device: device });
  if (taken.error !== null) throw new Error(taken.error.message);

  const row = await fetchOwnerMatch(client, matchId);
  const events = await fetchOwnerEvents(client, matchId);
  if (events.length === 0) throw new Error("The match has no events to take over");

  const lastSeq = events.reduce((max, event) => Math.max(max, event.seq), 0);
  const summary = summarize(replay(events));
  const stored = events.map((event): StoredEvent => ({ ...event, matchId }));
  const now = new Date().toISOString();

  await db.transaction("rw", db.matches, db.events, db.meta, async () => {
    const local = await db.matches.get(matchId);
    if (local !== undefined && local.syncedSeq < local.lastSeq) await keepUnsyncedEvents(db, local);
    await db.events.where("matchId").equals(matchId).delete();
    await db.events.bulkAdd(stored);
    await db.matches.put({
      id: matchId,
      code: row.code,
      createdAt: local?.createdAt ?? now,
      updatedAt: now,
      lastSeq,
      syncedSeq: lastSeq,
      syncState: "synced",
      blockedReason: null,
      summary,
      rules: row.rules,
      teams: [row.team_a, row.team_b],
      title: row.title,
    });
  });
}
