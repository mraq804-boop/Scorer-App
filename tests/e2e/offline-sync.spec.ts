import { expect, test } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { matchCode, nextBowler, runs, score, startMatch } from "./support/scoring";

const POLL_MS = Number(process.env.NEXT_PUBLIC_POLL_MS ?? 5000);
const VIEWER_WAIT_MS = POLL_MS + 5000;
const SYNC_WAIT_MS = 20_000;

const OVERS = [
  [1, 0, 4, 2, 0, 6],
  [1, 1, 1, 1, 1, 1],
  [4, 4, 0, 0, 0, 1],
];

const contexts: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
});

async function viewerPage(browser: Browser, baseURL: string | undefined): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  contexts.push(context);
  return context.newPage();
}

function total(overs: number): number {
  return OVERS.slice(0, overs).flat().reduce((sum, taps) => sum + taps, 0);
}

function scoreLine(overs: number): string {
  return `${total(overs)}/0 (${overs})`;
}

function syncChip(page: Page) {
  return page.getByTestId("sync-chip");
}

async function installWorker(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

test.describe("with a backend", () => {
  test.skip(process.env.E2E_BACKEND !== "1", "needs a Supabase project: set E2E_BACKEND=1");
  test.skip(({ isMobile }) => !isMobile, "runs on the Pixel 7 profile");

  test("full offline match syncs and streams", async ({ page, context, browser, baseURL }) => {
    test.setTimeout(120_000);
    const missingAssets: string[] = [];
    page.on("requestfailed", (request) => {
      if (request.url().includes("/_next/static/")) missingAssets.push(request.url());
    });

    await installWorker(page);
    const matchId = await startMatch(page);
    await runs(page, ...OVERS[0]);
    await expect(score(page)).toHaveText(scoreLine(1));
    await nextBowler(page, "Saad");
    await expect(syncChip(page)).toHaveText("Synced");
    const code = await matchCode(page, matchId);

    await context.setOffline(true);
    await page.goto("/");
    await page.getByRole("link", { name: /Lions vs Tigers/ }).click();
    await expect(page).toHaveURL(/\/score\?m=/);
    await expect(score(page)).toHaveText(scoreLine(1));

    await runs(page, ...OVERS[1]);
    await nextBowler(page, "Zain");
    await runs(page, ...OVERS[2]);
    await expect(score(page)).toHaveText(scoreLine(3));
    await expect(syncChip(page)).toHaveText("Saved on phone");

    await page.reload();
    await expect(score(page)).toHaveText(scoreLine(3));
    await expect(syncChip(page)).toHaveText("Saved on phone");
    await expect(page.getByRole("dialog", { name: "Next bowler" })).toBeVisible();
    expect(missingAssets).toEqual([]);

    await context.setOffline(false);
    await expect(syncChip(page)).toHaveText("Synced", { timeout: SYNC_WAIT_MS });

    const viewer = await viewerPage(browser, baseURL);
    await viewer.goto(`/m/${code}`);
    await expect(score(viewer)).toHaveText(scoreLine(3));

    await nextBowler(page, "Bilal");
    await runs(page, 4);
    const next = `${total(3) + 4}/0 (3.1)`;
    await expect(score(page)).toHaveText(next);
    await expect(score(viewer)).toHaveText(next, { timeout: VIEWER_WAIT_MS });
    await expect(viewer.getByTestId("live-commentary").locator("li").first()).toContainText("FOUR");
  });
});
