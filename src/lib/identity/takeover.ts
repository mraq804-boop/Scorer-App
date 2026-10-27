import type { SupabaseClient } from "@supabase/supabase-js";
import type { CachedTeam, LocalDb, LocalMatch, StoredEvent } from "@/lib/local/db";
import { getDeviceId } from "@/lib/local/matches";
import { replay } from "@/lib/scoring";
import type { MatchEvent, MatchState, Rules, TeamSide } from "@/lib/scoring";
import { summarize } from "@/lib/share/summary";
import { getCachedTeam } from "@/lib/team/local";

type OwnerMatchRow = {
  code: string;
  title: string;
  team_a: string;
  team_b: string;
  rules: Rules;
  team_id: string | null;
  team_side: TeamSide | null;
  fixture_id: string | null;
  player_stats: { xi?: unknown } | null;
};

type OwnerMatchState = { status: string; scoring_device: string; last_seq: number };

const PAGE_SIZE = 1000;
const PAGE_TIMEOUT_MS = 120_000;

export function canTakeOver(
  server: OwnerMatchState,
  local: Pick<LocalMatch, "syncState" | "lastSeq"> | undefined,
  deviceId: string,
): boolean {
  if (server.status === "complete") return false;
  return (
    server.scoring_device !== deviceId ||
    local === undefined ||
    local.syncState === "blocked" ||
    local.lastSeq < server.last_seq
  );
}

function orphanKey(matchId: string): string {
  return `orphaned:${matchId}`;
}

async function fetchOwnerMatch(client: SupabaseClient, matchId: string): Promise<OwnerMatchRow> {
  const { data, error } = await client
    .from("matches")
    .select("code, title, team_a, team_b, rules, team_id, team_side, fixture_id, player_stats")
    .eq("id", matchId)
    .single();
  if (error !== null) throw new Error(error.message);
  return data as OwnerMatchRow;
}

function restoreTeam(row: OwnerMatchRow, state: MatchState, cached: CachedTeam | undefined): LocalMatch["team"] {
  if (row.team_id === null || row.team_side === null) return undefined;
  const squadNames = new Map(cached?.id === row.team_id ? cached.squad.map((player) => [player.id, player.name]) : []);
  const xiIds = Array.isArray(row.player_stats?.xi)
    ? row.player_stats.xi.filter((id): id is string => typeof id === "string")
    : [];
  return {
    id: row.team_id,
    side: row.team_side,
    fixtureId: row.fixture_id,
    xi: xiIds.map((id) => ({ id, name: state.players[id]?.name ?? squadNames.get(id) ?? "" })),
  };
}

function highestSeq(events: MatchEvent[]): number {
  return events.reduce((max, event) => Math.max(max, event.seq), 0);
}

function withMatchId(matchId: string, events: MatchEvent[]): StoredEvent[] {
  return events.map((event) => ({ ...event, matchId }));
}

async function fetchOwnerEvents(client: SupabaseClient, matchId: string, from: number): Promise<MatchEvent[]> {
  const events: MatchEvent[] = [];
  let after = from;
  for (;;) {
    const { data, error } = await client
      .rpc("get_owner_events", { p_match: matchId, p_after: after })
      .abortSignal(AbortSignal.timeout(PAGE_TIMEOUT_MS));
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

async function appendLateEvents(
  db: LocalDb,
  matchId: string,
  known: MatchEvent[],
  late: MatchEvent[],
): Promise<void> {
  const lastSeq = highestSeq(late);
  const summary = summarize(replay([...known, ...late]));
  await db.transaction("rw", db.matches, db.events, async () => {
    await db.events.bulkAdd(withMatchId(matchId, late));
    await db.matches.update(matchId, {
      lastSeq,
      syncedSeq: lastSeq,
      summary,
      updatedAt: new Date().toISOString(),
    });
  });
}

export async function takeOverScoring(client: SupabaseClient, db: LocalDb, matchId: string): Promise<void> {
  const device = await getDeviceId(db);
  const taken = await client.rpc("take_over_scoring", { p_match: matchId, p_device: device });
  if (taken.error !== null) throw new Error(taken.error.message);
  if (typeof taken.data !== "number") throw new Error("Unexpected take-over response");

  const row = await fetchOwnerMatch(client, matchId);
  const events = await fetchOwnerEvents(client, matchId, 0);
  if (events.length === 0) throw new Error("The match has no events to take over");

  const lastSeq = highestSeq(events);
  if (lastSeq < taken.data) throw new Error("The owner events were read incompletely");
  const state = replay(events);
  const summary = summarize(state);
  const team = restoreTeam(row, state, await getCachedTeam(db));
  const stored = withMatchId(matchId, events);
  const now = new Date().toISOString();

  await db.transaction("rw", db.matches, db.events, db.meta, async () => {
    const local = await db.matches.get(matchId);
    if (local !== undefined && local.syncedSeq > local.lastSeq) {
      throw new Error("Local sync state is ahead of the local events");
    }
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
      ...(team === undefined ? {} : { team }),
    });
  });

  const late = await fetchOwnerEvents(client, matchId, lastSeq);
  if (late.length > 0) await appendLateEvents(db, matchId, events, late);
}
