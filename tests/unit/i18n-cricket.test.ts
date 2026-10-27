import { describe, expect, it } from "vitest";
import {
  formatCommentary,
  formatDismissal,
  formatFigures,
  formatNeed,
  formatResult,
  formatScoreLine,
  formatWarning,
} from "@/lib/i18n/cricket";
import { summarize } from "@/lib/share/summary";
import { replay } from "@/lib/scoring";
import type { BatterLine, CommentaryItem, Player } from "@/lib/scoring";
import { TestMatch } from "../helpers/match";

const players: Record<string, Player> = {
  "p-Hamza": { id: "p-Hamza", name: "Hamza", team: "B" },
  "p-Ali": { id: "p-Ali", name: "Ali", team: "A" },
};
const teams = { A: { name: "Lions" }, B: { name: "Tigers" } };

function item(overrides: Partial<CommentaryItem>): CommentaryItem {
  return {
    eventId: "x",
    ballLabel: "11.4",
    bowler: "p-Hamza",
    batter: "p-Ali",
    kind: "legal",
    runs: 0,
    runsAs: "bat",
    boundary: false,
    penalty: 0,
    freeHit: false,
    wicket: null,
    ...overrides,
  };
}

function commentary(overrides: Partial<CommentaryItem>): string {
  return formatCommentary(item(overrides), players);
}

describe("formatCommentary", () => {
  it("writes the spec example", () => {
    expect(commentary({ runs: 4, boundary: true })).toBe("11.4 Hamza to Ali, FOUR");
  });

  it("describes runs off the bat", () => {
    expect(commentary({ runs: 0 })).toBe("11.4 Hamza to Ali, no run");
    expect(commentary({ runs: 1 })).toBe("11.4 Hamza to Ali, 1 run");
    expect(commentary({ runs: 2 })).toBe("11.4 Hamza to Ali, 2 runs");
    expect(commentary({ runs: 6, boundary: true })).toBe("11.4 Hamza to Ali, SIX");
    expect(commentary({ runs: 4 })).toBe("11.4 Hamza to Ali, 4 runs");
    expect(commentary({ runs: 5, boundary: true })).toBe("11.4 Hamza to Ali, 5 runs");
  });

  it("describes byes and leg byes", () => {
    expect(commentary({ runs: 1, runsAs: "bye" })).toBe("11.4 Hamza to Ali, 1 bye");
    expect(commentary({ runs: 2, runsAs: "bye" })).toBe("11.4 Hamza to Ali, 2 byes");
    expect(commentary({ runs: 1, runsAs: "legbye" })).toBe("11.4 Hamza to Ali, 1 leg bye");
    expect(commentary({ runs: 3, runsAs: "legbye" })).toBe("11.4 Hamza to Ali, 3 leg byes");
    expect(commentary({ runs: 0, runsAs: "bye" })).toBe("11.4 Hamza to Ali, no run");
  });

  it("describes wides and no balls", () => {
    expect(commentary({ kind: "wide", penalty: 1 })).toBe("11.4 Hamza to Ali, wide");
    expect(commentary({ kind: "wide", penalty: 1, runs: 2, runsAs: "bye" })).toBe("11.4 Hamza to Ali, wide, 2 runs");
    expect(commentary({ kind: "wide", penalty: 1, runs: 4, boundary: true })).toBe("11.4 Hamza to Ali, wide, FOUR");
    expect(commentary({ kind: "noball", penalty: 1 })).toBe("11.4 Hamza to Ali, no ball");
    expect(commentary({ kind: "noball", penalty: 1, runs: 6, boundary: true })).toBe("11.4 Hamza to Ali, no ball, SIX");
    expect(commentary({ kind: "noball", penalty: 1, runs: 1, runsAs: "legbye" })).toBe(
      "11.4 Hamza to Ali, no ball, 1 leg bye",
    );
  });

  it("describes a wicket", () => {
    const wicket = { kind: "bowled" as const, playerOut: "p-Ali", fielderName: null };
    expect(commentary({ wicket })).toBe("11.4 Hamza to Ali, OUT");
    expect(commentary({ wicket: { ...wicket, kind: "run_out" }, runs: 1 })).toBe("11.4 Hamza to Ali, 1 run, OUT");
    expect(commentary({ kind: "wide", penalty: 1, wicket: { ...wicket, kind: "stumped" } })).toBe(
      "11.4 Hamza to Ali, wide, OUT",
    );
  });

  it("falls back to the id for a player it does not know", () => {
    expect(formatCommentary(item({ batter: "p-Ghost" }), players)).toBe("11.4 Hamza to p-Ghost, no run");
  });

  it("reads real engine output", () => {
    const m = new TestMatch();
    m.ball({ runs: 4, boundary: true });
    m.ball({ kind: "wide", runs: 0 });
    m.ball({ runs: 0, wicket: { kind: "bowled" } });
    expect(m.inn.commentary.map((c) => formatCommentary(c, m.state.players))).toEqual([
      "0.1 Hamza to Ali, FOUR",
      "0.2 Hamza to Ali, wide",
      "0.2 Hamza to Ali, OUT",
    ]);
  });
});

describe("formatResult", () => {
  it("describes a win by runs", () => {
    expect(formatResult({ kind: "won_by_runs", winner: "A", runs: 23 }, teams)).toBe("Lions won by 23 runs");
    expect(formatResult({ kind: "won_by_runs", winner: "A", runs: 1 }, teams)).toBe("Lions won by 1 run");
  });

  it("describes a win by wickets", () => {
    expect(formatResult({ kind: "won_by_wickets", winner: "B", wickets: 4, ballsLeft: 12 }, teams)).toBe(
      "Tigers won by 4 wickets (12 balls left)",
    );
    expect(formatResult({ kind: "won_by_wickets", winner: "B", wickets: 1, ballsLeft: 1 }, teams)).toBe(
      "Tigers won by 1 wicket (1 ball left)",
    );
    expect(formatResult({ kind: "won_by_wickets", winner: "B", wickets: 2, ballsLeft: 0 }, teams)).toBe(
      "Tigers won by 2 wickets (0 balls left)",
    );
  });

  it("describes a tie", () => {
    expect(formatResult({ kind: "tie" }, teams)).toBe("Match tied");
  });
});

describe("formatScoreLine", () => {
  it("shows runs, wickets and overs", () => {
    const m = new TestMatch();
    const innings = { ...m.inn, runs: 87, wickets: 3, legalBalls: 70 };
    expect(formatScoreLine(innings, m.state)).toBe("Lions 87/3 (11.4 ov)");
  });

  it("shows a finished full innings in whole overs", () => {
    const m = new TestMatch({ overs: 20 });
    const innings = { ...m.inn, runs: 150, wickets: 4, legalBalls: 120, ended: "overs" as const };
    expect(formatScoreLine(innings, m.state)).toBe("Lions 150/4 (20 ov)");
  });

  it("counts overs by the balls per over of the match", () => {
    const m = new TestMatch({ rules: { ballsPerOver: 8 } });
    const innings = { ...m.inn, runs: 40, wickets: 1, legalBalls: 19 };
    expect(formatScoreLine(innings, m.state)).toBe("Lions 40/1 (2.3 ov)");
  });

  it("names the batting side", () => {
    const m = new TestMatch({ toss: { winner: "A", choice: "bowl" } });
    expect(formatScoreLine(m.inn, m.state)).toBe("Tigers 0/0 (0 ov)");
  });
});

describe("summarize", () => {
  it("summarizes a match in progress", () => {
    const m = new TestMatch();
    m.ball({ runs: 1 });
    expect(summarize(m.state)).toEqual({
      title: "Lions v Tigers",
      teams: ["Lions", "Tigers"],
      status: "in_progress",
      lines: ["Lions 1/0 (0.1 ov)"],
      result: null,
    });
  });

  it("has a line per innings and the result once complete", () => {
    const m = new TestMatch();
    m.ball({ runs: 1 });
    m.endInnings("manual");
    expect(summarize(m.state)).toMatchObject({ status: "innings_break", lines: ["Lions 1/0 (0.1 ov)"], result: null });

    m.startInnings2(["Zain", "Faisal"], "Usman");
    m.ball({ runs: 6, boundary: true });
    m.endInnings("target");
    expect(summarize(m.state)).toEqual({
      title: "Lions v Tigers",
      teams: ["Lions", "Tigers"],
      status: "complete",
      lines: ["Lions 1/0 (0.1 ov)", "Tigers 6/0 (0.1 ov)"],
      result: "Tigers won by 10 wickets (59 balls left)",
    });
  });

  it("has no lines before an innings starts", () => {
    const m = new TestMatch();
    expect(summarize(replay(m.events.slice(0, 1)))).toMatchObject({ status: "setup", lines: [], result: null });
  });
});

describe("formatWarning", () => {
  it("names a bowler who bowled the last over too", () => {
    expect(formatWarning({ eventId: "x", kind: "consecutive_overs", bowler: "p-Hamza" }, players)).toBe(
      "Hamza also bowled the last over",
    );
  });

  it("names a bowler over the quota with the quota in overs", () => {
    expect(formatWarning({ eventId: "x", kind: "bowler_quota", bowler: "p-Hamza", quota: 2 }, players)).toBe(
      "Hamza has already bowled 2 overs, the most allowed",
    );
    expect(formatWarning({ eventId: "x", kind: "bowler_quota", bowler: "p-Hamza", quota: 1 }, players)).toBe(
      "Hamza has already bowled 1 over, the most allowed",
    );
  });

  it("asks the scorer to check the strike", () => {
    expect(formatWarning({ eventId: "x", kind: "strike_mismatch" }, players)).toBe(
      "The striker doesn't match the ball before. Check who's on strike.",
    );
  });

  it("reads real engine output", () => {
    const m = new TestMatch();
    m.over([0, 0, 0, 0, 0, 0]);
    m.bowler("Hamza");
    const [warning] = m.state.warnings;
    expect(formatWarning(warning, m.state.players)).toBe("Hamza also bowled the last over");
  });
});

describe("formatNeed", () => {
  it("says how many runs are needed from how many balls", () => {
    expect(formatNeed(64, 50)).toBe("Need 64 from 50 balls");
    expect(formatNeed(1, 1)).toBe("Need 1 from 1 ball");
  });
});

describe("formatFigures", () => {
  it("writes overs, maidens, runs and wickets", () => {
    const line = { playerId: "p-Hamza", legalBalls: 14, runs: 18, wickets: 1, wides: 0, noBalls: 0, maidens: 1, dots: 7 };
    expect(formatFigures(line, 6)).toBe("2.2-1-18-1");
    expect(formatFigures({ ...line, legalBalls: 16 }, 8)).toBe("2-1-18-1");
  });
});

describe("formatDismissal", () => {
  const named: Record<string, Player> = {
    ...players,
    "p-Zain": { id: "p-Zain", name: "Zain", team: "B" },
    "p-Bilal": { id: "p-Bilal", name: "Bilal", team: "B" },
  };

  function line(overrides: Partial<BatterLine>): BatterLine {
    return { playerId: "p-Ali", runs: 0, balls: 0, fours: 0, sixes: 0, dots: 0, out: null, retiredHurt: false, ...overrides };
  }

  function out(kind: NonNullable<BatterLine["out"]>["kind"], bowler: string | null, fielderName: string | null): string {
    return formatDismissal(line({ out: { kind, bowler, fielderName, fielderId: null } }), named);
  }

  it("writes each way of getting out", () => {
    expect(out("caught", "p-Bilal", "Zain")).toBe("c Zain b Bilal");
    expect(out("bowled", "p-Hamza", null)).toBe("b Hamza");
    expect(out("run_out", null, "Zain")).toBe("run out (Zain)");
    expect(out("stumped", "p-Bilal", "Zain")).toBe("st Zain b Bilal");
    expect(out("lbw", "p-Bilal", null)).toBe("lbw b Bilal");
    expect(out("hit_wicket", "p-Bilal", null)).toBe("hit wicket b Bilal");
    expect(out("retired_out", null, null)).toBe("retired out");
    expect(out("other", null, null)).toBe("out");
  });

  it("copes with a fielder that was not entered", () => {
    expect(out("caught", "p-Bilal", null)).toBe("caught b Bilal");
    expect(out("stumped", "p-Bilal", null)).toBe("stumped b Bilal");
    expect(out("run_out", null, null)).toBe("run out");
  });

  it("says retired hurt and not out", () => {
    expect(formatDismissal(line({ retiredHurt: true }), named)).toBe("retired hurt");
    expect(formatDismissal(line({}), named)).toBe("not out");
  });

  it("falls back to the id for a bowler it does not know", () => {
    expect(out("bowled", "p-Ghost", null)).toBe("b p-Ghost");
  });

  it("reads real engine output", () => {
    const m = new TestMatch();
    m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Zain" } });
    const [ali, usman] = ["Ali", "Usman"].map((name) => m.inn.batting.find((b) => b.playerId === m.id(name)) as BatterLine);
    expect(formatDismissal(ali, m.state.players)).toBe("c Zain b Hamza");
    expect(formatDismissal(usman, m.state.players)).toBe("not out");
  });
});
