import "server-only";
import { CODE_RE } from "@/lib/local/code";
import { replay } from "@/lib/scoring";
import type { MatchState, TeamSide } from "@/lib/scoring";
import { getLiveMatch } from "@/server/live";

export type MatchBrand = {
  side: TeamSide;
  colour: string | null;
  logoUrl: string | null;
  potmPlayerId: string | null;
  resultOverride: "no_result" | null;
  xi: string[];
  photoUrlOf: (playerId: string) => string | null;
} | null;

export type SharedMatch = { code: string; state: MatchState; brand: MatchBrand };

export async function loadSharedMatch(code: string): Promise<SharedMatch | null> {
  if (!CODE_RE.test(code)) return null;
  const live = await getLiveMatch(code);
  return live === null ? null : { code, state: replay(live.events), brand: null };
}
