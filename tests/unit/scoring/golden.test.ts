import { describe, expect, it } from "vitest";
import { boundaryPct, dotBallPct } from "@/lib/scoring";
import type { InningsState } from "@/lib/scoring";
import { TestMatch } from "../../helpers/match";

function goldenMatch(): TestMatch {
  const m = new TestMatch({ overs: 2 });

  m.ball({ runs: 1 });
  m.ball({ runs: 4, boundary: true });
  m.ball({ kind: "wide", runs: 0 });
  m.ball({ runs: 0 });
  m.ball({ kind: "noball", runs: 6, boundary: true });
  m.ball({ runs: 2 });
  m.ball({ runs: 0 });
  m.ball({ runs: 0, wicket: { kind: "bowled" } });
  m.batter("Saad");

  m.bowler("Bilal");
  m.ball({ runs: 1, runsAs: "legbye" });
  m.ball({ runs: 3 });
  m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Zain" } });
  m.batter("Kamran");
  m.ball({ runs: 6, boundary: true });
  m.ball({ runs: 2, runsAs: "bye" });
  m.ball({ runs: 1 });
  m.endInnings("overs");

  m.startInnings2(["Zain", "Faisal"], "Usman");
  for (const runs of [6, 6, 6, 6, 4, 1]) m.ball({ runs, boundary: runs >= 4 });
  m.endInnings("target");
  return m;
}

describe("golden match: Lions v Tigers, 2 overs", () => {
  const m = goldenMatch();
  const state = m.state;
  const first: InningsState = state.innings[0];

  function batter(name: string) {
    const line = first.batting.find((l) => l.playerId === m.id(name));
    if (line === undefined) throw new Error(`no batting line for ${name}`);
    return { runs: line.runs, balls: line.balls };
  }

  function bowler(name: string) {
    const line = first.bowling.find((l) => l.playerId === m.id(name));
    if (line === undefined) throw new Error(`no bowling line for ${name}`);
    return line;
  }

  it("totals the first innings", () => {
    expect(first.runs).toBe(28);
    expect(first.wickets).toBe(2);
    expect(first.legalBalls).toBe(12);
    expect(first.extras).toEqual({ wides: 1, noBalls: 1, byes: 2, legByes: 1 });
  });

  it("credits each batter with runs and balls faced", () => {
    expect(batter("Ali")).toEqual({ runs: 1, balls: 3 });
    expect(batter("Usman")).toEqual({ runs: 12, balls: 6 });
    expect(batter("Saad")).toEqual({ runs: 3, balls: 1 });
    expect(batter("Kamran")).toEqual({ runs: 7, balls: 3 });
    expect(first.batting).toHaveLength(4);
  });

  it("charges each bowler", () => {
    expect(bowler("Hamza")).toMatchObject({ legalBalls: 6, runs: 15, wickets: 1, wides: 1, noBalls: 1, dots: 3 });
    expect(bowler("Bilal")).toMatchObject({ legalBalls: 6, runs: 10, wickets: 1, dots: 3 });
    expect(first.bowling).toHaveLength(2);
  });

  it("records the fall of wickets", () => {
    expect(first.fallOfWickets).toEqual([
      { wicket: 1, runs: 15, legalBalls: 6, playerId: m.id("Usman") },
      { wicket: 2, runs: 19, legalBalls: 9, playerId: m.id("Ali") },
    ]);
  });

  it("splits the innings into partnerships", () => {
    expect(first.partnerships.map((p) => p.runs)).toEqual([15, 4, 9]);
  });

  it("computes the dot-ball and boundary rates", () => {
    expect(dotBallPct(first)).toBe(33.33);
    expect(boundaryPct(first)).toBe(57.14);
  });

  it("sets the target and decides the chase", () => {
    expect(state.target).toBe(29);
    expect(state.status).toBe("complete");
    expect(state.result).toEqual({ kind: "won_by_wickets", winner: "B", wickets: 10, ballsLeft: 6 });
  });
});
