import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import type { LocalMatch, StoredEvent, SquadOutboxRow } from "@/lib/local/db";
import { runs, score } from "./support/scoring";
import {
  ALI,
  BILAL,
  FIXTURE,
  HAMZA,
  TEAM_ID,
  USMAN,
  fakeAccount,
  openNewMatch,
  openWithTeam,
  player,
  readStore,
  seedTeam,
  team,
  waitForSession,
  xiGroup,
} from "./support/team";

function start(page: Page) {
  return page.getByRole("button", { name: "Start match" });
}

function opponent(page: Page) {
  return page.getByRole("textbox", { name: "Team B", exact: true });
}

function teamName(page: Page) {
  return page.getByRole("textbox", { name: "Team A", exact: true });
}

function striker(page: Page) {
  return page.getByLabel("Striker", { exact: true });
}

function nonStriker(page: Page) {
  return page.getByLabel("Non-striker", { exact: true });
}

function bowler(page: Page) {
  return page.getByLabel("Opening bowler", { exact: true });
}

async function tick(page: Page, ...names: RegExp[]) {
  for (const name of names) await xiGroup(page).getByRole("checkbox", { name }).check();
}

async function started(page: Page) {
  await expect(page).toHaveURL(/\/score\?m=/);
  const matchId = new URL(page.url()).searchParams.get("m");
  const matches = await readStore<LocalMatch>(page, "matches");
  const events = await readStore<StoredEvent>(page, "events");
  return {
    match: matches.find((match) => match.id === matchId),
    added: events.filter((event) => event.matchId === matchId && event.type === "player_added"),
    innings: events.find((event) => event.matchId === matchId && event.type === "innings_started"),
  };
}

test("team match starts offline from the cached squad", async ({ page, context }) => {
  await openWithTeam(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await context.setOffline(true);

  await expect(page.getByRole("switch", { name: "My team is playing" })).toBeChecked();
  await expect(teamName(page)).toHaveValue("Lions");
  await expect(teamName(page)).toHaveAttribute("readonly", "");
  await expect(xiGroup(page).getByRole("checkbox")).toHaveCount(4);
  await expect(xiGroup(page).getByText("Raza")).toHaveCount(0);

  await tick(page, /^Ali\b/, /^Hamza\b/, /^Usman\b/);
  await expect(xiGroup(page)).toContainText("3 selected");
  await opponent(page).fill("Tigers");
  await striker(page).selectOption({ label: "Ali" });
  await nonStriker(page).selectOption({ label: "Usman" });
  await bowler(page).fill("Kamran");
  await start(page).click();

  await expect(page).toHaveURL(/\/score\?m=/);
  await expect(score(page)).toHaveText("0/0 (0)");
  await runs(page, 1);
  await expect(score(page)).toHaveText("1/0 (0.1)");

  const { match, added, innings } = await started(page);
  expect(match?.teams).toEqual(["Lions", "Tigers"]);
  expect(match?.rules.playersPerSide).toEqual({ A: 3, B: 11 });
  expect(match?.team).toEqual({
    id: TEAM_ID,
    side: "A",
    fixtureId: null,
    xi: [
      { id: ALI, name: "Ali" },
      { id: HAMZA, name: "Hamza" },
      { id: USMAN, name: "Usman" },
    ],
  });
  expect(added.map((event) => event.type === "player_added" && event.player.id).slice(0, 2)).toEqual([ALI, USMAN]);
  expect(innings).toMatchObject({ striker: ALI, nonStriker: USMAN });
  await context.setOffline(false);
});

test("add a player at the ground", async ({ page }) => {
  await openWithTeam(page);
  const xi = xiGroup(page);

  await xi.getByRole("textbox", { name: "New player's name" }).fill("Zain Abbas");
  await xi.getByLabel("Role", { exact: true }).selectOption("keeper");
  await xi.getByRole("button", { name: "Add to squad" }).click();

  await expect(xi.getByRole("checkbox", { name: "Zain Abbas" })).toBeChecked();
  await expect(xi.getByRole("list").getByText("Wicketkeeper")).toBeVisible();
  await expect(xi.getByRole("textbox", { name: "New player's name" })).toHaveValue("");

  await expect.poll(async () => (await readStore<SquadOutboxRow>(page, "squadOutbox")).map((row) => row.name)).toEqual(["Zain Abbas"]);
  const [queued] = await readStore<SquadOutboxRow>(page, "squadOutbox");
  expect(queued).toMatchObject({ teamId: TEAM_ID, role: "keeper", active: true });
  const [cached] = await readStore<{ squad: { id: string; name: string }[] }>(page, "team");
  expect(cached.squad.map((row) => row.name)).toContain("Zain Abbas");

  await tick(page, /^Ali\b/);
  await opponent(page).fill("Tigers");
  await striker(page).selectOption({ label: "Zain Abbas" });
  await nonStriker(page).selectOption({ label: "Ali" });
  await bowler(page).fill("Kamran");
  await start(page).click();

  const { added, innings } = await started(page);
  expect(added[0]).toMatchObject({ player: { id: queued.id, name: "Zain Abbas", team: "A" } });
  expect(innings).toMatchObject({ striker: queued.id, nonStriker: ALI });
});

test("adding a player with no name or a name that is too long is refused and writes nothing", async ({ page }) => {
  await openWithTeam(page);
  const xi = xiGroup(page);
  const name = xi.getByRole("textbox", { name: "New player's name" });
  const add = xi.getByRole("button", { name: "Add to squad" });

  await add.click();
  await expect(xi.getByText("Enter a name")).toBeVisible();
  await name.fill("N".repeat(41));
  await add.click();
  await expect(xi.getByText("Use 40 characters or fewer")).toBeVisible();
  await expect(xi.getByRole("checkbox")).toHaveCount(4);
  expect(await readStore(page, "squadOutbox")).toEqual([]);

  await name.fill("Zain");
  await expect(xi.getByText("Use 40 characters or fewer")).toHaveCount(0);
  await name.press("Enter");
  await expect(page).toHaveURL(/\/new$/);
  await expect(xi.getByRole("checkbox", { name: /^Zain\b/ })).toBeChecked();
});

test("a fixture pre-fills the match", async ({ page }) => {
  await openWithTeam(page, team(), `/new?fixture=${FIXTURE.id}`);

  await expect(opponent(page)).toHaveValue("Kites");
  await expect(page.getByRole("spinbutton", { name: "Custom overs" })).toHaveValue("15");
  await expect(page.getByText("Ground:")).toBeVisible();
  await expect(page.getByText("Model Town Ground")).toBeVisible();
  await expect(teamName(page)).toHaveValue("Lions");

  await tick(page, /^Ali\b/, /^Usman\b/);
  await striker(page).selectOption({ label: "Ali" });
  await nonStriker(page).selectOption({ label: "Usman" });
  await bowler(page).fill("Kamran");
  await start(page).click();

  const { match } = await started(page);
  expect(match?.team).toMatchObject({ id: TEAM_ID, side: "A", fixtureId: FIXTURE.id });
  expect(match?.teams).toEqual(["Lions", "Kites"]);
  expect(match?.rules.oversPerInnings).toBe(15);
});

test("a fixture the phone doesn't know is ignored", async ({ page }) => {
  await openWithTeam(page, team(), "/new?fixture=99999999-9999-4999-8999-999999999999");

  await expect(opponent(page)).toHaveValue("");
  await expect(page.getByRole("spinbutton", { name: "Custom overs" })).toHaveValue("10");
  await expect(page.getByText("Ground:")).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "My team is playing" })).toBeChecked();
});

test("turning off My team is playing gives the plain form", async ({ page }) => {
  await openWithTeam(page, team(), `/new?fixture=${FIXTURE.id}`);
  await page.getByRole("switch", { name: "My team is playing" }).click();

  await expect(xiGroup(page)).toHaveCount(0);
  await expect(teamName(page)).toHaveValue("");
  await expect(teamName(page)).not.toHaveAttribute("readonly", "");
  await expect(striker(page)).toHaveJSProperty("tagName", "INPUT");
  await expect(page.getByText("Ground:")).toHaveCount(0);

  await teamName(page).fill("Pindi XI");
  await striker(page).fill("Ali");
  await nonStriker(page).fill("Usman");
  await bowler(page).fill("Kamran");
  await start(page).click();

  const { match, added } = await started(page);
  expect(match?.teams).toEqual(["Pindi XI", "Kites"]);
  expect(match).not.toHaveProperty("team");
  expect(added.map((event) => event.type === "player_added" && event.player.id)).not.toContain(ALI);
});

test("no cached team keeps the plain form", async ({ page }) => {
  await openNewMatch(page, `/new?fixture=${FIXTURE.id}`);

  await expect(page.getByRole("switch", { name: "My team is playing" })).toHaveCount(0);
  await expect(xiGroup(page)).toHaveCount(0);
  await expect(teamName(page)).toBeEditable();
  await expect(opponent(page)).toHaveValue("");
  await expect(striker(page)).toHaveJSProperty("tagName", "INPUT");
  await expect(page.getByRole("button", { name: "Add to squad" })).toHaveCount(0);

  await teamName(page).fill("Lions");
  await opponent(page).fill("Tigers");
  await striker(page).fill("Ali");
  await nonStriker(page).fill("Usman");
  await bowler(page).fill("Hamza");
  await start(page).click();

  const { match } = await started(page);
  expect(match).not.toHaveProperty("team");
});

test("the team's side is picked from the XI, and an XI needs two players", async ({ page }) => {
  await openWithTeam(page);
  await opponent(page).fill("Tigers");
  await bowler(page).fill("Kamran");
  await tick(page, /^Ali\b/);
  await start(page).click();

  await expect(page).toHaveURL(/\/new$/);
  await expect(page.getByText("Pick at least 2 players for your XI")).toBeVisible();
  await expect(xiGroup(page)).toBeFocused();
  await expect(page.getByText("Pick a player from your XI")).toHaveCount(2);

  await tick(page, /^Hamza\b/);
  await striker(page).selectOption({ label: "Ali" });
  await nonStriker(page).selectOption({ label: "Hamza" });
  await xiGroup(page).getByRole("checkbox", { name: /^Hamza\b/ }).uncheck();
  await expect(nonStriker(page)).toHaveValue("");
  await expect(xiGroup(page)).toContainText("1 selected");

  await xiGroup(page).getByRole("checkbox", { name: /^Usman\b/ }).check();
  await nonStriker(page).selectOption({ label: "Usman" });
  await start(page).click();
  await expect(page).toHaveURL(/\/score\?m=/);
});

test("the XI sets Team A's players until the scorer changes them", async ({ page }) => {
  await openWithTeam(page);
  await page.getByRole("button", { name: "Rules" }).click();
  const teamAPlayers = page.getByRole("group", { name: "Team A players" });
  const teamBPlayers = page.getByRole("group", { name: "Team B players" });
  const count = (group: Locator) => group.locator("span[aria-live]");

  await expect(count(teamAPlayers)).toHaveText("2");
  await tick(page, /^Ali\b/, /^Hamza\b/, /^Usman\b/);
  await expect(count(teamAPlayers)).toHaveText("3");
  await tick(page, /^Bilal\b/);
  await expect(count(teamAPlayers)).toHaveText("4");
  await expect(count(teamBPlayers)).toHaveText("11");

  await page.getByRole("button", { name: "Increase Team A players" }).click();
  await expect(count(teamAPlayers)).toHaveText("5");
  await xiGroup(page).getByRole("checkbox", { name: /^Bilal\b/ }).uncheck();
  await expect(count(teamAPlayers)).toHaveText("5");

  await opponent(page).fill("Tigers");
  await striker(page).selectOption({ label: "Ali" });
  await nonStriker(page).selectOption({ label: "Hamza" });
  await bowler(page).fill("Kamran");
  await start(page).click();

  const { match } = await started(page);
  expect(match?.rules.playersPerSide).toEqual({ A: 5, B: 11 });
});

test("changing Team B's players first still lets the XI set Team A's", async ({ page }) => {
  await openWithTeam(page);
  await page.getByRole("button", { name: "Rules" }).click();
  const teamAPlayers = page.getByRole("group", { name: "Team A players" });
  const teamBPlayers = page.getByRole("group", { name: "Team B players" });
  const count = (group: Locator) => group.locator("span[aria-live]");

  await page.getByRole("button", { name: "Decrease Team B players" }).click();
  await page.getByRole("button", { name: "Decrease Team B players" }).click();
  await page.getByRole("button", { name: "Decrease Team B players" }).click();
  await expect(count(teamBPlayers)).toHaveText("8");
  await tick(page, /^Ali\b/, /^Hamza\b/, /^Usman\b/, /^Bilal\b/);
  await expect(count(teamAPlayers)).toHaveText("4");
  await expect(count(teamBPlayers)).toHaveText("8");

  await opponent(page).fill("Tigers");
  await striker(page).selectOption({ label: "Ali" });
  await nonStriker(page).selectOption({ label: "Hamza" });
  await bowler(page).fill("Kamran");
  await start(page).click();

  const { match } = await started(page);
  expect(match?.rules.playersPerSide).toEqual({ A: 4, B: 8 });
});

test("when the team fields first the opening bowler is picked from the XI", async ({ page }) => {
  await openWithTeam(page);
  await page.getByRole("radio", { name: "Bowl", exact: true }).check();
  await opponent(page).fill("Tigers");
  await tick(page, /^Hamza\b/, /^Bilal\b/);
  await bowler(page).selectOption({ label: "Hamza" });
  await expect(striker(page)).toHaveJSProperty("tagName", "INPUT");
  await striker(page).fill("Kamran");
  await nonStriker(page).fill("Zain");
  await start(page).click();

  const { match, added, innings } = await started(page);
  expect(match?.team?.xi.map((row) => row.id)).toEqual([HAMZA, BILAL]);
  expect(innings).toMatchObject({ battingTeam: "B", bowler: HAMZA });
  expect(added.find((event) => event.type === "player_added" && event.player.id === HAMZA)).toMatchObject({
    player: { name: "Hamza", team: "A" },
  });
});

test("players who share a name can be told apart", async ({ page }) => {
  const first = "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const second = "22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await openWithTeam(page, team({ squad: [player(first, "Ali", "batter"), player(second, "Ali", "batter"), player(HAMZA, "Hamza", "bowler")] }));

  await expect(xiGroup(page).getByRole("checkbox", { name: /^Ali \(1\)/ })).toBeVisible();
  await expect(xiGroup(page).getByRole("checkbox", { name: /^Ali \(2\)/ })).toBeVisible();
  await expect(xiGroup(page).getByRole("checkbox", { name: /^Hamza\b/ })).toBeVisible();

  await tick(page, /^Ali \(1\)/, /^Ali \(2\)/);
  await expect(striker(page).getByRole("option", { name: "Ali (1)" })).toHaveCount(1);
  await expect(striker(page).getByRole("option", { name: "Ali (2)" })).toHaveCount(1);
  await opponent(page).fill("Tigers");
  await striker(page).selectOption({ label: "Ali (1)" });
  await nonStriker(page).selectOption({ label: "Ali (1)" });
  await bowler(page).fill("Kamran");
  await start(page).click();
  await expect(page.getByText("Pick two different batters")).toBeVisible();

  await nonStriker(page).selectOption({ label: "Ali (2)" });
  await start(page).click();
  const { innings } = await started(page);
  expect(innings).toMatchObject({ striker: first, nonStriker: second });
});

test("a long squad name doesn't overflow the phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const long = "W".repeat(40);
  await openWithTeam(page, team({ name: "K".repeat(40), squad: [player(ALI, long, "allrounder"), player(HAMZA, "لاہور قلندرز", "keeper")] }));

  await tick(page, /^W/, /^لاہور/);
  await striker(page).selectOption({ label: long });
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
});

for (const path of ["/", "/new"]) {
  test(`a signed-in phone refreshes the cached team in the background on ${path}`, async ({ page }) => {
    const calls = await fakeAccount(page, "google", team({ name: "Lions Reborn", squad: [player(ALI, "Ali", "batter")] }));
    await openNewMatch(page);
    await waitForSession(page);
    await page.waitForLoadState("networkidle");
    calls.myTeam = 0;
    await seedTeam(page, team({ name: "Lions" }));

    await page.goto(path);

    await expect.poll(async () => (await readStore<{ name: string }>(page, "team")).map((cached) => cached.name)).toEqual(["Lions Reborn"]);
    expect(calls.myTeam).toBe(1);
  });

  test(`a guest never refreshes or clears the cached team on ${path}`, async ({ page }) => {
    const calls = await fakeAccount(page, "guest", null);
    await openNewMatch(page);
    await waitForSession(page);
    await seedTeam(page, team());

    await page.goto(path);
    await page.waitForLoadState("networkidle");

    expect(calls.myTeam).toBe(0);
    expect((await readStore<{ name: string }>(page, "team")).map((cached) => cached.name)).toEqual(["Lions"]);
  });
}
