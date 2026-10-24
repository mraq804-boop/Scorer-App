import { formatResult, formatScoreLine } from "@/lib/i18n/cricket";
import type { MatchState } from "@/lib/scoring";

export type MatchSummary = {
  title: string;
  teams: [string, string];
  status: MatchState["status"];
  lines: string[];
  result: string | null;
};

export function summarize(state: MatchState): MatchSummary {
  return {
    title: state.title,
    teams: [state.teams.A.name, state.teams.B.name],
    status: state.status,
    lines: state.innings.map((innings) => formatScoreLine(innings, state)),
    result: state.result === null ? null : formatResult(state.result, state.teams),
  };
}
