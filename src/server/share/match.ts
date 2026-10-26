import "server-only";
import { CODE_RE } from "@/lib/local/code";
import { replay } from "@/lib/scoring";
import type { MatchState } from "@/lib/scoring";
import { getLiveMatch } from "@/server/live";

export type SharedMatch = { code: string; state: MatchState };

export async function loadSharedMatch(code: string): Promise<SharedMatch | null> {
  if (!CODE_RE.test(code)) return null;
  const live = await getLiveMatch(code);
  return live === null ? null : { code, state: replay(live.events) };
}
