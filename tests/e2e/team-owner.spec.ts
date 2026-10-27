import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { CachedTeam } from "@/lib/local/db";
import type { SquadPlayer } from "@/lib/team";
import { TEAM_ID, fakeAccount, openNewMatch, team, waitForSession } from "./support/team";

const WINTER = { id: "44444444-4444-4444-8444-444444444444", name: "Winter 2026", startsOn: "2026-11-01", endsOn: "2027-02-28" };

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
  await expect(page.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/");
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

  await expect(page.getByRole("link", { name: /Your team/ })).toHaveAttribute("href", "/team");
});

test("an owner sees the squad, seasons and the public team link", async ({ page }) => {
  await signIn(page, team({ seasons: [WINTER] }));
  await page.goto("/team");

  await expect(page.getByRole("heading", { name: "Lions" })).toBeVisible();
  await expect(page.getByTestId("team-link")).toHaveText("http://localhost:3200/t/abcd2345");
  const whatsapp = await page.getByRole("link", { name: "Share on WhatsApp" }).getAttribute("href");
  expect(decodeURIComponent(whatsapp ?? "")).toContain("http://localhost:3200/t/abcd2345");
  const squad = page.getByRole("region", { name: "Squad" });
  await expect(squad.getByRole("listitem")).toHaveCount(5);
  await expect(squad.getByRole("listitem").filter({ hasText: "Raza" })).toContainText("Inactive");
  await expect(squad.getByRole("button", { name: "Edit Raza" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Seasons" })).toContainText("Winter 2026");
});

test("an owner adds a player and the team is fetched again", async ({ page }) => {
  const calls = await signIn(page, team());
  await page.goto("/team");
  const squad = page.getByRole("region", { name: "Squad" });
  await expect(squad.getByRole("listitem")).toHaveCount(5);
  calls.myTeam = 0;

  const upsert = page.waitForRequest((request) => request.url().endsWith("/rpc/upsert_squad_players"));
  await squad.getByLabel("New player's name").fill("  Zain ");
  await squad.getByLabel("Role").selectOption("Wicketkeeper");
  await squad.getByRole("button", { name: "Add player" }).click();

  const body = (await upsert).postDataJSON() as { p_team: string; p_players: SquadPlayer[] };
  expect(body.p_team).toBe(TEAM_ID);
  expect(body.p_players).toEqual([{ id: expect.any(String), name: "Zain", role: "keeper", active: true }]);
  await expect.poll(() => calls.myTeam).toBe(1);
  await expect(squad.getByLabel("New player's name")).toHaveValue("");
});

test("an owner can't add a season that ends before it starts", async ({ page }) => {
  const seasonCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/rpc/upsert_season")) seasonCalls.push(request.url());
  });
  await signIn(page, team());
  await page.goto("/team");
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
