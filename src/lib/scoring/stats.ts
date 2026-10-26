import type { BallChip, CommentaryItem, DeliveryEvent, InningsState, MatchState, Player } from "./types";

export function formatOvers(legalBalls: number, ballsPerOver: number): string {
  const overs = Math.floor(legalBalls / ballsPerOver);
  const balls = legalBalls % ballsPerOver;
  return balls === 0 ? String(overs) : `${overs}.${balls}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function perOver(runs: number, balls: number, ballsPerOver: number): number {
  return balls === 0 ? 0 : round2((runs * ballsPerOver) / balls);
}

export function strikeRate(runs: number, balls: number): number {
  return balls === 0 ? 0 : round2((runs * 100) / balls);
}

export function economy(runs: number, legalBalls: number, ballsPerOver: number): number {
  return perOver(runs, legalBalls, ballsPerOver);
}

export function runRate(runs: number, legalBalls: number, ballsPerOver: number): number {
  return perOver(runs, legalBalls, ballsPerOver);
}

export function requiredRunRate(needed: number, ballsLeft: number, ballsPerOver: number): number | null {
  return ballsLeft <= 0 ? null : round2((needed * ballsPerOver) / ballsLeft);
}

export function chaseNeed(state: MatchState, innings: InningsState): { needed: number; ballsLeft: number } | null {
  if (innings.number !== 2 || innings.ended !== null || state.target === null) return null;
  const needed = state.target - innings.runs;
  const ballsLeft = state.rules.oversPerInnings * state.rules.ballsPerOver - innings.legalBalls;
  return needed > 0 && ballsLeft > 0 ? { needed, ballsLeft } : null;
}

export function playerName(players: Record<string, Player>, id: string): string {
  return players[id]?.name ?? id;
}

export function dotBallPct(innings: InningsState): number {
  if (innings.legalBalls === 0) return 0;
  const dots = innings.commentary.filter((item) => item.kind === "legal" && item.runs + item.penalty === 0).length;
  return round2((dots * 100) / innings.legalBalls);
}

export function boundaryPct(innings: InningsState): number {
  if (innings.runs === 0) return 0;
  const boundaryRuns = innings.batting.reduce((sum, line) => sum + line.fours * 4 + line.sixes * 6, 0);
  return round2((boundaryRuns * 100) / innings.runs);
}

export function chipLabel(delivery: DeliveryEvent): string {
  const { kind, runs, runsAs } = delivery;
  if (delivery.wicket !== null) return "W";
  if (kind === "wide") {
    const total = delivery.penalty + runs;
    return total === 1 ? "wd" : `${total}wd`;
  }
  if (kind === "noball") return runs === 0 ? "nb" : `${runs}nb`;
  if (runs === 0 || runsAs === "bat") return String(runs);
  return runsAs === "bye" ? `${runs}b` : `${runs}lb`;
}

export function ballChip(delivery: DeliveryEvent): BallChip {
  return { eventId: delivery.id, label: chipLabel(delivery) };
}

export function commentaryItem(
  delivery: DeliveryEvent,
  legalBallsBefore: number,
  ballsPerOver: number,
  freeHit: boolean,
): CommentaryItem {
  const over = Math.floor(legalBallsBefore / ballsPerOver);
  const ball = (legalBallsBefore % ballsPerOver) + 1;
  return {
    eventId: delivery.id,
    ballLabel: `${over}.${ball}`,
    bowler: delivery.bowler,
    batter: delivery.striker,
    kind: delivery.kind,
    runs: delivery.runs,
    runsAs: delivery.runsAs,
    boundary: delivery.boundary,
    penalty: delivery.penalty,
    freeHit,
    wicket: delivery.wicket === null ? null : { ...delivery.wicket },
  };
}
