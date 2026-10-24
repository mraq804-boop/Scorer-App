import { currentInnings, isLoneBatter } from "./replay";
import { allOutWickets } from "./rules";
import type { InningsState, MatchState, Prompt, Rules } from "./types";

function isAllOut(rules: Rules, innings: InningsState): boolean {
  return innings.wickets >= allOutWickets(rules, innings.battingTeam);
}

function inningsOverReason(state: MatchState, innings: InningsState): "overs" | "target" | null {
  const { rules, target } = state;
  if (innings.legalBalls >= rules.oversPerInnings * rules.ballsPerOver) return "overs";
  if (innings.number === 2 && target !== null && innings.runs >= target) return "target";
  return null;
}

function needsBatter(rules: Rules, innings: InningsState): boolean {
  return (innings.striker === null || innings.nonStriker === null) && !isLoneBatter(rules, innings);
}

export function nextPrompt(state: MatchState): Prompt | null {
  if (state.status === "setup") return { kind: "start_innings", innings: 1 };
  if (state.status === "innings_break") return { kind: "start_innings", innings: 2 };
  const innings = currentInnings(state);
  if (innings === null) return null;
  if (isAllOut(state.rules, innings)) return { kind: "all_out" };
  const overReason = inningsOverReason(state, innings);
  if (overReason !== null) return { kind: "innings_over", reason: overReason };
  if (needsBatter(state.rules, innings)) return { kind: "choose_batter" };
  if (innings.bowler === null) return { kind: "choose_bowler" };
  return null;
}
