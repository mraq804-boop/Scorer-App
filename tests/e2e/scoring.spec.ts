import { expect, test } from "@playwright/test";
import { BLOCKED, changeStoredMatch, runs, score, sendIn, startMatch, wicket } from "./support/scoring";

test("scores an over with extras", async ({ page }) => {
  await startMatch(page);
  await runs(page, 1, 4);
  await page.getByTestId("toggle-wide").click();
  await runs(page, 0, 0);
  await page.getByTestId("toggle-noball").click();
  await runs(page, 6, 2, 0);
  await wicket(page, "Bowled");

  await expect(score(page)).toHaveText("15/1 (1)");
  await expect(page.getByRole("dialog", { name: "Next batter" })).toBeVisible();
  await sendIn(page, "Saad");
  await expect(page.getByRole("dialog", { name: "Next bowler" })).toBeVisible();
});

test("toggles reset after a ball", async ({ page }) => {
  await startMatch(page);
  const toggle = (name: string) => page.getByTestId(`toggle-${name}`);

  await toggle("wide").click();
  await expect(toggle("wide")).toHaveAttribute("aria-pressed", "true");
  await toggle("noball").click();
  await expect(toggle("wide")).toHaveAttribute("aria-pressed", "false");
  await toggle("bye").click();
  await toggle("legbye").click();
  await expect(toggle("bye")).toHaveAttribute("aria-pressed", "false");
  await toggle("wide").click();
  await expect(toggle("noball")).toHaveAttribute("aria-pressed", "false");
  await expect(toggle("legbye")).toHaveAttribute("aria-pressed", "false");
  await toggle("noball").click();
  await toggle("legbye").click();
  await runs(page, 1);

  await expect(score(page)).toHaveText("2/0 (0)");
  for (const name of ["wide", "noball", "bye", "legbye"]) {
    await expect(toggle(name)).toHaveAttribute("aria-pressed", "false");
  }
  await runs(page, 1);
  await expect(score(page)).toHaveText("3/0 (0.1)");
});

test("wicket asks for the next batter and the batter takes strike after a catch", async ({ page }) => {
  await startMatch(page);
  await runs(page, 1);
  await expect(page.getByTestId("striker")).toContainText("Usman");

  await page.getByTestId("wicket").click();
  const how = page.getByRole("dialog", { name: "How out?" });
  await how.getByRole("button", { name: "Caught", exact: true }).click();
  await how.getByLabel("Fielder (optional)").fill("Zain");
  await how.getByRole("button", { name: "Out", exact: true }).click();

  await expect(page.getByRole("dialog", { name: "Next batter" })).toBeVisible();
  await sendIn(page, "Saad");
  await expect(score(page)).toHaveText("1/1 (0.2)");
  await expect(page.getByTestId("striker")).toContainText("Saad");
  await expect(page.getByTestId("striker")).toContainText("*");
  await expect(page.getByTestId("non-striker")).toContainText("Ali");
});

test("undo removes the last ball", async ({ page }) => {
  await startMatch(page);
  await runs(page, 1, 4);
  await expect(score(page)).toHaveText("5/0 (0.2)");

  await page.getByTestId("undo").click();
  await expect(score(page)).toHaveText("1/0 (0.1)");
  await page.getByTestId("undo").click();
  await expect(score(page)).toHaveText("0/0 (0)");
  await expect(page.getByTestId("striker")).toContainText("Ali");
});

test("same bowler twice shows a warning but is allowed", async ({ page }) => {
  await startMatch(page);
  await runs(page, 0, 0, 0, 0, 0, 0);

  const sheet = page.getByRole("dialog", { name: "Next bowler" });
  await sheet.getByRole("button", { name: /Hamza/ }).click();
  await expect(page.getByText("Hamza also bowled the last over")).toBeVisible();
  await expect(page.getByTestId("bowler")).toContainText("Hamza");

  await runs(page, 1);
  await expect(score(page)).toHaveText("1/0 (1.1)");
});

test("all out asks and add player continues", async ({ page }) => {
  await startMatch(page, { teamAPlayers: 2 });
  await wicket(page, "Bowled");

  const dialog = page.getByRole("alertdialog", { name: "All out — end innings, or add a player?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Add a player" }).click();
  await sendIn(page, "Saad");
  await runs(page, 1);
  await expect(score(page)).toHaveText("1/1 (0.2)");
});

test("two tabs stay in step", async ({ page, context }) => {
  const id = await startMatch(page);
  const other = await context.newPage();
  await other.goto(`/score?m=${id}`);
  await expect(score(other)).toHaveText("0/0 (0)");

  await runs(page, 4, 1);
  await expect(score(page)).toHaveText("5/0 (0.2)");
  await expect(score(other)).toHaveText("5/0 (0.2)");
  await expect(other.getByTestId("striker")).toContainText("Usman");
});

test("scores offline and survives reload", async ({ page, context }) => {
  await startMatch(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

  await context.setOffline(true);
  await runs(page, 1, 2, 4);
  await expect(score(page)).toHaveText("7/0 (0.3)");
  await page.reload();
  await expect(score(page)).toHaveText("7/0 (0.3)");
  await expect(page.getByText("Saved on phone")).toBeVisible();
  await context.setOffline(false);
});

test("the innings ends by itself, undo does not loop, and the chase ends with a result", async ({ page }) => {
  await startMatch(page, { overs: 1 });
  await runs(page, 1, 0, 0, 0, 0, 0);

  const start = page.getByRole("dialog", { name: "Start innings 2" });
  await expect(start).toBeVisible();
  await page.locator("[data-sonner-toast]", { hasText: "Innings over" }).getByRole("button", { name: "Undo" }).click();
  await expect(start).toBeHidden();
  await expect(score(page)).toHaveText("1/0 (1)");
  await page.getByRole("button", { name: "End innings" }).click();

  await expect(start).toBeVisible();
  await start.getByLabel("Striker", { exact: true }).fill("Zain");
  await start.getByLabel("Non-striker", { exact: true }).fill("Faisal");
  await start.getByLabel("Opening bowler", { exact: true }).fill("Usman");
  await start.getByRole("button", { name: "Start innings" }).click();
  await expect(score(page)).toHaveText("0/0 (0)");
  await expect(page.getByText("Need 2 from 6 balls")).toBeVisible();

  await runs(page, 2);
  await expect(page.getByText("Tigers won by 10 wickets (5 balls left)")).toBeVisible();
});

test("a blocked match is read-only", async ({ page }) => {
  const id = await startMatch(page);
  await runs(page, 1);
  await expect(score(page)).toHaveText("1/0 (0.1)");

  await changeStoredMatch(page, id, "block");
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: BLOCKED })).toBeVisible();
  await expect(score(page)).toHaveText("1/0 (0.1)");
  await expect(page.getByTestId("run-1")).toBeDisabled();
  await expect(page.getByTestId("wicket")).toBeDisabled();
  await expect(page.getByTestId("undo")).toBeDisabled();
});

test("a ball that can't be saved is not shown", async ({ page }) => {
  const id = await startMatch(page);
  await changeStoredMatch(page, id, "remove");

  await runs(page, 1);
  await expect(page.getByText("Couldn't save that on your phone. Check your storage and try again.")).toBeVisible();
  await expect(score(page)).toHaveText("0/0 (0)");
  await expect(page.getByTestId("this-over").locator("li")).toHaveCount(0);
});

test("run out asks which batter and how many runs were completed", async ({ page }) => {
  await startMatch(page);
  await page.getByTestId("wicket").click();
  const how = page.getByRole("dialog", { name: "How out?" });
  await how.getByRole("button", { name: "Run out", exact: true }).click();
  await how.getByRole("radio", { name: "Usman" }).check();
  await how.getByRole("radio", { name: "1", exact: true }).check();
  await how.getByRole("button", { name: "Out", exact: true }).click();

  await expect(score(page)).toHaveText("1/1 (0.1)");
  await sendIn(page, "Saad");
  await expect(page.getByTestId("striker")).toContainText("Saad");
  await expect(page.getByTestId("non-striker")).toContainText("Ali");
});

test("a retired-hurt batter is offered first when the next batter is needed", async ({ page }) => {
  await startMatch(page);
  await runs(page, 1);
  await wicket(page, "Retired hurt");
  await page.getByRole("dialog", { name: "How out?" }).getByRole("button", { name: "Retire" }).click();
  await sendIn(page, "Saad");
  await expect(score(page)).toHaveText("1/0 (0.1)");

  await wicket(page, "Bowled");
  const sheet = page.getByRole("dialog", { name: "Next batter" });
  await sheet.getByRole("button", { name: "Usman" }).click();
  await expect(score(page)).toHaveText("1/1 (0.2)");
  await expect(page.getByTestId("striker")).toContainText("Usman");
});
