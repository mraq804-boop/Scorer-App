import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlayerMatches, PlayerTotalsView } from "@/components/team-page/player-sections";
import { Leaderboards, RecentResults, TeamHeader } from "@/components/team-page/team-sections";
import { aggregateTeamStats, parseTeamPage } from "@/lib/team";
import type { PlayerMatchStats, TeamPageData } from "@/lib/team";

const ALI = "sq-ali";
const HAMZA = "sq-hamza";
const USMAN = "sq-usman";
const none = { catches: 0, runOuts: 0, stumpings: 0 };

function player(playerId: string, stats: Partial<PlayerMatchStats>): PlayerMatchStats {
  return { playerId, batting: null, bowling: null, fielding: none, ...stats };
}

function match(code: string, status: string, overrides: Record<string, unknown>, players: PlayerMatchStats[]) {
  return {
    code,
    title: "Lions vs Kites",
    status,
    summary: { lines: ["Lions 120/4 (15)"], result: "Lions won by 20 runs" },
    resultOverride: null,
    potmPlayerId: null,
    record: {
      version: 1,
      side: "A",
      opponent: "Kites",
      playedAt: "2026-11-01T10:00:00.000Z",
      xi: [ALI, HAMZA, USMAN],
      outcome: "won",
      players,
    },
    ...overrides,
  };
}

const page = parseTeamPage({
  team: { code: "abcd2345", name: "Lions", homeGround: "Model Town", timeZone: "Asia/Karachi" },
  squad: [
    { id: ALI, name: "Ali", role: "batter", active: true },
    { id: HAMZA, name: "Hamza", role: "bowler", active: true },
    { id: USMAN, name: "Usman", role: null, active: false },
  ],
  seasons: [],
  fixtures: [],
  matches: [
    match("mmmm2222", "complete", {}, [
      player(ALI, { batting: { runs: 45, balls: 30, fours: 4, sixes: 1, notOut: true } }),
      player(HAMZA, { bowling: { legalBalls: 24, runs: 20, wickets: 3, maidens: 1, dots: 12 } }),
      player(USMAN, { fielding: { catches: 1, runOuts: 0, stumpings: 0 } }),
    ]),
    match("mmmm3333", "in_progress", { summary: { lines: ["Lions 30/1 (4)"], result: null } }, []),
  ],
}) as TeamPageData;

const stats = aggregateTeamStats(page.matches, page.squad, { seasonId: null, seasons: [], timeZone: "Asia/Karachi" });
const names = new Map(page.squad.map((squadPlayer) => [squadPlayer.id, squadPlayer.name]));
const render = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);

describe("public team page sections", () => {
  it("shows the team and its record", () => {
    const html = render(createElement(TeamHeader, { page, record: stats.record }));
    expect(html).toContain("Lions");
    expect(html).toContain("Model Town");
    expect(html).toContain("P 1 · W 1 · L 0 · T 0 · NR 0");
  });

  it("lists recent results with outcome pills linking to the match", () => {
    const html = render(createElement(RecentResults, { matches: page.matches, timeZone: "Asia/Karachi" }));
    expect(html).toContain('href="/m/mmmm2222"');
    expect(html).toContain("Won");
    expect(html).toContain("Lions won by 20 runs");
    expect(html).toContain('href="/m/mmmm3333"');
    expect(html).toContain("Live now");
    expect(html).toContain("Lions 30/1 (4)");
  });

  it("groups the leaderboards and links each name to the player page", () => {
    const html = render(createElement(Leaderboards, { stats, names, playerHref: (id: string) => `/t/abcd2345/p/${id}` }));
    for (const heading of ["Batting", "Bowling", "Fielding", "MVP", "Most runs", "Highest score", "Best figures", "Most catches"]) {
      expect(html).toContain(heading);
    }
    expect(html).toContain('href="/t/abcd2345/p/sq-ali"');
    expect(html).toContain("45*");
    expect(html).toContain("3/20");
  });

  it("shows a player's totals and match-by-match figures", () => {
    const hamza = stats.players.find((totals) => totals.playerId === HAMZA);
    if (hamza === undefined) throw new Error("missing totals");
    const totals = render(createElement(PlayerTotalsView, { totals: hamza }));
    expect(totals).toContain("3/20");
    expect(totals).toContain("Overs");

    const matches = render(createElement(PlayerMatches, { matches: page.matches, playerId: ALI, potm: stats.potm, timeZone: "Asia/Karachi" }));
    expect(matches).toContain("45* (30)");
    expect(matches).not.toContain("mmmm3333");
  });
});
