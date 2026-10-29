import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MatchCard } from "@/components/match-list";
import { defaultRules } from "@/lib/scoring";
import type { LocalMatch } from "@/lib/local/db";

function teamMatch(winner: "A" | "B"): LocalMatch {
  return {
    id: "m1",
    code: "abcd2345",
    createdAt: "2026-10-29T08:00:00.000Z",
    updatedAt: "2026-10-29T09:00:00.000Z",
    lastSeq: 10,
    syncedSeq: 10,
    syncState: "synced",
    blockedReason: null,
    summary: { title: "Lions v Tigers", teams: ["Lions", "Tigers"], status: "complete", lines: [], result: "Lions won by 3 runs", winner },
    rules: defaultRules("tape", 10),
    teams: ["Lions", "Tigers"],
    title: "Lions v Tigers",
    team: { id: "t1", side: "A", fixtureId: null, xi: [] },
  };
}

describe("Home match card", () => {
  it("reads the result out in words and stays readable in dark mode", () => {
    const won = renderToStaticMarkup(createElement(MatchCard, { match: teamMatch("A"), live: false }));
    expect(won).toContain(">Won<");
    expect(won).toContain("bg-success-soft");
    expect(won).not.toContain("text-white");
    const lost = renderToStaticMarkup(createElement(MatchCard, { match: teamMatch("B"), live: false }));
    expect(lost).toContain(">Lost<");
  });
});
