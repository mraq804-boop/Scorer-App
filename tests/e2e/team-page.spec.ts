import { expect, test } from "@playwright/test";
import { forbiddenIn } from "./support/bundle";

test("a malformed team code is a 404 without a database", async ({ page, request }) => {
  expect((await page.goto("/t/not-a-code"))?.status()).toBe(404);
  expect((await page.goto("/t/not-a-code/p/not-a-player"))?.status()).toBe(404);
  expect((await request.get("/t/not-a-code/opengraph-image")).status()).toBe(404);
});

test("a player poster for a malformed match code is a 404 without a database", async ({ request }) => {
  expect((await request.get("/m/not-a-code/poster/x")).status()).toBe(404);
});

for (const route of ["t/[code]", "t/[code]/p/[playerId]"]) {
  test(`the public page ${route} ships no scoring, storage or sign-in code`, () => {
    const found = forbiddenIn(route);
    expect(found.size).toBeGreaterThan(0);
    expect(found.modules).toEqual([]);
    expect(found.code).toEqual([]);
  });
}

test.describe("with a backend", () => {
  test.skip(
    process.env.E2E_BACKEND !== "1" || process.env.E2E_TEAM_CODE === undefined,
    "needs a Supabase project and a team: set E2E_BACKEND=1 and E2E_TEAM_CODE",
  );

  test("the team page holds still when the phone asks for reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/t/${process.env.E2E_TEAM_CODE}?season=all`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator(".confetti-piece")).toHaveCount(0);
    await expect(page.locator(".tile-pulse")).toHaveCount(0);
  });

  test("the team page renders an existing team", async ({ page }) => {
    const response = await page.goto(`/t/${process.env.E2E_TEAM_CODE}?season=all`);
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Recent results" })).toBeVisible();
    for (const group of ["Batting", "Bowling", "Fielding", "MVP"]) {
      await expect(page.getByRole("region", { name: group })).toBeVisible();
    }
  });
});
