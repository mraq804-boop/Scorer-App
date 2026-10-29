import type { LocalMatch } from "@/lib/local/db";

export type HomeSection = "live" | "recent";
export type TeamPill = "W" | "L" | "T" | "NR";

export function matchSection(match: Pick<LocalMatch, "summary">): HomeSection {
  const { status } = match.summary;
  return status === "in_progress" || status === "innings_break" ? "live" : "recent";
}

export function teamPill(match: Pick<LocalMatch, "summary" | "team">): TeamPill | null {
  const { team, summary } = match;
  if (team === undefined || summary.status !== "complete" || summary.winner === undefined) return null;
  if (summary.winner === null) return "NR";
  if (summary.winner === "tie") return "T";
  return summary.winner === team.side ? "W" : "L";
}
