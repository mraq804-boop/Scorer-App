import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlayerHero, PlayerMatches, PlayerTotalsView } from "@/components/team-page/player-sections";
import { TeamHero } from "@/components/team-page/team-hero";
import { Leaderboards, Milestones, RecentResults } from "@/components/team-page/team-sections";
import { colourFor } from "@/lib/brand";
import { aggregateTeamStats, parseTeamPage } from "@/lib/team";
import type { PlayerMatchStats, PlayerTotals, TeamPageData } from "@/lib/team";

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
    const html = render(createElement(TeamHero, { page, record: stats.record, form: [] }));
    expect(html).toContain("Lions");
    expect(html).toContain("Model Town");
    expect(html).toMatch(/Played<\/dt><dd[^>]*><span>1<\/span>/);
    expect(html).toMatch(/Won<\/dt><dd[^>]*><span>1<\/span>/);
    expect(html).not.toContain("Tied");
  });

  it("adds a tied tile once the team has tied", () => {
    const html = render(
      createElement(TeamHero, { page, record: { played: 3, won: 1, lost: 1, tied: 1, noResult: 0 }, form: [] }),
    );
    expect(html).toMatch(/Tied<\/dt><dd[^>]*><span>1<\/span>/);
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
    for (const heading of [
      "Batting",
      "Bowling",
      "Fielding",
      "MVP",
      "Most runs",
      "Highest score",
      "Best figures",
      "Most catches",
    ]) {
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

    const matches = render(
      createElement(PlayerMatches, { matches: page.matches, playerId: ALI, potm: stats.potm, timeZone: "Asia/Karachi" }),
    );
    expect(matches).toContain("45* (30)");
    expect(matches).not.toContain("mmmm3333");
    expect(matches).toContain('href="/m/mmmm2222/poster/sq-ali"');
    expect(matches).toContain("Share poster");
  });
});

describe("loud team page", () => {
  const branded = { ...page, team: { ...page.team, colour: "ocean", logoVersion: 3 } };

  it("paints the hero in the team colour with the logo", () => {
    const html = render(createElement(TeamHero, { page: branded, record: stats.record, form: ["won", "won", "lost"] }));
    expect(html).toContain(colourFor("ocean", "Lions").base);
    expect(html).toContain("teams/abcd2345/logo-3.jpg");
    expect(html).toContain('alt="Lions logo"');
  });

  it("falls back to initials without a logo", () => {
    const html = render(createElement(TeamHero, { page, record: stats.record, form: [] }));
    expect(html).not.toContain("<img");
    expect(html).toContain(">L<");
  });

  it("shows the form strip newest first", () => {
    const html = render(createElement(TeamHero, { page, record: stats.record, form: ["won", "won", "lost"] }));
    const strip = html.slice(html.indexOf('data-testid="form-strip"'));
    const letters = [...strip.slice(0, strip.indexOf("</ol>")).matchAll(/aria-hidden="true">(W|L|T|NR)</g)].map(
      (match) => match[1],
    );
    expect(letters).toEqual(["W", "W", "L"]);
  });

  it("shows the record numbers in full before any effect runs", () => {
    const html = render(
      createElement(TeamHero, { page, record: { played: 12, won: 7, lost: 4, tied: 0, noResult: 1 }, form: [] }),
    );
    expect(html).toContain(">12<");
    expect(html).toContain(">7<");
  });

  it("crowns each board's leader with a photo", () => {
    const html = render(
      createElement(Leaderboards, {
        stats,
        names,
        playerHref: (id: string) => `/t/abcd2345/p/${id}`,
        colour: colourFor("ocean", "Lions"),
        photoOf: (id: string) => (id === ALI ? "https://x.test/ali.jpg" : null),
      }),
    );
    expect(html).toContain("data-leader");
    expect(html).toContain("https://x.test/ali.jpg");
  });

  it("shows a player's milestone badges", () => {
    const totals = { ...(stats.players.find((p) => p.playerId === ALI) as PlayerTotals), fifties: 2, hatTricks: 1 };
    const html = render(
      createElement(PlayerHero, { player: page.squad[0], totals, colour: colourFor("ocean", "Lions"), photoUrl: null }),
    );
    expect(html).toContain("2 fifties");
    expect(html).toContain("1 hat-trick");
    expect(html).toContain("Ali");
  });

  it("counts three-fors apart from five-fors", () => {
    const totals = { ...(stats.players.find((p) => p.playerId === HAMZA) as PlayerTotals), threeFors: 3, fiveFors: 1 };
    const html = render(
      createElement(PlayerHero, { player: page.squad[1], totals, colour: colourFor("ocean", "Lions"), photoUrl: null }),
    );
    expect(html).toContain("2 three-fors");
    expect(html).toContain("1 five-for");
  });

  it("lists each player's milestones as badge chips linking to the player", () => {
    const html = render(
      createElement(Milestones, {
        stats,
        names,
        playerHref: (id: string) => `/t/abcd2345/p/${id}`,
        colour: colourFor("ocean", "Lions"),
        photoOf: () => null,
      }),
    );
    expect(html).toContain("Milestones");
    expect(html).toContain("1 three-for");
    expect(html).toContain('href="/t/abcd2345/p/sq-hamza"');
  });

  it("shows no milestones section before anyone has one", () => {
    const empty = aggregateTeamStats([], page.squad, { seasonId: null, seasons: [], timeZone: "Asia/Karachi" });
    const html = render(
      createElement(Milestones, { stats: empty, names, playerHref: () => "#", colour: colourFor("ocean", "Lions"), photoOf: () => null }),
    );
    expect(html).toBe("");
  });
});
