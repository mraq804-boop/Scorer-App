import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { headlineLabel } from "@/lib/i18n/team";
import type { MatchBrand } from "@/server/share/match";
import { PLAYER_POSTER_SIZE, PlayerPoster, posterBrand } from "@/server/share/player-poster";
import { PREVIEW_SIZE, PreviewImage } from "@/server/share/preview-image";
import { renderPng } from "@/server/share/render";
import { RESULT_POSTER_SIZE, ResultPoster } from "@/server/share/result-poster";
import { TestMatch } from "../../helpers/match";

const OUT = join(tmpdir(), "cricket-posters");
const PNG = [0x89, 0x50, 0x4e, 0x47];

async function png(name: string, element: ReactElement, size: { width: number; height: number }): Promise<Uint8Array> {
  const bytes = new Uint8Array(await (await renderPng(element, size, "no-store")).arrayBuffer());
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.png`), bytes);
  return bytes;
}

function finishedMatch(teams?: [string, string], openers?: [string, string]): TestMatch {
  const m = new TestMatch({ overs: 1, teams, openers });
  for (const runs of [4, 6, 1, 0, 2, 0]) m.ball({ runs, boundary: runs >= 4 });
  m.endInnings("overs");
  m.startInnings2(["Zain", "Faisal"], openers?.[1] ?? "Usman");
  for (const runs of [1, 0, 0, 0, 0, 0]) m.ball({ runs });
  m.endInnings("overs");
  return m;
}

describe("match posters", { timeout: 30_000 }, () => {
  it("posters render without any brand", async () => {
    const bytes = await png(
      "result-plain",
      createElement(ResultPoster, { state: finishedMatch().state, brand: null }),
      RESULT_POSTER_SIZE,
    );
    expect([...bytes.slice(0, 4)]).toEqual(PNG);
    expect(RESULT_POSTER_SIZE).toEqual({ width: 1080, height: 1350 });
  });

  it("posters render a 40-character Urdu name", async () => {
    const long = "لاہور قلندرز کرکٹ کلب گلبرگ لاہور پاکستان".slice(0, 40);
    const state = finishedMatch([long, "کراچی کنگز"], ["محمد عبدالقادر خان صاحب لاہور والے کھلاڑی", "عثمان"]).state;
    const bytes = await png("result-urdu", createElement(ResultPoster, { state, brand: null }), RESULT_POSTER_SIZE);
    expect([...bytes.slice(0, 4)]).toEqual(PNG);
  });

  it("the preview renders for a match in progress", async () => {
    const m = new TestMatch();
    m.ball({ runs: 4, boundary: true });
    const bytes = await png("preview-live", createElement(PreviewImage, { state: m.state, brand: null }), PREVIEW_SIZE);
    expect([...bytes.slice(0, 4)]).toEqual(PNG);
  });
});

describe("team preview", { timeout: 30_000 }, () => {
  it("the team preview renders with a logo and photos", async () => {
    const { aggregateTeamStats, parseTeamPage } = await import("@/lib/team");
    const { TeamPreviewImage } = await import("@/server/share/team-image");
    const page = parseTeamPage({
      team: {
        code: "abcd2345",
        name: "Lions",
        homeGround: "Model Town",
        timeZone: "Asia/Karachi",
        colour: "ocean",
        logoVersion: 1,
      },
      squad: [{ id: "sq-ali", name: "Ali", role: "batter", active: true, photoVersion: 1 }],
      seasons: [],
      fixtures: [],
      matches: [],
    });
    if (page === null) throw new Error("no page");
    const stats = aggregateTeamStats(page.matches, page.squad, { seasonId: null, seasons: [], timeZone: "Asia/Karachi" });
    const bytes = await png("team-preview", createElement(TeamPreviewImage, { page, stats, images: new Map() }), PREVIEW_SIZE);
    expect([...bytes.slice(0, 4)]).toEqual(PNG);
  });
});

describe("player poster", { timeout: 30_000 }, () => {
  const DOT = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  function teamBrand(overrides: Partial<NonNullable<MatchBrand>> = {}): NonNullable<MatchBrand> {
    return {
      side: "A",
      colour: "ocean",
      logoUrl: DOT,
      potmPlayerId: null,
      resultOverride: null,
      xi: ["p-Ali", "p-Usman"],
      photoUrlOf: () => null,
      ...overrides,
    };
  }

  it("the player poster renders with and without a photo", async () => {
    const state = finishedMatch().state;
    const withPhoto = await png(
      "player-photo",
      createElement(PlayerPoster, { state, brand: teamBrand({ photoUrlOf: () => DOT }), playerId: "p-Ali" }),
      PLAYER_POSTER_SIZE,
    );
    const initialsOnly = await png(
      "player-initials",
      createElement(PlayerPoster, { state, brand: teamBrand({ logoUrl: null }), playerId: "p-Usman" }),
      PLAYER_POSTER_SIZE,
    );
    expect([...withPhoto.slice(0, 4)]).toEqual(PNG);
    expect([...initialsOnly.slice(0, 4)]).toEqual(PNG);
    expect(PLAYER_POSTER_SIZE).toEqual({ width: 1080, height: 1350 });
  });

  it("the headline badge names the feat", () => {
    expect(headlineLabel("potm")).toBe("Player of the match");
    expect(headlineLabel("hundred")).toBe("Hundred");
    expect(headlineLabel("fifty")).toBe("Fifty");
    expect(headlineLabel("fiveWickets")).toBe("Five wickets");
    expect(headlineLabel("hatTrick")).toBe("Hat-trick");
    expect(headlineLabel("threeWickets")).toBe("Three wickets");
  });

  it("only squad players in the XI of a finished team match get a poster", () => {
    const done = finishedMatch().state;
    const live = new TestMatch().state;
    expect(posterBrand({ code: "abcd2345", state: done, brand: teamBrand() }, "p-Ali")).not.toBeNull();
    expect(posterBrand({ code: "abcd2345", state: done, brand: null }, "p-Ali")).toBeNull();
    expect(posterBrand({ code: "abcd2345", state: done, brand: teamBrand() }, "p-Zain")).toBeNull();
    expect(posterBrand({ code: "abcd2345", state: live, brand: teamBrand() }, "p-Ali")).toBeNull();
    expect(
      posterBrand({ code: "abcd2345", state: live, brand: teamBrand({ resultOverride: "no_result" }) }, "p-Ali"),
    ).not.toBeNull();
  });
});
