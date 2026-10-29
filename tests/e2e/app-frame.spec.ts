import { expect, test } from "@playwright/test";
import { startMatch } from "./support/scoring";

const tabs = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Tabs" });

test("home shows the five tabs", async ({ page }) => {
  await page.goto("/");
  const bar = tabs(page);
  await expect(bar).toBeVisible();
  const expected: [string, string][] = [
    ["Home", "/"],
    ["My team", "/team"],
    ["New match", "/new"],
    ["Stats", "/team"],
    ["Account", "/account"],
  ];
  for (const [name, href] of expected) {
    await expect(bar.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
  }
  await expect(bar.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");
});

test("setup and scoring have no tab bar", async ({ page }) => {
  await page.goto("/new");
  await expect(page.getByRole("heading", { name: "New match" })).toBeVisible();
  await expect(tabs(page)).toHaveCount(0);
  await startMatch(page);
  await expect(page).toHaveURL(/\/score\?m=/);
  await expect(tabs(page)).toHaveCount(0);
});

test("the + opens New match", async ({ page }) => {
  await page.goto("/");
  await tabs(page).getByRole("link", { name: "New match" }).click();
  await expect(page).toHaveURL(/\/new$/);
});

test("the frame draws offline", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(tabs(page)).toBeVisible();
  await tabs(page).getByRole("link", { name: "New match" }).click();
  await expect(page.getByRole("heading", { name: "New match" })).toBeVisible();
  await context.setOffline(false);
});

test("reduced motion turns press feedback off", async ({ page }) => {
  const pressDuration = () =>
    page.evaluate(() => {
      const probe = document.createElement("span");
      probe.className = "press";
      document.body.append(probe);
      const duration = getComputedStyle(probe).transitionDuration;
      probe.remove();
      return duration;
    });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  expect(Number.parseFloat(await pressDuration())).toBeLessThan(0.001);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(Number.parseFloat(await pressDuration())).toBeGreaterThan(0.05);
});
