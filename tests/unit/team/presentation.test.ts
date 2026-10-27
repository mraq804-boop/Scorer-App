import { describe, expect, it } from "vitest";
import { formatAverage, formatBest, formatHighest, formatLeaderboardValue, formatRate, formatRecord } from "@/lib/i18n/team";

describe("team presentation", () => {
  it("formats averages and rates to two places, with a dash when there is none", () => {
    expect(formatAverage(null)).toBe("–");
    expect(formatAverage(41.234)).toBe("41.23");
    expect(formatAverage(30)).toBe("30.00");
    expect(formatRate(112.5)).toBe("112.50");
  });

  it("formats best figures as wickets/runs", () => {
    expect(formatBest({ wickets: 4, runs: 12 })).toBe("4/12");
    expect(formatBest(null)).toBe("–");
  });

  it("marks a not-out highest score with a star", () => {
    expect(formatHighest({ runs: 78, notOut: true })).toBe("78*");
    expect(formatHighest({ runs: 78, notOut: false })).toBe("78");
    expect(formatHighest(null)).toBe("–");
  });

  it("formats each leaderboard's value the way that board reads", () => {
    expect(formatLeaderboardValue("runs", { playerId: "p", value: 210 })).toBe("210");
    expect(formatLeaderboardValue("highest", { playerId: "p", value: 78, notOut: true })).toBe("78*");
    expect(formatLeaderboardValue("average", { playerId: "p", value: 41.234 })).toBe("41.23");
    expect(formatLeaderboardValue("economy", { playerId: "p", value: 5.5 })).toBe("5.50");
    expect(formatLeaderboardValue("bestBowling", { playerId: "p", value: 4, runs: 12 })).toBe("4/12");
  });

  it("formats the team record", () => {
    expect(formatRecord({ played: 10, won: 6, lost: 3, tied: 0, noResult: 1 })).toBe("P 10 · W 6 · L 3 · T 0 · NR 1");
  });
});
