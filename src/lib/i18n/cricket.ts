import { formatOvers, playerName } from "@/lib/scoring";
import type { BatterLine, BowlerLine, CommentaryItem, InningsState, MatchState, Player, Result, Warning } from "@/lib/scoring";
import { t } from "./index";

type Unit = "run" | "bye" | "legBye" | "wicket" | "ball" | "over";

function count(unit: Unit, n: number): string {
  return t(`unit.${unit}.${n === 1 ? "one" : "other"}`, { n });
}

function runsOutcome(item: CommentaryItem): string | null {
  if (item.runs === 0) return null;
  if (item.kind !== "wide" && item.runsAs === "bye") return count("bye", item.runs);
  if (item.kind !== "wide" && item.runsAs === "legbye") return count("legBye", item.runs);
  if (item.boundary && item.runs === 4) return t("commentary.four");
  if (item.boundary && item.runs === 6) return t("commentary.six");
  return count("run", item.runs);
}

function outcomes(item: CommentaryItem): string[] {
  const parts: string[] = [];
  if (item.kind === "wide") parts.push(t("commentary.wide"));
  if (item.kind === "noball") parts.push(t("commentary.noBall"));
  const runs = runsOutcome(item);
  if (runs !== null) parts.push(runs);
  else if (item.kind === "legal" && item.wicket === null) parts.push(t("commentary.noRun"));
  if (item.wicket !== null) parts.push(t("commentary.out"));
  return parts;
}

export function formatCommentary(item: CommentaryItem, players: Record<string, Player>): string {
  return t("commentary.line", {
    ball: item.ballLabel,
    bowler: playerName(players, item.bowler),
    batter: playerName(players, item.batter),
    outcome: outcomes(item).join(t("commentary.separator")),
  });
}

export function formatResult(result: Result, teams: MatchState["teams"]): string {
  switch (result.kind) {
    case "won_by_runs":
      return t("result.wonByRuns", { team: teams[result.winner].name, margin: count("run", result.runs) });
    case "won_by_wickets":
      return t("result.wonByWickets", {
        team: teams[result.winner].name,
        margin: count("wicket", result.wickets),
        left: count("ball", result.ballsLeft),
      });
    case "tie":
      return t("result.tie");
  }
}

export function formatScoreLine(innings: InningsState, state: MatchState): string {
  return t("score.line", {
    team: state.teams[innings.battingTeam].name,
    runs: innings.runs,
    wickets: innings.wickets,
    overs: formatOvers(innings.legalBalls, state.rules.ballsPerOver),
  });
}

export function formatWarning(warning: Warning, players: Record<string, Player>): string {
  switch (warning.kind) {
    case "consecutive_overs":
      return t("warning.consecutiveOvers", { bowler: playerName(players, warning.bowler) });
    case "bowler_quota":
      return t("warning.bowlerQuota", { bowler: playerName(players, warning.bowler), overs: count("over", warning.quota) });
    case "strike_mismatch":
      return t("warning.strikeMismatch");
  }
}

export function formatNeed(runs: number, ballsLeft: number): string {
  return t("score.need", { runs, balls: count("ball", ballsLeft) });
}

export function formatChase(line: string, runs: number, ballsLeft: number): string {
  return t("share.chase", { line, runs, balls: count("ball", ballsLeft) });
}

export function formatFigures(line: BowlerLine, ballsPerOver: number): string {
  return t("score.figures", {
    overs: formatOvers(line.legalBalls, ballsPerOver),
    maidens: line.maidens,
    runs: line.runs,
    wickets: line.wickets,
  });
}

export function formatDismissal(line: BatterLine, players: Record<string, Player>): string {
  const { out } = line;
  if (out === null) return t(line.retiredHurt ? "dismissal.text.retiredHurt" : "dismissal.text.notOut");
  const bowler = out.bowler === null ? "" : playerName(players, out.bowler);
  const fielder = out.fielderName ?? "";
  const withFielder = out.fielderName !== null;
  switch (out.kind) {
    case "bowled":
      return t("dismissal.text.bowled", { bowler });
    case "caught":
      return withFielder ? t("dismissal.text.caught", { fielder, bowler }) : t("dismissal.text.caughtNoFielder", { bowler });
    case "lbw":
      return t("dismissal.text.lbw", { bowler });
    case "run_out":
      return withFielder ? t("dismissal.text.runOut", { fielder }) : t("dismissal.text.runOutNoFielder");
    case "stumped":
      return withFielder ? t("dismissal.text.stumped", { fielder, bowler }) : t("dismissal.text.stumpedNoFielder", { bowler });
    case "hit_wicket":
      return t("dismissal.text.hitWicket", { bowler });
    case "retired_out":
      return t("dismissal.text.retiredOut");
    case "other":
      return t("dismissal.text.other");
  }
}
