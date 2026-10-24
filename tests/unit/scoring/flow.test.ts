import { describe, expect, it } from "vitest";
import { EngineError, nextPrompt, replay } from "@/lib/scoring";
import { TestMatch } from "../../helpers/match";

const SIX_DOTS = [0, 0, 0, 0, 0, 0];
const SIX_SINGLES = [1, 1, 1, 1, 1, 1];

function firstInningsDone(runs: number[], opts: ConstructorParameters<typeof TestMatch>[0] = { overs: 1 }): TestMatch {
  const m = new TestMatch(opts);
  m.over(runs);
  m.endInnings("overs");
  m.startInnings2(["Bilal", "Zain"], "Kamran");
  return m;
}

describe("innings over prompts", () => {
  it("prompts innings over when overs are done", () => {
    const m = new TestMatch({ overs: 1 });
    m.over(SIX_SINGLES);
    expect(nextPrompt(m.state)).toEqual({ kind: "innings_over", reason: "overs" });
  });

  it("does not prompt before the last legal ball", () => {
    const m = new TestMatch({ overs: 1 });
    m.over([1, 1, 1, 1, 1]);
    m.ball({ kind: "wide", runs: 0 });
    expect(nextPrompt(m.state)).toBeNull();
  });

  it("prompts innings over when the chase is reached", () => {
    const m = firstInningsDone(SIX_SINGLES);
    m.ball({ runs: 4, boundary: true });
    expect(nextPrompt(m.state)).toBeNull();
    m.ball({ runs: 4, boundary: true });
    expect(nextPrompt(m.state)).toEqual({ kind: "innings_over", reason: "target" });
  });

  it("does not prompt target in innings 1 even with a manual target", () => {
    const m = new TestMatch({ overs: 10 });
    m.push({ type: "settings_changed", target: 3 });
    m.ball({ runs: 4, boundary: true });
    expect(nextPrompt(m.state)).toBeNull();
  });

  it("prompts overs before target when both hold", () => {
    const m = firstInningsDone(SIX_SINGLES);
    m.over([1, 1, 1, 1, 1, 2]);
    expect(nextPrompt(m.state)).toEqual({ kind: "innings_over", reason: "overs" });
  });

  it("asks innings over before a batter or a bowler", () => {
    const m = new TestMatch({ overs: 1 });
    m.over([1, 1, 1, 1, 1]);
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    expect(m.inn.nonStriker).toBeNull();
    expect(m.inn.bowler).toBeNull();
    expect(nextPrompt(m.state)).toEqual({ kind: "innings_over", reason: "overs" });
  });

  it("asks all out before innings over", () => {
    const m = new TestMatch({ overs: 1, rules: { playersPerSide: { A: 2, B: 2 } } });
    m.over([1, 1, 1, 1, 1]);
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    expect(nextPrompt(m.state)).toEqual({ kind: "all_out" });
  });

  it("can be cut mid-innings", () => {
    const m = new TestMatch({ overs: 10 });
    m.push({ type: "settings_changed", oversPerInnings: 1 });
    m.over(SIX_DOTS);
    expect(nextPrompt(m.state)).toEqual({ kind: "innings_over", reason: "overs" });
  });

  it("ends the innings when overs are cut below the balls already bowled", () => {
    const m = new TestMatch({ overs: 10 });
    m.over(SIX_DOTS);
    m.bowler("Kamran");
    m.over([0, 0]);
    expect(nextPrompt(m.state)).toBeNull();
    m.push({ type: "settings_changed", oversPerInnings: 1 });
    expect(nextPrompt(m.state)).toEqual({ kind: "innings_over", reason: "overs" });
  });

  it("honours a longer innings after more overs are allowed", () => {
    const m = new TestMatch({ overs: 1 });
    m.over(SIX_DOTS);
    m.push({ type: "settings_changed", oversPerInnings: 2 });
    expect(nextPrompt(m.state)).toEqual({ kind: "choose_bowler" });
  });
});

describe("all out and added players", () => {
  it("clears the all-out prompt when a player is added", () => {
    const m = new TestMatch({ rules: { playersPerSide: { A: 3, B: 3 } } });
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    m.batter("Saad");
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    expect(nextPrompt(m.state)).toEqual({ kind: "all_out" });
    m.push({ type: "settings_changed", playersPerSide: { A: 4 } });
    expect(nextPrompt(m.state)).toEqual({ kind: "choose_batter" });
  });

  it("merges players per side without touching the other team", () => {
    const m = new TestMatch({ rules: { playersPerSide: { A: 3, B: 5 } } });
    m.push({ type: "settings_changed", playersPerSide: { A: 4 } });
    expect(m.state.rules.playersPerSide).toEqual({ A: 4, B: 5 });
    m.push({ type: "settings_changed", playersPerSide: { B: 6 } });
    expect(m.state.rules.playersPerSide).toEqual({ A: 4, B: 6 });
  });

  it("leaves everything else as it was when only one setting changes", () => {
    const m = new TestMatch({ overs: 10 });
    const before = m.state.rules;
    m.push({ type: "settings_changed", oversPerInnings: 8 });
    expect(m.state.rules).toEqual({ ...before, oversPerInnings: 8 });
    expect(m.state.target).toBeNull();
  });

  it("applies settings only from the event on", () => {
    const m = new TestMatch({ overs: 10 });
    m.over(SIX_DOTS);
    const beforeCut = replay(m.events);
    m.push({ type: "settings_changed", oversPerInnings: 1 });
    expect(beforeCut.rules.oversPerInnings).toBe(10);
    expect(replay(m.events).rules.oversPerInnings).toBe(1);
  });
});

describe("innings flow and target", () => {
  it("sets the target and asks for innings 2", () => {
    const m = new TestMatch({ overs: 1 });
    m.over(SIX_SINGLES);
    m.endInnings("overs");
    expect(m.state).toMatchObject({ status: "innings_break", target: 7 });
    expect(m.inn.ended).toBe("overs");
    expect(nextPrompt(m.state)).toEqual({ kind: "start_innings", innings: 2 });
  });

  it("has no target until innings 1 ends", () => {
    const m = new TestMatch({ overs: 1 });
    m.over(SIX_SINGLES);
    expect(m.state).toMatchObject({ status: "in_progress", target: null, result: null });
  });

  it("goes back in progress when innings 2 starts, with the other side bowling", () => {
    const m = firstInningsDone(SIX_SINGLES);
    expect(m.state).toMatchObject({ status: "in_progress", target: 7, result: null });
    expect(m.inn).toMatchObject({ number: 2, battingTeam: "B", bowlingTeam: "A" });
    expect(nextPrompt(m.state)).toBeNull();
  });

  it("gives no in-innings prompts once the innings has ended", () => {
    const m = new TestMatch({ overs: 1, rules: { playersPerSide: { A: 3, B: 3 } } });
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    m.batter("Saad");
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    expect(nextPrompt(m.state)).toEqual({ kind: "all_out" });
    m.endInnings("all_out");
    expect(m.inn.ended).toBe("all_out");
    expect(nextPrompt(m.state)).toEqual({ kind: "start_innings", innings: 2 });
  });

  it("ignores batter and bowler changes after the innings has ended", () => {
    const m = new TestMatch({ overs: 1 });
    m.over(SIX_SINGLES);
    m.endInnings("overs");
    const before = m.state;
    m.bowler("Kamran");
    m.push({ type: "batter_in", player: m.id("Ali") });
    expect(m.state.innings).toEqual(before.innings);
    expect(m.state.warnings).toEqual([]);
  });

  it("can be ended by hand mid-over", () => {
    const m = new TestMatch({ overs: 10 });
    m.over([2, 1, 0]);
    m.endInnings("manual");
    expect(m.state).toMatchObject({ status: "innings_break", target: 4 });
    expect(m.inn).toMatchObject({ ended: "manual", legalBalls: 3 });
    expect(nextPrompt(m.state)).toEqual({ kind: "start_innings", innings: 2 });
  });

  it("ignores a repeated innings_ended", () => {
    const m = new TestMatch({ overs: 1 });
    m.over(SIX_SINGLES);
    m.endInnings("overs");
    const once = m.state;
    m.push({ type: "innings_ended", innings: 1, reason: "manual" });
    expect(m.state).toEqual(once);
  });

  it("throws for an innings_ended with no such innings", () => {
    const m = new TestMatch();
    m.push({ type: "innings_ended", innings: 2, reason: "manual" });
    expect(() => m.state).toThrow(EngineError);
    expect(() => m.state).toThrow(expect.objectContaining({ code: "no_innings" }));
  });
});

describe("result", () => {
  it("chase reached gives won by wickets with balls left", () => {
    const m = firstInningsDone(SIX_SINGLES);
    m.ball({ runs: 4, boundary: true });
    m.ball({ runs: 4, boundary: true });
    expect(nextPrompt(m.state)).toEqual({ kind: "innings_over", reason: "target" });
    m.endInnings("target");
    expect(m.state.result).toEqual({ kind: "won_by_wickets", winner: "B", wickets: 10, ballsLeft: 4 });
    expect(m.state.status).toBe("complete");
    expect(m.inn.ended).toBe("target");
    expect(nextPrompt(m.state)).toBeNull();
  });

  it("defended total gives won by runs", () => {
    const m = firstInningsDone(SIX_SINGLES);
    m.over([1, 1, 0, 0, 0, 0]);
    m.endInnings("overs");
    expect(m.state.result).toEqual({ kind: "won_by_runs", winner: "A", runs: 4 });
    expect(m.state.status).toBe("complete");
    expect(nextPrompt(m.state)).toBeNull();
  });

  it("tie", () => {
    const m = firstInningsDone(SIX_SINGLES);
    m.over(SIX_SINGLES);
    m.endInnings("overs");
    expect(m.state.result).toEqual({ kind: "tie" });
    expect(m.state.status).toBe("complete");
  });

  it("is a win by wickets even when the chase is reached on the last ball", () => {
    const m = firstInningsDone(SIX_SINGLES);
    m.over([1, 1, 1, 1, 1, 2]);
    m.endInnings("overs");
    expect(m.state.result).toEqual({ kind: "won_by_wickets", winner: "B", wickets: 10, ballsLeft: 0 });
  });

  it("counts the chasing side's wickets against its own size", () => {
    const m = firstInningsDone(SIX_SINGLES, { overs: 1, rules: { playersPerSide: { A: 11, B: 5 } } });
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    m.batter("Imran");
    m.ball({ runs: 4, boundary: true });
    m.ball({ runs: 4, boundary: true });
    m.endInnings("target");
    expect(m.state.result).toEqual({ kind: "won_by_wickets", winner: "B", wickets: 3, ballsLeft: 3 });
  });

  it("follows the batting order when the toss winner bowls first", () => {
    const m = firstInningsDone(SIX_SINGLES, {
      overs: 1,
      toss: { winner: "A", choice: "bowl" },
      rules: { playersPerSide: { A: 5, B: 11 } },
    });
    expect(m.inn).toMatchObject({ battingTeam: "A", bowlingTeam: "B" });
    m.ball({ runs: 4, boundary: true });
    m.ball({ runs: 4, boundary: true });
    m.endInnings("target");
    expect(m.state.result).toEqual({ kind: "won_by_wickets", winner: "A", wickets: 4, ballsLeft: 4 });
  });

  it("counts every player as a wicket in hand with last man stands", () => {
    const m = firstInningsDone(SIX_SINGLES, {
      overs: 1,
      rules: { playersPerSide: { A: 3, B: 3 }, lastManStands: true },
    });
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    m.batter("Imran");
    m.ball({ runs: 4, boundary: true });
    m.ball({ runs: 4, boundary: true });
    m.endInnings("target");
    expect(m.state.result).toEqual({ kind: "won_by_wickets", winner: "B", wickets: 2, ballsLeft: 3 });
  });

  it("uses the overs in force for balls left", () => {
    const m = firstInningsDone(SIX_SINGLES, { overs: 1 });
    m.push({ type: "settings_changed", oversPerInnings: 2 });
    m.ball({ runs: 4, boundary: true });
    m.ball({ runs: 4, boundary: true });
    m.endInnings("target");
    expect(m.state.result).toMatchObject({ kind: "won_by_wickets", ballsLeft: 10 });
  });

  it("wins by runs when all out short of the target", () => {
    const m = firstInningsDone(SIX_SINGLES, { overs: 1, rules: { playersPerSide: { A: 3, B: 2 } } });
    m.ball({ runs: 2 });
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    m.endInnings("all_out");
    expect(m.state.result).toEqual({ kind: "won_by_runs", winner: "A", runs: 4 });
  });

  it("leaves the result empty while innings 2 is running", () => {
    const m = firstInningsDone(SIX_SINGLES);
    m.ball({ runs: 4, boundary: true });
    expect(m.state.result).toBeNull();
    expect(m.state.status).toBe("in_progress");
  });
});

describe("manual target", () => {
  it("is used for the result", () => {
    const m = new TestMatch({ overs: 1 });
    m.over(SIX_SINGLES);
    m.endInnings("overs");
    m.push({ type: "settings_changed", target: 50 });
    expect(m.state.target).toBe(50);
    m.startInnings2(["Bilal", "Zain"], "Kamran");
    m.over([5, 5, 5, 5, 5, 5]);
    m.endInnings("overs");
    expect(m.state.result).toEqual({ kind: "won_by_runs", winner: "A", runs: 19 });
  });

  it("set during innings 1 survives the end of innings 1", () => {
    const m = new TestMatch({ overs: 1 });
    m.push({ type: "settings_changed", target: 40 });
    expect(m.state.target).toBe(40);
    m.over(SIX_SINGLES);
    m.endInnings("overs");
    expect(m.state.target).toBe(40);
  });

  it("can be revised during the chase", () => {
    const m = firstInningsDone(SIX_SINGLES);
    m.push({ type: "settings_changed", target: 5 });
    m.ball({ runs: 4, boundary: true });
    m.ball({ runs: 1 });
    expect(nextPrompt(m.state)).toEqual({ kind: "innings_over", reason: "target" });
    m.endInnings("target");
    expect(m.state.result).toMatchObject({ kind: "won_by_wickets", winner: "B", ballsLeft: 4 });
  });

  it("falls back to the computed target when cleared", () => {
    const m = new TestMatch({ overs: 1 });
    m.over(SIX_SINGLES);
    m.endInnings("overs");
    m.push({ type: "settings_changed", target: 50 });
    m.push({ type: "settings_changed", target: null });
    expect(m.state.target).toBe(7);
  });

  it("is empty again when cleared before innings 1 ends", () => {
    const m = new TestMatch({ overs: 1 });
    m.push({ type: "settings_changed", target: 40 });
    m.push({ type: "settings_changed", target: null });
    expect(m.state.target).toBeNull();
  });
});

describe("bowler warnings", () => {
  it("warns on consecutive overs, keyed to the bowler change", () => {
    const m = new TestMatch();
    m.over(SIX_DOTS);
    m.bowler("Hamza");
    const change = m.events.at(-1);
    expect(m.state.warnings).toContainEqual(
      expect.objectContaining({ kind: "consecutive_overs", bowler: m.id("Hamza") }),
    );
    expect(m.state.warnings).toEqual([{ eventId: change?.id, kind: "consecutive_overs", bowler: m.id("Hamza") }]);
  });

  it("does not warn for a different bowler or for the first over", () => {
    const m = new TestMatch();
    m.bowler("Hamza");
    expect(m.state.warnings).toEqual([]);
    m.over(SIX_DOTS);
    m.bowler("Kamran");
    expect(m.state.warnings).toEqual([]);
  });

  it("warns when a bowler returns for the over straight after his own, mid-over", () => {
    const m = new TestMatch();
    m.over(SIX_DOTS);
    m.bowler("Kamran");
    m.over([0, 0, 0]);
    m.bowler("Hamza");
    expect(m.state.warnings).toEqual([
      { eventId: m.events.at(-1)?.id, kind: "consecutive_overs", bowler: m.id("Hamza") },
    ]);
  });

  it("does not warn about consecutive overs when the new bowler follows another bowler's over", () => {
    const m = new TestMatch();
    m.over(SIX_DOTS);
    m.bowler("Kamran");
    m.over(SIX_DOTS);
    m.bowler("Hamza");
    expect(m.state.warnings).toEqual([]);
  });

  it("warns when the bowler has bowled his quota", () => {
    const m = new TestMatch({ overs: 10 });
    m.over(SIX_DOTS);
    m.bowler("Kamran");
    m.over(SIX_DOTS);
    m.bowler("Hamza");
    expect(m.state.warnings).toEqual([]);
    m.over(SIX_DOTS);
    m.bowler("Kamran");
    m.over(SIX_DOTS);
    m.bowler("Hamza");
    expect(m.state.warnings).toContainEqual(expect.objectContaining({ kind: "bowler_quota", quota: 2 }));
    expect(m.state.warnings).toEqual([
      { eventId: m.events.at(-1)?.id, kind: "bowler_quota", bowler: m.id("Hamza"), quota: 2 },
    ]);
  });

  it("raises both warnings from one change", () => {
    const m = new TestMatch({ overs: 5 });
    m.over(SIX_DOTS);
    m.bowler("Hamza");
    const change = m.events.at(-1);
    expect(m.state.warnings).toEqual([
      { eventId: change?.id, kind: "consecutive_overs", bowler: m.id("Hamza") },
      { eventId: change?.id, kind: "bowler_quota", bowler: m.id("Hamza"), quota: 1 },
    ]);
  });

  it("warns about consecutive overs for a bowler who bowled only part of the previous over", () => {
    const m = new TestMatch({ overs: 5 });
    m.over([0, 0, 0]);
    m.bowler("Kamran");
    m.over([0, 0, 0]);
    m.bowler("Hamza");
    expect(m.state.warnings).toEqual([
      { eventId: m.events.at(-1)?.id, kind: "consecutive_overs", bowler: m.id("Hamza") },
    ]);
  });

  it("does not count a part-over towards the quota", () => {
    const m = new TestMatch({ overs: 5 });
    m.over([0, 0, 0]);
    m.bowler("Kamran");
    m.over([0, 0, 0]);
    m.bowler("Yasir");
    m.over(SIX_DOTS);
    m.bowler("Hamza");
    expect(m.state.warnings).toEqual([]);
  });

  it("uses the quota in force at the time of the change", () => {
    const m = new TestMatch({ overs: 10 });
    m.over(SIX_DOTS);
    m.push({ type: "settings_changed", oversPerInnings: 5 });
    m.bowler("Kamran");
    m.over(SIX_DOTS);
    m.bowler("Hamza");
    expect(m.state.warnings).toEqual([
      { eventId: m.events.at(-1)?.id, kind: "bowler_quota", bowler: m.id("Hamza"), quota: 1 },
    ]);
  });

  it("stays the same under replay in any order", () => {
    const m = new TestMatch({ overs: 5 });
    m.over(SIX_DOTS);
    m.bowler("Hamza");
    m.over(SIX_DOTS);
    m.bowler("Kamran");
    const warnings = m.state.warnings;
    expect(warnings).toHaveLength(2);
    expect(replay([...m.events].reverse()).warnings).toEqual(warnings);
    expect(replay(m.events).warnings).toEqual(warnings);
  });
});
