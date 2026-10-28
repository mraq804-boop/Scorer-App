import type { DismissalKind, InningsState } from "@/lib/scoring";

const CREDITED: ReadonlySet<DismissalKind> = new Set(["bowled", "caught", "lbw", "stumped", "hit_wicket"]);
const HAT_TRICK = 3;

export function hatTricksIn(innings: InningsState): Map<string, number> {
  const streaks = new Map<string, number>();
  const hatTricks = new Map<string, number>();
  for (const ball of innings.commentary) {
    if (ball.kind !== "legal") continue;
    if (ball.wicket === null || !CREDITED.has(ball.wicket.kind)) {
      streaks.set(ball.bowler, 0);
      continue;
    }
    const streak = (streaks.get(ball.bowler) ?? 0) + 1;
    if (streak === HAT_TRICK) {
      hatTricks.set(ball.bowler, (hatTricks.get(ball.bowler) ?? 0) + 1);
      streaks.set(ball.bowler, 0);
    } else {
      streaks.set(ball.bowler, streak);
    }
  }
  return hatTricks;
}
