import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { BLOCKED, changeStoredMatch, runs, score, sendIn, startMatch, wicket } from "./support/scoring";

const STRIKE_MISMATCH = "The striker doesn't match the ball before. Check who's on strike.";

async function openMenu(page: Page, item: string): Promise<void> {
  await page.getByRole("button", { name: "Match menu" }).click();
  await page.getByRole("dialog", { name: "Match menu" }).getByRole("button", { name: item, exact: true }).click();
}

function chip(page: Page, index: number): Locator {
  return page.getByTestId("this-over").getByRole("button").nth(index);
}

async function caughtBy(page: Page, fielder: string): Promise<void> {
  await page.getByTestId("wicket").click();
  const how = page.getByRole("dialog", { name: "How out?" });
  await how.getByRole("button", { name: "Caught", exact: true }).click();
  await how.getByLabel("Fielder (optional)").fill(fielder);
  await how.getByRole("button", { name: "Out", exact: true }).click();
}

async function storedEventTypes(page: Page, matchId: string): Promise<string[]> {
  return page.evaluate(
    (id) =>
      new Promise<string[]>((resolve, reject) => {
        const request = indexedDB.open("cricket-scorer");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction("events").objectStore("events").index("matchId").getAll(id);
          read.onsuccess = () => {
            db.close();
            resolve(read.result.map((event: { type: string }) => event.type));
          };
          read.onerror = () => reject(read.error);
        };
      }),
    matchId,
  );
}

async function openScorecard(page: Page): Promise<Locator> {
  await openMenu(page, "Scorecard");
  const card = page.getByRole("dialog", { name: "Scorecard" });
  await expect(card).toBeVisible();
  return card;
}

test("edit a past ball", async ({ page }) => {
  await startMatch(page);
  await runs(page, 1, 0, 0);
  await expect(score(page)).toHaveText("1/0 (0.3)");

  await chip(page, 0).click();
  const sheet = page.getByRole("dialog", { name: "Edit ball 0.1" });
  const save = sheet.getByRole("button", { name: "Save" });
  await expect(save).toBeDisabled();
  await sheet.getByRole("radio", { name: "2", exact: true }).check();
  await expect(save).toBeEnabled();
  await save.click();

  await expect(sheet).toBeHidden();
  await expect(score(page)).toHaveText("2/0 (0.3)");
  await expect(chip(page, 0)).toHaveText("2");
  await expect(page.getByText(STRIKE_MISMATCH)).toBeVisible();
});

test("an edit that keeps the strike right shows no warning", async ({ page }) => {
  await startMatch(page);
  await runs(page, 1, 0);

  await chip(page, 0).click();
  const sheet = page.getByRole("dialog", { name: "Edit ball 0.1" });
  await sheet.getByRole("radio", { name: "3", exact: true }).check();
  await sheet.getByRole("button", { name: "Save" }).click();

  await expect(score(page)).toHaveText("3/0 (0.2)");
  await expect(page.getByText(STRIKE_MISMATCH)).toHaveCount(0);
});

test("edit a ball into a wide and back keeps every field consistent", async ({ page }) => {
  await startMatch(page);
  await runs(page, 4);
  await expect(score(page)).toHaveText("4/0 (0.1)");

  await chip(page, 0).click();
  const sheet = page.getByRole("dialog", { name: "Edit ball 0.1" });
  await expect(sheet.getByRole("switch", { name: "Boundary" })).toBeChecked();
  await sheet.getByRole("radio", { name: "Wide", exact: true }).check();
  await expect(sheet.getByRole("radiogroup", { name: "Runs as" })).toBeHidden();
  await sheet.getByRole("radio", { name: "0", exact: true }).check();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(score(page)).toHaveText("1/0 (0)");
  await expect(chip(page, 0)).toHaveText("wd");

  await chip(page, 0).click();
  const again = page.getByRole("dialog", { name: /Edit ball 0\.1/ });
  await expect(again.getByRole("radio", { name: "Wide", exact: true })).toBeChecked();
  await again.getByRole("radio", { name: "Legal", exact: true }).check();
  await again.getByRole("radio", { name: "6", exact: true }).check();
  await again.getByRole("button", { name: "Save" }).click();
  await expect(score(page)).toHaveText("6/0 (0.1)");
  await expect(chip(page, 0)).toHaveText("6");
});

test("edit a wicket ball only offers dismissals that fit the ball", async ({ page }) => {
  await startMatch(page);
  await caughtBy(page, "Zain");
  await sendIn(page, "Saad");

  await chip(page, 0).click();
  const sheet = page.getByRole("dialog", { name: "Edit ball 0.1" });
  const save = sheet.getByRole("button", { name: "Save" });
  await expect(sheet.getByRole("button", { name: "Caught", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByLabel("Fielder (optional)")).toHaveValue("Zain");
  await expect(sheet.getByRole("button", { name: /Retired/ })).toHaveCount(0);

  await sheet.getByRole("radio", { name: "No-ball", exact: true }).check();
  await expect(sheet.getByRole("button", { name: "Bowled", exact: true })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Run out", exact: true })).toBeVisible();
  await expect(save).toBeDisabled();

  await sheet.getByRole("radio", { name: "Legal", exact: true }).check();
  await sheet.getByRole("button", { name: "Bowled", exact: true }).click();
  await expect(sheet.getByLabel("Fielder (optional)")).toBeHidden();
  await save.click();
  await expect(sheet).toBeHidden();

  const card = await openScorecard(page);
  await expect(card.getByText("b Hamza")).toBeVisible();
  await expect(card.getByText("c Zain b Hamza")).toHaveCount(0);
});

test("cut overs mid-innings", async ({ page }) => {
  await startMatch(page);
  await openMenu(page, "Match settings");
  const sheet = page.getByRole("dialog", { name: "Match settings" });
  await sheet.getByRole("spinbutton", { name: "Overs" }).fill("1");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();

  await runs(page, 0, 0, 0, 0, 0, 0);
  await expect(page.getByRole("dialog", { name: "Start innings 2" })).toBeVisible();
  await expect(page.locator("[data-sonner-toast]", { hasText: "Innings over" })).toBeVisible();
});

test("match settings refuse overs that make no sense", async ({ page }) => {
  await startMatch(page);
  await openMenu(page, "Match settings");
  const sheet = page.getByRole("dialog", { name: "Match settings" });
  await sheet.getByRole("spinbutton", { name: "Overs" }).fill("0");
  await sheet.getByRole("button", { name: "Save" }).click();

  await expect(sheet.getByText("Enter overs from 1 to 100")).toBeVisible();
  await expect(sheet).toBeVisible();
});

test("match settings change the players of a team", async ({ page }) => {
  await startMatch(page);
  await openMenu(page, "Match settings");
  const sheet = page.getByRole("dialog", { name: "Match settings" });
  const decrease = sheet.getByRole("button", { name: "Decrease Lions players" });
  for (let players = 11; players > 2; players -= 1) await decrease.click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();

  await wicket(page, "Bowled");
  await expect(page.getByRole("alertdialog", { name: "All out — end innings, or add a player?" })).toBeVisible();
});

test("match settings set a target in the chase", async ({ page }) => {
  await startMatch(page, { overs: 1 });
  await runs(page, 1, 0, 0, 0, 0, 0);
  const start = page.getByRole("dialog", { name: "Start innings 2" });
  await start.getByLabel("Striker", { exact: true }).fill("Zain");
  await start.getByLabel("Non-striker", { exact: true }).fill("Faisal");
  await start.getByLabel("Opening bowler", { exact: true }).fill("Usman");
  await start.getByRole("button", { name: "Start innings" }).click();
  await expect(page.getByText("Need 2 from 6 balls")).toBeVisible();

  await openMenu(page, "Match settings");
  const sheet = page.getByRole("dialog", { name: "Match settings" });
  await sheet.getByRole("spinbutton", { name: "Target (runs to win)" }).fill("5");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Need 5 from 6 balls")).toBeVisible();
});

test("the first innings has no target to set", async ({ page }) => {
  await startMatch(page);
  await openMenu(page, "Match settings");
  const sheet = page.getByRole("dialog", { name: "Match settings" });
  await expect(sheet.getByRole("spinbutton", { name: "Overs" })).toBeVisible();
  await expect(sheet.getByRole("spinbutton", { name: "Target (runs to win)" })).toHaveCount(0);
});

test("swap strike", async ({ page }) => {
  await startMatch(page);
  await expect(page.getByTestId("striker")).toContainText("Ali");
  await openMenu(page, "Swap strike");

  await expect(page.getByRole("dialog", { name: "Match menu" })).toBeHidden();
  await expect(page.getByTestId("striker")).toContainText("Usman");
  await expect(page.getByTestId("non-striker")).toContainText("Ali");
});

test("change bowler mid-over", async ({ page }) => {
  await startMatch(page);
  await runs(page, 1, 0);
  await openMenu(page, "Change bowler");
  const sheet = page.getByRole("dialog", { name: "Change bowler" });
  await expect(sheet.getByRole("button", { name: /^Hamza/ })).toHaveCount(0);
  await sheet.getByLabel("Bowler's name").fill("Kamran");
  await sheet.getByRole("button", { name: "Bowl", exact: true }).click();

  await expect(sheet).toBeHidden();
  await expect(page.getByTestId("bowler")).toContainText("Kamran");
  await runs(page, 1);
  await expect(score(page)).toHaveText("2/0 (0.3)");
});

test("change bowler can be cancelled", async ({ page }) => {
  await startMatch(page);
  await openMenu(page, "Change bowler");
  const sheet = page.getByRole("dialog", { name: "Change bowler" });
  await page.keyboard.press("Escape");

  await expect(sheet).toBeHidden();
  await expect(page.getByTestId("bowler")).toContainText("Hamza");
});

test("retire batter", async ({ page }) => {
  await startMatch(page);
  await runs(page, 2);
  await openMenu(page, "Retire batter");
  const sheet = page.getByRole("dialog", { name: "Retire batter" });
  await expect(sheet.getByRole("radio", { name: "Ali", exact: true })).toBeChecked();
  await sheet.getByRole("radio", { name: "Retired hurt", exact: true }).check();
  await sheet.getByRole("button", { name: "Retire", exact: true }).click();

  await sendIn(page, "Saad");
  await expect(page.getByTestId("striker")).toContainText("Saad");
  await expect(score(page)).toHaveText("2/0 (0.1)");
  const card = await openScorecard(page);
  await expect(card.getByText("retired hurt")).toBeVisible();
});

test("end innings asks first", async ({ page }) => {
  await startMatch(page);
  await openMenu(page, "End innings");
  const confirm = page.getByRole("alertdialog", { name: "End this innings now?" });
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole("dialog", { name: "Start innings 2" })).toHaveCount(0);

  await openMenu(page, "End innings");
  await confirm.getByRole("button", { name: "End innings" }).click();
  await expect(page.getByRole("dialog", { name: "Start innings 2" })).toBeVisible();
});

test("scorecard shows dismissal text", async ({ page }) => {
  await startMatch(page);
  await runs(page, 1);
  await caughtBy(page, "Zain");
  await sendIn(page, "Saad");

  const card = await openScorecard(page);
  await expect(card.getByRole("row", { name: /^Usman/ }).getByRole("rowheader")).toContainText("c Zain b Hamza");
  await expect(card.getByRole("row", { name: /^Ali/ }).getByRole("rowheader")).toContainText("not out");
  await expect(card.getByRole("row", { name: /^Ali/ }).getByRole("cell")).toHaveText(["1", "1", "0", "0", "100.00"]);
  await expect(card.getByRole("row", { name: /^Hamza/ }).getByRole("cell")).toHaveText(["0.2", "0", "1", "1", "3.00", "0", "0"]);
  await expect(card.getByRole("row", { name: /^Total/ })).toContainText("1/1");
  await expect(card.getByRole("group", { name: "Fall of wickets" }).getByRole("listitem")).toHaveText(["1-1 Usman (0.2 ov)"]);
});

test("a blocked match keeps the scorecard but not the edits", async ({ page }) => {
  const id = await startMatch(page);
  await runs(page, 1);
  await changeStoredMatch(page, id, "block");
  await page.reload();
  await expect(score(page)).toHaveText("1/0 (0.1)");

  await expect(page.getByTestId("this-over").getByRole("button")).toHaveCount(0);
  await page.getByRole("button", { name: "Match menu" }).click();
  const menu = page.getByRole("dialog", { name: "Match menu" });
  for (const item of ["Swap strike", "Change bowler", "Retire batter", "Match settings", "End innings"]) {
    await expect(menu.getByRole("button", { name: item, exact: true })).toBeDisabled();
  }
  await menu.getByRole("button", { name: "Scorecard", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Scorecard" })).toBeVisible();
});

test("a match blocked while a sheet is open records nothing", async ({ page }) => {
  const id = await startMatch(page);
  await openMenu(page, "Match settings");
  const sheet = page.getByRole("dialog", { name: "Match settings" });
  await sheet.getByRole("spinbutton", { name: "Overs" }).fill("1");
  await changeStoredMatch(page, id, "block");
  await sheet.getByRole("button", { name: "Save" }).click();

  await expect(page.locator("[data-sonner-toast]", { hasText: BLOCKED })).toBeVisible();
  await expect(sheet).toBeVisible();
  expect(await storedEventTypes(page, id)).not.toContain("settings_changed");
});

test("the scorecard fits a narrow screen with long names", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await startMatch(page);
  await caughtBy(page, "Muhammad Abdullah Ibn Abdul Rahman Ali");
  await sendIn(page, "سید محمد عبداللہ بن عبدالرحمن الفاروقی");

  const card = await openScorecard(page);
  await expect(card.getByRole("row", { name: /^Ali/ }).getByRole("rowheader")).toContainText(
    "c Muhammad Abdullah Ibn Abdul Rahman Ali b Hamza",
  );
  expect(await page.evaluate(() => window.innerWidth)).toBe(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  expect(await card.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
});
