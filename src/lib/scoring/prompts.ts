import { currentInnings, isLoneBatter } from "./replay";
import type { InningsState, MatchState, Prompt, Rules } from "./types";

function isAllOut(rules: Rules, innings: InningsState): boolean {
  const players = rules.playersPerSide[innings.battingTeam];
  return innings.wickets >= (rules.lastManStands ? players : players - 1);
}

function needsBatter(rules: Rules, innings: InningsState): boolean {
  return (innings.striker === null || innings.nonStriker === null) && !isLoneBatter(rules, innings);
}

export function nextPrompt(state: MatchState): Prompt | null {
  if (state.status === "setup") return { kind: "start_innings", innings: 1 };
  const innings = currentInnings(state);
  if (innings === null) return null;
  if (isAllOut(state.rules, innings)) return { kind: "all_out" };
  if (needsBatter(state.rules, innings)) return { kind: "choose_batter" };
  if (innings.bowler === null) return { kind: "choose_bowler" };
  return null;
}
