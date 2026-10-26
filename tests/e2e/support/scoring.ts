import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export type Setup = { overs?: number; teamAPlayers?: number };

export const BLOCKED = "Not synced — scoring moved to another phone";

export async function startMatch(page: Page, setup: Setup = {}): Promise<string> {
  await page.goto("/new");
  await page.getByRole("textbox", { name: "Team A", exact: true }).fill("Lions");
  await page.getByRole("textbox", { name: "Team B", exact: true }).fill("Tigers");
  if (setup.overs !== undefined) {
    await page.getByRole("spinbutton", { name: "Custom overs" }).fill(String(setup.overs));
  }
  if (setup.teamAPlayers !== undefined) {
    await page.getByRole("button", { name: "Rules" }).click();
    const decrease = page.getByRole("button", { name: "Decrease Team A players" });
    for (let players = 11; players > setup.teamAPlayers; players -= 1) await decrease.click();
  }
  await page.getByLabel("Striker", { exact: true }).fill("Ali");
  await page.getByLabel("Non-striker", { exact: true }).fill("Usman");
  await page.getByLabel("Opening bowler", { exact: true }).fill("Hamza");
  await page.getByRole("button", { name: "Start match" }).click();
  await expect(page).toHaveURL(/\/score\?m=/);
  await expect(score(page)).toHaveText("0/0 (0)");
  return new URL(page.url()).searchParams.get("m") ?? "";
}

export function score(page: Page) {
  return page.getByTestId("score");
}

export async function runs(page: Page, ...taps: number[]) {
  for (const tap of taps) await page.getByTestId(`run-${tap}`).click();
}

export async function wicket(page: Page, how: string) {
  await page.getByTestId("wicket").click();
  await page.getByRole("dialog", { name: "How out?" }).getByRole("button", { name: how, exact: true }).click();
}

export async function sendIn(page: Page, name: string) {
  const sheet = page.getByRole("dialog", { name: "Next batter" });
  await sheet.getByLabel("Batter's name").fill(name);
  await sheet.getByRole("button", { name: "Send in" }).click();
}

export async function changeStoredMatch(page: Page, matchId: string, change: "block" | "remove") {
  await page.evaluate(
    ({ id, change }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("cricket-scorer");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("matches", "readwrite");
          const store = tx.objectStore("matches");
          if (change === "remove") store.delete(id);
          else {
            const get = store.get(id);
            get.onsuccess = () => store.put({ ...get.result, syncState: "blocked", blockedReason: "scoring_moved" });
          }
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { id: matchId, change },
  );
}

export function matchCode(page: Page, matchId: string): Promise<string> {
  return page.evaluate(
    (id) =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open("cricket-scorer");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const get = db.transaction("matches").objectStore("matches").get(id);
          get.onerror = () => reject(get.error);
          get.onsuccess = () => {
            db.close();
            resolve(get.result.code);
          };
        };
      }),
    matchId,
  );
}
