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
  await expect.poll(async () => Number.parseFloat(await pressDuration())).toBeLessThan(0.001);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(async () => Number.parseFloat(await pressDuration())).toBeGreaterThan(0.05);
});

test("the install card hides for 14 days after Not now", async ({ page }) => {
  await page.addInitScript(() => {
    window.addEventListener("load", () => {
      setTimeout(() => {
        const event = new Event("beforeinstallprompt");
        Object.assign(event, { prompt: async () => undefined, userChoice: Promise.resolve({ outcome: "dismissed" }) });
        window.dispatchEvent(event);
      }, 300);
    });
  });
  await page.goto("/");
  const card = page.getByRole("region", { name: "Install the app" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Not now" }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Tabs" })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByRole("region", { name: "Install the app" })).toHaveCount(0);
});

test("the last card clears the tab bar at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  for (let match = 0; match < 3; match += 1) await startMatch(page);
  await page.goto("/");
  const cards = page.getByRole("region", { name: "Live now" }).getByRole("listitem");
  await expect(cards).toHaveCount(3);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const last = await cards.last().boundingBox();
  const bar = await tabs(page).boundingBox();
  if (last === null || bar === null) throw new Error("missing boxes");
  expect(last.y + last.height).toBeLessThanOrEqual(bar.y);
  for (const label of ["Home", "My team", "Stats", "Account"]) {
    const box = await tabs(page).getByRole("link", { name: label, exact: true }).boundingBox();
    expect(box?.height ?? 0).toBeLessThan(64);
    const text = await tabs(page).getByRole("link", { name: label, exact: true }).locator("span").boundingBox();
    expect(text?.height ?? 0).toBeLessThan(20);
  }
});

test("Appearance switches to dark and stays dark", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/account");
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
});

test("New match has a close button back to Home", async ({ page }) => {
  await page.goto("/new");
  await expect(page.getByRole("link", { name: "Close" })).toHaveAttribute("href", "/");
});
