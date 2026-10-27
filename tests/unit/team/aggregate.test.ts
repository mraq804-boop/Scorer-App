import { describe, expect, it } from "vitest";
import {
  LEADERBOARD_SIZE,
  MIN_BALLS_FOR_STRIKE_RATE,
  MIN_INNINGS_FOR_AVERAGE,
  MIN_LEGAL_BALLS_FOR_ECONOMY,
  POINTS_FIFTY,
  POINTS_PER_DOT,
  POINTS_PER_FIELDING,
  POINTS_PER_FOUR,
  POINTS_PER_MAIDEN,
  POINTS_PER_RUN,
  POINTS_PER_SIX,
  POINTS_PER_WICKET,
  POINTS_THIRTY,
  aggregateTeamStats,
  matchPoints,
  matchRecord,
} from "@/lib/team";
import type { Outcome, PlayerMatchStats, PlayerTotals, Season, SquadPlayer, TeamMatch, TeamStats } from "@/lib/team";
import { TestMatch } from "../../helpers/match";

const TZ = "Asia/Karachi";
const EVERYTHING = { seasonId: null, seasons: [], timeZone: TZ };
const PLAYED_AT = "2026-04-10T10:00:00.000Z";

function id(name: string): string {
  return `sq-${name.toLowerCase()}`;
}

function player(name: string, over: Partial<SquadPlayer> = {}): SquadPlayer {
  return { id: id(name), name, role: null, active: true, ...over };
}

const SQUAD = ["Ali", "Bilal", "Chand", "Danish", "Essa", "Farhan", "Gul"].map((name) => player(name));

type Parts = {
  bat?: Partial<NonNullable<PlayerMatchStats["batting"]>>;
  bowl?: Partial<NonNullable<PlayerMatchStats["bowling"]>>;
  field?: Partial<PlayerMatchStats["fielding"]>;
};

function stats(name: string, parts: Parts = {}): PlayerMatchStats {
  return {
    playerId: id(name),
    batting: parts.bat ? { runs: 0, balls: 0, fours: 0, sixes: 0, notOut: false, ...parts.bat } : null,
    bowling: parts.bowl ? { legalBalls: 0, runs: 0, wickets: 0, maidens: 0, dots: 0, ...parts.bowl } : null,
    fielding: { catches: 0, runOuts: 0, stumpings: 0, ...parts.field },
  };
}

type GameOptions = {
  playedAt?: string;
  outcome?: Outcome | null;
  xi?: string[];
  status?: TeamMatch["status"];
  resultOverride?: TeamMatch["resultOverride"];
  potm?: string | null;
};

function game(code: string, players: PlayerMatchStats[], options: GameOptions = {}): TeamMatch {
  return {
    code,
    status: options.status ?? "complete",
    resultOverride: options.resultOverride ?? null,
    potmPlayerId: options.potm ?? null,
    record: {
      version: 1,
      side: "A",
      opponent: "Tigers",
      playedAt: options.playedAt ?? PLAYED_AT,
      xi: options.xi ?? players.map((p) => p.playerId),
      outcome: options.outcome === undefined ? "won" : options.outcome,
      players,
    },
  };
}

function aggregate(matches: TeamMatch[], squad: SquadPlayer[] = SQUAD): TeamStats {
  return aggregateTeamStats(matches, squad, EVERYTHING);
}

function totalsOf(result: TeamStats, name: string): PlayerTotals {
  const found = result.players.find((p) => p.playerId === id(name));
  if (found === undefined) throw new Error(`no totals for ${name}`);
  return found;
}

function ids(rows: { playerId: string }[]): string[] {
  return rows.map((row) => row.playerId);
}

function innings(name: string, runs: number, extra: Parts["bat"] = {}): PlayerMatchStats {
  return stats(name, { bat: { runs, balls: 10, ...extra } });
}

describe("named constants", () => {
  it("pin the spec's thresholds and point values", () => {
    expect([MIN_INNINGS_FOR_AVERAGE, MIN_BALLS_FOR_STRIKE_RATE, MIN_LEGAL_BALLS_FOR_ECONOMY, LEADERBOARD_SIZE]).toEqual([
      3, 30, 60, 5,
    ]);
    expect([
      POINTS_PER_RUN,
      POINTS_PER_FOUR,
      POINTS_PER_SIX,
      POINTS_THIRTY,
      POINTS_FIFTY,
      POINTS_PER_WICKET,
      POINTS_PER_MAIDEN,
      POINTS_PER_DOT,
      POINTS_PER_FIELDING,
    ]).toEqual([1, 1, 2, 10, 20, 20, 10, 1, 10]);
  });
});

describe("matchPoints", () => {
  it("scores a half-century with boundaries", () => {
    expect(matchPoints(stats("Ali", { bat: { runs: 52, balls: 40, fours: 4, sixes: 1 } }))).toBe(78);
  });

  it("gives the 30 and 50 bonuses without stacking them", () => {
    const points = (runs: number) => matchPoints(stats("Ali", { bat: { runs, balls: 30 } }));
    expect([points(29), points(30), points(49), points(50), points(101)]).toEqual([29, 40, 59, 70, 121]);
  });

  it("scores wickets, maidens and dot balls", () => {
    expect(matchPoints(stats("Bilal", { bowl: { legalBalls: 24, wickets: 2, maidens: 1, dots: 8 } }))).toBe(58);
  });

  it("scores catches, run-outs and stumpings equally", () => {
    expect(matchPoints(stats("Chand", { field: { catches: 1, runOuts: 1, stumpings: 1 } }))).toBe(30);
  });

  it("is zero for a player who did nothing", () => {
    expect(matchPoints(stats("Danish"))).toBe(0);
  });

  it("adds every discipline together", () => {
    const all = stats("Ali", {
      bat: { runs: 30, balls: 20, fours: 2, sixes: 1 },
      bowl: { legalBalls: 12, wickets: 1, maidens: 1, dots: 5 },
      field: { catches: 2 },
    });
    expect(matchPoints(all)).toBe(30 + 2 + 2 + 10 + 20 + 10 + 5 + 20);
  });
});

describe("aggregateTeamStats batting", () => {
  const matches = [
    game("m1", [stats("Ali", { bat: { runs: 52, balls: 40, fours: 4, sixes: 1 } })]),
    game("m2", [stats("Ali", { bat: { runs: 30, balls: 25, notOut: true } })]),
    game("m3", [stats("Ali", { bat: { runs: 10, balls: 12 } })]),
  ];

  it("totals runs, balls, boundaries, milestones and the highest score", () => {
    expect(totalsOf(aggregate(matches), "Ali")).toMatchObject({
      matches: 3,
      innings: 3,
      notOuts: 1,
      runs: 92,
      balls: 77,
      fours: 4,
      sixes: 1,
      highest: { runs: 52, notOut: false },
      thirties: 1,
      fifties: 1,
    });
  });

  it("averages runs over dismissals, not innings", () => {
    expect(totalsOf(aggregate(matches), "Ali").average).toBe(46);
  });

  it("computes the strike rate without rounding", () => {
    expect(totalsOf(aggregate(matches), "Ali").strikeRate).toBe((92 * 100) / 77);
  });

  it("has no average below 3 innings", () => {
    const result = aggregate([game("m1", [innings("Ali", 40)]), game("m2", [innings("Ali", 20)])]);
    expect(totalsOf(result, "Ali").average).toBeNull();
    expect(result.leaderboards.average).toEqual([]);
  });

  it("has no average without a dismissal", () => {
    const result = aggregate(
      ["m1", "m2", "m3"].map((code) => game(code, [innings("Ali", 20, { notOut: true })])),
    );
    expect(totalsOf(result, "Ali")).toMatchObject({ innings: 3, notOuts: 3, average: null });
    expect(result.leaderboards.average).toEqual([]);
  });

  it("has no strike rate below 30 balls, and does at 30", () => {
    const below = aggregate([game("m1", [stats("Ali", { bat: { runs: 50, balls: 29 } })])]);
    expect(totalsOf(below, "Ali").strikeRate).toBeNull();
    expect(below.leaderboards.strikeRate).toEqual([]);

    const at = aggregate([game("m1", [stats("Ali", { bat: { runs: 45, balls: 30 } })])]);
    expect(totalsOf(at, "Ali").strikeRate).toBe(150);
    expect(at.leaderboards.strikeRate).toEqual([{ playerId: id("Ali"), value: 150 }]);
  });

  it("keeps the not-out marker on the highest score, preferring a not-out on a tie", () => {
    const result = aggregate([game("m1", [innings("Ali", 45)]), game("m2", [innings("Ali", 45, { notOut: true })])]);
    expect(totalsOf(result, "Ali").highest).toEqual({ runs: 45, notOut: true });
    expect(result.leaderboards.highest).toEqual([{ playerId: id("Ali"), value: 45, notOut: true }]);
  });

  it("has no highest score for a player who never batted", () => {
    const result = aggregate([game("m1", [stats("Ali")])]);
    expect(totalsOf(result, "Ali")).toMatchObject({ innings: 0, highest: null, average: null, strikeRate: null });
  });

  it("counts a match as played for an XI player who did not bat or bowl", () => {
    expect(totalsOf(aggregate([game("m1", [stats("Ali")])]), "Ali")).toMatchObject({ matches: 1, innings: 0 });
  });

  it("puts unrounded values on the average and strike-rate boards", () => {
    const result = aggregate([
      game("m1", [stats("Ali", { bat: { runs: 40, balls: 20 } })]),
      game("m2", [stats("Ali", { bat: { runs: 30, balls: 20 } })]),
      game("m3", [stats("Ali", { bat: { runs: 30, balls: 20 } })]),
    ]);
    expect(result.leaderboards.average).toEqual([{ playerId: id("Ali"), value: 100 / 3 }]);
    expect(result.leaderboards.strikeRate).toEqual([{ playerId: id("Ali"), value: (100 * 100) / 60 }]);
  });
});

describe("aggregateTeamStats bowling and fielding", () => {
  const matches = [
    game("m1", [stats("Bilal", { bowl: { legalBalls: 36, runs: 30, wickets: 3, maidens: 1, dots: 12 } })]),
    game("m2", [stats("Bilal", { bowl: { legalBalls: 24, runs: 18, wickets: 1, maidens: 0, dots: 6 } })]),
  ];

  it("totals overs, runs, wickets, maidens and dots", () => {
    expect(totalsOf(aggregate(matches), "Bilal")).toMatchObject({
      legalBalls: 60,
      runsConceded: 48,
      wickets: 4,
      maidens: 1,
      dots: 18,
      best: { wickets: 3, runs: 30 },
    });
  });

  it("computes economy per six balls once 60 legal balls are bowled", () => {
    const result = aggregate(matches);
    expect(totalsOf(result, "Bilal").economy).toBe((48 * 6) / 60);
    expect(result.leaderboards.economy).toEqual([{ playerId: id("Bilal"), value: (48 * 6) / 60 }]);
  });

  it("has no economy below 60 legal balls", () => {
    const result = aggregate([game("m1", [stats("Bilal", { bowl: { legalBalls: 59, runs: 20, wickets: 2 } })])]);
    expect(totalsOf(result, "Bilal").economy).toBeNull();
    expect(result.leaderboards.economy).toEqual([]);
  });

  it("ranks economy lowest first", () => {
    const result = aggregate([
      game("m1", [
        stats("Ali", { bowl: { legalBalls: 60, runs: 80 } }),
        stats("Bilal", { bowl: { legalBalls: 60, runs: 50 } }),
        stats("Chand", { bowl: { legalBalls: 72, runs: 66 } }),
      ]),
    ]);
    expect(ids(result.leaderboards.economy)).toEqual([id("Bilal"), id("Chand"), id("Ali")]);
  });

  it("takes the best figures from a single match: most wickets, then fewest runs", () => {
    const result = aggregate([
      game("m1", [stats("Ali", { bowl: { legalBalls: 12, runs: 10, wickets: 1 } })]),
      game("m2", [stats("Ali", { bowl: { legalBalls: 24, runs: 20, wickets: 3 } })]),
      game("m3", [stats("Ali", { bowl: { legalBalls: 24, runs: 18, wickets: 3 } })]),
    ]);
    expect(totalsOf(result, "Ali").best).toEqual({ wickets: 3, runs: 18 });
  });

  it("orders the best-bowling board by wickets then runs, leaving out wicketless spells", () => {
    const result = aggregate([
      game("m1", [
        stats("Ali", { bowl: { legalBalls: 24, runs: 20, wickets: 3 } }),
        stats("Bilal", { bowl: { legalBalls: 24, runs: 15, wickets: 3 } }),
        stats("Chand", { bowl: { legalBalls: 24, runs: 5, wickets: 2 } }),
        stats("Danish", { bowl: { legalBalls: 24, runs: 3, wickets: 0 } }),
      ]),
    ]);
    expect(result.leaderboards.bestBowling).toEqual([
      { playerId: id("Bilal"), value: 3, runs: 15 },
      { playerId: id("Ali"), value: 3, runs: 20 },
      { playerId: id("Chand"), value: 2, runs: 5 },
    ]);
  });

  it("totals catches, run-outs and stumpings and ranks run-outs plus stumpings together", () => {
    const result = aggregate([
      game("m1", [
        stats("Ali", { field: { catches: 3, runOuts: 1 } }),
        stats("Bilal", { field: { runOuts: 1, stumpings: 2 } }),
        stats("Chand", { field: { catches: 1 } }),
      ]),
      game("m2", [stats("Ali", { field: { catches: 1, stumpings: 1 } })]),
    ]);
    expect(totalsOf(result, "Ali")).toMatchObject({ catches: 4, runOuts: 1, stumpings: 1 });
    expect(ids(result.leaderboards.catches)).toEqual([id("Ali"), id("Chand")]);
    expect(result.leaderboards.runOutsStumpings).toEqual([
      { playerId: id("Bilal"), value: 3 },
      { playerId: id("Ali"), value: 2 },
    ]);
  });

  it("adds match points into the player's total", () => {
    const result = aggregate([
      game("m1", [stats("Ali", { bat: { runs: 52, balls: 40, fours: 4, sixes: 1 } })]),
      game("m2", [stats("Ali", { field: { catches: 1 } })]),
    ]);
    expect(totalsOf(result, "Ali").points).toBe(78 + 10);
    expect(result.leaderboards.mvp).toEqual([{ playerId: id("Ali"), value: 88 }]);
  });
});

describe("aggregateTeamStats leaderboards", () => {
  it("shows the top 5 only, highest first", () => {
    const players = SQUAD.map((p, index) => innings(p.name, (index + 1) * 10));
    const result = aggregate([game("m1", players)]);
    expect(LEADERBOARD_SIZE).toBe(5);
    expect(ids(result.leaderboards.runs)).toEqual(["Gul", "Farhan", "Essa", "Danish", "Chand"].map(id));
    expect(result.leaderboards.runs.map((row) => row.value)).toEqual([70, 60, 50, 40, 30]);
  });

  it("fills the boundary and dot boards", () => {
    const result = aggregate([
      game("m1", [
        stats("Ali", { bat: { runs: 20, balls: 10, fours: 2, sixes: 3 } }),
        stats("Bilal", { bat: { runs: 20, balls: 10, fours: 5, sixes: 1 }, bowl: { legalBalls: 12, maidens: 2, dots: 7 } }),
        stats("Chand", { bowl: { legalBalls: 12, maidens: 1, dots: 9 } }),
      ]),
    ]);
    expect(ids(result.leaderboards.sixes)).toEqual([id("Ali"), id("Bilal")]);
    expect(ids(result.leaderboards.fours)).toEqual([id("Bilal"), id("Ali")]);
    expect(ids(result.leaderboards.maidens)).toEqual([id("Bilal"), id("Chand")]);
    expect(ids(result.leaderboards.dots)).toEqual([id("Chand"), id("Bilal")]);
  });

  it("breaks ties by squad name, then id", () => {
    const squad = [
      player("Zara", { id: "sq-1" }),
      player("amir", { id: "sq-2" }),
      player("Bilal", { id: "sq-4" }),
      player("Bilal", { id: "sq-3" }),
    ];
    const tied = squad.map((p) => ({ ...innings("x", 30), playerId: p.id }));
    const result = aggregate([game("m1", tied)], squad);
    expect(ids(result.leaderboards.runs)).toEqual(["sq-2", "sq-3", "sq-4", "sq-1"]);
  });

  it("leaves players with nothing to show off the count boards", () => {
    const result = aggregate([game("m1", [stats("Ali"), innings("Bilal", 0)])]);
    for (const key of ["runs", "wickets", "highest", "sixes", "fours", "maidens", "dots", "catches", "runOutsStumpings", "mvp", "potm"] as const) {
      expect(result.leaderboards[key]).toEqual([]);
    }
  });
});

describe("aggregateTeamStats player of the match", () => {
  it("suggests the XI player with the most points", () => {
    const result = aggregate([
      game("m1", [
        stats("Ali", { bat: { runs: 52, balls: 40, fours: 4, sixes: 1 } }),
        stats("Bilal", { bowl: { legalBalls: 24, wickets: 3, dots: 10 } }),
      ]),
    ]);
    expect(result.potm).toEqual({ m1: { playerId: id("Ali"), suggested: true } });
    expect(result.leaderboards.potm).toEqual([{ playerId: id("Ali"), value: 1 }]);
    expect(totalsOf(result, "Ali").potmAwards).toBe(1);
    expect(totalsOf(result, "Bilal").potmAwards).toBe(0);
  });

  it("breaks a points tie by more runs", () => {
    const result = aggregate([
      game("m1", [
        stats("Bilal", { bowl: { legalBalls: 12, wickets: 2, maidens: 1 } }),
        stats("Ali", { bat: { runs: 40, balls: 30 } }),
      ]),
    ]);
    expect(matchPoints(stats("Bilal", { bowl: { legalBalls: 12, wickets: 2, maidens: 1 } }))).toBe(50);
    expect(matchPoints(stats("Ali", { bat: { runs: 40, balls: 30 } }))).toBe(50);
    expect(result.potm.m1).toEqual({ playerId: id("Ali"), suggested: true });
  });

  it("breaks a remaining tie by squad name", () => {
    const result = aggregate([
      game("m1", [stats("Danish", { field: { catches: 2 } }), stats("Chand", { field: { catches: 2 } })]),
    ]);
    expect(result.potm.m1).toEqual({ playerId: id("Chand"), suggested: true });
  });

  it("uses the owner's override and marks it as not suggested", () => {
    const result = aggregate([
      game("m1", [stats("Ali", { bat: { runs: 52, balls: 40 } }), stats("Bilal", { field: { catches: 1 } })], {
        potm: id("Bilal"),
      }),
    ]);
    expect(result.potm.m1).toEqual({ playerId: id("Bilal"), suggested: false });
    expect(result.leaderboards.potm).toEqual([{ playerId: id("Bilal"), value: 1 }]);
  });

  it("counts awards across matches", () => {
    const result = aggregate([
      game("m1", [innings("Ali", 50), innings("Bilal", 5)]),
      game("m2", [innings("Ali", 40), innings("Bilal", 5)]),
      game("m3", [innings("Ali", 5), innings("Bilal", 35)]),
    ]);
    expect(result.leaderboards.potm).toEqual([
      { playerId: id("Ali"), value: 2 },
      { playerId: id("Bilal"), value: 1 },
    ]);
  });

  it("gives a still-counted no-result match a player of the match too", () => {
    const result = aggregate([game("m1", [innings("Ali", 50)], { resultOverride: "no_result", status: "in_progress" })]);
    expect(result.potm.m1).toEqual({ playerId: id("Ali"), suggested: true });
  });

  it("suggests nobody when no one earned a point", () => {
    const result = aggregate([game("m1", [stats("Ali"), innings("Bilal", 0)])]);
    expect(result.potm).toEqual({ m1: null });
    expect(result.leaderboards.potm).toEqual([]);
  });

  it("is null when nobody in the XI is in the squad", () => {
    const result = aggregate([game("m1", [innings("Stranger", 50)])]);
    expect(result.potm).toEqual({ m1: null });
  });
});

describe("aggregateTeamStats record", () => {
  it("counts wins, losses, ties and no-results", () => {
    const result = aggregate([
      game("m1", [stats("Ali")], { outcome: "won" }),
      game("m2", [stats("Ali")], { outcome: "won" }),
      game("m3", [stats("Ali")], { outcome: "lost" }),
      game("m4", [stats("Ali")], { outcome: "tied" }),
      game("m5", [stats("Ali")], { outcome: "won", resultOverride: "no_result" }),
    ]);
    expect(result.record).toEqual({ played: 5, won: 2, lost: 1, tied: 1, noResult: 1 });
  });

  it("counts a finished match with no outcome as no result", () => {
    const result = aggregate([game("m1", [stats("Ali")], { outcome: null })]);
    expect(result.record).toEqual({ played: 1, won: 0, lost: 0, tied: 0, noResult: 1 });
  });

  it("counts an unfinished match marked no-result, and still counts its runs", () => {
    const m = new TestMatch();
    m.ball({ runs: 4, boundary: true });
    m.ball({ runs: 6, boundary: true });
    const record = matchRecord(m.state, "A", ["p-Ali", "p-Usman"], PLAYED_AT);
    const unfinished: TeamMatch = {
      code: "nr",
      status: "in_progress",
      resultOverride: "no_result",
      potmPlayerId: null,
      record,
    };
    const squad = [player("Ali", { id: "p-Ali" }), player("Usman", { id: "p-Usman" })];
    const result = aggregate([unfinished], squad);

    expect(result.record).toEqual({ played: 1, won: 0, lost: 0, tied: 0, noResult: 1 });
    expect(result.players.find((p) => p.playerId === "p-Ali")).toMatchObject({ runs: 10, balls: 2, matches: 1 });
    expect(result.potm.nr).toEqual({ playerId: "p-Ali", suggested: true });
  });

  it("counts a hand-ended chase marked no-result as no result, not as the win the engine computed", () => {
    const m = new TestMatch({ overs: 1 });
    for (const runs of [4, 4, 4, 0, 0, 0]) m.ball({ runs });
    m.endInnings("overs");
    m.startInnings2(["Zain", "Faisal"], "Usman");
    m.ball({ runs: 1 });
    m.endInnings("manual");

    const record = matchRecord(m.state, "A", ["p-Ali"], PLAYED_AT);
    expect(record.outcome).toBe("won");

    const marked: TeamMatch = { code: "rain", status: "complete", resultOverride: "no_result", potmPlayerId: null, record };
    const squad = [player("Ali", { id: "p-Ali" })];
    expect(aggregate([marked], squad).record).toEqual({ played: 1, won: 0, lost: 0, tied: 0, noResult: 1 });
    expect(aggregate([{ ...marked, resultOverride: null }], squad).record).toEqual({
      played: 1,
      won: 1,
      lost: 0,
      tied: 0,
      noResult: 0,
    });
  });

  it("leaves a live match out of the record, the stats and the player of the match", () => {
    const result = aggregate([
      game("done", [innings("Ali", 10)], { outcome: "won" }),
      game("live", [innings("Ali", 99)], { status: "in_progress", outcome: null }),
    ]);
    expect(result.record).toEqual({ played: 1, won: 1, lost: 0, tied: 0, noResult: 0 });
    expect(totalsOf(result, "Ali")).toMatchObject({ matches: 1, runs: 10 });
    expect(Object.keys(result.potm)).toEqual(["done"]);
  });

  it("leaves out a match that has no record yet", () => {
    const pending: TeamMatch = { code: "p", status: "complete", resultOverride: null, potmPlayerId: null, record: null };
    expect(aggregate([pending]).record).toEqual({ played: 0, won: 0, lost: 0, tied: 0, noResult: 0 });
  });

  it("is empty for a team that has played nothing", () => {
    const result = aggregate([]);
    expect(result.record).toEqual({ played: 0, won: 0, lost: 0, tied: 0, noResult: 0 });
    expect(result.potm).toEqual({});
    expect(Object.values(result.leaderboards).every((rows) => rows.length === 0)).toBe(true);
  });
});

describe("aggregateTeamStats seasons", () => {
  const seasons: Season[] = [
    { id: "winter", name: "Winter", startsOn: "2025-10-01", endsOn: "2026-03-31" },
    { id: "summer", name: "Summer", startsOn: "2026-04-01", endsOn: "2026-09-30" },
  ];
  const matches = [
    game("late-march", [innings("Ali", 10)], { playedAt: "2026-03-31T18:00:00.000Z", outcome: "lost" }),
    game("first-april", [innings("Ali", 20)], { playedAt: "2026-03-31T19:30:00.000Z", outcome: "won" }),
    game("gap", [innings("Ali", 40)], { playedAt: "2027-01-01T10:00:00.000Z", outcome: "won" }),
  ];

  function inSeason(seasonId: string | null): TeamStats {
    return aggregateTeamStats(matches, SQUAD, { seasonId, seasons, timeZone: TZ });
  }

  it("limits the record and the totals to the chosen season", () => {
    const winter = inSeason("winter");
    expect(winter.record).toEqual({ played: 1, won: 0, lost: 1, tied: 0, noResult: 0 });
    expect(totalsOf(winter, "Ali")).toMatchObject({ matches: 1, runs: 10 });

    const summer = inSeason("summer");
    expect(summer.record).toEqual({ played: 1, won: 1, lost: 0, tied: 0, noResult: 0 });
    expect(totalsOf(summer, "Ali")).toMatchObject({ matches: 1, runs: 20 });
  });

  it("covers every team match when no season is chosen, even outside all seasons", () => {
    const all = inSeason(null);
    expect(all.record.played).toBe(3);
    expect(totalsOf(all, "Ali").runs).toBe(70);
  });

  it("counts player of the match awards only for matches in the chosen season", () => {
    expect(totalsOf(inSeason("summer"), "Ali").potmAwards).toBe(1);
    expect(totalsOf(inSeason(null), "Ali").potmAwards).toBe(3);
  });

  it("matches nothing for an unknown season", () => {
    expect(inSeason("missing").record.played).toBe(0);
  });
});

describe("aggregateTeamStats squad handling", () => {
  it("ignores player ids missing from the squad", () => {
    const matches = [
      game("m1", [
        stats("Ali", { bat: { runs: 20, balls: 15 } }),
        stats("Newbie", { bat: { runs: 99, balls: 40, fours: 9 }, bowl: { legalBalls: 24, wickets: 4 }, field: { catches: 3 } }),
      ]),
    ];

    const before = aggregate(matches);
    expect(before.record).toEqual({ played: 1, won: 1, lost: 0, tied: 0, noResult: 0 });
    expect(before.players.map((p) => p.playerId)).not.toContain(id("Newbie"));
    for (const rows of Object.values(before.leaderboards)) expect(ids(rows)).not.toContain(id("Newbie"));
    expect(before.potm.m1).toEqual({ playerId: id("Ali"), suggested: true });
    expect(totalsOf(before, "Ali")).toMatchObject({ matches: 1, runs: 20 });

    const after = aggregate(matches, [...SQUAD, player("Newbie")]);
    expect(totalsOf(after, "Newbie")).toMatchObject({ matches: 1, runs: 99, wickets: 4, catches: 3 });
    expect(ids(after.leaderboards.runs)).toEqual([id("Newbie"), id("Ali")]);
    expect(after.potm.m1).toEqual({ playerId: id("Newbie"), suggested: true });
  });

  it("falls back to the suggestion when the override names a player missing from the squad", () => {
    const result = aggregate([game("m1", [stats("Ali", { bat: { runs: 20, balls: 15 } })], { potm: id("Stranger") })]);
    expect(result.potm.m1).toEqual({ playerId: id("Ali"), suggested: true });
  });

  it("uses current squad names and keeps inactive players", () => {
    const matches = [
      game("m1", [
        stats("Ali", { bat: { runs: 30, balls: 20 } }),
        stats("Bilal", { bat: { runs: 30, balls: 20 } }),
        stats("Chand", { bat: { runs: 100, balls: 60 }, bowl: { legalBalls: 24, wickets: 5 } }),
      ]),
    ];
    const squad = [
      player("Zed", { id: id("Ali") }),
      player("Amir", { id: id("Bilal") }),
      player("Chand", { active: false }),
    ];
    const result = aggregate(matches, squad);

    expect(ids(result.leaderboards.runs)).toEqual([id("Chand"), id("Bilal"), id("Ali")]);
    expect(ids(result.leaderboards.wickets)).toEqual([id("Chand")]);
    expect(result.players.map((p) => p.playerId).sort()).toEqual([id("Ali"), id("Bilal"), id("Chand")].sort());
    expect(totalsOf(result, "Chand")).toMatchObject({ matches: 1, runs: 100, wickets: 5 });
  });

  it("keeps a player's figures under the same id when the squad row is renamed", () => {
    const matches = [game("m1", [stats("Ali", { bat: { runs: 25, balls: 20 } })])];
    const renamed = [player("Ali Khan", { id: id("Ali") })];
    expect(totalsOf(aggregate(matches, renamed), "Ali")).toMatchObject({ matches: 1, runs: 25 });
  });

  it("gives every squad player totals, zero when they have not played", () => {
    const result = aggregate([game("m1", [innings("Ali", 10)])]);
    expect(result.players).toHaveLength(SQUAD.length);
    expect(totalsOf(result, "Gul")).toMatchObject({ matches: 0, innings: 0, runs: 0, points: 0, potmAwards: 0 });
  });

  it("counts a player listed in the XI but missing from the players list as having played", () => {
    const m = game("m1", [innings("Ali", 10)], { xi: [id("Ali"), id("Bilal")] });
    expect(totalsOf(aggregate([m]), "Bilal")).toMatchObject({ matches: 1, innings: 0 });
  });
});
