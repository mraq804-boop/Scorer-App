import { otherSide, replay } from "@/lib/scoring";
import type { EventDraft, MatchEvent, Player, Rules, TeamSide } from "@/lib/scoring";
import { summarize } from "@/lib/share/summary";
import { newMatchCode } from "./code";
import type { LocalDb, LocalMatch, StoredEvent } from "./db";

export type SetupPlayer = string | { id: string; name: string };

export type MatchSetup = {
  title?: string;
  teams: [string, string];
  rules: Rules;
  toss: { winner: TeamSide; choice: "bat" | "bowl" };
  striker: SetupPlayer;
  nonStriker: SetupPlayer;
  bowler: SetupPlayer;
  team?: { id: string; fixtureId: string | null; xi: { id: string; name: string }[] };
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

function setupPlayer(chosen: SetupPlayer, team: TeamSide): Player {
  return typeof chosen === "string"
    ? { id: crypto.randomUUID(), name: chosen, team }
    : { id: chosen.id, name: chosen.name, team };
}

export async function createLocalMatch(db: LocalDb, setup: MatchSetup): Promise<LocalMatch> {
  const [teamA, teamB] = setup.teams;
  const title = setup.title ?? `${teamA} vs ${teamB}`;
  const battingTeam = setup.toss.choice === "bat" ? setup.toss.winner : otherSide(setup.toss.winner);
  const striker = setupPlayer(setup.striker, battingTeam);
  const nonStriker = setupPlayer(setup.nonStriker, battingTeam);
  const bowler = setupPlayer(setup.bowler, otherSide(battingTeam));
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
    ...(setup.team === undefined
      ? {}
      : {
          team: {
            id: setup.team.id,
            side: "A",
            fixtureId: setup.team.fixtureId,
            xi: setup.team.xi.map(({ id, name }) => ({ id, name })),
          },
        }),
  };
  return db.transaction("rw", db.matches, db.events, async () => (await commit(db, base, [], drafts)).match);
}

export async function addToMatchXi(db: LocalDb, matchId: string, players: readonly { id: string; name: string }[]): Promise<void> {
  await db.transaction("rw", db.matches, async () => {
    const match = await db.matches.get(matchId);
    if (match?.team === undefined) return;
    const missing = players.filter((player) => !match.team?.xi.some((member) => member.id === player.id));
    if (missing.length === 0) return;
    const xi = [...match.team.xi, ...missing.map(({ id, name }) => ({ id, name }))];
    await db.matches.update(matchId, { team: { ...match.team, xi } });
  });
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
