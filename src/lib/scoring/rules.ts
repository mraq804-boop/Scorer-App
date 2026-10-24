import type { BallType, Rules, TeamSide } from "./types";

export type EngineErrorCode = "no_innings" | "innings_started_twice" | "no_striker" | "no_bowler";

export class EngineError extends Error {
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode) {
    super(code);
    this.name = "EngineError";
    this.code = code;
  }
}

export function defaultRules(ballType: BallType, overs: number): Rules {
  return {
    ballType,
    oversPerInnings: overs,
    ballsPerOver: 6,
    playersPerSide: { A: 11, B: 11 },
    wideRuns: 1,
    wideRebowled: true,
    noBallRuns: 1,
    freeHit: true,
    lbw: ballType === "hard",
    lastManStands: false,
  };
}

export function bowlerQuota(rules: Rules): number {
  return Math.ceil(rules.oversPerInnings / 5);
}

export function allOutWickets(rules: Rules, side: TeamSide): number {
  const players = rules.playersPerSide[side];
  return rules.lastManStands ? players : players - 1;
}

export function otherSide(side: TeamSide): TeamSide {
  return side === "A" ? "B" : "A";
}
