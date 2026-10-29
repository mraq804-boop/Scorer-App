import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { startMatch } from "./support/scoring";
import { readStore } from "./support/team";

function markSynced(page: Page, matchId: string, onTeam: boolean): Promise<void> {
  return page.evaluate(
    ({ id, team }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("cricket-scorer");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const store = db.transaction("matches", "readwrite").objectStore("matches");
          const get = store.get(id);
          get.onsuccess = () => {
            const match = get.result;
            const put = store.put({
              ...match,
              syncedSeq: match.lastSeq,
              syncState: "synced",
              ...(team ? { team: { id: "t1", side: "A", fixtureId: null, xi: [] } } : {}),
            });
            put.onerror = () => reject(put.error);
            put.onsuccess = () => {
              db.close();
              resolve();
            };
          };
        };
      }),
    { id: matchId, team: onTeam },
  );
}

test("a match is deleted from this phone from its Home card", async ({ page }) => {
  await startMatch(page);
  await page.goto("/");

  await page.getByRole("button", { name: "More for Lions vs Tigers" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("Lions vs Tigers");
  await expect(sheet).toContainText("It isn't saved online, so it will be gone for good.");
  await sheet.getByRole("button", { name: "Delete from this phone" }).click();

  await expect(page.getByText("Deleted from this phone")).toBeVisible();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText("Score your first match")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  expect(await readStore(page, "matches")).toEqual([]);
  expect(await readStore(page, "events")).toEqual([]);

  await page.getByRole("link", { name: "Start a match" }).click();
  await expect(page).toHaveURL(/\/new$/);
});

test("Cancel keeps the match and goes back to its button", async ({ page }) => {
  await startMatch(page);
  await page.goto("/");
  const more = page.getByRole("button", { name: "More for Lions vs Tigers" });

  await more.click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(more).toBeFocused();
  await expect(page.getByRole("link", { name: /Lions vs Tigers/ })).toBeVisible();
  expect(await readStore(page, "matches")).toHaveLength(1);
});

test("deleting one match keeps the others", async ({ page }) => {
  await startMatch(page, { names: { teamA: "Lions", teamB: "Kites" } });
  await startMatch(page);
  await page.goto("/");

  await page.getByRole("button", { name: "More for Lions vs Kites" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete from this phone" }).click();

  await expect(page.getByRole("link", { name: /Lions vs Kites/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Lions vs Tigers/ })).toBeVisible();
  expect((await readStore<{ title: string }>(page, "matches")).map((match) => match.title)).toEqual(["Lions vs Tigers"]);
});

test("a synced match says it stays online, and a team match says where the owner removes it", async ({ page }) => {
  const plain = await startMatch(page, { names: { teamA: "Lions", teamB: "Kites" } });
  const teamMatch = await startMatch(page);
  await markSynced(page, plain, false);
  await markSynced(page, teamMatch, true);
  await page.goto("/");

  await page.getByRole("button", { name: "More for Lions vs Kites" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("Only this phone's copy goes. It stays online for anyone with the link.");
  await expect(sheet).not.toContainText("My team → Results");
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);

  await page.getByRole("button", { name: "More for Lions vs Tigers" }).click();
  await expect(sheet).toContainText("It stays online for anyone with the link.");
  await expect(sheet).toContainText("To take it off the team page, the owner deletes it in My team → Results.");
});
