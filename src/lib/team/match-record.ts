import { otherSide } from "@/lib/scoring";
import type { BatterLine, BowlerLine, InningsState, MatchState, Result, TeamSide } from "@/lib/scoring";
import { hatTricksIn } from "./hat-tricks";
import type { Outcome, PlayerMatchStats, TeamMatchRecord } from "./types";

export function teamOutcome(result: Result | null, side: TeamSide): Outcome | null {
  if (result === null) return null;
  if (result.kind === "tie") return "tied";
  return result.winner === side ? "won" : "lost";
}

function battingFigures(line: BatterLine | undefined): PlayerMatchStats["batting"] {
  if (line === undefined) return null;
  return { runs: line.runs, balls: line.balls, fours: line.fours, sixes: line.sixes, notOut: line.out === null };
}

function bowlingFigures(line: BowlerLine | undefined, hatTricks: number): PlayerMatchStats["bowling"] {
  if (line === undefined) return null;
  const figures = { legalBalls: line.legalBalls, runs: line.runs, wickets: line.wickets, maidens: line.maidens, dots: line.dots };
  return hatTricks > 0 ? { ...figures, hatTricks } : figures;
}

function creditFielding(fielded: InningsState | undefined, byId: Map<string, PlayerMatchStats>): void {
  if (fielded === undefined) return;
  for (const line of fielded.batting) {
    const out = line.out;
    if (out === null || out.fielderId === null) continue;
    const fielder = byId.get(out.fielderId);
    if (fielder === undefined) continue;
    if (out.kind === "caught") fielder.fielding.catches += 1;
    else if (out.kind === "run_out") fielder.fielding.runOuts += 1;
    else if (out.kind === "stumped") fielder.fielding.stumpings += 1;
  }
}

export function playerFigures(state: MatchState, side: TeamSide, playerIds: readonly string[]): PlayerMatchStats[] {
  const batted = state.innings.find((innings) => innings.battingTeam === side);
  const fielded = state.innings.find((innings) => innings.bowlingTeam === side);
  const hatTricks = fielded === undefined ? new Map<string, number>() : hatTricksIn(fielded);

  const players = playerIds.map<PlayerMatchStats>((playerId) => ({
    playerId,
    batting: battingFigures(batted?.batting.find((line) => line.playerId === playerId)),
    bowling: bowlingFigures(fielded?.bowling.find((line) => line.playerId === playerId), hatTricks.get(playerId) ?? 0),
    fielding: { catches: 0, runOuts: 0, stumpings: 0 },
  }));
  creditFielding(fielded, new Map(players.map((player) => [player.playerId, player])));
  return players;
}

export function matchRecord(state: MatchState, side: TeamSide, xi: string[], playedAt: string): TeamMatchRecord {
  const playerIds = [...new Set(xi)];
  const players = playerFigures(state, side, playerIds);

  return {
    version: 1,
    side,
    opponent: state.teams[otherSide(side)].name,
    playedAt,
    xi: playerIds,
    outcome: teamOutcome(state.result, side),
    players,
  };
}
