import { describe, expect, it } from "vitest";
import { buildPatch, fieldsOf, findBall, isUnchanged, setKind, setRuns, wicketOptions } from "@/components/scoring/ball-patch";
import type { BallFields, EditableBall } from "@/components/scoring/ball-patch";
import { canCorrect, defaultRules, replay } from "@/lib/scoring";
import type { DeliveryEvent } from "@/lib/scoring";
import { TestMatch } from "../../helpers/match";

const rules = { ...defaultRules("tape", 10), wideRuns: 2, noBallRuns: 3 };

function legal(overrides: Partial<BallFields> = {}): BallFields {
  return { kind: "legal", runs: 1, runsAs: "bat", boundary: false, wicketKind: null, fielder: "", fielderId: null, ...overrides };
}

function editable(m: TestMatch, event: DeliveryEvent): EditableBall {
  const ball = findBall(m.events, m.state, event.id);
  if (ball === null) throw new Error("ball not found");
  return ball;
}

describe("buildPatch", () => {
  it("sends every editable field of a ball without a wicket", () => {
    expect(buildPatch(legal({ runs: 4, boundary: true }), rules)).toEqual({
      kind: "legal",
      runs: 4,
      runsAs: "bat",
      boundary: true,
      penalty: 0,
    });
  });

  it("derives the penalty from the ball kind and the current rules", () => {
    expect(buildPatch(legal({ kind: "wide" }), rules).penalty).toBe(2);
    expect(buildPatch(legal({ kind: "noball" }), rules).penalty).toBe(3);
    expect(buildPatch(legal({ kind: "legal" }), rules).penalty).toBe(0);
  });

  it("keeps runs as the bat on a wide", () => {
    expect(buildPatch(legal({ kind: "wide", runsAs: "bye" }), rules).runsAs).toBe("bat");
    expect(buildPatch(legal({ kind: "noball", runsAs: "bye" }), rules).runsAs).toBe("bye");
  });

  it("only marks a boundary on a 4 or a 6", () => {
    expect(buildPatch(legal({ runs: 2, boundary: true }), rules).boundary).toBe(false);
    expect(buildPatch(legal({ runs: 6, boundary: true }), rules).boundary).toBe(true);
    expect(buildPatch(legal({ runs: 4, boundary: false }), rules).boundary).toBe(false);
  });

  it("includes the wicket only when the ball has one", () => {
    expect(buildPatch(legal({ wicketKind: "bowled" }), rules).wicket).toEqual({ kind: "bowled", fielderName: null, fielderId: null });
    expect(buildPatch(legal(), rules)).not.toHaveProperty("wicket");
  });

  it("keeps a trimmed fielder only for dismissals that name one", () => {
    expect(buildPatch(legal({ wicketKind: "caught", fielder: "  Zain " }), rules).wicket).toEqual({
      kind: "caught",
      fielderName: "Zain",
      fielderId: null,
    });
    expect(buildPatch(legal({ wicketKind: "caught", fielder: "  " }), rules).wicket).toEqual({
      kind: "caught",
      fielderName: null,
      fielderId: null,
    });
    expect(buildPatch(legal({ wicketKind: "bowled", fielder: "Zain" }), rules).wicket).toEqual({
      kind: "bowled",
      fielderName: null,
      fielderId: null,
    });
  });
});

describe("editing the form fields", () => {
  it("resets runs as when the ball becomes a wide", () => {
    expect(setKind(legal({ runsAs: "legbye" }), "wide")).toMatchObject({ kind: "wide", runsAs: "bat" });
    expect(setKind(legal({ runsAs: "legbye" }), "noball")).toMatchObject({ kind: "noball", runsAs: "legbye" });
  });

  it("marks a boundary by default on a 4 or 6 like the run pad does", () => {
    expect(setRuns(legal({ runs: 1 }), 4)).toMatchObject({ runs: 4, boundary: true });
    expect(setRuns(legal({ runs: 4, boundary: true }), 6)).toMatchObject({ runs: 6, boundary: true });
    expect(setRuns(legal({ runs: 4, boundary: true }), 2)).toMatchObject({ runs: 2, boundary: false });
  });
});

describe("a patch laid over the original ball", () => {
  it("pre-fills from the values after an earlier correction", () => {
    const m = new TestMatch();
    const ball = m.ball({ runs: 1 });
    m.correct(ball.id, { runs: 4, boundary: true });
    expect(fieldsOf(editable(m, ball).item)).toEqual(legal({ runs: 4, boundary: true }));
  });

  it("replaces the ball completely, whatever an earlier correction said", () => {
    const m = new TestMatch();
    const ball = m.ball({ runs: 1 });
    m.correct(ball.id, { runs: 6, boundary: true });
    const fields = setKind(fieldsOf(editable(m, ball).item), "wide");
    const patch = buildPatch(setRuns(fields, 0), m.state.rules);
    expect(canCorrect(ball, patch)).toBe(true);
    m.correct(ball.id, patch);

    expect(m.inn.runs).toBe(m.state.rules.wideRuns);
    expect(m.inn.legalBalls).toBe(m.state.rules.wideRebowled ? 0 : 1);
    expect(m.inn.batting.find((line) => line.playerId === m.id("Ali"))).toMatchObject({ runs: 0, sixes: 0 });
  });

  it("changes a caught wicket and its fielder without touching who was out", () => {
    const m = new TestMatch();
    const ball = m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Zain" } });
    const fields = fieldsOf(editable(m, ball).item);
    expect(fields).toMatchObject({ wicketKind: "caught", fielder: "Zain" });

    m.correct(ball.id, buildPatch({ ...fields, wicketKind: "stumped", fielder: "Faisal" }, m.state.rules));
    const out = m.inn.batting.find((line) => line.playerId === m.id("Ali"))?.out;
    expect(out).toEqual({ kind: "stumped", bowler: m.id("Hamza"), fielderName: "Faisal", fielderId: null });
  });

  it("reports whether the patch changes anything", () => {
    const m = new TestMatch();
    const ball = m.ball({ runs: 4, boundary: true });
    const { item } = editable(m, ball);
    const unchanged = fieldsOf(item);
    expect(isUnchanged(buildPatch(unchanged, m.state.rules), item)).toBe(true);
    expect(isUnchanged(buildPatch(setRuns(unchanged, 6), m.state.rules), item)).toBe(false);
    expect(isUnchanged(buildPatch(setKind(unchanged, "noball"), m.state.rules), item)).toBe(false);
    expect(isUnchanged(buildPatch({ ...unchanged, boundary: false }, m.state.rules), item)).toBe(false);
  });

  it("does not report a wicket ball with an unknown fielder as changed", () => {
    const m = new TestMatch();
    const ball = m.ball({ runs: 0, wicket: { kind: "bowled" } });
    const { item } = editable(m, ball);
    expect(isUnchanged(buildPatch(fieldsOf(item), m.state.rules), item)).toBe(true);
  });
});

describe("wicketOptions", () => {
  it("offers every dismissal on a legal ball except the retirements", () => {
    const m = new TestMatch({ rules: { lbw: true } });
    const ball = m.ball({ runs: 0, wicket: { kind: "bowled" } });
    expect(wicketOptions(m.state, editable(m, ball), "legal")).toEqual([
      "bowled",
      "caught",
      "lbw",
      "run_out",
      "stumped",
      "hit_wicket",
      "other",
    ]);
  });

  it("follows the ball kind", () => {
    const m = new TestMatch({ rules: { lbw: true } });
    const ball = m.ball({ runs: 0, wicket: { kind: "bowled" } });
    expect(wicketOptions(m.state, editable(m, ball), "wide")).toEqual(["stumped", "run_out", "hit_wicket", "other"]);
    expect(wicketOptions(m.state, editable(m, ball), "noball")).toEqual(["run_out", "other"]);
  });

  it("leaves out LBW when the match has no LBW", () => {
    const m = new TestMatch({ rules: { lbw: false } });
    const ball = m.ball({ runs: 0, wicket: { kind: "bowled" } });
    expect(wicketOptions(m.state, editable(m, ball), "legal")).not.toContain("lbw");
  });

  it("restricts a ball that was a free hit even after the free hit is over", () => {
    const m = new TestMatch();
    m.ball({ kind: "noball", runs: 0 });
    const freeHit = m.ball({ runs: 0 });
    m.ball({ runs: 0 });
    expect(wicketOptions(m.state, editable(m, freeHit), "legal")).toEqual(["run_out", "other"]);
  });

  it("does not restrict an earlier ball just because a free hit is live now", () => {
    const m = new TestMatch();
    const first = m.ball({ runs: 0 });
    m.ball({ kind: "noball", runs: 0 });
    expect(m.inn.freeHit).toBe(true);
    expect(wicketOptions(m.state, editable(m, first), "legal")).toContain("bowled");
  });

  it("only offers what can dismiss the non-striker when the non-striker was out", () => {
    const m = new TestMatch({ rules: { lbw: true } });
    const ball = m.ball({ runs: 1, wicket: { kind: "run_out", playerOut: m.id("Usman") } });
    expect(wicketOptions(m.state, editable(m, ball), "legal")).toEqual(["run_out", "other"]);
    expect(wicketOptions(m.state, editable(m, ball), "wide")).toEqual(["run_out", "other"]);
  });

  it("keeps every option when the striker was run out", () => {
    const m = new TestMatch({ rules: { lbw: true } });
    const ball = m.ball({ runs: 1, wicket: { kind: "run_out" } });
    expect(wicketOptions(m.state, editable(m, ball), "legal")).toContain("caught");
  });

  it("works for a ball in an innings that has ended", () => {
    const m = new TestMatch();
    const ball = m.ball({ runs: 0, wicket: { kind: "bowled" } });
    m.endInnings("manual");
    expect(replay(m.events).status).toBe("innings_break");
    expect(wicketOptions(m.state, editable(m, ball), "legal")).toContain("caught");
  });
});

describe("findBall", () => {
  it("finds a delivery with its effective values and innings", () => {
    const m = new TestMatch();
    const ball = m.ball({ runs: 2 });
    m.correct(ball.id, { runs: 3 });
    const found = findBall(m.events, m.state, ball.id);
    expect(found?.event).toEqual(ball);
    expect(found?.item.runs).toBe(3);
    expect(found?.innings.number).toBe(1);
  });

  it("finds nothing for an id that is not a live delivery", () => {
    const m = new TestMatch();
    const ball = m.ball({ runs: 2 });
    expect(findBall(m.events, m.state, "nope")).toBeNull();
    expect(findBall(m.events, m.state, m.events[0].id)).toBeNull();
    m.undo();
    expect(findBall(m.events, m.state, ball.id)).toBeNull();
  });
});
