import { describe, expect, it } from "vitest";
import { replay } from "@/lib/scoring";
import type { MatchState } from "@/lib/scoring";
import { buildShareText } from "@/lib/share/text";
import { TestMatch } from "../../helpers/match";

const URL = "https://cricket.example/m/abcd2345";

function firstInningsOf(m: TestMatch, runs: number, wickets: number, legalBalls: number): MatchState {
  const state = m.state;
  return { ...state, innings: [{ ...state.innings[0], runs, wickets, legalBalls }] };
}

function chaseOf(m: TestMatch, target: number, first: [number, number], second: [number, number, number]): MatchState {
  const state = m.state;
  const [innings1, innings2] = state.innings;
  return {
    ...state,
    target,
    innings: [
      { ...innings1, runs: first[0], wickets: first[1], legalBalls: 120, ended: "overs" },
      { ...innings2, runs: second[0], wickets: second[1], legalBalls: second[2] },
    ],
  };
}

function chaseMatch(): TestMatch {
  const m = new TestMatch({ overs: 20 });
  m.endInnings("manual");
  m.startInnings2(["Zain", "Faisal"], "Usman");
  return m;
}

describe("buildShareText", () => {
  it("shares the live score in the first innings", () => {
    const m = new TestMatch({ overs: 20 });
    expect(buildShareText(firstInningsOf(m, 87, 3, 70), URL)).toBe(
      `Lions vs Tigers\nLions 87/3 (11.4 ov)\nLive: ${URL}`,
    );
  });

  it("shares what the chase needs in the second innings", () => {
    const state = chaseOf(chaseMatch(), 151, [150, 6], [87, 3, 70]);
    expect(buildShareText(state, URL)).toBe(
      `Lions vs Tigers\nLions 150/6 (20 ov)\nTigers 87/3 (11.4 ov), need 64 from 50 balls\nLive: ${URL}`,
    );
  });

  it("says ball in the singular when one ball is left", () => {
    const state = chaseOf(chaseMatch(), 151, [150, 6], [149, 3, 119]);
    expect(buildShareText(state, URL)).toContain("Tigers 149/3 (19.5 ov), need 2 from 1 ball\n");
  });

  it("shares the result and every innings once the match is complete", () => {
    const state: MatchState = {
      ...chaseOf(chaseMatch(), 151, [150, 6], [127, 9, 120]),
      status: "complete",
      result: { kind: "won_by_runs", winner: "A", runs: 23 },
    };
    expect(buildShareText(state, URL)).toBe(
      `Lions vs Tigers\nLions won by 23 runs\nLions 150/6 (20 ov)\nTigers 127/9 (20 ov)\nScorecard: ${URL}`,
    );
  });

  it("describes a tie and a chase won by wickets", () => {
    const m = chaseMatch();
    const tied: MatchState = { ...m.state, status: "complete", result: { kind: "tie" } };
    expect(buildShareText(tied, URL).split("\n")[1]).toBe("Match tied");

    const won: MatchState = {
      ...m.state,
      status: "complete",
      result: { kind: "won_by_wickets", winner: "B", wickets: 4, ballsLeft: 12 },
    };
    expect(buildShareText(won, URL).split("\n")[1]).toBe("Tigers won by 4 wickets (12 balls left)");
  });

  it("drops the need once the target is reached or no balls are left", () => {
    const reached = chaseOf(chaseMatch(), 151, [150, 6], [151, 3, 100]);
    expect(buildShareText(reached, URL)).toContain("\nTigers 151/3 (16.4 ov)\nLive:");

    const out = chaseOf(chaseMatch(), 151, [150, 6], [140, 5, 120]);
    expect(buildShareText(out, URL)).toContain("\nTigers 140/5 (20 ov)\nLive:");
  });

  it("shares only the first innings during the innings break", () => {
    const m = new TestMatch({ overs: 20 });
    m.over([1, 4, 0, 2, 1, 0]);
    m.endInnings("manual");
    expect(buildShareText(m.state, URL)).toBe(`Lions vs Tigers\nLions 8/0 (1 ov)\nLive: ${URL}`);
  });

  it("shares just the teams and the link before the first ball", () => {
    const m = new TestMatch();
    expect(buildShareText(replay(m.events.slice(0, 1)), URL)).toBe(`Lions vs Tigers\nLive: ${URL}`);
  });

  it("keeps team names exactly as typed", () => {
    const m = new TestMatch({ teams: ["لاہور قلندرز", "Tigers 🐯"] });
    m.ball({ runs: 1 });
    expect(buildShareText(m.state, URL)).toBe(`لاہور قلندرز vs Tigers 🐯\nلاہور قلندرز 1/0 (0.1 ov)\nLive: ${URL}`);
  });

  it("reads real engine output through a whole match", () => {
    const m = new TestMatch({ overs: 1 });
    m.over([4, 1, 0, 2, 6, 1]);
    m.endInnings("overs");
    m.startInnings2(["Zain", "Faisal"], "Usman");
    m.ball({ runs: 3 });
    expect(buildShareText(m.state, URL)).toBe(
      `Lions vs Tigers\nLions 14/0 (1 ov)\nTigers 3/0 (0.1 ov), need 12 from 5 balls\nLive: ${URL}`,
    );

    m.over([1, 0, 0, 0, 0]);
    m.endInnings("overs");
    expect(buildShareText(m.state, URL)).toBe(
      `Lions vs Tigers\nLions won by 10 runs\nLions 14/0 (1 ov)\nTigers 4/0 (1 ov)\nScorecard: ${URL}`,
    );
  });
});
