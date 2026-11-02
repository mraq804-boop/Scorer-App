import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { runs, startMatch } from "./support/scoring";
import { openWithTeam, xiGroup } from "./support/team";

function totalSheet(page: Page, team: string) {
  return page.getByRole("dialog", { name: `${team} total` });
}

async function typeTotal(page: Page, team: string, total: [string, string, string], bowlers: [string, string, string, string][]) {
  const sheet = totalSheet(page, team);
  const totals = sheet.getByRole("group", { name: "Total" });
  await totals.getByLabel("Runs").fill(total[0]);
  await totals.getByLabel("Wickets").fill(total[1]);
  await totals.getByLabel("Overs").fill(total[2]);
  for (const [index, [name, overs, given, taken]] of bowlers.entries()) {
    if (index > 0) await sheet.getByRole("button", { name: "Add bowler" }).click();
    const row = sheet.getByRole("group", { name: `Bowler ${index + 1}` });
    await row.getByLabel("Bowler", { exact: true }).fill(name);
    await row.getByLabel("Overs").fill(overs);
    await row.getByLabel("Runs").fill(given);
    await row.getByLabel("Wickets").fill(taken);
  }
  await sheet.getByRole("button", { name: "Save total" }).click();
}

test("they batted second: their typed total and our bowlers finish the match, and can be fixed later", async ({ page }) => {
  await startMatch(page, { overs: 1 });
  await runs(page, 1, 1, 1, 1, 1, 1);
  const start = page.getByRole("dialog", { name: "Start innings 2" });
  await start.getByRole("button", { name: "Type in the Tigers total instead" }).click();

  await typeTotal(page, "Tigers", ["4", "2", "1"], [["Hamza", "1", "4", "2"]]);

  await expect(page.getByRole("status").filter({ hasText: "Lions won by 2 runs" })).toBeVisible();
  await page.getByRole("button", { name: "Match menu" }).click();
  await page.getByRole("button", { name: "Scorecard" }).click();
  const card = page.getByRole("region", { name: /^Tigers/ });
  await expect(card).toContainText("Total typed in by the scorer");
  await expect(card.getByRole("row", { name: /Hamza/ })).toContainText("4");
  await expect(card.getByRole("table")).toHaveCount(1);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Match menu" }).click();
  await page.getByRole("button", { name: "Edit the Tigers total" }).click();
  const edit = totalSheet(page, "Tigers");
  await expect(edit.getByRole("group", { name: "Total" }).getByLabel("Runs")).toHaveValue("4");
  await expect(edit.getByRole("group", { name: "Bowler 1" }).getByLabel("Bowler", { exact: true })).toHaveValue("Hamza");
  await edit.getByRole("group", { name: "Total" }).getByLabel("Runs").fill("8");
  await edit.getByRole("group", { name: "Total" }).getByLabel("Wickets").fill("3");
  await edit.getByRole("button", { name: "Save total" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Tigers won by 7 wickets" })).toBeVisible();

  await page.getByTestId("undo").click();
  await expect(page.getByRole("status").filter({ hasText: "Lions won by 2 runs" })).toBeVisible();
});

test("the typed total explains what's wrong before saving", async ({ page }) => {
  await startMatch(page, { overs: 1 });
  await runs(page, 1, 1, 1, 1, 1, 1);
  await page.getByRole("dialog", { name: "Start innings 2" }).getByRole("button", { name: "Type in the Tigers total instead" }).click();

  await typeTotal(page, "Tigers", ["4", "1", "1"], [["Hamza", "1", "4", "2"]]);

  const sheet = totalSheet(page, "Tigers");
  await expect(sheet.getByRole("alert")).toHaveText("The bowlers' wickets add up to more than 1");
  await sheet.getByRole("button", { name: "Score it ball by ball instead" }).click();
  await expect(page.getByRole("dialog", { name: "Start innings 2" })).toBeVisible();
});

test("they batted first: their total is typed in at the start and we chase it", async ({ page }) => {
  await page.goto("/new");
  await page.getByRole("textbox", { name: "Team A", exact: true }).fill("Lions");
  await page.getByRole("textbox", { name: "Team B", exact: true }).fill("Tigers");
  await page.getByRole("spinbutton", { name: "Custom overs" }).fill("1");
  await page.getByRole("radio", { name: "Bowl", exact: true }).check();
  await page.getByRole("switch", { name: "Type in the Tigers total instead" }).click();
  await expect(page.getByLabel("Striker", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Start match" }).click();

  await typeTotal(page, "Tigers", ["5", "1", "1"], [["Hamza", "1", "5", "1"]]);

  const start = page.getByRole("dialog", { name: "Start innings 2" });
  await expect(start).toContainText("Target 6");
  await expect(start.getByRole("button", { name: /Type in/ })).toHaveCount(1);
  await start.getByLabel("Striker", { exact: true }).fill("Ali");
  await start.getByLabel("Non-striker", { exact: true }).fill("Usman");
  await start.getByLabel("Opening bowler", { exact: true }).fill("Kamran");
  await start.getByRole("button", { name: "Start innings" }).click();
  await runs(page, 6);

  await expect(page.getByRole("status").filter({ hasText: "Lions won by 10 wickets" })).toBeVisible();
});

test("a team match offers to type in only the opponent's innings", async ({ page }) => {
  await openWithTeam(page);
  await expect(page.getByRole("switch", { name: /^Type in the/ })).toHaveCount(0);
  await page.getByRole("radio", { name: "Bowl", exact: true }).check();
  await expect(page.getByRole("switch", { name: /^Type in the .* total instead$/ })).toBeVisible();
});

test("undoing the start of a scored match goes back to the start sheet, not the typed total", async ({ page }) => {
  await startMatch(page);
  await page.getByTestId("undo").click();

  await expect(page.getByRole("dialog", { name: "Start innings 1" })).toBeVisible();
  await expect(totalSheet(page, "Lions")).toHaveCount(0);
});

test("a team match types the opponent's total with our XI bowlers, can fix it before the chase, and never offers to type our own", async ({ page }) => {
  await openWithTeam(page);
  await page.getByRole("textbox", { name: "Team B", exact: true }).fill("Tigers");
  await page.getByRole("radio", { name: "Bowl", exact: true }).check();
  for (const name of [/^Ali\b/, /^Hamza\b/, /^Usman\b/, /^Bilal\b/]) await xiGroup(page).getByRole("checkbox", { name }).check();
  await page.getByRole("switch", { name: "Type in the Tigers total instead" }).click();
  await page.getByRole("button", { name: "Start match" }).click();

  const sheet = totalSheet(page, "Tigers");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Score it ball by ball instead" }).click();
  await expect(page.getByRole("dialog", { name: "Start innings 1" })).toBeVisible();
  await page.getByRole("dialog", { name: "Start innings 1" }).getByRole("button", { name: "Type in the Tigers total instead" }).click();

  const totals = sheet.getByRole("group", { name: "Total" });
  await totals.getByLabel("Runs").fill("60");
  await totals.getByLabel("Wickets").fill("4");
  await totals.getByLabel("Overs").fill("10");
  const row = sheet.getByRole("group", { name: "Bowler 1" });
  await row.getByLabel("Bowler", { exact: true }).selectOption({ label: "Someone else" });
  await row.getByLabel(/name/).fill("Guest Bowler");
  await row.getByLabel("Bowler", { exact: true }).selectOption({ label: "Hamza" });
  await row.getByLabel("Overs").fill("3");
  await row.getByLabel("Runs").fill("20");
  await row.getByLabel("Wickets").fill("2");
  await sheet.getByRole("button", { name: "Save total" }).click();

  const start = page.getByRole("dialog", { name: "Start innings 2" });
  await expect(start).toContainText("Target 61");
  await expect(start.getByRole("button", { name: /^Type in/ })).toHaveCount(0);
  await start.getByRole("button", { name: "Edit the Tigers total" }).click();
  await expect(sheet.getByRole("group", { name: "Bowler 1" }).getByLabel("Bowler", { exact: true })).toHaveValue(/.+/);
  await expect(sheet.getByRole("group", { name: "Bowler 1" }).getByLabel(/name/)).toHaveCount(0);
  await sheet.getByRole("group", { name: "Total" }).getByLabel("Runs").fill("65");
  await sheet.getByRole("button", { name: "Save total" }).click();
  await expect(page.getByRole("dialog", { name: "Start innings 2" })).toContainText("Target 66");
});
