import type { MatchState, TeamSide } from "@/lib/scoring";
import { matchRecord, playerFigures } from "./match-record";
import { FIFTY_RUNS, FIVE_WICKETS, HUNDRED_RUNS, THREE_WICKETS, bestByPoints, matchPoints } from "./points";
import type { PlayerMatchStats, TeamMatchRecord, TeamPageMatch } from "./types";

export type Performer = { playerId: string; name: string; side: TeamSide; stats: PlayerMatchStats; points: number };
export type PosterHeadline = "potm" | "hundred" | "fifty" | "fiveWickets" | "hatTrick" | "threeWickets";
export type PosterOutcome = { kind: "live" } | { kind: "noResult" } | { kind: "tie" } | { kind: "won"; winner: TeamSide };
export type FormResult = "won" | "lost" | "tied" | "noResult";

const SIDES: readonly TeamSide[] = ["A", "B"];

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function byName(nameOf: (id: string) => string) {
  return (idA: string, idB: string) =>
    compareText(nameOf(idA).toLowerCase(), nameOf(idB).toLowerCase()) || compareText(idA, idB);
}

export function suggestedPotm(record: TeamMatchRecord, nameOf: (id: string) => string): string | null {
  const entries = record.players
    .filter((stats) => record.xi.includes(stats.playerId))
    .map((stats) => ({ stats, points: matchPoints(stats) }));
  const best = bestByPoints(entries, byName(nameOf));
  return best !== undefined && best.points > 0 ? best.stats.playerId : null;
}

export function matchPotm(record: TeamMatchRecord, override: string | null, nameOf: (id: string) => string): string | null {
  return override !== null && record.xi.includes(override) ? override : suggestedPotm(record, nameOf);
}

export function potmFromState(state: MatchState, side: TeamSide, xi: string[], override: string | null): string | null {
  return matchPotm(matchRecord(state, side, xi, ""), override, (id) => state.players[id]?.name ?? "");
}

export function topPerformers(state: MatchState, limit = 3): Performer[] {
  const nameOf = (id: string) => state.players[id]?.name ?? "";
  const performers = SIDES.flatMap((side) => {
    const ids = Object.values(state.players)
      .filter((player) => player.team === side)
      .map((player) => player.id);
    return playerFigures(state, side, ids).map((stats) => ({
      playerId: stats.playerId,
      name: nameOf(stats.playerId),
      side,
      stats,
      points: matchPoints(stats),
    }));
  });
  const ranked: Performer[] = [];
  const remaining = performers.filter((performer) => performer.points > 0);
  while (ranked.length < limit) {
    const best = bestByPoints(remaining, byName(nameOf));
    if (best === undefined) break;
    ranked.push(best);
    remaining.splice(remaining.indexOf(best), 1);
  }
  return ranked;
}

export function posterHeadline(stats: PlayerMatchStats, isPotm: boolean): PosterHeadline | null {
  if (isPotm) return "potm";
  const runs = stats.batting?.runs ?? 0;
  const wickets = stats.bowling?.wickets ?? 0;
  if (runs >= HUNDRED_RUNS) return "hundred";
  if (runs >= FIFTY_RUNS) return "fifty";
  if (wickets >= FIVE_WICKETS) return "fiveWickets";
  if ((stats.bowling?.hatTricks ?? 0) > 0) return "hatTrick";
  return wickets >= THREE_WICKETS ? "threeWickets" : null;
}

export function posterOutcome(state: MatchState, resultOverride: "no_result" | null): PosterOutcome {
  if (resultOverride === "no_result") return { kind: "noResult" };
  if (state.status !== "complete") return { kind: "live" };
  if (state.result === null) return { kind: "noResult" };
  if (state.result.kind === "tie") return { kind: "tie" };
  return { kind: "won", winner: state.result.winner };
}

export function teamForm(matches: readonly TeamPageMatch[], limit = 5): FormResult[] {
  return matches
    .filter((match) => match.record !== null && (match.status === "complete" || match.resultOverride === "no_result"))
    .slice(0, limit)
    .map((match) => (match.resultOverride === "no_result" ? "noResult" : (match.record?.outcome ?? "noResult")));
}
