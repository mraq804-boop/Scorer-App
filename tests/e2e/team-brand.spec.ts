import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { CachedTeam } from "@/lib/local/db";
import { CORS, TINY_PNG, fulfillJson } from "./support/fake-sync";
import { ALI, fakeAccount, openNewMatch, team, waitForSession } from "./support/team";

type Storage = { uploads: string[]; removed: string[] };

async function signIn(page: Page, server: CachedTeam) {
  await fakeAccount(page, "google", server);
  await openNewMatch(page);
  await waitForSession(page);
}

async function stubStorage(page: Page): Promise<Storage> {
  const storage: Storage = { uploads: [], removed: [] };
  await page.route("**/storage/v1/object/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (request.method() === "GET") return route.fulfill({ body: TINY_PNG, contentType: "image/png", headers: CORS });
    if (request.method() === "DELETE") {
      storage.removed.push(...((request.postDataJSON() as { prefixes: string[] }).prefixes ?? []));
      return fulfillJson(route, []);
    }
    storage.uploads.push(new URL(request.url()).pathname.replace("/storage/v1/object/team-media/", ""));
    return fulfillJson(route, { Key: "team-media/x", Id: "1" });
  });
  return storage;
}

async function stubRpc(page: Page, name: string, status = 200) {
  const calls: unknown[] = [];
  await page.route(`**/rest/v1/rpc/${name}`, (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    calls.push(route.request().postDataJSON());
    if (status === 200) return fulfillJson(route, null);
    return route.fulfill({ status, contentType: "application/json", headers: CORS, body: JSON.stringify({ message: "boom" }) });
  });
  return calls;
}

const picture = { name: "logo.png", mimeType: "image/png", buffer: TINY_PNG };
const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);
const VERSION = Math.floor((NOW - Date.UTC(2026, 0, 1)) / 1000);

test("an owner picks a colour and uploads a logo", async ({ page }) => {
  await signIn(page, team());
  const storage = await stubStorage(page);
  const colours = await stubRpc(page, "set_team_colour");
  const logos = await stubRpc(page, "set_team_logo");
  await page.clock.setFixedTime(NOW);
  await page.goto("/team");
  const look = page.getByRole("region", { name: "Team look" });

  await look.getByRole("radio", { name: "Ocean" }).click();
  await expect.poll(() => colours).toEqual([{ p_colour: "ocean" }]);

  await look.getByLabel("Upload logo").setInputFiles(picture);
  await expect.poll(() => logos).toEqual([{ p_version: VERSION }]);
  expect(storage.uploads).toEqual([`teams/abcd2345/logo-${VERSION}.jpg`]);
});

test("an owner adds a player photo", async ({ page }) => {
  await signIn(page, team());
  const storage = await stubStorage(page);
  const photos = await stubRpc(page, "set_player_photo");
  await page.clock.setFixedTime(NOW);
  await page.goto("/team");

  await page.getByRole("region", { name: "Squad" }).getByLabel("Add a photo of Ali").setInputFiles(picture);

  await expect.poll(() => photos).toEqual([{ p_player: ALI, p_version: VERSION }]);
  expect(storage.uploads).toEqual([`teams/abcd2345/players/${ALI}-${VERSION}.jpg`]);
});

test("a failed save keeps the old logo", async ({ page }) => {
  await signIn(page, team({ logoVersion: 2 }));
  const storage = await stubStorage(page);
  await stubRpc(page, "set_team_logo", 500);
  await page.clock.setFixedTime(NOW);
  await page.goto("/team");
  const look = page.getByRole("region", { name: "Team look" });
  await expect(look.getByRole("img", { name: "Lions logo" })).toHaveAttribute("src", /\/teams\/abcd2345\/logo-2\.jpg$/);

  await look.getByLabel("Change logo").setInputFiles(picture);

  await expect(look.getByRole("alert")).toBeVisible();
  expect(storage.uploads).toEqual([`teams/abcd2345/logo-${VERSION}.jpg`]);
  expect(storage.removed).toEqual([]);
  await expect(look.getByRole("img", { name: "Lions logo" })).toHaveAttribute("src", /\/teams\/abcd2345\/logo-2\.jpg$/);
});

test("a scorer sees no brand controls", async ({ page }) => {
  await signIn(page, team({ role: "scorer" }));
  await page.goto("/team");

  await expect(page.getByText("You score for this team")).toBeVisible();
  await expect(page.getByRole("region", { name: "Team look" })).toHaveCount(0);
  await expect(page.getByLabel(/^Add a photo of/)).toHaveCount(0);
});

test("a photo that won't load shows the player's initials instead of a broken image", async ({ page }) => {
  const base = team();
  await signIn(page, team({ squad: base.squad.map((player) => (player.id === ALI ? { ...player, photoVersion: 5 } : player)) }));
  await page.route("**/storage/v1/object/public/**", (route) => route.fulfill({ status: 404, headers: CORS, body: "" }));
  await page.goto("/team");
  const squad = page.getByRole("region", { name: "Squad" });

  await expect(squad.getByLabel("Change the photo of Ali")).toBeAttached();
  await expect(squad.locator(`img[src*="players/${ALI}-5.jpg"]`)).toHaveCount(0);
  await expect(squad.getByText("A", { exact: true })).toBeVisible();
});
