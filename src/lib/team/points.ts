import type { PlayerMatchStats } from "./types";

export const POINTS_PER_RUN = 1;
export const POINTS_PER_FOUR = 1;
export const POINTS_PER_SIX = 2;
export const THIRTY_RUNS = 30;
export const FIFTY_RUNS = 50;
export const POINTS_THIRTY = 10;
export const POINTS_FIFTY = 20;
export const POINTS_PER_WICKET = 20;
export const POINTS_PER_MAIDEN = 10;
export const POINTS_PER_DOT = 1;
export const POINTS_PER_FIELDING = 10;

function milestoneBonus(runs: number): number {
  if (runs >= FIFTY_RUNS) return POINTS_FIFTY;
  return runs >= THIRTY_RUNS ? POINTS_THIRTY : 0;
}

export function matchPoints(p: PlayerMatchStats): number {
  const { batting, bowling, fielding } = p;
  const battingPoints =
    batting === null
      ? 0
      : batting.runs * POINTS_PER_RUN +
        batting.fours * POINTS_PER_FOUR +
        batting.sixes * POINTS_PER_SIX +
        milestoneBonus(batting.runs);
  const bowlingPoints =
    bowling === null
      ? 0
      : bowling.wickets * POINTS_PER_WICKET + bowling.maidens * POINTS_PER_MAIDEN + bowling.dots * POINTS_PER_DOT;
  const fieldingPoints = (fielding.catches + fielding.runOuts + fielding.stumpings) * POINTS_PER_FIELDING;
  return battingPoints + bowlingPoints + fieldingPoints;
}
