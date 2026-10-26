import { t } from "@/lib/i18n";
import { formatChase, formatResult, formatScoreLine } from "@/lib/i18n/cricket";
import { chaseNeed } from "@/lib/scoring";
import type { InningsState, MatchState } from "@/lib/scoring";

function inningsLine(state: MatchState, innings: InningsState): string {
  const line = formatScoreLine(innings, state);
  const need = chaseNeed(state, innings);
  return need === null ? line : formatChase(line, need.needed, need.ballsLeft);
}

export function buildShareText(state: MatchState, url: string): string {
  const complete = state.status === "complete";
  const lines = [t("share.title", { teamA: state.teams.A.name, teamB: state.teams.B.name })];
  if (complete && state.result !== null) lines.push(formatResult(state.result, state.teams));
  lines.push(...state.innings.map((innings) => inningsLine(state, innings)));
  lines.push(t(complete ? "share.scorecard" : "share.live", { url }));
  return lines.join("\n");
}
