import { describe, expect, it } from "vitest";
import { canCorrect, replay, undoTargets } from "@/lib/scoring";
import type { CorrectionPatch, MatchEvent } from "@/lib/scoring";
import { TestMatch, batterLine, bowlerLine } from "../../helpers/match";

function eventOfType<T extends MatchEvent["type"]>(m: TestMatch, type: T): Extract<MatchEvent, { type: T }> {
  const event = m.events.find((e) => e.type === type);
  if (event === undefined) throw new Error(`no ${type} event`);
  return event as Extract<MatchEvent, { type: T }>;
}

function mismatches(m: TestMatch): string[] {
  return m.state.warnings.filter((w) => w.kind === "strike_mismatch").map((w) => w.eventId);
}

describe("undo", () => {
  it("restores the previous state exactly", () => {
    const m = new TestMatch();
    m.over([1, 4]);
    const before = m.state;
    m.ball({ runs: 2 });
    m.undo();
    expect(m.state).toEqual(before);
  });

  it("removes a wicket together with the incoming batter", () => {
    const m = new TestMatch();
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    m.batter("Saad");
    m.undo();
    expect(m.inn.wickets).toBe(0);
    expect(m.inn.striker).toBe(m.id("Ali"));
    expect(m.inn.nonStriker).toBe(m.id("Usman"));
    expect(m.inn.batting.map((line) => line.playerId)).toEqual([m.id("Ali"), m.id("Usman")]);
  });

  it("steps back two deliveries when repeated", () => {
    const m = new TestMatch();
    m.over([1, 2, 3]);
    m.undo();
    m.undo();
    expect(m.inn.runs).toBe(1);
    expect(m.inn.legalBalls).toBe(1);
  });

  it("can step back past the start of an over and a bowler change", () => {
    const m = new TestMatch({ overs: 2 });
    m.over([1, 1, 1, 1, 1, 1]);
    const afterFirstOver = m.state;
    m.bowler("Kamran");
    m.ball({ runs: 4, boundary: true });
    m.undo();
    expect(m.state.innings[0]).toEqual({ ...afterFirstOver.innings[0], bowler: m.id("Kamran") });
    m.undo();
    expect(m.state.innings[0].legalBalls).toBe(5);
  });

  it("undoes a retirement", () => {
    const m = new TestMatch();
    m.ball({ runs: 1 });
    m.push({ type: "retired", player: m.id("Usman"), how: "out" });
    expect(m.inn.wickets).toBe(1);
    m.undo();
    expect(m.inn.wickets).toBe(0);
    expect(m.inn.striker).toBe(m.id("Usman"));
    expect(m.inn.nonStriker).toBe(m.id("Ali"));
  });

  it("undoes the end of an innings", () => {
    const m = new TestMatch({ overs: 1 });
    m.over([1, 1, 1, 1, 1, 1]);
    m.endInnings("overs");
    expect(m.state.status).toBe("innings_break");
    m.undo();
    expect(m.state.status).toBe("in_progress");
    expect(m.state.target).toBeNull();
  });

  it("undoes a settings change", () => {
    const m = new TestMatch({ overs: 10 });
    m.push({ type: "settings_changed", oversPerInnings: 2 });
    m.undo();
    expect(m.state.rules.oversPerInnings).toBe(10);
  });

  it("undoes the start of an innings", () => {
    const m = new TestMatch({ overs: 1 });
    m.over([1, 1, 1, 1, 1, 1]);
    m.endInnings("overs");
    m.startInnings2(["Bilal", "Zain"], "Kamran");
    m.undo();
    expect(m.state.innings).toHaveLength(1);
    expect(m.state.status).toBe("innings_break");
  });

  it("can step back to the match setup and then does nothing", () => {
    const m = new TestMatch();
    m.undo();
    const setup = m.state;
    expect(setup.innings).toHaveLength(0);
    expect(setup.status).toBe("setup");
    m.undo();
    expect(m.state).toEqual(setup);
  });

  it("keeps stepping back in order regardless of event array order", () => {
    const m = new TestMatch();
    m.over([1, 2, 3]);
    m.undo();
    const shuffled = [...m.events].reverse();
    expect(replay(shuffled)).toEqual(m.state);
  });
});

describe("undoTargets", () => {
  it("never includes match_created or player_added", () => {
    const m = new TestMatch();
    const targets = undoTargets(m.events);
    expect(targets).toEqual([eventOfType(m, "innings_started").id]);
    expect(targets).not.toContain(eventOfType(m, "match_created").id);
    expect(targets).not.toContain(eventOfType(m, "player_added").id);
  });

  it("returns the latest delivery plus the later events, minus players, undos and corrections", () => {
    const m = new TestMatch();
    const first = m.ball({ runs: 1 });
    const second = m.ball({ runs: 0, wicket: { kind: "bowled" } });
    m.batter("Saad");
    m.push({ type: "strike_swapped" });
    m.correct(first.id, { runs: 2 });
    m.bowler("Kamran");
    const targets = undoTargets(m.events);
    const expected = m.events
      .filter((e) => e.seq >= second.seq && ["delivery", "batter_in", "strike_swapped", "bowler_changed"].includes(e.type))
      .map((e) => e.id);
    expect(targets).toEqual(expected);
    expect(targets).not.toContain(first.id);
  });

  it("skips events that were already undone when picking the anchor", () => {
    const m = new TestMatch();
    const first = m.ball({ runs: 1 });
    const second = m.ball({ runs: 2 });
    m.undo();
    expect(undoTargets(m.events)).toEqual([first.id]);
    expect(undoTargets(m.events)).not.toContain(second.id);
  });

  it("never targets an undo or a correction", () => {
    const m = new TestMatch();
    const e = m.ball({ runs: 1 });
    m.correct(e.id, { runs: 2 });
    m.ball({ runs: 1 });
    m.undo();
    const undoIds = m.events.filter((x) => x.type === "undo" || x.type === "correct").map((x) => x.id);
    for (const id of undoTargets(m.events)) expect(undoIds).not.toContain(id);
  });

  it("is empty when there is no anchor", () => {
    const m = new TestMatch();
    const withoutInnings = m.events.filter((e) => e.type !== "innings_started");
    expect(undoTargets(withoutInnings)).toEqual([]);
  });

  it("is empty once everything has been undone back to the match setup", () => {
    const m = new TestMatch();
    m.ball({ runs: 1 });
    m.undo();
    m.undo();
    expect(undoTargets(m.events)).toEqual([]);
  });
});

describe("corrections", () => {
  it("correcting runs updates totals and flags strike mismatch", () => {
    const m = new TestMatch();
    const e = m.ball({ runs: 1 });
    const later = m.ball({ runs: 0 });
    m.correct(e.id, { runs: 2 });
    expect(m.inn.runs).toBe(2);
    expect(m.state.warnings).toContainEqual({ eventId: later.id, kind: "strike_mismatch" });
  });

  it("matches a fresh replay of a match scored with the corrected value", () => {
    const corrected = new TestMatch();
    const e = corrected.ball({ runs: 1 });
    corrected.ball({ runs: 3 });
    corrected.correct(e.id, { runs: 2 });

    const fresh = new TestMatch();
    fresh.ball({ runs: 2 });
    fresh.ball({ runs: 3 });

    expect(corrected.inn.runs).toBe(fresh.inn.runs);
    expect(corrected.inn.legalBalls).toBe(fresh.inn.legalBalls);
    expect(corrected.inn.extras).toEqual(fresh.inn.extras);
    expect(batterLine(corrected, "Ali")).toMatchObject({ runs: 2, balls: 1 });
  });

  it("legal to wide removes a legal ball", () => {
    const m = new TestMatch();
    const e = m.ball({ runs: 0 });
    m.correct(e.id, { kind: "wide", penalty: 1 });
    expect(m.inn.legalBalls).toBe(0);
    expect(m.inn.runs).toBe(1);
    expect(m.inn.extras.wides).toBe(1);
    expect(batterLine(m, "Ali").balls).toBe(0);
  });

  it("wide to legal adds a legal ball", () => {
    const m = new TestMatch();
    const e = m.ball({ kind: "wide", runs: 0 });
    m.correct(e.id, { kind: "legal", penalty: 0 });
    expect(m.inn.legalBalls).toBe(1);
    expect(m.inn.runs).toBe(0);
    expect(m.inn.extras.wides).toBe(0);
  });

  it("changes the extras type of a run", () => {
    const m = new TestMatch();
    const e = m.ball({ runs: 2 });
    m.correct(e.id, { runsAs: "bye" });
    expect(m.inn.runs).toBe(2);
    expect(m.inn.extras.byes).toBe(2);
    expect(batterLine(m, "Ali").runs).toBe(0);
  });

  it("changes a boundary", () => {
    const m = new TestMatch();
    const e = m.ball({ runs: 4, boundary: true });
    m.correct(e.id, { boundary: false });
    expect(batterLine(m, "Ali").fours).toBe(0);
    expect(batterLine(m, "Ali").runs).toBe(4);
  });

  it("latest correction wins", () => {
    const m = new TestMatch();
    const e = m.ball({ runs: 1 });
    m.correct(e.id, { runs: 2 });
    m.correct(e.id, { runs: 3 });
    expect(m.inn.runs).toBe(3);
  });

  it("applies only the latest patch over the original ball", () => {
    const m = new TestMatch();
    const e = m.ball({ runs: 1 });
    m.correct(e.id, { runs: 4, boundary: true });
    m.correct(e.id, { runsAs: "legbye" });
    expect(m.inn.runs).toBe(1);
    expect(m.inn.extras.legByes).toBe(1);
    expect(batterLine(m, "Ali").fours).toBe(0);
  });

  it("changes a dismissal kind and fielder but keeps who was out", () => {
    const m = new TestMatch();
    const e = m.ball({ runs: 0, wicket: { kind: "bowled" } });
    m.correct(e.id, { wicket: { kind: "caught", fielderName: "Zain" } });
    expect(m.inn.wickets).toBe(1);
    expect(batterLine(m, "Ali").out).toEqual({ kind: "caught", bowler: m.id("Hamza"), fielderName: "Zain", fielderId: null });
  });

  it("keeps a run-out of the non-striker when the kind is corrected", () => {
    const m = new TestMatch();
    const e = m.ball({ runs: 1, wicket: { kind: "run_out", playerOut: m.id("Usman") } });
    m.correct(e.id, { wicket: { kind: "other", fielderName: null } });
    expect(batterLine(m, "Usman").out).toEqual({ kind: "other", bowler: null, fielderName: null, fielderId: null });
    expect(batterLine(m, "Ali").out).toBeNull();
    expect(m.inn.wickets).toBe(1);
  });

  it("moves the bowler's credit when a dismissal changes to a run-out", () => {
    const m = new TestMatch();
    const e = m.ball({ runs: 0, wicket: { kind: "bowled" } });
    m.correct(e.id, { wicket: { kind: "run_out", fielderName: null } });
    expect(bowlerLine(m, "Hamza").wickets).toBe(0);
    expect(batterLine(m, "Ali").out).toEqual({ kind: "run_out", bowler: null, fielderName: null, fielderId: null });
  });

  it("ignores a wicket patch on a ball without one", () => {
    const m = new TestMatch();
    const e = m.ball({ runs: 1 });
    m.correct(e.id, { runs: 2, wicket: { kind: "bowled", fielderName: null } });
    expect(m.inn.wickets).toBe(0);
    expect(m.inn.runs).toBe(2);
  });

  it("ignores a correction whose target was undone", () => {
    const m = new TestMatch();
    const e = m.ball({ runs: 1 });
    m.correct(e.id, { runs: 4, boundary: true });
    m.undo();
    expect(m.inn.runs).toBe(0);
    expect(m.inn.legalBalls).toBe(0);
  });

  it("ignores a correction whose target is not a delivery", () => {
    const m = new TestMatch();
    m.ball({ runs: 1 });
    const started = eventOfType(m, "innings_started");
    const before = m.state;
    m.correct(started.id, { runs: 6 });
    m.correct("no-such-event", { runs: 6 });
    expect(m.state).toEqual(before);
  });

  it("keeps a correction in force after later balls are undone", () => {
    const m = new TestMatch();
    const e = m.ball({ runs: 1 });
    m.ball({ runs: 0 });
    m.correct(e.id, { runs: 2 });
    m.undo();
    expect(m.inn.runs).toBe(2);
    expect(m.inn.legalBalls).toBe(1);
  });

  it("does not change the events it was given", () => {
    const m = new TestMatch();
    const e = m.ball({ runs: 1 });
    m.correct(e.id, { runs: 6, boundary: true });
    m.undo();
    const snapshot = JSON.stringify(m.events);
    replay(m.events);
    expect(JSON.stringify(m.events)).toBe(snapshot);
  });
});

describe("strike mismatch and recorded players", () => {
  it("credits later balls to the recorded players, not the state's", () => {
    const m = new TestMatch();
    const first = m.ball({ runs: 1 });
    m.ball({ runs: 0 });
    m.correct(first.id, { runs: 2 });
    expect(batterLine(m, "Ali")).toMatchObject({ runs: 2, balls: 1 });
    expect(batterLine(m, "Usman")).toMatchObject({ runs: 0, balls: 1, dots: 1 });
  });

  it("adopts the recorded ends after a mismatch", () => {
    const m = new TestMatch();
    const first = m.ball({ runs: 1 });
    m.ball({ runs: 0 });
    m.correct(first.id, { runs: 2 });
    expect(m.inn.striker).toBe(m.id("Usman"));
    expect(m.inn.nonStriker).toBe(m.id("Ali"));
  });

  it("does not flag a mismatch when nothing was edited", () => {
    const m = new TestMatch();
    m.over([1, 2, 0, 3, 4, 1]);
    m.bowler("Kamran");
    m.over([1, 1]);
    expect(mismatches(m)).toEqual([]);
  });

  it("does not flag a mismatch when the edit keeps the strike the same", () => {
    const m = new TestMatch();
    const first = m.ball({ runs: 1 });
    m.ball({ runs: 0 });
    m.correct(first.id, { runs: 3 });
    expect(mismatches(m)).toEqual([]);
  });

  it("flags only the ball where the record and the replay diverge", () => {
    const m = new TestMatch();
    const first = m.ball({ runs: 1 });
    const second = m.ball({ runs: 0 });
    m.ball({ runs: 1 });
    m.correct(first.id, { runs: 2 });
    expect(mismatches(m)).toEqual([second.id]);
  });

  it("drops the warning when the ball it was raised on is undone", () => {
    const m = new TestMatch();
    const first = m.ball({ runs: 1 });
    m.ball({ runs: 0 });
    m.correct(first.id, { runs: 2 });
    m.undo();
    expect(mismatches(m)).toEqual([]);
  });

  it("does not throw when a correction empties the bowler before the next ball", () => {
    const m = new TestMatch();
    m.over([0, 0, 0, 0, 0]);
    const wide = m.ball({ kind: "wide", runs: 0 });
    const lastLegal = m.ball({ runs: 0 });
    m.bowler("Kamran");
    m.ball({ runs: 1 });
    expect(m.inn.legalBalls).toBe(7);

    m.correct(wide.id, { kind: "legal", penalty: 0 });

    expect(m.inn.legalBalls).toBe(8);
    expect(mismatches(m)).toContain(lastLegal.id);
    expect(bowlerLine(m, "Hamza").legalBalls).toBe(7);
    expect(bowlerLine(m, "Kamran").legalBalls).toBe(1);
  });

  it("does not throw when a correction keeps an over open across a bowler change", () => {
    const m = new TestMatch();
    const events = m.over([0, 0, 0, 0, 0, 0]);
    m.bowler("Kamran");
    m.ball({ runs: 0 });
    m.correct(events[5].id, { kind: "wide", penalty: 1 });
    expect(m.inn.legalBalls).toBe(6);
    expect(bowlerLine(m, "Hamza").wides).toBe(1);
    expect(bowlerLine(m, "Kamran").legalBalls).toBe(1);
  });

  it("does not throw for a delivery when the state's end and bowler are empty", () => {
    const m = new TestMatch();
    m.over([0, 0, 0, 0, 0]);
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    expect(m.inn.nonStriker).toBeNull();
    expect(m.inn.bowler).toBeNull();
    m.push({
      type: "delivery",
      striker: m.id("Usman"),
      nonStriker: m.id("Saad"),
      bowler: m.id("Kamran"),
      kind: "legal",
      runs: 0,
      runsAs: "bat",
      boundary: false,
      penalty: 0,
      wicket: null,
    });
    expect(m.inn.legalBalls).toBe(7);
    expect(m.inn.striker).toBe(m.id("Usman"));
    expect(m.inn.nonStriker).toBe(m.id("Saad"));
    expect(m.inn.bowler).toBe(m.id("Kamran"));
    expect(batterLine(m, "Usman").balls).toBe(1);
    expect(mismatches(m)).toEqual([]);
  });
});

describe("canCorrect", () => {
  function plainBall(): MatchEvent {
    return new TestMatch().ball({ runs: 1 });
  }

  function wicketBall(): MatchEvent {
    return new TestMatch().ball({ runs: 0, wicket: { kind: "bowled" } });
  }

  it("cannot add or remove a wicket by editing", () => {
    const inningsStarted = eventOfType(new TestMatch(), "innings_started");
    expect(canCorrect(plainBall(), { wicket: { kind: "bowled", fielderName: null } })).toBe(false);
    expect(canCorrect(wicketBall(), { wicket: { kind: "caught", fielderName: "Zain" } })).toBe(true);
    expect(canCorrect(inningsStarted, { runs: 1 })).toBe(false);
    expect(canCorrect(wicketBall(), { wicket: null } as unknown as CorrectionPatch)).toBe(false);
  });

  it("allows edits to a wicket ball that leave the wicket alone", () => {
    expect(canCorrect(wicketBall(), { kind: "noball", penalty: 1, runs: 0 })).toBe(true);
    expect(canCorrect(plainBall(), {})).toBe(true);
  });

  it("only accepts deliveries", () => {
    const m = new TestMatch();
    const e = m.ball({ runs: 1 });
    m.correct(e.id, { runs: 2 });
    m.undo();
    for (const event of m.events.filter((x) => x.type !== "delivery")) {
      expect(canCorrect(event, { runs: 1 })).toBe(false);
    }
  });

  it.each([
    [0, true],
    [9, true],
    [-1, false],
    [10, false],
    [1.5, false],
  ])("runs %s -> %s", (runs, allowed) => {
    expect(canCorrect(plainBall(), { runs })).toBe(allowed);
  });

  it.each([
    [0, true],
    [5, true],
    [-1, false],
    [6, false],
    [0.5, false],
  ])("penalty %s -> %s", (penalty, allowed) => {
    expect(canCorrect(plainBall(), { penalty })).toBe(allowed);
  });
});
