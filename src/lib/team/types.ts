import type { TeamSide } from "@/lib/scoring";

export type SquadRole = "batter" | "bowler" | "allrounder" | "keeper";
export type SquadPlayer = { id: string; name: string; role: SquadRole | null; active: boolean };
export type Season = { id: string; name: string; startsOn: string; endsOn: string };
export type Outcome = "won" | "lost" | "tied";
export type PlayerMatchStats = {
  playerId: string;
  batting: { runs: number; balls: number; fours: number; sixes: number; notOut: boolean } | null;
  bowling: { legalBalls: number; runs: number; wickets: number; maidens: number; dots: number } | null;
  fielding: { catches: number; runOuts: number; stumpings: number };
};
export type TeamMatchRecord = {
  version: 1;
  side: TeamSide;
  opponent: string;
  playedAt: string;
  xi: string[];
  outcome: Outcome | null;
  players: PlayerMatchStats[];
};
export type TeamMatch = {
  code: string;
  status: "in_progress" | "complete";
  resultOverride: "no_result" | null;
  potmPlayerId: string | null;
  record: TeamMatchRecord | null;
};
export type LeaderboardKey =
  | "runs"
  | "wickets"
  | "highest"
  | "sixes"
  | "fours"
  | "average"
  | "strikeRate"
  | "economy"
  | "bestBowling"
  | "maidens"
  | "dots"
  | "catches"
  | "runOutsStumpings"
  | "mvp"
  | "potm";
export type LeaderboardRow = { playerId: string; value: number; notOut?: boolean; runs?: number };
export type PlayerTotals = {
  playerId: string;
  matches: number;
  innings: number;
  notOuts: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  highest: { runs: number; notOut: boolean } | null;
  thirties: number;
  fifties: number;
  average: number | null;
  strikeRate: number | null;
  legalBalls: number;
  maidens: number;
  runsConceded: number;
  wickets: number;
  dots: number;
  economy: number | null;
  best: { wickets: number; runs: number } | null;
  catches: number;
  runOuts: number;
  stumpings: number;
  points: number;
  potmAwards: number;
};
export type TeamRecord = { played: number; won: number; lost: number; tied: number; noResult: number };
export type TeamStats = {
  record: TeamRecord;
  players: PlayerTotals[];
  leaderboards: Record<LeaderboardKey, LeaderboardRow[]>;
  potm: Record<string, { playerId: string; suggested: boolean } | null>;
};
