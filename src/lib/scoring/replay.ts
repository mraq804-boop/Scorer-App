import { EngineError, allOutWickets, bowlerQuota, defaultRules, otherSide } from "./rules";
import type {
  BatterLine,
  BowlerLine,
  DeliveryEvent,
  DismissalKind,
  InningsState,
  MatchEvent,
  MatchState,
  OverSummary,
  Result,
  Rules,
  Wicket,
} from "./types";
import { effectiveEvents } from "./undo";

type OpenOver = { summary: OverSummary; bowlers: string[]; charged: number };
type Context = { state: MatchState; over: OpenOver | null; lastOverBowlers: string[]; manualTarget: number | null };
type Dismissal = NonNullable<BatterLine["out"]>;

const BOWLER_WICKETS: ReadonlySet<DismissalKind> = new Set(["bowled", "caught", "lbw", "stumped", "hit_wicket"]);

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
  const ctx: Context = { state: emptyState(), over: null, lastOverBowlers: [], manualTarget: null };
  for (const event of effectiveEvents(events)) apply(ctx, event);
  return ctx.state;
}

export function currentInnings(state: MatchState): InningsState | null {
  const last = state.innings[state.innings.length - 1];
  return last !== undefined && last.ended === null ? last : null;
}

export function isLoneBatter(rules: Rules, innings: InningsState): boolean {
  return (
    rules.lastManStands &&
    innings.striker !== null &&
    innings.nonStriker === null &&
    innings.wickets >= rules.playersPerSide[innings.battingTeam] - 1
  );
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
    case "bowler_changed":
      changeBowler(ctx, event);
      return;
    case "strike_swapped": {
      const innings = currentInnings(state);
      if (innings !== null) swapEnds(state, innings);
      return;
    }
    case "batter_in":
      batterIn(ctx, event.player);
      return;
    case "retired":
      retire(ctx, event);
      return;
    case "settings_changed":
      changeSettings(ctx, event);
      return;
    case "innings_ended":
      endInnings(ctx, event);
      return;
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
    partnerships: [{ batters: [event.striker, event.nonStriker], runs: 0, balls: 0 }],
    overs: [],
    commentary: [],
    freeHit: false,
    ended: null,
  });
  state.status = "in_progress";
  ctx.over = null;
  ctx.lastOverBowlers = [];
}

function endInnings(ctx: Context, event: Extract<MatchEvent, { type: "innings_ended" }>): void {
  const { state } = ctx;
  const innings = state.innings.find((candidate) => candidate.number === event.innings);
  if (innings === undefined) throw new EngineError("no_innings");
  if (innings.ended !== null) return;

  innings.ended = event.reason;
  if (innings.number === 1) {
    state.status = "innings_break";
    refreshTarget(ctx);
    return;
  }
  state.status = "complete";
  state.result = matchResult(state, innings);
}

function refreshTarget(ctx: Context): void {
  const first = ctx.state.innings.find((innings) => innings.number === 1);
  const computed = first !== undefined && first.ended !== null ? first.runs + 1 : null;
  ctx.state.target = ctx.manualTarget ?? computed;
}

function matchResult(state: MatchState, chase: InningsState): Result | null {
  const { target, rules } = state;
  if (target === null) return null;
  if (chase.runs >= target) {
    return {
      kind: "won_by_wickets",
      winner: chase.battingTeam,
      wickets: allOutWickets(rules, chase.battingTeam) - chase.wickets,
      ballsLeft: rules.oversPerInnings * rules.ballsPerOver - chase.legalBalls,
    };
  }
  if (chase.runs === target - 1) return { kind: "tie" };
  return { kind: "won_by_runs", winner: chase.bowlingTeam, runs: target - 1 - chase.runs };
}

function changeSettings(ctx: Context, event: Extract<MatchEvent, { type: "settings_changed" }>): void {
  const { rules } = ctx.state;
  if (event.oversPerInnings !== undefined) rules.oversPerInnings = event.oversPerInnings;
  if (event.playersPerSide?.A !== undefined) rules.playersPerSide.A = event.playersPerSide.A;
  if (event.playersPerSide?.B !== undefined) rules.playersPerSide.B = event.playersPerSide.B;
  if (event.target !== undefined) {
    ctx.manualTarget = event.target;
    refreshTarget(ctx);
  }
}

function changeBowler(ctx: Context, event: Extract<MatchEvent, { type: "bowler_changed" }>): void {
  const { state } = ctx;
  const innings = currentInnings(state);
  if (innings === null) return;
  innings.bowler = event.player;

  if (ctx.lastOverBowlers.includes(event.player)) {
    state.warnings.push({ eventId: event.id, kind: "consecutive_overs", bowler: event.player });
  }
  const quota = bowlerQuota(state.rules);
  const bowled = innings.bowling.find((line) => line.playerId === event.player)?.legalBalls ?? 0;
  if (Math.floor(bowled / state.rules.ballsPerOver) >= quota) {
    state.warnings.push({ eventId: event.id, kind: "bowler_quota", bowler: event.player, quota });
  }
}

function applyDelivery(ctx: Context, event: DeliveryEvent): void {
  const innings = currentInnings(ctx.state);
  if (innings === null) throw new EngineError("no_innings");
  if (innings.striker !== event.striker) {
    ctx.state.warnings.push({ eventId: event.id, kind: "strike_mismatch" });
  }
  innings.striker = event.striker;
  innings.nonStriker = event.nonStriker;
  innings.bowler = event.bowler;
  const runsBefore = innings.runs;
  const ballsBefore = innings.legalBalls;

  if (event.kind === "wide") scoreWide(ctx, innings, event);
  else if (event.kind === "noball") scoreNoBall(ctx, innings, event);
  else scoreLegalBall(ctx, innings, event);

  creditPartnership(innings, innings.runs - runsBefore, innings.legalBalls - ballsBefore);
  if (event.wicket !== null) dismiss(ctx, innings, event.wicket, event.bowler);
  if (innings.legalBalls > ballsBefore) endOverIfComplete(ctx, innings);
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

  rotateStrike(ctx.state, innings, event.runs);
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

  rotateStrike(ctx.state, innings, event.runs);
  if (!ctx.state.rules.wideRebowled) {
    innings.legalBalls += 1;
    bowler.legalBalls += 1;
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
  rotateStrike(ctx.state, innings, event.runs);
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

function rotateStrike(state: MatchState, innings: InningsState, runs: number): void {
  if (runs % 2 !== 0) swapEnds(state, innings);
}

function endOverIfComplete(ctx: Context, innings: InningsState): void {
  if (innings.legalBalls % ctx.state.rules.ballsPerOver !== 0) return;
  swapEnds(ctx.state, innings);
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
  if (over !== null) ctx.lastOverBowlers = over.bowlers;
  ctx.over = null;
}

function chargeBowler(over: OpenOver, bowler: BowlerLine, runs: number): void {
  bowler.runs += runs;
  over.charged += runs;
}

function swapEnds(state: MatchState, innings: InningsState): void {
  if (isLoneBatter(state.rules, innings)) return;
  [innings.striker, innings.nonStriker] = [innings.nonStriker, innings.striker];
}

function creditPartnership(innings: InningsState, runs: number, balls: number): void {
  const open = innings.partnerships[innings.partnerships.length - 1];
  open.runs += runs;
  open.balls += balls;
}

function dismiss(ctx: Context, innings: InningsState, wicket: Wicket, bowlerId: string): void {
  const credited = BOWLER_WICKETS.has(wicket.kind);
  recordWicket(innings, wicket.playerOut, {
    kind: wicket.kind,
    bowler: credited ? bowlerId : null,
    fielderName: wicket.fielderName,
  });
  if (credited) bowlerLineFor(innings, bowlerId).wickets += 1;
  if (ctx.over !== null) ctx.over.summary.wickets += 1;

  vacateEnd(innings, wicket.playerOut);
  if (wicket.kind === "caught" && innings.nonStriker === null) swapEnds(ctx.state, innings);
  settleLastManStands(ctx.state, innings);
}

function retire(ctx: Context, event: Extract<MatchEvent, { type: "retired" }>): void {
  const innings = currentInnings(ctx.state);
  if (innings === null) return;
  if (event.how === "hurt") {
    batterLineFor(innings, event.player).retiredHurt = true;
    vacateEnd(innings, event.player);
    return;
  }
  recordWicket(innings, event.player, { kind: "retired_out", bowler: null, fielderName: null });
  vacateEnd(innings, event.player);
  settleLastManStands(ctx.state, innings);
}

function recordWicket(innings: InningsState, playerId: string, out: Dismissal): void {
  innings.wickets += 1;
  batterLineFor(innings, playerId).out = out;
  innings.fallOfWickets.push({
    wicket: innings.wickets,
    runs: innings.runs,
    legalBalls: innings.legalBalls,
    playerId,
  });
}

function vacateEnd(innings: InningsState, playerId: string): void {
  if (innings.striker === playerId) innings.striker = null;
  else if (innings.nonStriker === playerId) innings.nonStriker = null;
}

function settleLastManStands(state: MatchState, innings: InningsState): void {
  const { rules } = state;
  if (!rules.lastManStands || innings.wickets !== rules.playersPerSide[innings.battingTeam] - 1) return;
  const lone = innings.striker ?? innings.nonStriker;
  if (lone === null || (innings.striker !== null && innings.nonStriker !== null)) return;
  innings.striker = lone;
  innings.nonStriker = null;
  innings.partnerships.push({ batters: [lone, null], runs: 0, balls: 0 });
}

function batterIn(ctx: Context, playerId: string): void {
  const innings = currentInnings(ctx.state);
  if (innings === null || (innings.striker !== null && innings.nonStriker !== null)) return;

  batterLineFor(innings, playerId).retiredHurt = false;
  const partner = innings.striker ?? innings.nonStriker;
  if (innings.striker === null) innings.striker = playerId;
  else innings.nonStriker = playerId;
  innings.partnerships.push({
    batters: partner === null ? [playerId, null] : [partner, playerId],
    runs: 0,
    balls: 0,
  });
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
