import { expect, test } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { matchCode, runs, score, startMatch } from "./support/scoring";

const POLL_MS = Number(process.env.NEXT_PUBLIC_POLL_MS ?? 5000);
const REALTIME_WAIT_MS = 10_000;

const contexts: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
});

async function viewerPage(browser: Browser, baseURL: string | undefined): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  contexts.push(context);
  return context.newPage();
}

function joinedMatchChannel(page: Page): Promise<void> {
  return new Promise((resolve) => {
    page.on("websocket", (socket) => {
      socket.on("framereceived", ({ payload }) => {
        if (typeof payload !== "string") return;
        if (payload.includes("realtime:match:") && payload.includes("phx_reply") && payload.includes('"status":"ok"')) resolve();
      });
    });
  });
}

async function scoreTwoBalls(page: Page): Promise<string> {
  const matchId = await startMatch(page);
  await runs(page, 1, 1);
  await expect(score(page)).toHaveText("2/0 (0.2)");
  await expect(page.getByTestId("sync-chip")).toHaveText("Synced");
  return matchCode(page, matchId);
}

test("a malformed code is a 404 without a database", async ({ page, request }) => {
  const response = await page.goto("/m/not-a-code");
  expect(response?.status()).toBe(404);
  expect((await request.get("/api/m/not-a-code/events")).status()).toBe(404);
  expect((await request.get("/api/m/abcd2345/events?after=-1")).status()).toBe(400);
});

test.describe("with a backend", () => {
  test.skip(process.env.E2E_BACKEND !== "1", "needs a Supabase project: set E2E_BACKEND=1");

  test("viewer sees balls live", async ({ page, browser, baseURL }) => {
    const code = await scoreTwoBalls(page);

    const viewer = await viewerPage(browser, baseURL);
    await viewer.route("**/api/m/*/events*", (route) => route.abort());
    const joined = joinedMatchChannel(viewer);
    await viewer.goto(`/m/${code}`);
    await expect(score(viewer)).toContainText("2/0");
    await joined;

    await runs(page, 4);
    await expect(score(viewer)).toContainText("6/0", { timeout: REALTIME_WAIT_MS });
    await expect(viewer.getByTestId("live-commentary").locator("li").first()).toContainText("FOUR");
  });

  test("polling fallback", async ({ page, browser, baseURL }) => {
    const code = await scoreTwoBalls(page);

    const viewer = await viewerPage(browser, baseURL);
    await viewer.routeWebSocket(/realtime/, (ws) => ws.close());
    await viewer.goto(`/m/${code}`);
    await expect(score(viewer)).toContainText("2/0");

    const polledNewBall = viewer.waitForResponse(
      async (response) =>
        response.url().includes(`/api/m/${code}/events`) &&
        response.ok() &&
        ((await response.json()) as { events: unknown[] }).events.length > 0,
    );
    await runs(page, 4);
    await expect(score(viewer)).toContainText("6/0", { timeout: POLL_MS + 5000 });
    await polledNewBall;
  });

  test("unknown code is 404", async ({ page, request }) => {
    const response = await page.goto("/m/zzzzzzzz");
    expect(response?.status()).toBe(404);
    expect((await request.get("/api/m/zzzzzzzz/events?after=0")).status()).toBe(404);
  });
});
