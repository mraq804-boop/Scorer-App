import { describe, expect, it } from "vitest";
import { availableDismissals, nextPrompt } from "@/lib/scoring";
import { TestMatch, batterLine, bowlerLine } from "../../helpers/match";

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function retire(m: TestMatch, name: string, how: "hurt" | "out"): void {
  m.push({ type: "retired", player: m.id(name), how });
}

describe("wickets", () => {
  it("bowled credits the bowler and asks for a batter", () => {
    const m = new TestMatch();
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    expect(m.inn.wickets).toBe(1);
    expect(bowlerLine(m, "Hamza").wickets).toBe(1);
    expect(batterLine(m, "Ali").out).toEqual({ kind: "bowled", bowler: m.id("Hamza"), fielderName: null, fielderId: null });
    expect(nextPrompt(m.state)).toEqual({ kind: "choose_batter" });
    expect(m.inn.fallOfWickets[0]).toMatchObject({ wicket: 1, runs: 0, legalBalls: 1, playerId: m.id("Ali") });
  });

  it.each(["bowled", "caught", "lbw", "stumped", "hit_wicket"] as const)(
    "%s is credited to the bowler",
    (kind) => {
      const m = new TestMatch();
      m.ball({ runs: 0, wicket: { kind, fielderName: "Zain" } });
      expect(bowlerLine(m, "Hamza").wickets).toBe(1);
      expect(batterLine(m, "Ali").out).toEqual({ kind, bowler: m.id("Hamza"), fielderName: "Zain", fielderId: null });
    },
  );

  it.each(["run_out", "other"] as const)("%s is a wicket but not the bowler's", (kind) => {
    const m = new TestMatch();
    m.ball({ runs: 0, wicket: { kind, fielderName: "Zain" } });
    expect(m.inn.wickets).toBe(1);
    expect(bowlerLine(m, "Hamza").wickets).toBe(0);
    expect(batterLine(m, "Ali").out).toEqual({ kind, bowler: null, fielderName: "Zain", fielderId: null });
  });

  it("run out of the non-striker after one run", () => {
    const m = new TestMatch();
    m.ball({ runs: 1, wicket: { kind: "run_out", playerOut: m.id("Ali") } });
    m.batter("Saad");
    expect(m.inn.runs).toBe(1);
    expect(m.inn.striker).toBe(m.id("Usman"));
    expect(m.inn.nonStriker).toBe(m.id("Saad"));
    expect(bowlerLine(m, "Hamza").wickets).toBe(0);
  });

  it("records the runs of the wicket ball in the fall of wickets", () => {
    const m = new TestMatch();
    m.ball({ runs: 4, boundary: true });
    m.ball({ runs: 1, wicket: { kind: "run_out", playerOut: m.id("Ali") } });
    expect(m.inn.fallOfWickets).toEqual([{ wicket: 1, runs: 5, legalBalls: 2, playerId: m.id("Ali") }]);
  });

  it("vacates the non-striker's end when the non-striker is run out", () => {
    const m = new TestMatch();
    m.ball({ runs: 0, wicket: { kind: "run_out", playerOut: m.id("Usman") } });
    expect(m.inn).toMatchObject({ striker: m.id("Ali"), nonStriker: null });
    m.batter("Saad");
    expect(m.inn).toMatchObject({ striker: m.id("Ali"), nonStriker: m.id("Saad") });
  });

  it("new batter takes strike after a catch", () => {
    const m = new TestMatch();
    m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Zain" } });
    m.batter("Saad");
    expect(m.inn.striker).toBe(m.id("Saad"));
    expect(m.inn.nonStriker).toBe(m.id("Usman"));
  });

  it("new batter takes strike after a catch even when the batters crossed", () => {
    const m = new TestMatch();
    m.ball({ runs: 1, wicket: { kind: "caught", fielderName: "Zain" } });
    m.batter("Saad");
    expect(m.inn.striker).toBe(m.id("Saad"));
    expect(m.inn.nonStriker).toBe(m.id("Usman"));
  });

  it("caught on the last ball of the over", () => {
    const m = new TestMatch();
    m.over([0, 0, 0, 0, 0]);
    m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Zain" } });
    m.batter("Saad");
    expect(m.inn.striker).toBe(m.id("Usman"));
    expect(m.inn.nonStriker).toBe(m.id("Saad"));
  });

  it("moves the empty end with the over-end swap", () => {
    const m = new TestMatch();
    m.over([0, 0, 0, 0, 0]);
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    expect(m.inn).toMatchObject({ striker: m.id("Usman"), nonStriker: null, bowler: null, legalBalls: 6 });
    m.batter("Saad");
    expect(m.inn).toMatchObject({ striker: m.id("Usman"), nonStriker: m.id("Saad") });
  });

  it("fills the striker's end first when both ends are empty", () => {
    const m = new TestMatch();
    retire(m, "Ali", "hurt");
    retire(m, "Usman", "hurt");
    expect(m.inn).toMatchObject({ striker: null, nonStriker: null });
    m.batter("Saad");
    expect(m.inn).toMatchObject({ striker: m.id("Saad"), nonStriker: null });
    m.batter("Kamran");
    expect(m.inn).toMatchObject({ striker: m.id("Saad"), nonStriker: m.id("Kamran") });
  });

  it("ignores a batter coming in when both ends are occupied", () => {
    const m = new TestMatch();
    m.batter("Saad");
    expect(m.inn).toMatchObject({ striker: m.id("Ali"), nonStriker: m.id("Usman") });
    expect(m.inn.batting.map((line) => line.playerId)).toEqual([m.id("Ali"), m.id("Usman")]);
    expect(m.inn.partnerships).toHaveLength(1);
  });

  it("counts a wicket on a wide for the bowler, without a ball faced", () => {
    const m = new TestMatch();
    m.ball({ kind: "wide", runs: 0, wicket: { kind: "stumped", fielderName: "Zain" } });
    expect(m.inn).toMatchObject({ runs: 1, wickets: 1, legalBalls: 0 });
    expect(bowlerLine(m, "Hamza")).toMatchObject({ wickets: 1, wides: 1, legalBalls: 0 });
    expect(batterLine(m, "Ali")).toMatchObject({ balls: 0, out: { kind: "stumped", bowler: m.id("Hamza") } });
    expect(m.inn.fallOfWickets[0]).toMatchObject({ runs: 1, legalBalls: 0 });
  });

  it("counts a run out on a no-ball without crediting the bowler", () => {
    const m = new TestMatch();
    m.ball({ kind: "noball", runs: 1, wicket: { kind: "run_out", playerOut: m.id("Usman") } });
    m.batter("Saad");
    expect(m.inn).toMatchObject({ runs: 2, wickets: 1, freeHit: true });
    expect(bowlerLine(m, "Hamza")).toMatchObject({ wickets: 0, noBalls: 1 });
    expect(m.inn.striker).toBe(m.id("Saad"));
    expect(m.inn.nonStriker).toBe(m.id("Ali"));
  });

  it("counts the wicket in the over's summary", () => {
    const m = new TestMatch();
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    m.batter("Saad");
    m.ball({ runs: 1, wicket: { kind: "run_out", playerOut: m.id("Saad") } });
    expect(m.inn.overs[0].wickets).toBe(2);
  });
});

describe("retirements", () => {
  it("retired hurt is not a wicket and can return", () => {
    const m = new TestMatch();
    m.ball({ runs: 4, boundary: true });
    retire(m, "Ali", "hurt");
    expect(m.inn).toMatchObject({ wickets: 0, striker: null, nonStriker: m.id("Usman") });
    expect(batterLine(m, "Ali")).toMatchObject({ retiredHurt: true, out: null });
    expect(m.inn.fallOfWickets).toEqual([]);
    expect(nextPrompt(m.state)).toEqual({ kind: "choose_batter" });

    m.batter("Saad");
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    m.batter("Ali");
    m.ball({ runs: 2 });

    expect(m.inn.wickets).toBe(1);
    expect(m.inn.striker).toBe(m.id("Ali"));
    expect(batterLine(m, "Ali")).toMatchObject({ retiredHurt: false, out: null, runs: 6, balls: 2 });
    expect(m.inn.batting.filter((line) => line.playerId === m.id("Ali"))).toHaveLength(1);
  });

  it("retired hurt of the non-striker vacates the non-striker's end", () => {
    const m = new TestMatch();
    retire(m, "Usman", "hurt");
    expect(m.inn).toMatchObject({ striker: m.id("Ali"), nonStriker: null });
    m.batter("Saad");
    expect(m.inn).toMatchObject({ striker: m.id("Ali"), nonStriker: m.id("Saad") });
  });

  it("retired out is a wicket without bowler credit", () => {
    const m = new TestMatch();
    m.ball({ runs: 3 });
    retire(m, "Ali", "out");
    expect(m.inn).toMatchObject({ wickets: 1, striker: m.id("Usman"), nonStriker: null });
    expect(batterLine(m, "Ali").out).toEqual({ kind: "retired_out", bowler: null, fielderName: null, fielderId: null });
    expect(bowlerLine(m, "Hamza").wickets).toBe(0);
    expect(m.inn.fallOfWickets).toEqual([{ wicket: 1, runs: 3, legalBalls: 1, playerId: m.id("Ali") }]);
    expect(nextPrompt(m.state)).toEqual({ kind: "choose_batter" });
    m.batter("Saad");
    expect(m.inn.nonStriker).toBe(m.id("Saad"));
  });
});

describe("partnerships", () => {
  it("sums to the total across extras, wickets and retirements", () => {
    const m = new TestMatch();
    m.ball({ runs: 1 });
    m.ball({ kind: "wide", runs: 0 });
    m.ball({ runs: 4, boundary: true });
    m.ball({ kind: "noball", runs: 2, runsAs: "bye" });
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    m.batter("Saad");
    m.ball({ runs: 3 });
    retire(m, "Saad", "out");
    m.batter("Kamran");
    m.ball({ runs: 2 });

    expect(sum(m.inn.partnerships.map((p) => p.runs))).toBe(m.inn.runs);
    expect(sum(m.inn.partnerships.map((p) => p.balls))).toBe(m.inn.legalBalls);
    expect(m.inn.partnerships).toEqual([
      { batters: [m.id("Ali"), m.id("Usman")], runs: 9, balls: 3 },
      { batters: [m.id("Ali"), m.id("Saad")], runs: 3, balls: 1 },
      { batters: [m.id("Ali"), m.id("Kamran")], runs: 2, balls: 1 },
    ]);
  });

  it("gives the wicket ball to the partnership that ends", () => {
    const m = new TestMatch();
    m.ball({ runs: 1, wicket: { kind: "run_out", playerOut: m.id("Ali") } });
    m.batter("Saad");
    expect(m.inn.partnerships).toEqual([
      { batters: [m.id("Ali"), m.id("Usman")], runs: 1, balls: 1 },
      { batters: [m.id("Usman"), m.id("Saad")], runs: 0, balls: 0 },
    ]);
  });

  it("counts a wide that is not re-bowled as a ball", () => {
    const m = new TestMatch({ rules: { wideRebowled: false } });
    m.ball({ kind: "wide", runs: 0 });
    expect(m.inn.partnerships).toEqual([{ batters: [m.id("Ali"), m.id("Usman")], runs: 1, balls: 1 }]);
  });

  it("starts a new partnership when a retired batter returns", () => {
    const m = new TestMatch();
    retire(m, "Ali", "hurt");
    m.batter("Saad");
    m.ball({ runs: 1 });
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    m.batter("Ali");
    m.ball({ runs: 2 });
    expect(m.inn.partnerships.map((p) => p.batters)).toEqual([
      [m.id("Ali"), m.id("Usman")],
      [m.id("Usman"), m.id("Saad")],
      [m.id("Saad"), m.id("Ali")],
    ]);
    expect(sum(m.inn.partnerships.map((p) => p.runs))).toBe(m.inn.runs);
  });
});

describe("all out", () => {
  it("asks rather than ends when all out", () => {
    const m = new TestMatch({ rules: { playersPerSide: { A: 3, B: 3 } } });
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    m.batter("Saad");
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    expect(nextPrompt(m.state)).toEqual({ kind: "all_out" });
    expect(m.inn.ended).toBeNull();
  });

  it("is judged by the batting side's size", () => {
    const m = new TestMatch({
      rules: { playersPerSide: { A: 11, B: 3 } },
      toss: { winner: "B", choice: "bat" },
    });
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    expect(nextPrompt(m.state)).toEqual({ kind: "choose_batter" });
    m.batter("Saad");
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    expect(nextPrompt(m.state)).toEqual({ kind: "all_out" });
  });

  it("is not all out one wicket short of the batting side", () => {
    const m = new TestMatch({ rules: { playersPerSide: { A: 4, B: 4 } } });
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    m.batter("Saad");
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    expect(nextPrompt(m.state)).toEqual({ kind: "choose_batter" });
  });

  it("asks all out before a batter or a bowler", () => {
    const m = new TestMatch({ rules: { playersPerSide: { A: 3, B: 3 } } });
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    m.batter("Saad");
    m.over([0, 0, 0, 0]);
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    expect(m.inn.bowler).toBeNull();
    expect(nextPrompt(m.state)).toEqual({ kind: "all_out" });
  });

  it("asks for a batter before a bowler", () => {
    const m = new TestMatch();
    m.over([0, 0, 0, 0, 0]);
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    expect(nextPrompt(m.state)).toEqual({ kind: "choose_batter" });
    m.batter("Saad");
    expect(nextPrompt(m.state)).toEqual({ kind: "choose_bowler" });
  });
});

describe("last man stands", () => {
  const rules = { playersPerSide: { A: 3, B: 3 }, lastManStands: true };

  function loneBatterMatch(): TestMatch {
    const m = new TestMatch({ rules });
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    m.batter("Saad");
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    return m;
  }

  it("bats alone without rotating", () => {
    const m = loneBatterMatch();
    expect(nextPrompt(m.state)).toBeNull();
    expect(m.inn.nonStriker).toBeNull();
    const lone = m.inn.striker;
    expect(lone).toBe(m.id("Usman"));
    m.ball({ runs: 1 });
    expect(m.inn.striker).toBe(lone);
    expect(m.inn.nonStriker).toBeNull();
  });

  it("keeps the lone batter on strike at the end of the over", () => {
    const m = loneBatterMatch();
    m.over([0, 0, 0, 0]);
    expect(m.inn).toMatchObject({ legalBalls: 6, bowler: null, striker: m.id("Usman"), nonStriker: null });
    expect(nextPrompt(m.state)).toEqual({ kind: "choose_bowler" });
  });

  it("keeps the lone batter on strike when a swap is recorded", () => {
    const m = loneBatterMatch();
    m.push({ type: "strike_swapped" });
    expect(m.inn).toMatchObject({ striker: m.id("Usman"), nonStriker: null });
  });

  it("opens a partnership of one and credits it with the runs", () => {
    const m = loneBatterMatch();
    m.ball({ runs: 2 });
    m.ball({ kind: "wide", runs: 0 });
    expect(m.inn.partnerships.at(-1)).toEqual({ batters: [m.id("Usman"), null], runs: 3, balls: 1 });
    expect(sum(m.inn.partnerships.map((p) => p.runs))).toBe(m.inn.runs);
  });

  it("is all out when the lone batter goes", () => {
    const m = loneBatterMatch();
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    expect(m.inn.wickets).toBe(3);
    expect(m.inn).toMatchObject({ striker: null, nonStriker: null });
    expect(nextPrompt(m.state)).toEqual({ kind: "all_out" });
  });

  it("applies after a retired out wicket as well", () => {
    const m = new TestMatch({ rules });
    retire(m, "Ali", "out");
    m.batter("Saad");
    retire(m, "Saad", "out");
    expect(m.inn).toMatchObject({ wickets: 2, striker: m.id("Usman"), nonStriker: null });
    expect(nextPrompt(m.state)).toBeNull();
  });
});

describe("availableDismissals", () => {
  it("free hit allows only run out and other", () => {
    const m = new TestMatch();
    m.ball({ kind: "noball", runs: 0 });
    expect(availableDismissals(m.state, "legal")).toEqual(["run_out", "other", "retired_hurt", "retired_out"]);
  });

  it("offers everything but lbw on a legal ball when lbw is off", () => {
    const m = new TestMatch();
    expect(availableDismissals(m.state, "legal")).toEqual([
      "bowled",
      "caught",
      "run_out",
      "stumped",
      "hit_wicket",
      "other",
      "retired_hurt",
      "retired_out",
    ]);
  });

  it("offers lbw on a legal ball when lbw is on", () => {
    const m = new TestMatch({ rules: { lbw: true } });
    expect(availableDismissals(m.state, "legal")).toEqual([
      "bowled",
      "caught",
      "lbw",
      "run_out",
      "stumped",
      "hit_wicket",
      "other",
      "retired_hurt",
      "retired_out",
    ]);
  });

  it("wide allows stumping", () => {
    const m = new TestMatch({ rules: { lbw: true } });
    expect(availableDismissals(m.state, "wide")).toEqual([
      "stumped",
      "run_out",
      "hit_wicket",
      "other",
      "retired_hurt",
      "retired_out",
    ]);
  });

  it("no-ball allows only run out and other", () => {
    const m = new TestMatch({ rules: { lbw: true } });
    expect(availableDismissals(m.state, "noball")).toEqual(["run_out", "other", "retired_hurt", "retired_out"]);
  });

  it("a wide bowled on a free hit allows only what both restrictions allow", () => {
    const m = new TestMatch({ rules: { lbw: true } });
    m.ball({ kind: "noball", runs: 0 });
    expect(availableDismissals(m.state, "wide")).toEqual(["run_out", "other", "retired_hurt", "retired_out"]);
  });

  it("lifts the free hit restriction once a legal ball has been bowled", () => {
    const m = new TestMatch();
    m.ball({ kind: "noball", runs: 0 });
    m.ball({ runs: 0 });
    expect(availableDismissals(m.state, "legal")).toContain("bowled");
  });
});
