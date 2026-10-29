import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { burstFor } from "@/components/live/burst";
import { LiveHero } from "@/components/live/live-hero";
import { colourFor } from "@/lib/brand";
import type { CommentaryItem } from "@/lib/scoring";
import type { LiveTeam } from "@/server/live";
import { TestMatch } from "../../helpers/match";

const TEAM: LiveTeam = {
  code: "abcd2345",
  name: "Lions",
  colour: "ocean",
  logoVersion: 2,
  side: "A",
  potmPlayerId: null,
  resultOverride: null,
  xi: ["p-Ali", "p-Usman"],
  photos: { "p-Ali": 4 },
};

function inProgress(): TestMatch {
  const m = new TestMatch();
  m.ball({ runs: 4, boundary: true });
  return m;
}

const render = (team: LiveTeam | null, m = inProgress()) =>
  renderToStaticMarkup(createElement(LiveHero, { state: m.state, team }));

describe("LiveHero", () => {
  it("paints our side in the team colour with its logo", () => {
    const html = render(TEAM);
    expect(html).toContain(colourFor("ocean", "Lions").base);
    expect(html).toContain("teams/abcd2345/logo-2.jpg");
    expect(html).toContain(colourFor(null, "Tigers").base);
  });

  it("falls back to hashed colours and initials for a plain match", () => {
    const html = render(null);
    expect(html).toContain(colourFor(null, "Lions").base);
    expect(html).toContain(colourFor(null, "Tigers").base);
    expect(html).not.toContain("<img");
  });

  it("shows the batters at the crease with a photo for a squad batter", () => {
    const html = render(TEAM);
    const crease = html.slice(html.indexOf('data-testid="crease"'));
    expect(crease).toContain("teams/abcd2345/players/p-Ali-4.jpg");
    expect(crease).toContain("Usman");
    expect(crease).toContain(">U<");
  });

  it("shows the live badge and both scores while the match is on", () => {
    const html = render(TEAM);
    expect(html).toContain("LIVE");
    expect(html).toContain("4/0");
    expect(html).toContain("Yet to bat");
  });

  it("shows No result when the owner marked the match so", () => {
    const html = render({ ...TEAM, resultOverride: "no_result" });
    expect(html).toContain("No result");
    expect(html).not.toContain("LIVE");
  });
});

function item(overrides: Partial<CommentaryItem>): CommentaryItem {
  return {
    eventId: "e1",
    ballLabel: "0.1",
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

describe("burstFor", () => {
  const dot = item({ eventId: "e1" });

  it("stays quiet on the first render and for the same ball", () => {
    expect(burstFor(undefined, item({ eventId: "e2", runs: 6, boundary: true }))).toBeNull();
    const four = item({ eventId: "e2", runs: 4, boundary: true });
    expect(burstFor(four, four)).toBeNull();
    expect(burstFor(dot, undefined)).toBeNull();
  });

  it("celebrates a four, a six and a wicket", () => {
    expect(burstFor(dot, item({ eventId: "e2", runs: 4, boundary: true }))).toBe("four");
    expect(burstFor(dot, item({ eventId: "e2", runs: 6, boundary: true }))).toBe("six");
    expect(
      burstFor(dot, item({ eventId: "e2", wicket: { kind: "bowled", playerOut: "p-Ali", fielderName: null } })),
    ).toBe("wicket");
  });

  it("stays quiet for runs that are not boundaries", () => {
    expect(burstFor(dot, item({ eventId: "e2", runs: 4 }))).toBeNull();
    expect(burstFor(dot, item({ eventId: "e2", runs: 1 }))).toBeNull();
  });
});

describe("LiveHero in the app frame", () => {
  it("the hero leaves the title to the top bar", () => {
    const m = new TestMatch();
    m.ball({ runs: 4, boundary: true });
    const html = renderToStaticMarkup(createElement(LiveHero, { state: m.state, team: null }));
    expect(html).not.toContain("<h1");
    expect(html).toContain("LIVE");
  });
});
