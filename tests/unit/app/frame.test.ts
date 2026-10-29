import { describe, expect, it } from "vitest";
import { goesBack, readTeamCodes, showsTabBar, statsHref, tabForPath } from "@/lib/app/frame";

describe("app frame", () => {
  it("maps each path to its tab", () => {
    const paths = ["/", "/team", "/team/join", "/account", "/t/abcd2345", "/t/abcd2345/p/x", "/m/abcd2345", "/new"];
    expect(paths.map(tabForPath)).toEqual(["home", "team", null, "account", "stats", "stats", null, null]);
  });

  it("hides the tab bar on setup, scoring, joining, sign-in and offline", () => {
    for (const path of ["/new", "/score", "/team/join", "/auth/callback", "/offline"]) expect(showsTabBar(path)).toBe(false);
    for (const path of ["/", "/team", "/account", "/m/abcd2345", "/t/abcd2345"]) expect(showsTabBar(path)).toBe(true);
  });

  it("sends Stats to your team, then the last team viewed, then My team", () => {
    expect(statsHref({ myTeam: "aaaa2222", lastTeam: "bbbb3333" })).toBe("/t/aaaa2222");
    expect(statsHref({ myTeam: null, lastTeam: "bbbb3333" })).toBe("/t/bbbb3333");
    expect(statsHref({ myTeam: null, lastTeam: null })).toBe("/team");
  });

  it("goes back only when the previous page was this app", () => {
    const origin = "https://scorer.test";
    expect(goesBack("https://scorer.test/team", origin, 3)).toBe(true);
    expect(goesBack("https://wa.me/", origin, 3)).toBe(false);
    expect(goesBack("", origin, 3)).toBe(false);
    expect(goesBack("https://scorer.test/team", origin, 1)).toBe(false);
    expect(goesBack("not a url", origin, 3)).toBe(false);
  });

  it("reads nothing when storage throws", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readTeamCodes(blocked)).toEqual({ myTeam: null, lastTeam: null });
    expect(readTeamCodes(null)).toEqual({ myTeam: null, lastTeam: null });
  });
});
