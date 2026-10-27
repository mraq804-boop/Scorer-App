import { FIFTY_RUNS, THIRTY_RUNS, matchPoints } from "./points";
import { seasonOf } from "./seasons";
import type {
  LeaderboardKey,
  LeaderboardRow,
  PlayerMatchStats,
  PlayerTotals,
  Season,
  SquadPlayer,
  TeamMatch,
  TeamMatchRecord,
  TeamRecord,
  TeamStats,
} from "./types";

export const MIN_INNINGS_FOR_AVERAGE = 3;
export const MIN_BALLS_FOR_STRIKE_RATE = 30;
export const MIN_LEGAL_BALLS_FOR_ECONOMY = 60;
export const LEADERBOARD_SIZE = 5;
const ECONOMY_BALLS_PER_OVER = 6;

type Filter = { seasonId: string | null; seasons: Season[]; timeZone: string };
type CountedMatch = TeamMatch & { record: TeamMatchRecord };
type Appearance = { stats: PlayerMatchStats; points: number };
type Counted = { match: CountedMatch; appearances: Appearance[] };
type Award = { playerId: string; suggested: boolean };
type NameOrder = (a: string, b: string) => number;
type RowOrder = (a: LeaderboardRow, b: LeaderboardRow) => number;
type RowPick = (p: PlayerTotals) => Omit<LeaderboardRow, "playerId"> | null;

function isCounted(match: TeamMatch): match is CountedMatch {
  return match.record !== null && (match.status === "complete" || match.resultOverride === "no_result");
}

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function nameOrder(squad: SquadPlayer[]): NameOrder {
  const names = new Map(squad.map((player) => [player.id, player.name]));
  return (idA, idB) => {
    const a = names.get(idA) ?? "";
    const b = names.get(idB) ?? "";
    return compareText(a.toLowerCase(), b.toLowerCase()) || compareText(a, b) || compareText(idA, idB);
  };
}

function didNotPlay(playerId: string): PlayerMatchStats {
  return { playerId, batting: null, bowling: null, fielding: { catches: 0, runOuts: 0, stumpings: 0 } };
}

function appearancesIn(record: TeamMatchRecord, squadIds: Set<string>): Appearance[] {
  const recorded = new Map(record.players.map((stats) => [stats.playerId, stats]));
  const playerIds = new Set([...record.xi, ...recorded.keys()]);
  return [...playerIds]
    .filter((playerId) => squadIds.has(playerId))
    .map((playerId) => {
      const stats = recorded.get(playerId) ?? didNotPlay(playerId);
      return { stats, points: matchPoints(stats) };
    });
}

function runsOf(appearance: Appearance): number {
  return appearance.stats.batting?.runs ?? 0;
}

function pickPotm(
  match: CountedMatch,
  appearances: Appearance[],
  squadIds: Set<string>,
  order: NameOrder,
): Award | null {
  const override = match.potmPlayerId;
  if (override !== null && squadIds.has(override)) return { playerId: override, suggested: false };

  const ranked = [...appearances].sort(
    (a, b) => b.points - a.points || runsOf(b) - runsOf(a) || order(a.stats.playerId, b.stats.playerId),
  );
  const top = ranked[0];
  return top !== undefined && top.points > 0 ? { playerId: top.stats.playerId, suggested: true } : null;
}

function emptyTotals(playerId: string): PlayerTotals {
  return {
    playerId,
    matches: 0,
    innings: 0,
    notOuts: 0,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    highest: null,
    thirties: 0,
    fifties: 0,
    average: null,
    strikeRate: null,
    legalBalls: 0,
    maidens: 0,
    runsConceded: 0,
    wickets: 0,
    dots: 0,
    economy: null,
    best: null,
    catches: 0,
    runOuts: 0,
    stumpings: 0,
    points: 0,
    potmAwards: 0,
  };
}

function addBatting(totals: PlayerTotals, batting: NonNullable<PlayerMatchStats["batting"]>): void {
  totals.innings += 1;
  totals.runs += batting.runs;
  totals.balls += batting.balls;
  totals.fours += batting.fours;
  totals.sixes += batting.sixes;
  if (batting.notOut) totals.notOuts += 1;
  if (batting.runs >= FIFTY_RUNS) totals.fifties += 1;
  else if (batting.runs >= THIRTY_RUNS) totals.thirties += 1;

  const { highest } = totals;
  const higher =
    highest === null ||
    batting.runs > highest.runs ||
    (batting.runs === highest.runs && batting.notOut && !highest.notOut);
  if (higher) totals.highest = { runs: batting.runs, notOut: batting.notOut };
}

function addBowling(totals: PlayerTotals, bowling: NonNullable<PlayerMatchStats["bowling"]>): void {
  totals.legalBalls += bowling.legalBalls;
  totals.runsConceded += bowling.runs;
  totals.wickets += bowling.wickets;
  totals.maidens += bowling.maidens;
  totals.dots += bowling.dots;

  const { best } = totals;
  const better =
    best === null ||
    bowling.wickets > best.wickets ||
    (bowling.wickets === best.wickets && bowling.runs < best.runs);
  if (better) totals.best = { wickets: bowling.wickets, runs: bowling.runs };
}

function addAppearance(totals: PlayerTotals, { stats, points }: Appearance): void {
  totals.matches += 1;
  totals.points += points;
  if (stats.batting !== null) addBatting(totals, stats.batting);
  if (stats.bowling !== null) addBowling(totals, stats.bowling);
  totals.catches += stats.fielding.catches;
  totals.runOuts += stats.fielding.runOuts;
  totals.stumpings += stats.fielding.stumpings;
}

function addRates(totals: PlayerTotals): void {
  const dismissals = totals.innings - totals.notOuts;
  if (totals.innings >= MIN_INNINGS_FOR_AVERAGE && dismissals > 0) totals.average = totals.runs / dismissals;
  if (totals.balls >= MIN_BALLS_FOR_STRIKE_RATE) totals.strikeRate = (totals.runs * 100) / totals.balls;
  if (totals.legalBalls >= MIN_LEGAL_BALLS_FOR_ECONOMY) {
    totals.economy = (totals.runsConceded * ECONOMY_BALLS_PER_OVER) / totals.legalBalls;
  }
}

function recordOf(matches: CountedMatch[]): TeamRecord {
  const record: TeamRecord = { played: 0, won: 0, lost: 0, tied: 0, noResult: 0 };
  for (const match of matches) {
    record.played += 1;
    const outcome = match.resultOverride === "no_result" ? null : match.record.outcome;
    if (outcome === "won") record.won += 1;
    else if (outcome === "lost") record.lost += 1;
    else if (outcome === "tied") record.tied += 1;
    else record.noResult += 1;
  }
  return record;
}

function board(players: PlayerTotals[], pick: RowPick, compare: RowOrder, order: NameOrder): LeaderboardRow[] {
  const rows: LeaderboardRow[] = [];
  for (const player of players) {
    const row = pick(player);
    if (row !== null) rows.push({ playerId: player.playerId, ...row });
  }
  rows.sort((a, b) => compare(a, b) || order(a.playerId, b.playerId));
  return rows.slice(0, LEADERBOARD_SIZE);
}

const highestFirst: RowOrder = (a, b) => b.value - a.value;
const lowestFirst: RowOrder = (a, b) => a.value - b.value;
const bestFigures: RowOrder = (a, b) => b.value - a.value || (a.runs ?? 0) - (b.runs ?? 0);

function counting(value: number): { value: number } | null {
  return value > 0 ? { value } : null;
}

function rated(value: number | null): { value: number } | null {
  return value === null ? null : { value };
}

function leaderboardsOf(players: PlayerTotals[], order: NameOrder): Record<LeaderboardKey, LeaderboardRow[]> {
  const build = (pick: RowPick, compare: RowOrder = highestFirst) => board(players, pick, compare, order);
  return {
    runs: build((p) => counting(p.runs)),
    wickets: build((p) => counting(p.wickets)),
    highest: build((p) =>
      p.highest !== null && p.highest.runs > 0 ? { value: p.highest.runs, notOut: p.highest.notOut } : null,
    ),
    sixes: build((p) => counting(p.sixes)),
    fours: build((p) => counting(p.fours)),
    average: build((p) => rated(p.average)),
    strikeRate: build((p) => rated(p.strikeRate)),
    economy: build((p) => rated(p.economy), lowestFirst),
    bestBowling: build(
      (p) => (p.best !== null && p.best.wickets > 0 ? { value: p.best.wickets, runs: p.best.runs } : null),
      bestFigures,
    ),
    maidens: build((p) => counting(p.maidens)),
    dots: build((p) => counting(p.dots)),
    catches: build((p) => counting(p.catches)),
    runOutsStumpings: build((p) => counting(p.runOuts + p.stumpings)),
    mvp: build((p) => counting(p.points)),
    potm: build((p) => counting(p.potmAwards)),
  };
}

export function aggregateTeamStats(matches: TeamMatch[], squad: SquadPlayer[], filter: Filter): TeamStats {
  const squadIds = new Set(squad.map((player) => player.id));
  const order = nameOrder(squad);

  const potm: TeamStats["potm"] = {};
  const counted: Counted[] = matches.filter(isCounted).map((match) => {
    const appearances = appearancesIn(match.record, squadIds);
    potm[match.code] = pickPotm(match, appearances, squadIds, order);
    return { match, appearances };
  });
  const selected = counted.filter(
    ({ match }) =>
      filter.seasonId === null ||
      seasonOf(match.record.playedAt, filter.seasons, filter.timeZone) === filter.seasonId,
  );

  const totals = new Map(squad.map((player) => [player.id, emptyTotals(player.id)]));
  for (const { match, appearances } of selected) {
    for (const appearance of appearances) {
      const entry = totals.get(appearance.stats.playerId);
      if (entry !== undefined) addAppearance(entry, appearance);
    }
    const award = potm[match.code];
    const winner = award === null ? undefined : totals.get(award.playerId);
    if (winner !== undefined) winner.potmAwards += 1;
  }

  const players = [...totals.values()];
  for (const player of players) addRates(player);

  return {
    record: recordOf(selected.map(({ match }) => match)),
    players,
    leaderboards: leaderboardsOf(players, order),
    potm,
  };
}
