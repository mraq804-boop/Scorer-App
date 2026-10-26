import { describe, expect, it } from "vitest";
import {
  boundaryPct,
  chaseNeed,
  chipLabel,
  dotBallPct,
  economy,
  playerName,
  requiredRunRate,
  runRate,
  strikeRate,
} from "@/lib/scoring";
import type { BallInput } from "@/lib/scoring";
import { TestMatch } from "../../helpers/match";

function label(input: BallInput): string {
  return chipLabel(new TestMatch().ball(input));
}

describe("rates", () => {
  it("rounds to two decimals", () => {
    expect(strikeRate(34, 22)).toBe(154.55);
    expect(economy(19, 16, 6)).toBe(7.13);
    expect(runRate(87, 70, 6)).toBe(7.46);
    expect(requiredRunRate(64, 50, 6)).toBe(7.68);
  });

  it("scales economy and run rate by balls per over", () => {
    expect(economy(16, 8, 8)).toBe(16);
    expect(runRate(30, 24, 8)).toBe(10);
  });

  it("has no required rate with no balls left", () => {
    expect(requiredRunRate(10, 0, 6)).toBeNull();
  });

  it("returns 0 rather than dividing by zero", () => {
    expect(strikeRate(0, 0)).toBe(0);
    expect(economy(0, 0, 6)).toBe(0);
    expect(runRate(0, 0, 6)).toBe(0);
  });
});

describe("chipLabel", () => {
  it("labels runs off the bat", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((runs) => label({ runs }))).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
    expect(label({ runs: 4, boundary: true })).toBe("4");
  });

  it("labels any wicket W", () => {
    expect(label({ runs: 0, wicket: { kind: "bowled" } })).toBe("W");
    expect(label({ runs: 1, wicket: { kind: "run_out" } })).toBe("W");
    expect(label({ kind: "noball", runs: 0, wicket: { kind: "run_out" } })).toBe("W");
    expect(label({ kind: "wide", runs: 0, wicket: { kind: "stumped" } })).toBe("W");
  });

  it("labels wides by their total", () => {
    expect(label({ kind: "wide", runs: 0 })).toBe("wd");
    expect(label({ kind: "wide", runs: 1 })).toBe("2wd");
    expect(label({ kind: "wide", runs: 4, boundary: true })).toBe("5wd");
  });

  it("labels no-balls by the runs scored, not the penalty", () => {
    expect(label({ kind: "noball", runs: 0 })).toBe("nb");
    expect(label({ kind: "noball", runs: 2 })).toBe("2nb");
    expect(label({ kind: "noball", runs: 6, boundary: true })).toBe("6nb");
    expect(label({ kind: "noball", runs: 1, runsAs: "bye" })).toBe("1nb");
  });

  it("labels byes and leg-byes", () => {
    expect(label({ runs: 2, runsAs: "bye" })).toBe("2b");
    expect(label({ runs: 1, runsAs: "legbye" })).toBe("1lb");
    expect(label({ runs: 0, runsAs: "bye" })).toBe("0");
  });
});

describe("over balls and commentary", () => {
  it("labels and commentary numbering", () => {
    const m = new TestMatch();
    m.ball({ kind: "wide", runs: 0 });
    m.ball({ runs: 1 });
    expect(m.inn.overs[0].balls.map((b) => b.label)).toEqual(["wd", "1"]);
    expect(m.inn.commentary.map((c) => c.ballLabel)).toEqual(["0.1", "0.1"]);
  });

  it("links each chip and commentary item to its event", () => {
    const m = new TestMatch();
    const wide = m.ball({ kind: "wide", runs: 0 });
    const single = m.ball({ runs: 1 });
    expect(m.inn.overs[0].balls.map((b) => b.eventId)).toEqual([wide.id, single.id]);
    expect(m.inn.commentary.map((c) => c.eventId)).toEqual([wide.id, single.id]);
  });

  it("numbers legal balls through the over and into the next", () => {
    const m = new TestMatch();
    m.over([0, 0, 0, 0, 0, 0]);
    m.bowler("Bilal");
    m.ball({ runs: 1 });
    expect(m.inn.commentary.map((c) => c.ballLabel)).toEqual(["0.1", "0.2", "0.3", "0.4", "0.5", "0.6", "1.1"]);
    expect(m.inn.overs.map((o) => o.balls.length)).toEqual([6, 1]);
  });

  it("numbers a wide or no-ball after the legal balls so far", () => {
    const m = new TestMatch();
    m.over([0, 0]);
    m.ball({ kind: "wide", runs: 0 });
    m.ball({ kind: "noball", runs: 0 });
    m.ball({ runs: 0 });
    expect(m.inn.commentary.map((c) => c.ballLabel)).toEqual(["0.1", "0.2", "0.3", "0.3", "0.3"]);
  });

  it("numbers a wide that counts as a ball once", () => {
    const m = new TestMatch({ rules: { wideRebowled: false } });
    m.ball({ kind: "wide", runs: 0 });
    m.ball({ runs: 0 });
    expect(m.inn.commentary.map((c) => c.ballLabel)).toEqual(["0.1", "0.2"]);
  });

  it("uses the balls per over of the match", () => {
    const m = new TestMatch({ rules: { ballsPerOver: 8 } });
    m.over([0, 0, 0, 0, 0, 0, 0, 0]);
    m.bowler("Bilal");
    m.ball({ runs: 0 });
    expect(m.inn.commentary.map((c) => c.ballLabel).slice(-2)).toEqual(["0.8", "1.1"]);
  });

  it("records the delivery as scored", () => {
    const m = new TestMatch();
    const four = m.ball({ runs: 4, boundary: true });
    m.ball({ kind: "noball", runs: 1, runsAs: "legbye" });
    expect(m.inn.commentary[0]).toEqual({
      eventId: four.id,
      ballLabel: "0.1",
      bowler: m.id("Hamza"),
      batter: m.id("Ali"),
      kind: "legal",
      runs: 4,
      runsAs: "bat",
      boundary: true,
      penalty: 0,
      freeHit: false,
      wicket: null,
    });
    expect(m.inn.commentary[1]).toMatchObject({ kind: "noball", runs: 1, runsAs: "legbye", penalty: 1, batter: m.id("Ali") });
  });

  it("records the wicket and the batter on strike at the time", () => {
    const m = new TestMatch();
    m.ball({ runs: 1 });
    m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Zain" } });
    expect(m.inn.commentary[1]).toMatchObject({
      batter: m.id("Usman"),
      wicket: { kind: "caught", playerOut: m.id("Usman"), fielderName: "Zain" },
    });
    expect(m.inn.overs[0]).toMatchObject({ wickets: 1 });
    expect(m.inn.overs[0].balls.map((b) => b.label)).toEqual(["1", "W"]);
  });

  it("flags the free-hit ball itself, including a wide on it", () => {
    const m = new TestMatch();
    m.ball({ kind: "noball", runs: 0 });
    m.ball({ kind: "wide", runs: 0 });
    m.ball({ runs: 2 });
    m.ball({ runs: 0 });
    expect(m.inn.commentary.map((c) => c.freeHit)).toEqual([false, true, true, false]);
  });

  it("never flags a free hit when the rule is off", () => {
    const m = new TestMatch({ rules: { freeHit: false } });
    m.ball({ kind: "noball", runs: 0 });
    m.ball({ runs: 0 });
    expect(m.inn.commentary.map((c) => c.freeHit)).toEqual([false, false]);
  });

  it("leaves retirements out of the commentary", () => {
    const m = new TestMatch();
    m.ball({ runs: 1 });
    m.push({ type: "retired", player: m.id("Ali"), how: "hurt" });
    expect(m.inn.commentary).toHaveLength(1);
    expect(m.inn.overs[0].balls).toHaveLength(1);
  });

  it("drops an undone ball and rewrites a corrected one", () => {
    const m = new TestMatch();
    m.ball({ runs: 1 });
    const second = m.ball({ runs: 1 });
    m.undo();
    expect(m.inn.commentary).toHaveLength(1);
    expect(m.inn.overs[0].balls.map((b) => b.eventId)).not.toContain(second.id);

    const third = m.ball({ runs: 1 });
    m.correct(third.id, { runs: 4, boundary: true });
    expect(m.inn.overs[0].balls.map((b) => b.label)).toEqual(["1", "4"]);
    expect(m.inn.commentary[1]).toMatchObject({ runs: 4, boundary: true });
  });

  it("starts the second innings with a clean slate", () => {
    const m = new TestMatch();
    m.ball({ runs: 1 });
    m.endInnings("manual");
    m.startInnings2(["Zain", "Faisal"], "Usman");
    m.ball({ runs: 2 });
    expect(m.inn.commentary.map((c) => c.ballLabel)).toEqual(["0.1"]);
    expect(m.inn.overs).toHaveLength(1);
    expect(m.state.innings[0].commentary).toHaveLength(1);
  });
});

describe("dotBallPct and boundaryPct", () => {
  it("counts legal balls with no runs, and boundary runs off the bat", () => {
    const m = new TestMatch();
    m.ball({ runs: 0 });
    m.ball({ runs: 4, boundary: true });
    m.ball({ runs: 1, runsAs: "legbye" });
    m.ball({ kind: "wide", runs: 0 });
    m.ball({ kind: "noball", runs: 6, boundary: true });
    expect(m.inn).toMatchObject({ runs: 13, legalBalls: 3 });
    expect(dotBallPct(m.inn)).toBe(33.33);
    expect(boundaryPct(m.inn)).toBe(76.92);
  });

  it("counts a wicket ball with no runs as a dot, and a bye as not", () => {
    const m = new TestMatch();
    m.ball({ runs: 2, runsAs: "bye" });
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    expect(dotBallPct(m.inn)).toBe(50);
  });

  it("returns 0 for an innings with nothing in it", () => {
    const m = new TestMatch();
    expect(dotBallPct(m.inn)).toBe(0);
    expect(boundaryPct(m.inn)).toBe(0);
    m.ball({ kind: "wide", runs: 0 });
    expect(dotBallPct(m.inn)).toBe(0);
    expect(boundaryPct(m.inn)).toBe(0);
  });
});

describe("chaseNeed", () => {
  function chase(): TestMatch {
    const m = new TestMatch({ overs: 1 });
    m.over([1, 0, 0, 0, 0, 0]);
    m.endInnings("overs");
    m.startInnings2(["Zain", "Faisal"], "Usman");
    return m;
  }

  it("is null in the first innings", () => {
    const m = new TestMatch({ overs: 1 });
    expect(chaseNeed(m.state, m.inn)).toBeNull();
  });

  it("gives the runs needed and the balls left in the chase", () => {
    const m = chase();
    expect(chaseNeed(m.state, m.inn)).toEqual({ needed: 2, ballsLeft: 6 });
    m.ball({ runs: 0 });
    expect(chaseNeed(m.state, m.inn)).toEqual({ needed: 2, ballsLeft: 5 });
  });

  it("is null once the target is reached or the innings has ended", () => {
    const m = chase();
    m.ball({ runs: 2 });
    expect(chaseNeed(m.state, m.inn)).toBeNull();
    const ended = chase();
    ended.endInnings("manual");
    expect(chaseNeed(ended.state, ended.inn)).toBeNull();
  });
});

describe("playerName", () => {
  it("falls back to the id for a player that is not in the match", () => {
    const m = new TestMatch();
    expect(playerName(m.state.players, m.id("Ali"))).toBe("Ali");
    expect(playerName(m.state.players, "p-unknown")).toBe("p-unknown");
  });
});
