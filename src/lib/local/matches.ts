import { otherSide, replay } from "@/lib/scoring";
import type { EventDraft, MatchEvent, Rules, TeamSide } from "@/lib/scoring";
import { summarize } from "@/lib/share/summary";
import { newMatchCode } from "./code";
import type { LocalDb, LocalMatch, StoredEvent } from "./db";

export type MatchSetup = {
  title?: string;
  teams: [string, string];
  rules: Rules;
  toss: { winner: TeamSide; choice: "bat" | "bowl" };
  striker: string;
  nonStriker: string;
  bowler: string;
};

type MatchBase = Omit<LocalMatch, "summary">;

function withoutMatchId(stored: StoredEvent): MatchEvent {
  const { matchId, ...event } = stored;
  void matchId;
  return event;
}

function matchEventsQuery(db: LocalDb, matchId: string) {
  return db.events.where("[matchId+seq]").between([matchId, -Infinity], [matchId, Infinity]);
}

export async function loadEvents(db: LocalDb, matchId: string): Promise<MatchEvent[]> {
  const stored = await matchEventsQuery(db, matchId).toArray();
  return stored.map(withoutMatchId);
}

async function commit(
  db: LocalDb,
  match: MatchBase,
  existing: MatchEvent[],
  drafts: EventDraft[],
): Promise<{ match: LocalMatch; events: MatchEvent[] }> {
  const at = new Date().toISOString();
  const events = drafts.map(
    (draft, i): MatchEvent => ({ ...draft, id: crypto.randomUUID(), seq: match.lastSeq + i + 1, at }),
  );
  const summary = summarize(replay([...existing, ...events]));
  await db.events.bulkAdd(events.map((event): StoredEvent => ({ ...event, matchId: match.id })));
  const next: LocalMatch = {
    ...match,
    lastSeq: match.lastSeq + events.length,
    summary,
    updatedAt: at,
    syncState: match.syncState === "blocked" ? "blocked" : "pending",
  };
  await db.matches.put(next);
  return { match: next, events };
}

export async function appendEvents(
  db: LocalDb,
  matchId: string,
  drafts: EventDraft[],
): Promise<MatchEvent[]> {
  return db.transaction("rw", db.matches, db.events, async () => {
    const match = await db.matches.get(matchId);
    if (match === undefined) throw new Error(`Unknown match ${matchId}`);
    const existing = await loadEvents(db, matchId);
    return (await commit(db, match, existing, drafts)).events;
  });
}

export async function createLocalMatch(db: LocalDb, setup: MatchSetup): Promise<LocalMatch> {
  const [teamA, teamB] = setup.teams;
  const title = setup.title ?? `${teamA} vs ${teamB}`;
  const battingTeam = setup.toss.choice === "bat" ? setup.toss.winner : otherSide(setup.toss.winner);
  const striker = { id: crypto.randomUUID(), name: setup.striker, team: battingTeam };
  const nonStriker = { id: crypto.randomUUID(), name: setup.nonStriker, team: battingTeam };
  const bowler = { id: crypto.randomUUID(), name: setup.bowler, team: otherSide(battingTeam) };
  const drafts: EventDraft[] = [
    {
      type: "match_created",
      title,
      teams: { A: { name: teamA }, B: { name: teamB } },
      rules: setup.rules,
      toss: setup.toss,
    },
    { type: "player_added", player: striker },
    { type: "player_added", player: nonStriker },
    { type: "player_added", player: bowler },
    {
      type: "innings_started",
      innings: 1,
      battingTeam,
      striker: striker.id,
      nonStriker: nonStriker.id,
      bowler: bowler.id,
    },
  ];
  const now = new Date().toISOString();
  const base: MatchBase = {
    id: crypto.randomUUID(),
    code: newMatchCode(),
    createdAt: now,
    updatedAt: now,
    lastSeq: 0,
    syncedSeq: 0,
    syncState: "pending",
    blockedReason: null,
    rules: setup.rules,
    teams: [teamA, teamB],
    title,
  };
  return db.transaction("rw", db.matches, db.events, async () => (await commit(db, base, [], drafts)).match);
}

export async function getDeviceId(db: LocalDb): Promise<string> {
  return db.transaction("rw", db.meta, async () => {
    const existing = await db.meta.get("deviceId");
    if (typeof existing?.value === "string") return existing.value;
    const value = crypto.randomUUID();
    await db.meta.put({ key: "deviceId", value });
    return value;
  });
}

export async function recentPlayerNames(db: LocalDb, limit = 50): Promise<string[]> {
  const names = new Set<string>();
  const matches = await db.matches.orderBy("updatedAt").reverse().toArray();
  for (const match of matches) {
    if (names.size >= limit) break;
    const events = await matchEventsQuery(db, match.id).reverse().toArray();
    for (const event of events) {
      if (names.size >= limit) break;
      if (event.type === "player_added") names.add(event.player.name);
    }
  }
  return [...names];
}
