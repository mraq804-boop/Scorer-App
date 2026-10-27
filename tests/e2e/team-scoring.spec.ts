import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import type { LocalMatch, StoredEvent } from "@/lib/local/db";
import { runs, score, sendIn, startMatch, wicket } from "./support/scoring";
import { ALI, BILAL, HAMZA, USMAN, openWithTeam, player, readStore, team, xiGroup } from "./support/team";

type Role = "batting" | "fielding";

function opponent(page: Page) {
  return page.getByRole("textbox", { name: "Team B", exact: true });
}

async function tick(page: Page, ...names: RegExp[]) {
  for (const name of names) await xiGroup(page).getByRole("checkbox", { name }).check();
}

async function startTeamMatch(page: Page, role: Role, squad = team()): Promise<string> {
  await openWithTeam(page, squad);
  await opponent(page).fill("Tigers");
  if (role === "batting") {
    await tick(page, /^Ali\b/, /^Hamza\b/, /^Usman\b/, /^Bilal\b/);
    await page.getByLabel("Striker", { exact: true }).selectOption({ label: "Ali" });
    await page.getByLabel("Non-striker", { exact: true }).selectOption({ label: "Usman" });
    await page.getByLabel("Opening bowler", { exact: true }).fill("Kamran");
  } else {
    await page.getByRole("radio", { name: "Bowl", exact: true }).check();
    await tick(page, /^Ali\b/, /^Hamza\b/, /^Usman\b/, /^Bilal\b/);
    await page.getByLabel("Striker", { exact: true }).fill("Kamran");
    await page.getByLabel("Non-striker", { exact: true }).fill("Zain");
    await page.getByLabel("Opening bowler", { exact: true }).selectOption({ label: "Hamza" });
  }
  await page.getByRole("button", { name: "Start match" }).click();
  await expect(page).toHaveURL(/\/score\?m=/);
  await expect(score(page)).toHaveText("0/0 (0)");
  return new URL(page.url()).searchParams.get("m") ?? "";
}

async function eventsOf<T extends StoredEvent["type"]>(page: Page, matchId: string, type: T) {
  const events = await readStore<StoredEvent>(page, "events");
  return events
    .filter((event): event is Extract<StoredEvent, { type: T }> => event.matchId === matchId && event.type === type)
    .sort((first, second) => first.seq - second.seq);
}

async function out(page: Page, how: string, fielder?: string) {
  await wicket(page, how);
  const sheet = page.getByRole("dialog", { name: "How out?" });
  if (fielder !== undefined) await sheet.getByLabel("Fielder (optional)").selectOption({ label: fielder });
  await sheet.getByRole("button", { name: "Out", exact: true }).click();
}

function nextBatter(page: Page): Locator {
  return page.getByRole("dialog", { name: "Next batter" });
}

function chip(page: Page, index: number): Locator {
  return page.getByTestId("this-over").getByRole("button").nth(index);
}

test("the next batter is picked from the XI and the line keeps the squad id", async ({ page }) => {
  const matchId = await startTeamMatch(page, "batting");
  await wicket(page, "Bowled");

  const sheet = nextBatter(page);
  const picks = sheet.getByRole("group", { name: "Playing XI" });
  await expect(picks.getByRole("button")).toHaveText(["Hamza", "Bilal"]);
  const before = await sheet.locator("h3, input").evaluateAll((nodes) => nodes.map((node) => node.tagName));
  expect(before.indexOf("H3")).toBeLessThan(before.indexOf("INPUT"));

  await picks.getByRole("button", { name: "Hamza" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId("striker")).toContainText("Hamza");

  const added = await eventsOf(page, matchId, "player_added");
  expect(added.map((event) => event.player)).toContainEqual({ id: HAMZA, name: "Hamza", team: "A" });
  const arrived = await eventsOf(page, matchId, "batter_in");
  expect(arrived.map((event) => event.player)).toEqual([HAMZA]);
});

test("a batter typed by name who is in the XI is recorded under the squad id", async ({ page }) => {
  const matchId = await startTeamMatch(page, "batting");
  await wicket(page, "Bowled");
  await nextBatter(page).getByRole("group", { name: "Playing XI" }).getByRole("button", { name: "Hamza" }).click();
  await wicket(page, "Bowled");

  const sheet = nextBatter(page);
  await expect(sheet.getByRole("group", { name: "Playing XI" }).getByRole("button")).toHaveText(["Bilal"]);
  await sendIn(page, "bilal");
  await expect(page.getByTestId("striker")).toContainText("Bilal");

  const added = (await eventsOf(page, matchId, "player_added")).map((event) => event.player);
  expect(added.filter((entry) => entry.name === "Bilal")).toEqual([{ id: BILAL, name: "Bilal", team: "A" }]);
  expect((await eventsOf(page, matchId, "batter_in")).map((event) => event.player)).toEqual([HAMZA, BILAL]);
});

test("a batter outside the XI can still be typed in", async ({ page }) => {
  const matchId = await startTeamMatch(page, "batting");
  await wicket(page, "Bowled");
  await sendIn(page, "Saad");
  await expect(page.getByTestId("striker")).toContainText("Saad");

  const added = (await eventsOf(page, matchId, "player_added")).map((event) => event.player);
  const saad = added.find((entry) => entry.name === "Saad");
  expect(saad).toMatchObject({ team: "A" });
  expect([ALI, HAMZA, USMAN, BILAL]).not.toContain(saad?.id);
});

test("players who share a name are told apart in the next batter list", async ({ page }) => {
  const first = "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const second = "22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const squad = team({
    squad: [player(first, "Ali", "batter"), player(second, "Ali", "batter"), player(HAMZA, "Hamza", "bowler"), player(USMAN, "Usman", "allrounder")],
  });
  await openWithTeam(page, squad);
  await opponent(page).fill("Tigers");
  await tick(page, /^Ali \(1\)/, /^Ali \(2\)/, /^Hamza\b/, /^Usman\b/);
  await page.getByLabel("Striker", { exact: true }).selectOption({ label: "Hamza" });
  await page.getByLabel("Non-striker", { exact: true }).selectOption({ label: "Usman" });
  await page.getByLabel("Opening bowler", { exact: true }).fill("Kamran");
  await page.getByRole("button", { name: "Start match" }).click();
  await expect(score(page)).toHaveText("0/0 (0)");
  const matchId = new URL(page.url()).searchParams.get("m") ?? "";

  await wicket(page, "Bowled");
  const picks = nextBatter(page).getByRole("group", { name: "Playing XI" });
  await expect(picks.getByRole("button")).toHaveText(["Ali (1)", "Ali (2)"]);
  await picks.getByRole("button", { name: "Ali (2)" }).click();
  await expect(page.getByTestId("striker")).toContainText("Ali");

  expect((await eventsOf(page, matchId, "batter_in")).map((event) => event.player)).toEqual([second]);
  const added = (await eventsOf(page, matchId, "player_added")).map((event) => event.player.id);
  expect(added).toContain(second);
  expect(added).not.toContain(first);
});

test("a bowler picked from the XI keeps the squad id, and a bowler outside it can be typed", async ({ page }) => {
  const matchId = await startTeamMatch(page, "fielding");
  await runs(page, 0, 0, 0, 0, 0, 0);

  const sheet = page.getByRole("dialog", { name: "Next bowler" });
  const picks = sheet.getByRole("group", { name: "Playing XI" });
  await expect(picks.getByRole("button")).toHaveText(["Ali", "Usman", "Bilal"]);
  await picks.getByRole("button", { name: "Bilal" }).click();
  await expect(sheet).toBeHidden();

  await runs(page, 0, 0, 0, 0, 0, 0);
  await expect(sheet.getByRole("group", { name: "Playing XI" }).getByRole("button")).toHaveText(["Ali", "Usman"]);
  await sheet.getByLabel("Bowler's name").fill("Fahad");
  await sheet.getByRole("button", { name: "Bowl", exact: true }).click();
  await expect(sheet).toBeHidden();

  const changes = (await eventsOf(page, matchId, "bowler_changed")).map((event) => event.player);
  expect(changes[0]).toBe(BILAL);
  const added = (await eventsOf(page, matchId, "player_added")).map((event) => event.player);
  expect(added.find((entry) => entry.name === "Fahad")).toMatchObject({ team: "A" });
  expect([ALI, HAMZA, USMAN, BILAL]).not.toContain(changes[1]);
  expect(added.filter((entry) => entry.id === BILAL)).toHaveLength(1);
});

test("the opponents' bowler is typed even in a team match", async ({ page }) => {
  await startTeamMatch(page, "batting");
  await runs(page, 0, 0, 0, 0, 0, 0);

  const sheet = page.getByRole("dialog", { name: "Next bowler" });
  await expect(sheet.getByRole("group", { name: "Playing XI" })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Bowl", exact: true })).toBeVisible();
});

test("a catch by an XI fielder stores the fielder's id, and the opponents' next batter is typed", async ({ page }) => {
  const matchId = await startTeamMatch(page, "fielding");
  await wicket(page, "Caught");
  const how = page.getByRole("dialog", { name: "How out?" });
  const fielder = how.getByLabel("Fielder (optional)");
  await expect(fielder).toHaveJSProperty("tagName", "SELECT");
  await expect(fielder.getByRole("option")).toHaveText(["No fielder", "Ali", "Hamza", "Usman", "Bilal"]);
  await fielder.selectOption({ label: "Bilal" });
  await how.getByRole("button", { name: "Out", exact: true }).click();

  const sheet = nextBatter(page);
  await expect(sheet.getByRole("group", { name: "Playing XI" })).toHaveCount(0);
  await sendIn(page, "Faisal");
  await expect(score(page)).toHaveText("0/1 (0.1)");

  const [ball] = await eventsOf(page, matchId, "delivery");
  expect(ball?.wicket).toMatchObject({ kind: "caught", fielderName: "Bilal", fielderId: BILAL });
});

test("caught and bowled records the bowler's id as the fielder", async ({ page }) => {
  const matchId = await startTeamMatch(page, "fielding");
  await out(page, "Caught", "Hamza");
  await sendIn(page, "Faisal");
  await expect(score(page)).toHaveText("0/1 (0.1)");

  const [ball] = await eventsOf(page, matchId, "delivery");
  expect(ball?.bowler).toBe(HAMZA);
  expect(ball?.wicket).toMatchObject({ kind: "caught", fielderName: "Hamza", fielderId: HAMZA });
});

test("a run out and a stumping offer the XI too, and no fielder keeps no id", async ({ page }) => {
  const matchId = await startTeamMatch(page, "fielding");
  await out(page, "Stumped", "Usman");
  await sendIn(page, "Faisal");
  await wicket(page, "Run out");
  const how = page.getByRole("dialog", { name: "How out?" });
  await expect(how.getByLabel("Fielder (optional)")).toHaveJSProperty("tagName", "SELECT");
  await how.getByRole("button", { name: "Out", exact: true }).click();
  await sendIn(page, "Saad");

  const [stumping, runOut] = await eventsOf(page, matchId, "delivery");
  expect(stumping?.wicket).toMatchObject({ kind: "stumped", fielderName: "Usman", fielderId: USMAN });
  expect(runOut?.wicket).toMatchObject({ kind: "run_out", fielderName: null });
  expect(runOut?.wicket).not.toHaveProperty("fielderId");
});

test("when the opponents are fielding the fielder stays free text with no id", async ({ page }) => {
  const matchId = await startTeamMatch(page, "batting");
  await wicket(page, "Caught");
  const how = page.getByRole("dialog", { name: "How out?" });
  const fielder = how.getByLabel("Fielder (optional)");
  await expect(fielder).toHaveJSProperty("tagName", "INPUT");
  await fielder.fill("Zain");
  await how.getByRole("button", { name: "Out", exact: true }).click();
  await expect(nextBatter(page)).toBeVisible();

  const [ball] = await eventsOf(page, matchId, "delivery");
  expect(ball?.wicket).toMatchObject({ kind: "caught", fielderName: "Zain" });
  expect(ball?.wicket).not.toHaveProperty("fielderId");
});

test("editing a ball changes the fielder's id, and taking the fielder off clears it", async ({ page }) => {
  const matchId = await startTeamMatch(page, "fielding");
  await out(page, "Caught", "Bilal");
  await sendIn(page, "Faisal");

  await chip(page, 0).click();
  const sheet = page.getByRole("dialog", { name: "Edit ball 0.1" });
  const fielder = sheet.getByLabel("Fielder (optional)");
  const save = sheet.getByRole("button", { name: "Save" });
  await expect(fielder).toHaveJSProperty("tagName", "SELECT");
  await expect(fielder).toHaveValue(BILAL);
  await expect(save).toBeDisabled();

  await fielder.selectOption({ label: "Usman" });
  await save.click();
  await expect(sheet).toBeHidden();

  await chip(page, 0).click();
  await expect(fielder).toHaveValue(USMAN);
  await fielder.selectOption({ label: "No fielder" });
  await save.click();
  await expect(sheet).toBeHidden();

  const patches = (await eventsOf(page, matchId, "correct")).map((event) => event.patch.wicket);
  expect(patches).toEqual([
    { kind: "caught", fielderName: "Usman", fielderId: USMAN },
    { kind: "caught", fielderName: null, fielderId: null },
  ]);

  await chip(page, 0).click();
  await expect(fielder).toHaveValue("");
});

test("editing a ball the opponents caught keeps a typed fielder and sends a null id", async ({ page }) => {
  const matchId = await startTeamMatch(page, "batting");
  await wicket(page, "Caught");
  const how = page.getByRole("dialog", { name: "How out?" });
  await how.getByLabel("Fielder (optional)").fill("Zain");
  await how.getByRole("button", { name: "Out", exact: true }).click();
  await sendIn(page, "Saad");

  await chip(page, 0).click();
  const sheet = page.getByRole("dialog", { name: "Edit ball 0.1" });
  const fielder = sheet.getByLabel("Fielder (optional)");
  await expect(fielder).toHaveJSProperty("tagName", "INPUT");
  await expect(fielder).toHaveValue("Zain");
  await fielder.fill("Zain Abbas");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();

  const [patch] = (await eventsOf(page, matchId, "correct")).map((event) => event.patch.wicket);
  expect(patch).toEqual({ kind: "caught", fielderName: "Zain Abbas", fielderId: null });
});

test("the second innings is started from the XI and reuses a player who already bowled", async ({ page }) => {
  const matchId = await startTeamMatch(page, "fielding");
  await runs(page, 1);
  await page.getByRole("button", { name: "Match menu" }).click();
  await page.getByRole("dialog", { name: "Match menu" }).getByRole("button", { name: "End innings", exact: true }).click();
  await page.getByRole("alertdialog", { name: "End this innings now?" }).getByRole("button", { name: "End innings" }).click();

  const sheet = page.getByRole("dialog", { name: "Start innings 2" });
  await expect(sheet).toBeVisible();
  const striker = sheet.getByLabel("Striker", { exact: true });
  const nonStriker = sheet.getByLabel("Non-striker", { exact: true });
  await expect(striker).toHaveJSProperty("tagName", "SELECT");
  await expect(nonStriker).toHaveJSProperty("tagName", "SELECT");
  await expect(sheet.getByLabel("Opening bowler", { exact: true })).toHaveJSProperty("tagName", "INPUT");

  await sheet.getByRole("button", { name: "Start innings" }).click();
  await expect(sheet.getByText("Pick a player from your XI")).toHaveCount(2);
  await striker.selectOption({ label: "Ali" });
  await nonStriker.selectOption({ label: "Ali" });
  await sheet.getByLabel("Opening bowler", { exact: true }).fill("Kamran");
  await sheet.getByRole("button", { name: "Start innings" }).click();
  await expect(sheet.getByText("Pick two different batters")).toBeVisible();

  await nonStriker.selectOption({ label: "Hamza" });
  await sheet.getByRole("button", { name: "Start innings" }).click();
  await expect(sheet).toBeHidden();
  await expect(score(page)).toHaveText("0/0 (0)");

  const [, second] = await eventsOf(page, matchId, "innings_started");
  expect(second).toMatchObject({ innings: 2, battingTeam: "A", striker: ALI, nonStriker: HAMZA });
  const added = (await eventsOf(page, matchId, "player_added")).map((event) => event.player.id);
  expect(added.filter((id) => id === HAMZA)).toHaveLength(1);
  expect(added.filter((id) => id === ALI)).toHaveLength(1);
});

test("the second innings openers are typed when the opponents bat", async ({ page }) => {
  const matchId = await startTeamMatch(page, "batting");
  await page.getByRole("button", { name: "Match menu" }).click();
  await page.getByRole("dialog", { name: "Match menu" }).getByRole("button", { name: "End innings", exact: true }).click();
  await page.getByRole("alertdialog", { name: "End this innings now?" }).getByRole("button", { name: "End innings" }).click();

  const sheet = page.getByRole("dialog", { name: "Start innings 2" });
  await expect(sheet.getByLabel("Striker", { exact: true })).toHaveJSProperty("tagName", "INPUT");
  await expect(sheet.getByLabel("Opening bowler", { exact: true })).toHaveJSProperty("tagName", "SELECT");
  await sheet.getByLabel("Striker", { exact: true }).fill("Zain");
  await sheet.getByLabel("Non-striker", { exact: true }).fill("Faisal");
  await sheet.getByLabel("Opening bowler", { exact: true }).selectOption({ label: "Hamza" });
  await sheet.getByRole("button", { name: "Start innings" }).click();
  await expect(sheet).toBeHidden();

  const [, second] = await eventsOf(page, matchId, "innings_started");
  expect(second).toMatchObject({ innings: 2, battingTeam: "B", bowler: HAMZA });
});

test("a match without a team scores exactly as before", async ({ page }) => {
  const matchId = await startMatch(page);
  await wicket(page, "Caught");
  const how = page.getByRole("dialog", { name: "How out?" });
  const fielder = how.getByLabel("Fielder (optional)");
  await expect(fielder).toHaveJSProperty("tagName", "INPUT");
  await fielder.fill("Zain");
  await how.getByRole("button", { name: "Out", exact: true }).click();

  const sheet = nextBatter(page);
  await expect(sheet.getByRole("group", { name: "Playing XI" })).toHaveCount(0);
  await sendIn(page, "Saad");
  await expect(score(page)).toHaveText("0/1 (0.1)");

  const [ball] = await eventsOf(page, matchId, "delivery");
  expect(ball?.wicket).toMatchObject({ fielderName: "Zain" });
  expect(ball?.wicket).not.toHaveProperty("fielderId");
  const matches = await readStore<LocalMatch>(page, "matches");
  expect(matches.find((match) => match.id === matchId)).not.toHaveProperty("team");
});
