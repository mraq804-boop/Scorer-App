import { describe, expect, it } from "vitest";
import { EngineError, nextPrompt } from "@/lib/scoring";
import { summarize } from "@/lib/share/summary";
import { matchRecord } from "@/lib/team/match-record";
import { TestMatch } from "../../helpers/match";

const THEY_BAT_FIRST = { winner: "A", choice: "bowl" } as const;

describe("a typed first innings", () => {
  it("sets the target from the typed total and asks for the chase", () => {
    const m = new TestMatch({ overs: 20, toss: THEY_BAT_FIRST, typedFirst: true });
    m.enter(1, { runs: 145, wickets: 7, legalBalls: 118, bowlers: [["Hamza", 24, 28, 2], ["Usman", 24, 30, 3]] });

    const state = m.state;
    expect(state.status).toBe("innings_break");
    expect(state.target).toBe(146);
    expect(nextPrompt(state)).toEqual({ kind: "start_innings", innings: 2 });
    expect(state.innings[0]).toMatchObject({
      number: 1,
      battingTeam: "B",
      bowlingTeam: "A",
      runs: 145,
      wickets: 7,
      legalBalls: 118,
      entered: true,
      batting: [],
      overs: [],
      commentary: [],
    });
    expect(state.innings[0].ended).not.toBeNull();
    expect(state.innings[0].bowling).toEqual([
      { playerId: m.id("Hamza"), legalBalls: 24, runs: 28, wickets: 2, wides: 0, noBalls: 0, maidens: 0, dots: 0 },
      { playerId: m.id("Usman"), legalBalls: 24, runs: 30, wickets: 3, wides: 0, noBalls: 0, maidens: 0, dots: 0 },
    ]);
  });

  it("is chased ball by ball and gives a win by wickets", () => {
    const m = new TestMatch({ overs: 1, toss: THEY_BAT_FIRST, typedFirst: true });
    m.enter(1, { runs: 3, wickets: 2, legalBalls: 6 });
    m.startInnings2(["Ali", "Bilal"], "Kamran");
    m.over([1, 1, 2]);
    m.endInnings("target");

    expect(m.state.status).toBe("complete");
    expect(m.state.result).toEqual({ kind: "won_by_wickets", winner: "A", wickets: 10, ballsLeft: 3 });
    expect(summarize(m.state).lines).toEqual(["Tigers 3/2 (1 ov)", "Lions 4/0 (0.3 ov)"]);
  });
});

describe("a typed second innings", () => {
  it("finishes the match with a win by runs", () => {
    const m = new TestMatch({ overs: 1 });
    m.over([4, 4, 1, 1, 0, 0]);
    m.endInnings("overs");
    m.enter(2, { runs: 7, wickets: 4, legalBalls: 6, bowlers: [["Raza", 6, 7, 3]] });

    expect(m.state.status).toBe("complete");
    expect(m.state.result).toEqual({ kind: "won_by_runs", winner: "A", runs: 3 });
    expect(nextPrompt(m.state)).toBeNull();
  });

  it("gives a win by wickets with balls left when the typed chase gets there", () => {
    const m = new TestMatch({ overs: 2 });
    m.over([1, 1, 1, 1, 1, 1]);
    m.endInnings("overs");
    m.enter(2, { runs: 7, wickets: 3, legalBalls: 9 });

    expect(m.state.result).toEqual({ kind: "won_by_wickets", winner: "B", wickets: 7, ballsLeft: 3 });
  });

  it("counts our typed bowlers' figures in the team record", () => {
    const m = new TestMatch({ overs: 1 });
    m.over([1, 1, 1, 1, 1, 1]);
    m.endInnings("overs");
    m.enter(2, { runs: 4, wickets: 2, legalBalls: 6, bowlers: [["Raza", 6, 4, 2]] });

    const record = matchRecord(m.state, "A", [m.id("Ali"), m.id("Raza")], "2026-11-02T10:00:00.000Z");
    expect(record.outcome).toBe("won");
    expect(record.players.find((player) => player.playerId === m.id("Raza"))?.bowling).toEqual({
      legalBalls: 6,
      runs: 4,
      wickets: 2,
      maidens: 0,
      dots: 0,
    });
  });
});

describe("editing and undoing a typed innings", () => {
  it("replaces the typed total and works the result out again", () => {
    const m = new TestMatch({ overs: 1 });
    m.over([1, 1, 1, 1, 1, 1]);
    m.endInnings("overs");
    m.enter(2, { runs: 4, wickets: 2, legalBalls: 6, bowlers: [["Raza", 6, 4, 2]] });
    m.enter(2, { runs: 9, wickets: 1, legalBalls: 5, bowlers: [["Raza", 5, 9, 1]] });

    expect(m.state.innings).toHaveLength(2);
    expect(m.state.innings[1]).toMatchObject({ runs: 9, wickets: 1, legalBalls: 5 });
    expect(m.state.innings[1].bowling).toEqual([
      { playerId: m.id("Raza"), legalBalls: 5, runs: 9, wickets: 1, wides: 0, noBalls: 0, maidens: 0, dots: 0 },
    ]);
    expect(m.state.result).toEqual({ kind: "won_by_wickets", winner: "B", wickets: 9, ballsLeft: 1 });
  });

  it("moves the target of a chase already under way when the first innings is edited", () => {
    const m = new TestMatch({ overs: 2, toss: THEY_BAT_FIRST, typedFirst: true });
    m.enter(1, { runs: 10, wickets: 2, legalBalls: 12 });
    m.startInnings2(["Ali", "Bilal"], "Kamran");
    m.over([1, 1]);
    m.enter(1, { runs: 14, wickets: 2, legalBalls: 12 });

    expect(m.state.target).toBe(15);
    expect(m.state.status).toBe("in_progress");
    expect(m.inn.number).toBe(2);
  });

  it("undo takes back the latest typed entry", () => {
    const m = new TestMatch({ overs: 1 });
    m.over([1, 1, 1, 1, 1, 1]);
    m.endInnings("overs");
    m.enter(2, { runs: 4, wickets: 2, legalBalls: 6 });
    m.enter(2, { runs: 9, wickets: 1, legalBalls: 5 });

    m.undo();
    expect(m.state.innings[1]).toMatchObject({ runs: 4, wickets: 2 });
    expect(m.state.status).toBe("complete");

    m.undo();
    expect(m.state.innings).toHaveLength(1);
    expect(m.state.status).toBe("innings_break");
    expect(m.state.result).toBeNull();
  });
});

describe("refused typed innings", () => {
  it("won't replace an innings that is being scored, or come before the first innings ends", () => {
    const m = new TestMatch({ overs: 1 });
    m.enter(1, { runs: 1, wickets: 0, legalBalls: 1 });
    expect(() => m.state).toThrow(new EngineError("innings_started_twice"));

    const n = new TestMatch({ overs: 1 });
    n.ball({ runs: 1 });
    n.enter(2, { runs: 1, wickets: 0, legalBalls: 1 });
    expect(() => n.state).toThrow(new EngineError("no_innings"));
  });

  it("won't let the same side bat twice", () => {
    const m = new TestMatch({ overs: 1 });
    m.over([1, 1, 1, 1, 1, 1]);
    m.endInnings("overs");
    m.enter(2, { runs: 1, wickets: 0, legalBalls: 1 }, "A");
    expect(() => m.state).toThrow(new EngineError("wrong_side"));
  });

  it("won't start a scored innings over a typed one", () => {
    const m = new TestMatch({ overs: 1, toss: THEY_BAT_FIRST, typedFirst: true });
    m.enter(1, { runs: 5, wickets: 1, legalBalls: 6 });
    m.startInnings2(["Ali", "Bilal"], "Kamran");
    m.endInnings("manual");
    m.enter(2, { runs: 1, wickets: 0, legalBalls: 1 });
    expect(() => m.state).toThrow(new EngineError("innings_started_twice"));
  });
});
