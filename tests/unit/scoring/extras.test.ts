import { describe, expect, it } from "vitest";
import { deliveryDraft } from "@/lib/scoring";
import { TestMatch, batterLine, bowlerLine } from "../../helpers/match";

describe("wides", () => {
  it("wide adds penalty, not a ball", () => {
    const m = new TestMatch();
    m.ball({ kind: "wide", runs: 0 });
    expect(m.inn).toMatchObject({ runs: 1, legalBalls: 0, extras: { wides: 1 } });
    expect(bowlerLine(m, "Hamza")).toMatchObject({ runs: 1, wides: 1 });
    expect(batterLine(m, "Ali").balls).toBe(0);
  });

  it("wide with odd runs run swaps strike", () => {
    const m = new TestMatch();
    m.ball({ kind: "wide", runs: 1 });
    expect(m.inn.runs).toBe(2);
    expect(m.inn.striker).toBe(m.id("Usman"));
  });

  it("wide with even runs keeps strike", () => {
    const m = new TestMatch();
    m.ball({ kind: "wide", runs: 2 });
    expect(m.inn.runs).toBe(3);
    expect(m.inn.striker).toBe(m.id("Ali"));
  });

  it("wide counts as a ball when not re-bowled", () => {
    const m = new TestMatch({ rules: { wideRebowled: false } });
    m.ball({ kind: "wide", runs: 0 });
    expect(m.inn.legalBalls).toBe(1);
    expect(bowlerLine(m, "Hamza").legalBalls).toBe(1);
    expect(batterLine(m, "Ali").balls).toBe(0);
  });

  it("wide runs are all wides, whatever runsAs says, and none go to the batter", () => {
    const m = new TestMatch();
    m.ball({ kind: "wide", runs: 2, runsAs: "bye" });
    expect(m.inn.extras).toEqual({ wides: 3, noBalls: 0, byes: 0, legByes: 0 });
    expect(bowlerLine(m, "Hamza").runs).toBe(3);
    expect(batterLine(m, "Ali")).toMatchObject({ runs: 0, balls: 0 });
  });

  it("is not a dot for the batter or the bowler", () => {
    const m = new TestMatch();
    m.ball({ kind: "wide", runs: 0 });
    expect(batterLine(m, "Ali").dots).toBe(0);
    expect(bowlerLine(m, "Hamza").dots).toBe(0);
  });

  it("uses the penalty recorded on the event", () => {
    const m = new TestMatch({ rules: { wideRuns: 2 } });
    m.ball({ kind: "wide", runs: 0 });
    expect(m.inn.runs).toBe(2);
    expect(m.inn.extras.wides).toBe(2);
  });

  it("uses the recorded penalty rather than the current rules", () => {
    const m = new TestMatch();
    m.push({ ...deliveryDraft(m.state, { kind: "wide", runs: 1 }), penalty: 5 });
    expect(m.inn.runs).toBe(6);
    expect(m.inn.extras.wides).toBe(6);
    expect(bowlerLine(m, "Hamza").runs).toBe(6);
  });

  it("ends the over on the sixth ball when a wide is not re-bowled", () => {
    const m = new TestMatch({ rules: { wideRebowled: false } });
    m.over([0, 0, 0, 0, 0]);
    m.ball({ kind: "wide", runs: 0 });
    expect(m.inn).toMatchObject({ legalBalls: 6, bowler: null, striker: m.id("Usman") });
    expect(m.inn.overs).toHaveLength(1);
  });

  it("does not end the over when a wide is re-bowled", () => {
    const m = new TestMatch();
    m.over([0, 0, 0, 0, 0]);
    m.ball({ kind: "wide", runs: 0 });
    expect(m.inn).toMatchObject({ legalBalls: 5, bowler: m.id("Hamza"), striker: m.id("Ali") });
    m.ball({ runs: 0 });
    expect(m.inn.bowler).toBeNull();
  });

  it("spoils a maiden and adds to the over's runs", () => {
    const m = new TestMatch();
    m.ball({ kind: "wide", runs: 0 });
    m.over([0, 0, 0, 0, 0, 0]);
    expect(bowlerLine(m, "Hamza")).toMatchObject({ maidens: 0, runs: 1, legalBalls: 6 });
    expect(m.inn.overs[0]).toMatchObject({ index: 0, bowler: m.id("Hamza"), runs: 1 });
  });

  it("opens the over when a wide is the first delivery of it", () => {
    const m = new TestMatch();
    m.over([0, 0, 0, 0, 0, 0]);
    m.bowler("Bilal");
    m.ball({ kind: "wide", runs: 0 });
    expect(m.inn.overs).toHaveLength(2);
    expect(m.inn.overs[1]).toMatchObject({ index: 1, bowler: m.id("Bilal"), runs: 1 });
    expect(bowlerLine(m, "Bilal")).toMatchObject({ runs: 1, wides: 1, legalBalls: 0 });
  });
});

describe("no-balls", () => {
  it("no-ball six off the bat", () => {
    const m = new TestMatch();
    m.ball({ kind: "noball", runs: 6, boundary: true });
    expect(m.inn).toMatchObject({ runs: 7, legalBalls: 0, freeHit: true, extras: { noBalls: 1 } });
    expect(batterLine(m, "Ali")).toMatchObject({ runs: 6, balls: 1, sixes: 1 });
    expect(bowlerLine(m, "Hamza")).toMatchObject({ runs: 7, noBalls: 1 });
  });

  it("no-ball byes are not charged to the bowler", () => {
    const m = new TestMatch();
    m.ball({ kind: "noball", runs: 2, runsAs: "bye" });
    expect(m.inn.extras).toMatchObject({ noBalls: 1, byes: 2 });
    expect(bowlerLine(m, "Hamza").runs).toBe(1);
  });

  it("no-ball leg byes go to leg byes and the batter still faces the ball", () => {
    const m = new TestMatch();
    m.ball({ kind: "noball", runs: 1, runsAs: "legbye" });
    expect(m.inn).toMatchObject({ runs: 2, extras: { noBalls: 1, legByes: 1 } });
    expect(batterLine(m, "Ali")).toMatchObject({ runs: 0, balls: 1 });
    expect(bowlerLine(m, "Hamza").runs).toBe(1);
  });

  it("does not count towards the over or the bowler's legal balls", () => {
    const m = new TestMatch();
    m.over([0, 0, 0, 0, 0]);
    m.ball({ kind: "noball", runs: 0 });
    expect(m.inn).toMatchObject({ legalBalls: 5, bowler: m.id("Hamza") });
    expect(bowlerLine(m, "Hamza").legalBalls).toBe(5);
    m.ball({ runs: 0 });
    expect(m.inn).toMatchObject({ legalBalls: 6, bowler: null });
  });

  it("rotates strike on odd runs and keeps it on even runs", () => {
    const m = new TestMatch();
    m.ball({ kind: "noball", runs: 1 });
    expect(m.inn.striker).toBe(m.id("Usman"));
    m.ball({ kind: "noball", runs: 2 });
    expect(m.inn.striker).toBe(m.id("Usman"));
  });

  it("rotates strike on odd byes", () => {
    const m = new TestMatch();
    m.ball({ kind: "noball", runs: 1, runsAs: "bye" });
    expect(m.inn.striker).toBe(m.id("Usman"));
  });

  it("counts a four off the bat but not a boundary scored as byes", () => {
    const m = new TestMatch();
    m.ball({ kind: "noball", runs: 4, boundary: true });
    m.ball({ kind: "noball", runs: 4, boundary: true, runsAs: "bye" });
    expect(batterLine(m, "Ali")).toMatchObject({ runs: 4, fours: 1, sixes: 0, balls: 2 });
    expect(m.inn.extras).toMatchObject({ noBalls: 2, byes: 4 });
  });

  it("is not a dot for the batter or the bowler", () => {
    const m = new TestMatch();
    m.ball({ kind: "noball", runs: 0 });
    expect(batterLine(m, "Ali")).toMatchObject({ balls: 1, dots: 0 });
    expect(bowlerLine(m, "Hamza").dots).toBe(0);
  });

  it("spoils a maiden even when the runs are byes", () => {
    const m = new TestMatch();
    m.ball({ kind: "noball", runs: 2, runsAs: "bye" });
    m.over([0, 0, 0, 0, 0, 0]);
    expect(bowlerLine(m, "Hamza")).toMatchObject({ maidens: 0, runs: 1 });
    expect(m.inn.overs[0].runs).toBe(3);
  });

  it("uses the penalty recorded on the event", () => {
    const m = new TestMatch({ rules: { noBallRuns: 2 } });
    m.ball({ kind: "noball", runs: 0 });
    expect(m.inn.runs).toBe(2);
    expect(m.inn.extras.noBalls).toBe(2);
    expect(bowlerLine(m, "Hamza").runs).toBe(2);
  });

  it("uses the recorded penalty rather than the current rules", () => {
    const m = new TestMatch();
    m.push({ ...deliveryDraft(m.state, { kind: "noball", runs: 3 }), penalty: 4 });
    expect(m.inn.runs).toBe(7);
    expect(m.inn.extras.noBalls).toBe(4);
    expect(bowlerLine(m, "Hamza").runs).toBe(7);
  });
});

describe("free hit", () => {
  it("free hit carries over a wide and clears after a legal ball", () => {
    const m = new TestMatch();
    m.ball({ kind: "noball", runs: 0 });
    m.ball({ kind: "wide", runs: 0 });
    expect(m.inn.freeHit).toBe(true);
    m.ball({ runs: 0 });
    expect(m.inn.freeHit).toBe(false);
  });

  it("no free hit when the rule is off", () => {
    const m = new TestMatch({ rules: { freeHit: false } });
    m.ball({ kind: "noball", runs: 0 });
    expect(m.inn.freeHit).toBe(false);
  });

  it("a second no-ball keeps the free hit", () => {
    const m = new TestMatch();
    m.ball({ kind: "noball", runs: 0 });
    m.ball({ kind: "noball", runs: 0 });
    expect(m.inn.freeHit).toBe(true);
  });

  it("a wide that counts as a ball does not clear the free hit", () => {
    const m = new TestMatch({ rules: { wideRebowled: false } });
    m.ball({ kind: "noball", runs: 0 });
    m.ball({ kind: "wide", runs: 0 });
    expect(m.inn.freeHit).toBe(true);
  });

  it("a legal ball with byes clears it too", () => {
    const m = new TestMatch();
    m.ball({ kind: "noball", runs: 0 });
    m.ball({ runs: 1, runsAs: "bye" });
    expect(m.inn.freeHit).toBe(false);
  });

  it("is false before any no-ball and after the free hit is over", () => {
    const m = new TestMatch();
    expect(m.inn.freeHit).toBe(false);
    m.ball({ runs: 1 });
    expect(m.inn.freeHit).toBe(false);
  });

  it("carries across the end of an over", () => {
    const m = new TestMatch({ rules: { wideRebowled: false } });
    m.over([0, 0, 0, 0]);
    m.ball({ kind: "noball", runs: 0 });
    m.ball({ runs: 0 });
    expect(m.inn.freeHit).toBe(false);
    m.ball({ kind: "noball", runs: 0 });
    m.ball({ kind: "wide", runs: 0 });
    expect(m.inn).toMatchObject({ legalBalls: 6, bowler: null, freeHit: true });
    m.bowler("Bilal");
    m.ball({ runs: 0 });
    expect(m.inn.freeHit).toBe(false);
  });
});
