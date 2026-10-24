import { currentInnings } from "./replay";
import type { BallKind, DismissalKind, MatchState } from "./types";

export type AvailableDismissal = DismissalKind | "retired_hurt" | "retired_out";

const ALL: readonly AvailableDismissal[] = [
  "bowled",
  "caught",
  "lbw",
  "run_out",
  "stumped",
  "hit_wicket",
  "other",
  "retired_hurt",
  "retired_out",
];

const ON_WIDE: readonly AvailableDismissal[] = [
  "stumped",
  "run_out",
  "hit_wicket",
  "other",
  "retired_hurt",
  "retired_out",
];

const RESTRICTED: ReadonlySet<AvailableDismissal> = new Set(["run_out", "other", "retired_hurt", "retired_out"]);

export function availableDismissals(state: MatchState, kind: BallKind): AvailableDismissal[] {
  const freeHit = currentInnings(state)?.freeHit ?? false;
  const candidates = kind === "wide" ? ON_WIDE : ALL;
  return candidates.filter((dismissal) => {
    if (dismissal === "lbw" && !state.rules.lbw) return false;
    if (freeHit || kind === "noball") return RESTRICTED.has(dismissal);
    return true;
  });
}
