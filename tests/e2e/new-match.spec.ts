import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const STORAGE_ERROR = "This browser can't save matches. Open in Chrome, or turn off private browsing.";

type Names = { teamA: string; teamB: string; striker: string; nonStriker: string; bowler: string };

const names: Names = { teamA: "Lions", teamB: "Tigers", striker: "Ali", nonStriker: "Usman", bowler: "Hamza" };

async function fillNames(page: Page, values: Names) {
  await page.getByRole("textbox", { name: "Team A", exact: true }).fill(values.teamA);
  await page.getByRole("textbox", { name: "Team B", exact: true }).fill(values.teamB);
  await page.getByLabel("Striker", { exact: true }).fill(values.striker);
  await page.getByLabel("Non-striker", { exact: true }).fill(values.nonStriker);
  await page.getByLabel("Opening bowler", { exact: true }).fill(values.bowler);
}

function start(page: Page) {
  return page.getByRole("button", { name: "Start match" });
}

const PHONE_WIDTH = 360;

function fitsViewport(page: Page) {
  return page.evaluate(
    (width) => document.documentElement.scrollWidth <= window.innerWidth && window.innerWidth <= width,
    PHONE_WIDTH,
  );
}

test("home offers a new match and an empty list", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "New match" })).toHaveAttribute("href", "/new");
  await expect(page.getByRole("link", { name: /Keep your matches/ })).toHaveAttribute("href", "/account");
  await expect(page.getByText("No matches yet")).toBeVisible();
});

test("home shows the copyright", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("© 2026 AQ. All rights reserved.")).toBeVisible();
});

test("start a match with defaults", async ({ page }) => {
  await page.goto("/new");
  await fillNames(page, names);
  await start(page).click();

  await expect(page).toHaveURL(/\/score\?m=/);
  const id = new URL(page.url()).searchParams.get("m");
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.getByTestId("score")).toContainText("0/0");

  await page.goto("/");
  const item = page.getByRole("link", { name: /Lions vs Tigers/ });
  await expect(item).toHaveAttribute("href", `/score?m=${id}`);
  await expect(item).toContainText("Lions 0/0 (0 ov)");
  await expect(item).toContainText("Saved on phone");
});

test("long and Urdu names don't overflow", async ({ page }) => {
  await page.setViewportSize({ width: PHONE_WIDTH, height: 780 });
  await page.goto("/new");
  await fillNames(page, {
    teamA: "لاہور قلندرز",
    teamB: "K".repeat(40),
    striker: "W".repeat(40),
    nonStriker: "N".repeat(40),
    bowler: "B".repeat(40),
  });
  await page.getByRole("button", { name: "Rules" }).click();
  await expect(page.getByRole("switch", { name: "LBW" })).toBeVisible();
  expect(await fitsViewport(page)).toBe(true);

  await start(page).click();
  await expect(page).toHaveURL(/\/score\?m=/);

  await page.goto("/");
  await expect(page.getByRole("link", { name: /Saved on phone/ })).toBeVisible();
  expect(await fitsViewport(page)).toBe(true);
});

test("Start does not wait for an unanswered storage persistence prompt", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(StorageManager.prototype, "persist", { value: () => new Promise<boolean>(() => undefined) });
  });
  await page.goto("/new");
  await fillNames(page, names);
  await start(page).click();

  await expect(page).toHaveURL(/\/score\?m=/);
});

test("storage error is shown", async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as { indexedDB?: unknown }).indexedDB;
  });
  await page.goto("/new");
  await expect(page.getByText(STORAGE_ERROR)).toBeVisible();
  await expect(start(page)).toHaveCount(0);

  await page.goto("/");
  await expect(page.getByText(STORAGE_ERROR)).toBeVisible();
  await expect(page.getByRole("link", { name: "New match" })).toBeVisible();
});

test("changing the ball type re-applies defaults for rules that were not touched", async ({ page }) => {
  await page.goto("/new");
  await page.getByRole("button", { name: "Rules" }).click();
  const lbw = page.getByRole("switch", { name: "LBW" });
  const lastMan = page.getByRole("switch", { name: "Last man stands" });
  const ball = (label: string) => page.getByRole("radio", { name: label, exact: true });

  await expect(ball("Tape")).toBeChecked();
  await expect(lbw).not.toBeChecked();
  await ball("Hard").check();
  await expect(lbw).toBeChecked();
  await ball("Tennis").check();
  await expect(lbw).not.toBeChecked();

  await ball("Hard").check();
  await lastMan.click();
  await lbw.click();
  await expect(lbw).not.toBeChecked();
  await ball("Tennis").check();
  await ball("Hard").check();
  await expect(lbw).not.toBeChecked();
  await expect(lastMan).toBeChecked();
});

test("identical openers are rejected before anything is saved", async ({ page }) => {
  await page.goto("/new");
  await fillNames(page, { ...names, nonStriker: "ali" });
  await start(page).click();

  await expect(page.getByText("Pick two different batters")).toBeVisible();
  await expect(page).toHaveURL(/\/new$/);

  await page.getByLabel("Non-striker", { exact: true }).fill("Usman");
  await expect(page.getByText("Pick two different batters")).toHaveCount(0);
  await start(page).click();
  await expect(page).toHaveURL(/\/score\?m=/);
});

test("player names from earlier matches are suggested", async ({ page }) => {
  await page.goto("/new");
  await fillNames(page, names);
  await start(page).click();
  await expect(page).toHaveURL(/\/score\?m=/);

  await page.goto("/new");
  await expect(page.getByLabel("Striker", { exact: true })).toBeVisible();
  const suggestions = page.locator("datalist#recent-players option");
  await expect(suggestions).toHaveCount(3);
  await expect(page.locator('datalist#recent-players option[value="Usman"]')).toHaveCount(1);
  await expect(page.getByLabel("Striker", { exact: true })).toHaveAttribute("list", "recent-players");
});

test("overs must be between 1 and 100", async ({ page }) => {
  await page.goto("/new");
  await fillNames(page, names);
  await page.getByRole("spinbutton", { name: "Custom overs" }).fill("101");
  await start(page).click();
  await expect(page.getByText("Enter overs from 1 to 100")).toBeVisible();
  await expect(page).toHaveURL(/\/new$/);

  await page.getByRole("button", { name: "T20", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Custom overs" })).toHaveValue("20");
  await start(page).click();
  await expect(page).toHaveURL(/\/score\?m=/);
});
