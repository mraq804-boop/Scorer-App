export type TeamSide = "A" | "B";
export type BallType = "tape" | "tennis" | "hard" | "custom";
export type Rules = {
  ballType: BallType; oversPerInnings: number; ballsPerOver: 6 | 8;
  playersPerSide: Record<TeamSide, number>;
  wideRuns: number; wideRebowled: boolean; noBallRuns: number;
  freeHit: boolean; lbw: boolean; lastManStands: boolean;
};
export type Player = { id: string; name: string; team: TeamSide };
export type DismissalKind = "bowled" | "caught" | "lbw" | "run_out" | "stumped" | "hit_wicket" | "other";
export type Wicket = { kind: DismissalKind; playerOut: string; fielderName: string | null; fielderId?: string | null };
export type BallKind = "legal" | "wide" | "noball";
export type RunsAs = "bat" | "bye" | "legbye";
export type CorrectionPatch = {
  kind?: BallKind; runs?: number; runsAs?: RunsAs; boundary?: boolean; penalty?: number;
  wicket?: { kind: DismissalKind; fielderName: string | null; fielderId?: string | null };
};
export type EventDraft =
  | { type: "match_created"; title: string; teams: Record<TeamSide, { name: string }>; rules: Rules; toss: { winner: TeamSide; choice: "bat" | "bowl" } }
  | { type: "player_added"; player: Player }
  | { type: "innings_started"; innings: 1 | 2; battingTeam: TeamSide; striker: string; nonStriker: string; bowler: string }
  | { type: "delivery"; striker: string; nonStriker: string | null; bowler: string; kind: BallKind; runs: number; runsAs: RunsAs; boundary: boolean; penalty: number; wicket: Wicket | null }
  | { type: "batter_in"; player: string }
  | { type: "bowler_changed"; player: string }
  | { type: "strike_swapped" }
  | { type: "retired"; player: string; how: "hurt" | "out" }
  | { type: "settings_changed"; oversPerInnings?: number; playersPerSide?: Partial<Record<TeamSide, number>>; target?: number | null }
  | { type: "innings_ended"; innings: 1 | 2; reason: "overs" | "all_out" | "target" | "manual" }
  | { type: "undo"; targets: string[] }
  | { type: "correct"; target: string; patch: CorrectionPatch };
export type MatchEvent = EventDraft & { id: string; seq: number; at: string };
export type DeliveryEvent = Extract<MatchEvent, { type: "delivery" }>;
export type BallInput = { runs: number; boundary?: boolean; kind?: BallKind; runsAs?: RunsAs;
  wicket?: { kind: DismissalKind; playerOut?: string; fielderName?: string | null; fielderId?: string | null } };

export type Extras = { wides: number; noBalls: number; byes: number; legByes: number };
export type BatterLine = { playerId: string; runs: number; balls: number; fours: number; sixes: number; dots: number;
  out: { kind: DismissalKind | "retired_out"; bowler: string | null; fielderName: string | null; fielderId: string | null } | null;
  retiredHurt: boolean };
export type BowlerLine = { playerId: string; legalBalls: number; runs: number; wickets: number; wides: number; noBalls: number; maidens: number; dots: number };
export type FallOfWicket = { wicket: number; runs: number; legalBalls: number; playerId: string };
export type Partnership = { batters: [string, string | null]; runs: number; balls: number };
export type BallChip = { eventId: string; label: string };
export type OverSummary = { index: number; bowler: string; runs: number; wickets: number; balls: BallChip[] };
export type CommentaryItem = { eventId: string; ballLabel: string; bowler: string; batter: string; kind: BallKind;
  runs: number; runsAs: RunsAs; boundary: boolean; penalty: number; freeHit: boolean; wicket: Wicket | null };
export type InningsState = {
  number: 1 | 2; battingTeam: TeamSide; bowlingTeam: TeamSide;
  runs: number; wickets: number; legalBalls: number; extras: Extras;
  striker: string | null; nonStriker: string | null; bowler: string | null;
  batting: BatterLine[]; bowling: BowlerLine[]; fallOfWickets: FallOfWicket[];
  partnerships: Partnership[]; overs: OverSummary[]; commentary: CommentaryItem[];
  freeHit: boolean; ended: null | "overs" | "all_out" | "target" | "manual";
};
export type Result =
  | { kind: "won_by_runs"; winner: TeamSide; runs: number }
  | { kind: "won_by_wickets"; winner: TeamSide; wickets: number; ballsLeft: number }
  | { kind: "tie" };
export type Warning = { eventId: string } & (
  | { kind: "consecutive_overs"; bowler: string }
  | { kind: "bowler_quota"; bowler: string; quota: number }
  | { kind: "strike_mismatch" });
export type Prompt =
  | { kind: "start_innings"; innings: 1 | 2 } | { kind: "choose_batter" } | { kind: "choose_bowler" }
  | { kind: "all_out" } | { kind: "innings_over"; reason: "overs" | "target" };
export type MatchState = {
  title: string; teams: Record<TeamSide, { name: string }>; rules: Rules;
  toss: { winner: TeamSide; choice: "bat" | "bowl" } | null; players: Record<string, Player>;
  innings: InningsState[]; target: number | null;
  status: "setup" | "in_progress" | "innings_break" | "complete";
  result: Result | null; warnings: Warning[];
};
