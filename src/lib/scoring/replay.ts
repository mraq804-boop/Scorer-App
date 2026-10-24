import { EngineError, defaultRules, otherSide } from "./rules";
import type {
  BatterLine,
  BowlerLine,
  DeliveryEvent,
  InningsState,
  MatchEvent,
  MatchState,
  OverSummary,
} from "./types";

type OpenOver = { summary: OverSummary; bowlers: string[]; charged: number };
type Context = { state: MatchState; over: OpenOver | null };

function emptyState(): MatchState {
  return {
    title: "",
    teams: { A: { name: "" }, B: { name: "" } },
    rules: defaultRules("tape", 10),
    toss: null,
    players: {},
    innings: [],
    target: null,
    status: "setup",
    result: null,
    warnings: [],
  };
}

export function replay(events: readonly MatchEvent[]): MatchState {
  const ctx: Context = { state: emptyState(), over: null };
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) apply(ctx, event);
  return ctx.state;
}

export function currentInnings(state: MatchState): InningsState | null {
  const last = state.innings[state.innings.length - 1];
  return last !== undefined && last.ended === null ? last : null;
}

function apply(ctx: Context, event: MatchEvent): void {
  const { state } = ctx;
  switch (event.type) {
    case "match_created":
      state.title = event.title;
      state.teams = { A: { ...event.teams.A }, B: { ...event.teams.B } };
      state.rules = { ...event.rules, playersPerSide: { ...event.rules.playersPerSide } };
      state.toss = { ...event.toss };
      return;
    case "player_added":
      state.players[event.player.id] = { ...event.player };
      return;
    case "innings_started":
      startInnings(ctx, event);
      return;
    case "delivery":
      applyDelivery(ctx, event);
      return;
    case "bowler_changed": {
      const innings = currentInnings(state);
      if (innings !== null) innings.bowler = event.player;
      return;
    }
    case "strike_swapped": {
      const innings = currentInnings(state);
      if (innings !== null) swapEnds(innings);
      return;
    }
    default:
      return;
  }
}

function startInnings(ctx: Context, event: Extract<MatchEvent, { type: "innings_started" }>): void {
  const { state } = ctx;
  if (state.innings.some((innings) => innings.number === event.innings)) {
    throw new EngineError("innings_started_twice");
  }
  state.innings.push({
    number: event.innings,
    battingTeam: event.battingTeam,
    bowlingTeam: otherSide(event.battingTeam),
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0 },
    striker: event.striker,
    nonStriker: event.nonStriker,
    bowler: event.bowler,
    batting: [newBatter(event.striker), newBatter(event.nonStriker)],
    bowling: [],
    fallOfWickets: [],
    partnerships: [],
    overs: [],
    commentary: [],
    freeHit: false,
    ended: null,
  });
  state.status = "in_progress";
  ctx.over = null;
}

function applyDelivery(ctx: Context, event: DeliveryEvent): void {
  const innings = currentInnings(ctx.state);
  if (innings === null) throw new EngineError("no_innings");
  if (event.kind === "wide") scoreWide(ctx, innings, event);
  else if (event.kind === "noball") scoreNoBall(ctx, innings, event);
  else scoreLegalBall(ctx, innings, event);
}

function scoreLegalBall(ctx: Context, innings: InningsState, event: DeliveryEvent): void {
  const over = openOver(ctx, innings, event.bowler);
  const batter = batterLineFor(innings, event.striker);
  const bowler = bowlerLineFor(innings, event.bowler);
  const offBat = runsOffBat(event);

  innings.runs += event.runs;
  over.summary.runs += event.runs;
  innings.legalBalls += 1;
  innings.freeHit = false;
  batter.balls += 1;
  bowler.legalBalls += 1;

  creditBatter(batter, event);
  if (offBat === 0) batter.dots += 1;
  creditByes(innings, event);

  chargeBowler(over, bowler, offBat);
  if (offBat === 0) bowler.dots += 1;

  rotateStrike(innings, event.runs);
  endOverIfComplete(ctx, innings);
}

function scoreWide(ctx: Context, innings: InningsState, event: DeliveryEvent): void {
  const over = openOver(ctx, innings, event.bowler);
  const bowler = bowlerLineFor(innings, event.bowler);
  const total = event.penalty + event.runs;

  innings.runs += total;
  over.summary.runs += total;
  innings.extras.wides += total;
  bowler.wides += 1;
  chargeBowler(over, bowler, total);

  rotateStrike(innings, event.runs);
  if (!ctx.state.rules.wideRebowled) {
    innings.legalBalls += 1;
    bowler.legalBalls += 1;
    endOverIfComplete(ctx, innings);
  }
}

function scoreNoBall(ctx: Context, innings: InningsState, event: DeliveryEvent): void {
  const over = openOver(ctx, innings, event.bowler);
  const batter = batterLineFor(innings, event.striker);
  const bowler = bowlerLineFor(innings, event.bowler);

  innings.runs += event.penalty + event.runs;
  over.summary.runs += event.penalty + event.runs;
  innings.extras.noBalls += event.penalty;
  batter.balls += 1;
  bowler.noBalls += 1;

  creditBatter(batter, event);
  creditByes(innings, event);
  chargeBowler(over, bowler, event.penalty + runsOffBat(event));

  if (ctx.state.rules.freeHit) innings.freeHit = true;
  rotateStrike(innings, event.runs);
}

function runsOffBat(event: DeliveryEvent): number {
  return event.runsAs === "bat" ? event.runs : 0;
}

function creditBatter(batter: BatterLine, event: DeliveryEvent): void {
  batter.runs += runsOffBat(event);
  if (event.boundary && event.runsAs === "bat") {
    if (event.runs === 4) batter.fours += 1;
    else if (event.runs === 6) batter.sixes += 1;
  }
}

function creditByes(innings: InningsState, event: DeliveryEvent): void {
  if (event.runsAs === "bye") innings.extras.byes += event.runs;
  else if (event.runsAs === "legbye") innings.extras.legByes += event.runs;
}

function rotateStrike(innings: InningsState, runs: number): void {
  if (runs % 2 !== 0) swapEnds(innings);
}

function endOverIfComplete(ctx: Context, innings: InningsState): void {
  if (innings.legalBalls % ctx.state.rules.ballsPerOver !== 0) return;
  swapEnds(innings);
  innings.bowler = null;
  closeOver(ctx, innings);
}

function openOver(ctx: Context, innings: InningsState, bowler: string): OpenOver {
  let over = ctx.over;
  if (over === null) {
    const summary: OverSummary = {
      index: Math.floor(innings.legalBalls / ctx.state.rules.ballsPerOver),
      bowler,
      runs: 0,
      wickets: 0,
      balls: [],
    };
    innings.overs.push(summary);
    over = { summary, bowlers: [], charged: 0 };
    ctx.over = over;
  }
  if (!over.bowlers.includes(bowler)) over.bowlers.push(bowler);
  return over;
}

function closeOver(ctx: Context, innings: InningsState): void {
  const over = ctx.over;
  if (over !== null && over.bowlers.length === 1 && over.charged === 0) {
    bowlerLineFor(innings, over.bowlers[0]).maidens += 1;
  }
  ctx.over = null;
}

function chargeBowler(over: OpenOver, bowler: BowlerLine, runs: number): void {
  bowler.runs += runs;
  over.charged += runs;
}

function swapEnds(innings: InningsState): void {
  [innings.striker, innings.nonStriker] = [innings.nonStriker, innings.striker];
}

function newBatter(playerId: string): BatterLine {
  return { playerId, runs: 0, balls: 0, fours: 0, sixes: 0, dots: 0, out: null, retiredHurt: false };
}

function batterLineFor(innings: InningsState, playerId: string): BatterLine {
  let line = innings.batting.find((l) => l.playerId === playerId);
  if (line === undefined) {
    line = newBatter(playerId);
    innings.batting.push(line);
  }
  return line;
}

function bowlerLineFor(innings: InningsState, playerId: string): BowlerLine {
  let line = innings.bowling.find((l) => l.playerId === playerId);
  if (line === undefined) {
    line = { playerId, legalBalls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0, maidens: 0, dots: 0 };
    innings.bowling.push(line);
  }
  return line;
}
