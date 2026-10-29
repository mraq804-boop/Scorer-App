import { describe, expect, it } from "vitest";
import { matchSection, teamPill } from "@/lib/app/home";
import type { LocalMatch } from "@/lib/local/db";

type Status = LocalMatch["summary"]["status"];

const NOW = Date.UTC(2026, 9, 29, 12);
const HOUR = 60 * 60 * 1000;

function match(status: Status, winner?: "A" | "B" | "tie" | null, side: "A" | "B" | null = "A") {
  const summary = { title: "Lions v Tigers", teams: ["Lions", "Tigers"] as [string, string], status, lines: [], result: null, winner };
  const team = side === null ? undefined : { id: "t1", side, fixtureId: null, xi: [] };
  return { summary, team, syncState: "synced" as LocalMatch["syncState"], updatedAt: new Date(NOW - HOUR).toISOString() };
}

describe("home sections", () => {
  it("live holds matches in progress or at the break", () => {
    expect(matchSection(match("in_progress"), NOW)).toBe("live");
    expect(matchSection(match("innings_break"), NOW)).toBe("live");
    expect(matchSection(match("complete"), NOW)).toBe("recent");
    expect(matchSection(match("setup"), NOW)).toBe("recent");
  });

  it("an unfinished match goes stale after 12 hours, and a handed-over match is never live", () => {
    expect(matchSection({ ...match("in_progress"), updatedAt: new Date(NOW - 11 * HOUR).toISOString() }, NOW)).toBe("live");
    expect(matchSection({ ...match("in_progress"), updatedAt: new Date(NOW - 13 * HOUR).toISOString() }, NOW)).toBe("recent");
    expect(matchSection({ ...match("in_progress"), syncState: "blocked" }, NOW)).toBe("recent");
  });

  it("team matches get a pill from the team's side", () => {
    expect(teamPill(match("complete", "A"))).toBe("W");
    expect(teamPill(match("complete", "B"))).toBe("L");
    expect(teamPill(match("complete", "tie"))).toBe("T");
    expect(teamPill(match("complete", null))).toBe("NR");
    expect(teamPill(match("complete", undefined))).toBeNull();
    expect(teamPill(match("complete", "A", null))).toBeNull();
    expect(teamPill(match("in_progress", "A"))).toBeNull();
  });
});
