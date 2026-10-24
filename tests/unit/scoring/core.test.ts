import { describe, expect, it } from "vitest";
import {
  EngineError,
  bowlerQuota,
  currentInnings,
  defaultRules,
  deliveryDraft,
  formatOvers,
  nextPrompt,
  replay,
} from "@/lib/scoring";
import { TestMatch, batterLine, bowlerLine } from "../../helpers/match";

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

describe("rules", () => {
  it("defaults by ball type", () => {
    expect(defaultRules("tape", 10)).toMatchObject({
      ballsPerOver: 6,
      lbw: false,
      freeHit: true,
      wideRuns: 1,
      noBallRuns: 1,
      wideRebowled: true,
      lastManStands: false,
      playersPerSide: { A: 11, B: 11 },
    });
    expect(defaultRules("hard", 20).lbw).toBe(true);
    expect(bowlerQuota(defaultRules("tape", 10))).toBe(2);
  });

  it("rounds the bowler quota up", () => {
    expect(bowlerQuota(defaultRules("tape", 12))).toBe(3);
    expect(bowlerQuota(defaultRules("hard", 50))).toBe(10);
  });

  it("returns a fresh rules object each call", () => {
    const a = defaultRules("tape", 10);
    a.playersPerSide.A = 5;
    expect(defaultRules("tape", 10).playersPerSide.A).toBe(11);
  });
});

describe("replay", () => {
  it("status is setup before innings_started and prompts innings 1", () => {
    const m = new TestMatch();
    const s = replay(m.events.filter((e) => e.type === "match_created"));
    expect(s.status).toBe("setup");
    expect(s.innings).toEqual([]);
    expect(nextPrompt(s)).toEqual({ kind: "start_innings", innings: 1 });
  });

  it("is in progress once an innings has started", () => {
    const m = new TestMatch();
    const s = m.state;
    expect(s.status).toBe("in_progress");
    expect(nextPrompt(s)).toBeNull();
    expect(currentInnings(s)).toBe(s.innings[0]);
  });

  it("reads match details from match_created and player_added", () => {
    const m = new TestMatch({ overs: 8, teams: ["Kites", "Owls"], toss: { winner: "A", choice: "bowl" } });
    expect(m.state).toMatchObject({
      title: "Kites v Owls",
      teams: { A: { name: "Kites" }, B: { name: "Owls" } },
      toss: { winner: "A", choice: "bowl" },
      rules: { oversPerInnings: 8 },
    });
    expect(m.state.players[m.id("Ali")]).toEqual({ id: "p-Ali", name: "Ali", team: "B" });
    expect(m.state.players[m.id("Hamza")]).toEqual({ id: "p-Hamza", name: "Hamza", team: "A" });
    expect(m.inn).toMatchObject({ battingTeam: "B", bowlingTeam: "A" });
  });

  it("opens the innings with both openers on the card and the bowler chosen", () => {
    const m = new TestMatch();
    expect(m.inn).toMatchObject({
      number: 1,
      battingTeam: "A",
      bowlingTeam: "B",
      runs: 0,
      wickets: 0,
      legalBalls: 0,
      striker: "p-Ali",
      nonStriker: "p-Usman",
      bowler: "p-Hamza",
      ended: null,
      freeHit: false,
    });
    expect(m.inn.batting.map((b) => b.playerId)).toEqual(["p-Ali", "p-Usman"]);
    expect(m.inn.bowling).toEqual([]);
  });

  it("credits runs off the bat and rotates strike on odd runs", () => {
    const m = new TestMatch();
    m.ball({ runs: 1 });
    expect(m.inn.runs).toBe(1);
    expect(m.inn.striker).toBe(m.id("Usman"));
  });

  it("keeps strike on even runs", () => {
    const m = new TestMatch();
    m.ball({ runs: 2 });
    expect(m.inn.striker).toBe(m.id("Ali"));
    expect(m.inn.nonStriker).toBe(m.id("Usman"));
  });

  it("charges the batter and bowler and counts the ball", () => {
    const m = new TestMatch();
    m.ball({ runs: 3 });
    expect(m.inn.legalBalls).toBe(1);
    expect(batterLine(m, "Ali")).toMatchObject({ runs: 3, balls: 1, dots: 0 });
    expect(bowlerLine(m, "Hamza")).toMatchObject({ runs: 3, legalBalls: 1, dots: 0 });
  });

  it("byes and leg byes go to extras and not to the bowler", () => {
    const m = new TestMatch();
    m.ball({ runs: 2, runsAs: "bye" });
    m.ball({ runs: 1, runsAs: "legbye" });
    expect(m.inn.extras).toMatchObject({ byes: 2, legByes: 1 });
    expect(bowlerLine(m, "Hamza").runs).toBe(0);
  });

  it("byes add to the total and the ball, but not to the batter's runs", () => {
    const m = new TestMatch();
    m.ball({ runs: 2, runsAs: "bye" });
    expect(m.inn).toMatchObject({ runs: 2, legalBalls: 1 });
    expect(batterLine(m, "Ali")).toMatchObject({ runs: 0, balls: 1 });
    expect(bowlerLine(m, "Hamza").legalBalls).toBe(1);
  });

  it("rotates strike on odd byes", () => {
    const m = new TestMatch();
    m.ball({ runs: 1, runsAs: "legbye" });
    expect(m.inn.striker).toBe(m.id("Usman"));
  });

  it("counts a dot for the batter when nothing comes off the bat, and for the bowler when uncharged", () => {
    const m = new TestMatch();
    m.ball({ runs: 0 });
    m.ball({ runs: 1, runsAs: "bye" });
    m.ball({ runs: 0 });
    expect(batterLine(m, "Ali")).toMatchObject({ balls: 2, dots: 2 });
    expect(batterLine(m, "Usman")).toMatchObject({ balls: 1, dots: 1 });
    expect(bowlerLine(m, "Hamza")).toMatchObject({ legalBalls: 3, dots: 3 });
  });

  it("does not count a dot when runs come off the bat", () => {
    const m = new TestMatch();
    m.ball({ runs: 1 });
    m.ball({ runs: 0 });
    expect(bowlerLine(m, "Hamza").dots).toBe(1);
    expect(batterLine(m, "Ali").dots).toBe(0);
  });

  it("ends the over after 6 legal balls, swaps strike, clears bowler, records a maiden", () => {
    const m = new TestMatch();
    m.over([0, 0, 0, 0, 0, 0]);
    expect(m.inn.striker).toBe(m.id("Usman"));
    expect(m.inn.bowler).toBeNull();
    expect(nextPrompt(m.state)).toEqual({ kind: "choose_bowler" });
    expect(bowlerLine(m, "Hamza").maidens).toBe(1);
  });

  it("swaps twice when an odd run falls on the last ball of the over", () => {
    const m = new TestMatch();
    m.over([0, 0, 0, 0, 0, 1]);
    expect(m.inn.striker).toBe(m.id("Ali"));
    expect(m.inn.nonStriker).toBe(m.id("Usman"));
  });

  it("does not spoil a maiden with byes and leg byes", () => {
    const m = new TestMatch();
    m.ball({ runs: 1, runsAs: "bye" });
    m.ball({ runs: 2, runsAs: "legbye" });
    m.over([0, 0, 0, 0]);
    expect(bowlerLine(m, "Hamza")).toMatchObject({ maidens: 1, runs: 0, legalBalls: 6 });
    expect(m.inn.runs).toBe(3);
  });

  it("does not give a maiden for an over with runs off the bat", () => {
    const m = new TestMatch();
    m.over([0, 0, 0, 0, 0, 1]);
    expect(bowlerLine(m, "Hamza")).toMatchObject({ maidens: 0, runs: 1 });
  });

  it("gives no maiden when the bowler changes mid-over, and credits each bowler their own balls", () => {
    const m = new TestMatch();
    m.over([0, 0, 0]);
    m.bowler("Bilal");
    m.over([1, 0, 0]);
    expect(bowlerLine(m, "Hamza")).toMatchObject({ legalBalls: 3, runs: 0, maidens: 0 });
    expect(bowlerLine(m, "Bilal")).toMatchObject({ legalBalls: 3, runs: 1, maidens: 0 });
    expect(m.inn.bowling.map((b) => b.playerId)).toEqual([m.id("Hamza"), m.id("Bilal")]);
    expect(m.inn.bowler).toBeNull();
  });

  it("starts the next over with the chosen bowler and keeps counting", () => {
    const m = new TestMatch();
    m.over([1, 0, 0, 0, 0, 0]);
    expect(m.inn.striker).toBe(m.id("Ali"));
    m.bowler("Bilal");
    expect(m.inn.bowler).toBe(m.id("Bilal"));
    expect(nextPrompt(m.state)).toBeNull();
    m.ball({ runs: 4, boundary: true });
    expect(m.inn.legalBalls).toBe(7);
    expect(bowlerLine(m, "Bilal")).toMatchObject({ legalBalls: 1, runs: 4 });
    expect(batterLine(m, "Ali")).toMatchObject({ runs: 5, fours: 1, balls: 2 });
    expect(batterLine(m, "Usman")).toMatchObject({ runs: 0, balls: 5 });
  });

  it("summarises each over with its first-ball bowler and runs", () => {
    const m = new TestMatch();
    m.over([1, 4, 0, 0, 2, 0]);
    m.bowler("Bilal");
    m.over([0, 0]);
    expect(m.inn.overs).toHaveLength(2);
    expect(m.inn.overs[0]).toMatchObject({ index: 0, bowler: m.id("Hamza"), runs: 7, wickets: 0 });
    expect(m.inn.overs[1]).toMatchObject({ index: 1, bowler: m.id("Bilal"), runs: 0, wickets: 0 });
  });

  it("names the over's bowler from its first ball when the bowler changes mid-over", () => {
    const m = new TestMatch();
    m.over([0, 0]);
    m.bowler("Bilal");
    m.over([0, 0, 0, 0]);
    expect(m.inn.overs).toHaveLength(1);
    expect(m.inn.overs[0].bowler).toBe(m.id("Hamza"));
  });

  it("counts boundaries", () => {
    const m = new TestMatch();
    m.ball({ runs: 4, boundary: true });
    m.ball({ runs: 6, boundary: true });
    expect(batterLine(m, "Ali")).toMatchObject({ runs: 10, fours: 1, sixes: 1, balls: 2 });
  });

  it("does not count a four that was run, or a boundary scored as byes", () => {
    const m = new TestMatch();
    m.ball({ runs: 4 });
    m.ball({ runs: 4, boundary: true, runsAs: "bye" });
    expect(batterLine(m, "Ali")).toMatchObject({ runs: 4, fours: 0, sixes: 0 });
    expect(m.inn.extras.byes).toBe(4);
  });

  it("swaps the ends on strike_swapped", () => {
    const m = new TestMatch();
    m.push({ type: "strike_swapped" });
    expect(m.inn.striker).toBe(m.id("Usman"));
    expect(m.inn.nonStriker).toBe(m.id("Ali"));
  });

  it("plays 8-ball overs when the rules say so", () => {
    const m = new TestMatch({ rules: { ballsPerOver: 8 } });
    m.over([0, 0, 0, 0, 0, 0]);
    expect(m.inn.bowler).toBe(m.id("Hamza"));
    m.over([0, 0]);
    expect(m.inn.bowler).toBeNull();
    expect(bowlerLine(m, "Hamza").maidens).toBe(1);
  });

  it("orders by seq, not array order", () => {
    const m = new TestMatch();
    m.over([1, 2, 3]);
    expect(replay([...m.events].reverse())).toEqual(m.state);
  });

  it("returns a fresh state on every call and never touches its input", () => {
    const m = new TestMatch();
    m.over([1, 4, 0]);
    const events = deepFreeze([...m.events]);
    const first = replay(events);
    const second = replay(events);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.rules).not.toBe(second.rules);
    first.rules.oversPerInnings = 99;
    first.rules.playersPerSide.A = 99;
    first.teams.A.name = "changed";
    first.players[m.id("Ali")].name = "changed";
    expect(replay(events)).toEqual(second);
  });

  it("replays an empty list into the setup state", () => {
    expect(replay([])).toMatchObject({ status: "setup", innings: [], toss: null, result: null, warnings: [] });
    expect(nextPrompt(replay([]))).toEqual({ kind: "start_innings", innings: 1 });
  });

  it("starts with no warnings", () => {
    const m = new TestMatch();
    m.over([1, 2, 3]);
    expect(m.state.warnings).toEqual([]);
  });

  it("starts innings 2 with the other side bowling", () => {
    const m = new TestMatch();
    m.startInnings2(["Bilal", "Zain"], "Kamran");
    const s = m.state;
    expect(s.innings).toHaveLength(2);
    expect(currentInnings(s)).toBe(s.innings[1]);
    expect(m.inn).toMatchObject({
      number: 2,
      battingTeam: "B",
      bowlingTeam: "A",
      striker: "p-Bilal",
      nonStriker: "p-Zain",
      bowler: "p-Kamran",
    });
  });

  it("throws EngineError for a delivery with no innings in progress", () => {
    const m = new TestMatch();
    m.ball({ runs: 1 });
    const withoutInnings = m.events.filter((e) => e.type !== "innings_started");
    expect(() => replay(withoutInnings)).toThrow(EngineError);
    expect(() => replay(withoutInnings)).toThrow(expect.objectContaining({ code: "no_innings" }));
  });

  it("throws EngineError when an innings is started twice", () => {
    const m = new TestMatch();
    m.push({
      type: "innings_started",
      innings: 1,
      battingTeam: "A",
      striker: "p-Ali",
      nonStriker: "p-Usman",
      bowler: "p-Hamza",
    });
    expect(() => m.state).toThrow(EngineError);
    expect(() => m.state).toThrow(expect.objectContaining({ code: "innings_started_twice" }));
  });
});

describe("deliveryDraft", () => {
  it("fills the players from the state and defaults the rest", () => {
    const m = new TestMatch();
    expect(deliveryDraft(m.state, { runs: 2 })).toEqual({
      type: "delivery",
      striker: "p-Ali",
      nonStriker: "p-Usman",
      bowler: "p-Hamza",
      kind: "legal",
      runs: 2,
      runsAs: "bat",
      boundary: false,
      penalty: 0,
      wicket: null,
    });
  });

  it("sets the penalty from the rules for wides and no-balls only", () => {
    const m = new TestMatch({ rules: { wideRuns: 2, noBallRuns: 3 } });
    expect(deliveryDraft(m.state, { runs: 0, kind: "wide" })).toMatchObject({ kind: "wide", penalty: 2 });
    expect(deliveryDraft(m.state, { runs: 0, kind: "noball" })).toMatchObject({ kind: "noball", penalty: 3 });
    expect(deliveryDraft(m.state, { runs: 0, kind: "legal" })).toMatchObject({ penalty: 0 });
  });

  it("stores runsAs for wides even though it is ignored", () => {
    const m = new TestMatch();
    expect(deliveryDraft(m.state, { runs: 1, kind: "wide", runsAs: "bye" })).toMatchObject({ runsAs: "bye" });
  });

  it("defaults the dismissed player to the striker and the fielder to null", () => {
    const m = new TestMatch();
    expect(deliveryDraft(m.state, { runs: 0, wicket: { kind: "bowled" } })).toMatchObject({
      wicket: { kind: "bowled", playerOut: "p-Ali", fielderName: null },
    });
    expect(
      deliveryDraft(m.state, { runs: 1, wicket: { kind: "run_out", playerOut: "p-Usman", fielderName: "Zain" } }),
    ).toMatchObject({ wicket: { kind: "run_out", playerOut: "p-Usman", fielderName: "Zain" } });
  });

  it("records the non-striker as null when there is none", () => {
    const m = new TestMatch();
    const state = m.state;
    state.innings[0].nonStriker = null;
    expect(deliveryDraft(state, { runs: 0 })).toMatchObject({ striker: "p-Ali", nonStriker: null });
  });

  it("throws EngineError when there is no bowler", () => {
    const m = new TestMatch();
    m.over([0, 0, 0, 0, 0, 0]);
    expect(() => deliveryDraft(m.state, { runs: 0 })).toThrow(EngineError);
    expect(() => deliveryDraft(m.state, { runs: 0 })).toThrow(expect.objectContaining({ code: "no_bowler" }));
  });

  it("throws EngineError when there is no striker", () => {
    const m = new TestMatch();
    const state = m.state;
    state.innings[0].striker = null;
    expect(() => deliveryDraft(state, { runs: 0 })).toThrow(expect.objectContaining({ code: "no_striker" }));
  });

  it("throws EngineError when no innings is in progress", () => {
    const setup = replay(new TestMatch().events.filter((e) => e.type === "match_created"));
    expect(() => deliveryDraft(setup, { runs: 0 })).toThrow(expect.objectContaining({ code: "no_innings" }));
  });
});

describe("formatOvers", () => {
  it("formats overs", () => {
    expect(formatOvers(70, 6)).toBe("11.4");
    expect(formatOvers(72, 6)).toBe("12");
    expect(formatOvers(0, 6)).toBe("0");
  });

  it("handles 8-ball overs", () => {
    expect(formatOvers(10, 8)).toBe("1.2");
    expect(formatOvers(16, 8)).toBe("2");
  });
});

describe("TestMatch", () => {
  it("assigns ids e1, e2, … and matching seq, and player ids p-<name>", () => {
    const m = new TestMatch();
    expect(m.events.map((e) => e.id)).toEqual(["e1", "e2", "e3", "e4", "e5"]);
    expect(m.events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(m.events.map((e) => e.type)).toEqual([
      "match_created",
      "player_added",
      "player_added",
      "player_added",
      "innings_started",
    ]);
    expect(m.id("Ali")).toBe("p-Ali");
  });

  it("only adds a player the first time a name is used", () => {
    const m = new TestMatch();
    m.bowler("Bilal");
    m.bowler("Hamza");
    m.bowler("Bilal");
    expect(m.events.filter((e) => e.type === "player_added")).toHaveLength(4);
    expect(m.events.filter((e) => e.type === "bowler_changed")).toHaveLength(3);
  });

  it("undo targets the latest delivery and anything after it except player_added", () => {
    const m = new TestMatch();
    m.over([1, 2]);
    const last = m.ball({ runs: 4 });
    m.batter("Saad");
    const batterIn = m.events.at(-1)!;
    m.undo();
    expect(m.events.at(-1)).toMatchObject({ type: "undo", targets: [last.id, batterIn.id] });
  });
});
