import type { LocalMatch } from "@/lib/local/db";

export type HomeSection = "live" | "recent";
export type TeamPill = "W" | "L" | "T" | "NR";

const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export function matchSection(match: Pick<LocalMatch, "summary" | "syncState" | "updatedAt">, now: number): HomeSection {
  const { status } = match.summary;
  const unfinished = status === "in_progress" || status === "innings_break";
  const recent = now - Date.parse(match.updatedAt) < STALE_AFTER_MS;
  return unfinished && recent && match.syncState !== "blocked" ? "live" : "recent";
}

export function teamPill(match: Pick<LocalMatch, "summary" | "team">): TeamPill | null {
  const { team, summary } = match;
  if (team === undefined || summary.status !== "complete" || summary.winner === undefined) return null;
  if (summary.winner === null) return "NR";
  if (summary.winner === "tie") return "T";
  return summary.winner === team.side ? "W" : "L";
}
