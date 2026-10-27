import { describe, expect, it } from "vitest";
import { matchRecord, teamOutcome } from "@/lib/team";
import type { PlayerMatchStats, TeamMatchRecord } from "@/lib/team";
import { TestMatch, batterLine } from "../../helpers/match";

const PLAYED_AT = "2026-04-01T10:00:00.000Z";
const LIONS_XI = ["p-Ali", "p-Usman", "p-Saad", "p-Kamran", "p-Bench"];
const TIGERS_XI = ["p-Zain", "p-Faisal", "p-Hamza", "p-Bilal"];

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
  m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Zain", fielderId: m.id("Zain") } });
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

function entry(record: TeamMatchRecord, playerId: string): PlayerMatchStats {
  const found = record.players.find((p) => p.playerId === playerId);
  if (found === undefined) throw new Error(`no entry for ${playerId}`);
  return found;
}

function twoOvers(first: number[], second: number[]): TestMatch {
  const m = new TestMatch({ overs: 1 });
  for (const runs of first) m.ball({ runs });
  m.endInnings("overs");
  m.startInnings2(["Zain", "Faisal"], "Usman");
  for (const runs of second) m.ball({ runs });
  m.endInnings("overs");
  return m;
}

describe("matchRecord", () => {
  const m = goldenMatch();
  const lions = matchRecord(m.state, "A", LIONS_XI, PLAYED_AT);
  const tigers = matchRecord(m.state, "B", TIGERS_XI, PLAYED_AT);

  it("describes the match from the team's side", () => {
    expect(lions).toMatchObject({
      version: 1,
      side: "A",
      opponent: "Tigers",
      playedAt: PLAYED_AT,
      xi: LIONS_XI,
      outcome: "lost",
    });
    expect(tigers).toMatchObject({ version: 1, side: "B", opponent: "Lions", outcome: "won" });
  });

  it("gives every XI player an entry, in XI order", () => {
    expect(lions.players.map((p) => p.playerId)).toEqual(LIONS_XI);
    expect(tigers.players.map((p) => p.playerId)).toEqual(TIGERS_XI);
  });

  it("records each batter's runs, balls and boundaries from the innings the team batted", () => {
    expect(entry(lions, "p-Ali").batting).toEqual({ runs: 1, balls: 3, fours: 0, sixes: 0, notOut: false });
    expect(entry(lions, "p-Usman").batting).toEqual({ runs: 12, balls: 6, fours: 1, sixes: 1, notOut: false });
    expect(entry(lions, "p-Saad").batting).toEqual({ runs: 3, balls: 1, fours: 0, sixes: 0, notOut: true });
    expect(entry(lions, "p-Kamran").batting).toEqual({ runs: 7, balls: 3, fours: 0, sixes: 1, notOut: true });
    expect(entry(tigers, "p-Zain").batting).toEqual({ runs: 29, balls: 6, fours: 1, sixes: 4, notOut: true });
  });

  it("charges each bowler from the innings the team fielded", () => {
    expect(entry(tigers, "p-Hamza").bowling).toEqual({ legalBalls: 6, runs: 15, wickets: 1, maidens: 0, dots: 3 });
    expect(entry(tigers, "p-Bilal").bowling).toEqual({ legalBalls: 6, runs: 10, wickets: 1, maidens: 0, dots: 3 });
    expect(entry(lions, "p-Usman").bowling).toEqual({ legalBalls: 6, runs: 29, wickets: 0, maidens: 0, dots: 0 });
  });

  it("does not credit batting or bowling from the other side's innings", () => {
    expect(entry(lions, "p-Ali").bowling).toBeNull();
    expect(entry(tigers, "p-Hamza").batting).toBeNull();
    expect(entry(tigers, "p-Zain").bowling).toBeNull();
  });

  it("leaves batting and bowling null for an XI player who did neither", () => {
    expect(entry(lions, "p-Bench")).toEqual({
      playerId: "p-Bench",
      batting: null,
      bowling: null,
      fielding: { catches: 0, runOuts: 0, stumpings: 0 },
    });
  });

  it("credits a catch to the fielder named by id while the team fields", () => {
    expect(entry(tigers, "p-Zain").fielding).toEqual({ catches: 1, runOuts: 0, stumpings: 0 });
  });

  it("ignores batters and fielders outside the XI", () => {
    const short = matchRecord(m.state, "A", ["p-Ali"], PLAYED_AT);
    expect(short.players.map((p) => p.playerId)).toEqual(["p-Ali"]);
  });

  it("leaves the outcome null while the match has no result", () => {
    const live = new TestMatch();
    live.ball({ runs: 4, boundary: true });
    expect(matchRecord(live.state, "A", ["p-Ali"], PLAYED_AT).outcome).toBeNull();
  });
});

describe("matchRecord fielding", () => {
  function lionsFielding(wicket: NonNullable<Parameters<TestMatch["ball"]>[0]["wicket"]>): PlayerMatchStats[] {
    const m = new TestMatch({ toss: { winner: "B", choice: "bat" }, openers: ["Zain", "Faisal"] });
    m.ball({ runs: 0, wicket });
    return matchRecord(m.state, "A", ["sq-ali", "p-Hamza"], PLAYED_AT).players;
  }

  it("counts a catch by fielder id", () => {
    const [ali] = lionsFielding({ kind: "caught", fielderName: "Ali", fielderId: "sq-ali" });
    expect(ali.fielding).toEqual({ catches: 1, runOuts: 0, stumpings: 0 });
  });

  it("counts a run-out by fielder id", () => {
    const [ali] = lionsFielding({ kind: "run_out", fielderName: "Ali", fielderId: "sq-ali" });
    expect(ali.fielding).toEqual({ catches: 0, runOuts: 1, stumpings: 0 });
  });

  it("counts a stumping by fielder id", () => {
    const [ali] = lionsFielding({ kind: "stumped", fielderName: "Ali", fielderId: "sq-ali" });
    expect(ali.fielding).toEqual({ catches: 0, runOuts: 0, stumpings: 1 });
  });

  it("does not credit a dismissal that names a fielder by typed name only", () => {
    const [ali] = lionsFielding({ kind: "caught", fielderName: "Ali" });
    expect(ali.fielding).toEqual({ catches: 0, runOuts: 0, stumpings: 0 });
  });

  it("does not count a stale fielder id after a catch is corrected to bowled", () => {
    const m = new TestMatch({ toss: { winner: "B", choice: "bat" }, openers: ["Zain", "Faisal"] });
    const caught = m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Ali", fielderId: "sq-ali" } });
    m.correct(caught.id, { wicket: { kind: "bowled", fielderName: null } });
    expect(batterLine(m, "Zain").out).toMatchObject({ kind: "bowled", fielderId: "sq-ali" });

    const [ali, hamza] = matchRecord(m.state, "A", ["sq-ali", "p-Hamza"], PLAYED_AT).players;
    expect(ali.fielding).toEqual({ catches: 0, runOuts: 0, stumpings: 0 });
    expect(hamza.bowling).toMatchObject({ wickets: 1 });
  });

  it("counts a caught-and-bowled as a catch for the bowler", () => {
    const m = new TestMatch({ toss: { winner: "B", choice: "bat" }, openers: ["Zain", "Faisal"] });
    m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Hamza", fielderId: m.id("Hamza") } });
    const [hamza] = matchRecord(m.state, "A", ["p-Hamza"], PLAYED_AT).players;
    expect(hamza.fielding).toEqual({ catches: 1, runOuts: 0, stumpings: 0 });
    expect(hamza.bowling).toMatchObject({ wickets: 1 });
  });

  it("does not credit fielding for dismissals in an innings the team batted", () => {
    const m = new TestMatch();
    m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Ali", fielderId: "sq-ali" } });
    const [ali] = matchRecord(m.state, "A", ["sq-ali"], PLAYED_AT).players;
    expect(ali.fielding).toEqual({ catches: 0, runOuts: 0, stumpings: 0 });
  });

  it("does not credit a retirement", () => {
    const m = new TestMatch({ toss: { winner: "B", choice: "bat" }, openers: ["Zain", "Faisal"] });
    m.push({ type: "retired", player: m.id("Zain"), how: "out" });
    const [ali] = matchRecord(m.state, "A", ["sq-ali"], PLAYED_AT).players;
    expect(ali.fielding).toEqual({ catches: 0, runOuts: 0, stumpings: 0 });
  });
});

describe("teamOutcome", () => {
  it("is won for the side that chased down the target", () => {
    const { result } = twoOvers([1, 0, 0, 0, 0, 0], [2, 0, 0, 0, 0, 0]).state;
    expect(result).toMatchObject({ kind: "won_by_wickets", winner: "B" });
    expect(teamOutcome(result, "B")).toBe("won");
    expect(teamOutcome(result, "A")).toBe("lost");
  });

  it("is won for the side that defended its total", () => {
    const { result } = twoOvers([4, 4, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0]).state;
    expect(result).toMatchObject({ kind: "won_by_runs", winner: "A" });
    expect(teamOutcome(result, "A")).toBe("won");
    expect(teamOutcome(result, "B")).toBe("lost");
  });

  it("is tied for both sides on a tie", () => {
    const { result } = twoOvers([3, 3, 0, 0, 0, 0], [3, 3, 0, 0, 0, 0]).state;
    expect(result).toEqual({ kind: "tie" });
    expect(teamOutcome(result, "A")).toBe("tied");
    expect(teamOutcome(result, "B")).toBe("tied");
  });

  it("is null when there is no result", () => {
    expect(teamOutcome(null, "A")).toBeNull();
    expect(teamOutcome(null, "B")).toBeNull();
  });

  it("is carried into the match record for the side that batted second", () => {
    const m = twoOvers([4, 4, 0, 0, 0, 0], [6, 6, 0, 0, 0, 0]);
    expect(matchRecord(m.state, "B", ["p-Zain"], PLAYED_AT).outcome).toBe("won");
    expect(matchRecord(m.state, "A", ["p-Ali"], PLAYED_AT).outcome).toBe("lost");
  });
});
