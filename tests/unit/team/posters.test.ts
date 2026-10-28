import { describe, expect, it } from "vitest";
import { matchPotm, posterHeadline, posterOutcome, teamForm, topPerformers } from "@/lib/team";
import type { PlayerMatchStats, TeamMatchRecord, TeamPageMatch } from "@/lib/team";
import { TestMatch } from "../../helpers/match";

const noFielding = { catches: 0, runOuts: 0, stumpings: 0 };

function stats(playerId: string, parts: { runs?: number; wickets?: number; hatTricks?: number } = {}): PlayerMatchStats {
  const bowling =
    parts.wickets === undefined
      ? null
      : { legalBalls: 24, runs: 20, wickets: parts.wickets, maidens: 0, dots: 0, ...(parts.hatTricks ? { hatTricks: parts.hatTricks } : {}) };
  return {
    playerId,
    batting: parts.runs === undefined ? null : { runs: parts.runs, balls: 30, fours: 0, sixes: 0, notOut: false },
    bowling,
    fielding: noFielding,
  };
}

function record(players: PlayerMatchStats[], xi = players.map((p) => p.playerId)): TeamMatchRecord {
  return { version: 1, side: "A", opponent: "Tigers", playedAt: "2026-04-01T10:00:00.000Z", xi, outcome: "won", players };
}

const nameOf = (id: string) => id;

describe("posterHeadline", () => {
  it("picks the biggest achievement in the agreed order", () => {
    expect(posterHeadline(stats("a", { runs: 104 }), false)).toBe("hundred");
    expect(posterHeadline(stats("a", { runs: 52, wickets: 5 }), false)).toBe("fifty");
    expect(posterHeadline(stats("a", { wickets: 5, hatTricks: 1 }), false)).toBe("fiveWickets");
    expect(posterHeadline(stats("a", { wickets: 3, hatTricks: 1 }), false)).toBe("hatTrick");
    expect(posterHeadline(stats("a", { wickets: 3 }), false)).toBe("threeWickets");
    expect(posterHeadline(stats("a", { runs: 104 }), true)).toBe("potm");
    expect(posterHeadline(stats("a", { runs: 12 }), false)).toBeNull();
  });
});

describe("matchPotm", () => {
  const players = [stats("ali", { runs: 40 }), stats("bilal", { runs: 12, wickets: 2 }), stats("chand", { runs: 5 })];

  it("uses the owner's pick when the player was in the XI", () => {
    expect(matchPotm(record(players), "chand", nameOf)).toBe("chand");
  });

  it("falls back to the points when the pick was not in the XI", () => {
    expect(matchPotm(record(players), "stranger", nameOf)).toBe("bilal");
  });

  it("picks nobody when nobody scored points", () => {
    expect(matchPotm(record([stats("ali", { runs: 0 })]), null, nameOf)).toBeNull();
  });
});

describe("topPerformers", () => {
  it("ranks both sides by points, then runs", () => {
    const m = new TestMatch({ overs: 1 });
    for (const runs of [4, 4, 1, 0, 0, 0]) m.ball({ runs, boundary: runs === 4 });
    m.endInnings("overs");
    m.startInnings2(["Zain", "Faisal"], "Usman");
    for (const runs of [6, 6, 0]) m.ball({ runs, boundary: true });
    const top = topPerformers(m.state);
    expect(top.map((p) => p.name)).toEqual(["Zain", "Ali", "Hamza"]);
    expect(top[0]).toMatchObject({ side: "B" });
  });

  it("skips players with no points", () => {
    const m = new TestMatch();
    m.ball({ runs: 0 });
    expect(topPerformers(m.state).map((p) => p.name)).toEqual(["Hamza"]);
  });
});

describe("posterOutcome", () => {
  it("never calls an unfinished, tied or No result match a win", () => {
    const live = new TestMatch().state;
    expect(posterOutcome(live, null)).toEqual({ kind: "live" });
    expect(posterOutcome({ ...live, status: "complete", result: { kind: "tie" } }, null)).toEqual({ kind: "tie" });
    const won = { ...live, status: "complete" as const, result: { kind: "won_by_runs" as const, winner: "A" as const, runs: 20 } };
    expect(posterOutcome(won, null)).toEqual({ kind: "won", winner: "A" });
    expect(posterOutcome(won, "no_result")).toEqual({ kind: "noResult" });
    expect(posterOutcome({ ...live, status: "complete", result: null }, null)).toEqual({ kind: "noResult" });
  });
});

describe("teamForm", () => {
  function match(
    code: string,
    status: TeamPageMatch["status"],
    outcome: TeamMatchRecord["outcome"],
    override: TeamPageMatch["resultOverride"] = null,
  ): TeamPageMatch {
    return { code, title: code, status, resultOverride: override, potmPlayerId: null, lines: [], result: null, record: { ...record([]), outcome } };
  }

  it("shows the newest counted results and skips live matches", () => {
    const matches = [
      match("m1", "in_progress", null),
      match("m2", "complete", "won"),
      match("m3", "complete", "lost"),
      match("m4", "in_progress", null, "no_result"),
      match("m5", "complete", "tied"),
      match("m6", "complete", "won"),
      match("m7", "complete", "won"),
    ];
    expect(teamForm(matches)).toEqual(["won", "lost", "noResult", "tied", "won"]);
  });
});
