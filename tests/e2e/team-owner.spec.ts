import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { CachedTeam } from "@/lib/local/db";
import type { SquadPlayer } from "@/lib/team";
import { CORS, fulfillJson } from "./support/fake-sync";
import { matchCode, startMatch } from "./support/scoring";
import { ALI, FIXTURE, HAMZA, TEAM_ID, fakeAccount, openNewMatch, readStore, team, waitForSession } from "./support/team";

const WINTER = { id: "44444444-4444-4444-8444-444444444444", name: "Winter 2026", startsOn: "2026-11-01", endsOn: "2027-02-28" };

async function stubRpc(page: Page, name: string, body: unknown) {
  const calls: unknown[] = [];
  await page.route(`**/rest/v1/rpc/${name}`, (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    calls.push(route.request().postDataJSON());
    return fulfillJson(route, body);
  });
  return calls;
}

const fielding = { catches: 0, runOuts: 0, stumpings: 0 };

const teamPage = {
  team: { code: "abcd2345", name: "Lions", homeGround: null, timeZone: "Asia/Karachi" },
  squad: team().squad,
  seasons: [],
  fixtures: [],
  matches: [
    {
      code: "mmmm2222",
      title: "Lions vs Kites",
      status: "complete",
      summary: { lines: [], result: "Lions won by 20 runs" },
      resultOverride: null,
      potmPlayerId: null,
      record: {
        version: 1,
        side: "A",
        opponent: "Kites",
        playedAt: "2026-11-01T10:00:00.000Z",
        xi: [ALI, HAMZA],
        outcome: "won",
        players: [
          { playerId: ALI, batting: { runs: 45, balls: 30, fours: 4, sixes: 1, notOut: false }, bowling: null, fielding },
          { playerId: HAMZA, batting: null, bowling: { legalBalls: 24, runs: 20, wickets: 3, maidens: 0, dots: 10 }, fielding },
        ],
      },
    },
  ],
};

async function signIn(page: Page, server: CachedTeam | null) {
  const calls = await fakeAccount(page, "google", server);
  await openNewMatch(page);
  await waitForSession(page);
  return calls;
}

test("guests see the Google prompt and no guest session starts", async ({ page }) => {
  const signups: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/auth/v1/signup")) signups.push(request.url());
  });

  await page.goto("/team");

  await expect(
    page.getByRole("heading", {
      name: "Sign in with Google to create your team",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeEnabled();
  await expect(page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "My team" })).toHaveAttribute("aria-current", "page");
  await page.waitForTimeout(500);
  expect(signups).toEqual([]);
});

test("the sign-in button brings the guest back to the team page", async ({ page, baseURL }) => {
  const authorize = page.waitForRequest((request) => request.url().includes("/auth/v1/authorize"));
  await page.route("**/auth/v1/authorize*", (route) => route.fulfill({ contentType: "text/html", body: "<title>stub</title>" }));
  await page.goto("/team");

  await page.getByRole("button", { name: "Sign in with Google" }).click();

  const url = new URL((await authorize).url());
  expect(url.searchParams.get("provider")).toBe("google");
  expect(url.searchParams.get("redirect_to")).toBe(`${baseURL}/auth/callback?next=/team`);
});

test("the team page does not install the service worker", async ({ page }) => {
  await page.goto("/team");
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  await page.waitForTimeout(1500);

  const registrations = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
  expect(registrations).toBe(0);
});

test("home links to the team page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "My team" })).toHaveAttribute("href", "/team");
});

test("an owner sees the squad, seasons and the public team link", async ({ page }) => {
  await signIn(page, team({ seasons: [WINTER] }));
  await page.goto("/team");

  await expect(page.getByRole("heading", { name: "Lions" })).toBeVisible();
  const squad = page.getByRole("region", { name: "Squad" });
  await expect(squad.getByRole("listitem")).toHaveCount(5);
  await expect(squad.getByRole("listitem").filter({ hasText: "Raza" })).toContainText("Inactive");
  await expect(squad.getByRole("button", { name: "Edit Raza" })).toBeVisible();

  await page.getByRole("tab", { name: "Settings" }).click();
  await expect(page.getByTestId("team-link")).toHaveText("http://localhost:3200/t/abcd2345");
  const whatsapp = await page.getByRole("link", { name: "Share on WhatsApp" }).getAttribute("href");
  expect(decodeURIComponent(whatsapp ?? "")).toContain("http://localhost:3200/t/abcd2345");
  await expect(page.getByRole("region", { name: "Seasons" })).toContainText("Winter 2026");
});

test("an owner adds a player and the team is fetched again", async ({ page }) => {
  const calls = await signIn(page, team());
  await page.goto("/team");
  const squad = page.getByRole("region", { name: "Squad" });
  await expect(squad.getByRole("listitem")).toHaveCount(5);
  await expect.poll(() => calls.myTeam).toBeGreaterThan(0);
  calls.myTeam = 0;

  const upsert = page.waitForRequest((request) => request.url().endsWith("/rpc/upsert_squad_players"));
  await squad.getByRole("button", { name: "Add player" }).click();
  const sheet = page.getByRole("dialog", { name: "Add player" });
  await sheet.getByLabel("New player's name").fill("  Zain ");
  await sheet.getByLabel("Role").selectOption("Wicketkeeper");
  await sheet.getByRole("button", { name: "Add player" }).click();

  const body = (await upsert).postDataJSON() as { p_team: string; p_players: SquadPlayer[] };
  expect(body.p_team).toBe(TEAM_ID);
  expect(body.p_players).toEqual([{ id: expect.any(String), name: "Zain", role: "keeper", active: true }]);
  await expect.poll(() => calls.myTeam).toBe(1);
  await expect(sheet).toHaveCount(0);
});

test("editing a player opens a sheet with their details", async ({ page }) => {
  await signIn(page, team());
  await page.goto("/team");
  await page.getByRole("region", { name: "Squad" }).getByRole("button", { name: "Edit Raza" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit player" });
  await expect(sheet.getByLabel("Player name")).toHaveValue("Raza");
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
});

test("an owner can't add a season that ends before it starts", async ({ page }) => {
  const seasonCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/rpc/upsert_season")) seasonCalls.push(request.url());
  });
  await signIn(page, team());
  await page.goto("/team?section=settings");
  const seasons = page.getByRole("region", { name: "Seasons" });

  await seasons.getByLabel("Season name").fill("Winter 2026");
  await seasons.getByLabel("Starts").fill("2026-11-01");
  await seasons.getByLabel("Ends").fill("2026-10-01");
  await seasons.getByRole("button", { name: "Add season" }).click();

  await expect(seasons.getByText("The end date can't be before the start date")).toBeVisible();
  expect(seasonCalls).toEqual([]);
});

test("a scorer sees the squad without editing and can add a player", async ({ page }) => {
  await signIn(page, team({ role: "scorer" }));
  await page.goto("/team");

  await expect(page.getByText("You score for this team")).toBeVisible();
  await expect(page.getByRole("region", { name: "Squad" }).getByRole("listitem")).toHaveCount(5);
  await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add player" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Seasons" })).toHaveCount(0);
  await expect(page.getByTestId("team-link")).toHaveCount(0);
});

test("a signed-in owner without a team gets the create form", async ({ page }) => {
  await signIn(page, null);
  await page.goto("/team");

  await expect(page.getByRole("heading", { name: "Create your team" })).toBeVisible();
  await expect(page.getByLabel("Time zone")).toHaveValue("Asia/Karachi");
  const create = page.waitForRequest((request) => request.url().endsWith("/rpc/create_team"));
  await page.getByLabel("Team name").fill(" Lions ");
  await page.getByRole("button", { name: "Create team" }).click();

  expect((await create).postDataJSON()).toEqual({ p_name: "Lions", p_home_ground: null, p_time_zone: "Asia/Karachi" });
});

test("fixtures show the team's local time and link to starting the match", async ({ page }) => {
  await signIn(page, team());
  await page.goto("/team?section=fixtures");
  const fixtures = page.getByRole("region", { name: "Fixtures" });

  await expect(fixtures.getByRole("listitem")).toContainText("vs Kites");
  await expect(fixtures.getByRole("listitem")).toContainText(/2:30|14:30/);
  await expect(fixtures.getByRole("link", { name: "Start match" })).toHaveAttribute("href", `/new?fixture=${FIXTURE.id}`);
  await expect(fixtures.getByRole("button", { name: "Edit the fixture against Kites" })).toBeVisible();
});

test("an owner adds a fixture in the team's time zone", async ({ page }) => {
  await signIn(page, team({ fixtures: [] }));
  const saved = await stubRpc(page, "upsert_fixture", FIXTURE.id);
  await page.goto("/team?section=fixtures");
  const fixtures = page.getByRole("region", { name: "Fixtures" });

  await fixtures.getByRole("button", { name: "Add fixture" }).click();
  const sheet = page.getByRole("dialog", { name: "Add fixture" });
  await sheet.getByLabel("Date").fill("2026-11-08");
  await sheet.getByLabel("Time").fill("14:30");
  await sheet.getByLabel("Opponent").fill(" Hawks ");
  await sheet.getByLabel("Overs (optional)").fill("20");
  await sheet.getByRole("button", { name: "Add fixture" }).click();

  await expect.poll(() => saved.length).toBe(1);
  await expect(sheet).toHaveCount(0);
  expect(saved[0]).toEqual({
    p_fixture: {
      id: expect.any(String),
      startsAt: "2026-11-08T09:30:00.000Z",
      opponent: "Hawks",
      ground: null,
      homeAway: null,
      overs: 20,
      notes: null,
      status: "scheduled",
    },
  });
});

test("a scorer can start a fixture but not edit it, and sees no owner sections", async ({ page }) => {
  await signIn(page, team({ role: "scorer" }));
  await page.goto("/team?section=fixtures");
  const fixtures = page.getByRole("region", { name: "Fixtures" });

  await expect(fixtures.getByRole("link", { name: "Start match" })).toBeVisible();
  await expect(fixtures.getByRole("button", { name: /^Edit / })).toHaveCount(0);
  await expect(fixtures.getByRole("button", { name: "Add fixture" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Results" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Scorers" })).toHaveCount(0);
});

test("results suggest a Player of the match and save an override and No result", async ({ page }) => {
  await signIn(page, team());
  await stubRpc(page, "get_team_page", teamPage);
  const potm = await stubRpc(page, "set_potm", null);
  const noResult = await stubRpc(page, "set_result_override", null);
  await page.goto("/team?section=results");
  const results = page.getByRole("region", { name: "Results" });

  await expect(results.getByRole("listitem")).toContainText("Lions won by 20 runs");
  const select = results.getByLabel("Player of the match");
  await expect(select.locator("option:checked")).toHaveText("Suggested: Hamza");
  await select.selectOption("Ali");
  await expect.poll(() => potm).toEqual([{ p_code: "mmmm2222", p_player: ALI }]);

  await results.getByRole("switch", { name: "No result" }).click();
  await expect.poll(() => noResult).toEqual([{ p_code: "mmmm2222", p_no_result: true }]);
});

test("the owner deletes a match from Results, and it leaves this phone too", async ({ page }) => {
  const matchId = await startMatch(page, { names: { teamA: "Lions", teamB: "Kites" } });
  const code = await matchCode(page, matchId);
  const account = await signIn(page, team());
  const deleted = await stubRpc(page, "delete_match", null);
  await page.route("**/rest/v1/rpc/get_team_page", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    return fulfillJson(route, { ...teamPage, matches: deleted.length === 0 ? [{ ...teamPage.matches[0], code }] : [] });
  });
  await page.goto("/team?section=results");
  const results = page.getByRole("region", { name: "Results" });
  await expect(results.getByRole("listitem")).toContainText("Lions won by 20 runs");
  const teamLoads = account.myTeam;
  let release = () => {};
  const teamRefresh = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/rest/v1/rpc/get_my_team", async (route) => {
    await teamRefresh;
    return route.fallback();
  });

  await results.getByRole("button", { name: "Delete Lions vs Kites" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Delete Lions vs Kites?");
  await expect(dialog).toContainText("This can't be undone.");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();

  await expect.poll(() => deleted).toEqual([{ p_code: code }]);
  await expect(dialog).toHaveCount(0);
  await expect(results.getByRole("heading", { name: "Results" })).toBeFocused();
  await expect(page.getByText("Match deleted")).toBeVisible();
  await expect(results.getByRole("listitem")).toHaveCount(0);
  await expect(results).toContainText("Team matches you score show up here.");
  expect(await readStore(page, "matches")).toEqual([]);
  expect(await readStore(page, "events")).toEqual([]);
  release();
  await expect.poll(() => account.myTeam).toBeGreaterThan(teamLoads);

  await page.goto("/");
  await expect(page.getByText("Score your first match")).toBeVisible();
});

test("a failed delete keeps the match here and on this phone, and says why", async ({ page }) => {
  const matchId = await startMatch(page, { names: { teamA: "Lions", teamB: "Kites" } });
  const code = await matchCode(page, matchId);
  await signIn(page, team());
  await stubRpc(page, "get_team_page", { ...teamPage, matches: [{ ...teamPage.matches[0], code }] });
  await page.route("**/rest/v1/rpc/delete_match", (route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 204, headers: CORS })
      : route.fulfill({ status: 400, headers: CORS, contentType: "application/json", body: JSON.stringify({ code: "P0001", message: "not_team_owner" }) }),
  );
  await page.goto("/team?section=results");
  const results = page.getByRole("region", { name: "Results" });

  await results.getByRole("button", { name: "Delete Lions vs Kites" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(dialog.getByRole("alert")).toHaveText("Only the team owner can change this.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(results.getByRole("button", { name: "Delete Lions vs Kites" })).toBeFocused();
  await expect(results.getByRole("listitem")).toContainText("Lions won by 20 runs");
  expect((await readStore<{ code: string }>(page, "matches")).map((match) => match.code)).toEqual([code]);
  expect((await readStore(page, "events")).length).toBeGreaterThan(0);
});

test("a deleted match leaves Results even when the list can't refresh", async ({ page }) => {
  await signIn(page, team());
  const deleted = await stubRpc(page, "delete_match", null);
  await page.route("**/rest/v1/rpc/get_team_page", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (deleted.length === 0) return fulfillJson(route, teamPage);
    return route.fulfill({ status: 503, headers: CORS, contentType: "application/json", body: JSON.stringify({ message: "unavailable" }) });
  });
  await page.goto("/team?section=results");
  const results = page.getByRole("region", { name: "Results" });
  await expect(results.getByRole("listitem")).toContainText("Lions won by 20 runs");

  await results.getByRole("button", { name: "Delete Lions vs Kites" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page.getByText("Match deleted")).toBeVisible();
  await expect(results.getByRole("listitem")).toHaveCount(0);
});

test("an owner creates a scorer invite to share on WhatsApp", async ({ page }) => {
  await signIn(page, team());
  await stubRpc(page, "create_scorer_invite", "tok-abc");
  await page.goto("/team?section=settings");
  const scorers = page.getByRole("region", { name: "Scorers" });
  await expect(scorers).toContainText("No scorers yet.");

  await scorers.getByRole("button", { name: "Invite a scorer" }).click();

  await expect(scorers.getByTestId("invite-link")).toHaveText("http://localhost:3200/team/join?token=tok-abc");
  const whatsapp = await scorers.getByRole("link", { name: "Share on WhatsApp" }).getAttribute("href");
  expect(decodeURIComponent(whatsapp ?? "")).toContain("Join Lions as a scorer: http://localhost:3200/team/join?token=tok-abc");
});

test("the owner sees each scorer's name and removes the right one", async ({ page }) => {
  await signIn(page, team());
  const { id, code, name, homeGround, timeZone, role, squad, seasons, fixtures } = team();
  const bilal = { userId: "u-bilal", name: "Bilal Ahmed", addedAt: "2026-10-27T08:00:00.000Z" };
  const nameless = { userId: "u-nameless", name: null, addedAt: "2026-10-28T08:00:00.000Z" };
  const removed = await stubRpc(page, "remove_scorer", null);
  await page.route("**/rest/v1/rpc/get_my_team", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    return fulfillJson(route, {
      role,
      team: { id, code, name, homeGround, timeZone },
      squad,
      seasons,
      fixtures,
      scorers: removed.length === 0 ? [bilal, nameless] : [nameless],
    });
  });
  await page.goto("/team?section=settings");
  const scorers = page.getByRole("region", { name: "Scorers" });

  await expect(scorers.getByRole("listitem")).toHaveCount(2);
  await expect(scorers.getByRole("listitem").first()).toContainText("Bilal Ahmed");
  await expect(scorers.getByRole("listitem").nth(1)).toContainText("Scorer");
  await scorers.getByRole("button", { name: /^Remove Bilal Ahmed/ }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Remove Bilal Ahmed?");
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();

  await expect.poll(() => removed).toEqual([{ p_user: "u-bilal" }]);
  await expect(scorers.getByRole("listitem")).toHaveCount(1);
  await expect(scorers.getByRole("heading", { name: "Scorers" })).toBeFocused();
});

test("the owner edits the team's name, home ground and time zone", async ({ page }) => {
  const calls = await signIn(page, team());
  const saved = await stubRpc(page, "update_team", null);
  await page.goto("/team?section=settings");
  await expect(page.getByRole("heading", { name: "Lions" }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Scorers" })).toContainText("No scorers yet.");
  calls.myTeam = 0;

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Team name")).toHaveValue("Lions");
  await expect(page.getByLabel("Time zone")).toHaveValue("Asia/Karachi");
  await page.getByLabel("Team name").fill(" Lions CC ");
  await page.getByLabel("Home ground (optional)").fill("");
  await page.getByLabel("Time zone").selectOption("Asia/Dubai");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect.poll(() => saved).toEqual([{ p_name: "Lions CC", p_home_ground: null, p_time_zone: "Asia/Dubai" }]);
  await expect.poll(() => calls.myTeam).toBe(1);
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
});

test("a scorer can't edit the team", async ({ page }) => {
  await signIn(page, team({ role: "scorer" }));
  await page.goto("/team");

  await expect(page.getByText("You score for this team")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
});

test("an edit sheet keeps its title while it closes", async ({ page }) => {
  await signIn(page, team());
  await page.goto("/team");
  await page.getByRole("region", { name: "Squad" }).getByRole("button", { name: "Edit Raza" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit player" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  const titleWhileClosing = await page.evaluate(() => document.querySelector('[data-slot="drawer-title"]')?.textContent ?? null);
  expect(titleWhileClosing).not.toBe("Add player");
  await expect(sheet).toHaveCount(0);
});

test("tapping outside a half-filled sheet keeps it and what was typed", async ({ page }) => {
  await signIn(page, team({ fixtures: [] }));
  await page.goto("/team?section=fixtures");
  await page.getByRole("region", { name: "Fixtures" }).getByRole("button", { name: "Add fixture" }).click();
  const sheet = page.getByRole("dialog", { name: "Add fixture" });
  await sheet.getByLabel("Opponent").fill("Hawks");
  await page.mouse.click(20, 20);
  await page.waitForTimeout(600);
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("Opponent")).toHaveValue("Hawks");
});

test("a scorer can't open the owner's Settings or Results", async ({ page }) => {
  await signIn(page, team({ role: "scorer" }));
  for (const section of ["settings", "results"]) {
    await page.goto(`/team?section=${section}`);
    await expect(page.getByRole("region", { name: "Squad" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Settings" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Results" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Seasons" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Scorers" })).toHaveCount(0);
  }
});
