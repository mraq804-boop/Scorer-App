import { formatOvers } from "@/lib/scoring";
import type { CommentaryItem, InningsState, MatchState, Player, Result } from "@/lib/scoring";
import { t } from "./index";

type Unit = "run" | "bye" | "legBye" | "wicket" | "ball";

function count(unit: Unit, n: number): string {
  return t(`unit.${unit}.${n === 1 ? "one" : "other"}`, { n });
}

function playerName(players: Record<string, Player>, id: string): string {
  return players[id]?.name ?? id;
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
