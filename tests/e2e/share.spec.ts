import { expect, test } from "@playwright/test";
import type { APIResponse, Browser, BrowserContext, Page } from "@playwright/test";
import { fakeSync, TINY_PNG } from "./support/fake-sync";
import { matchCode, runs, score, startMatch } from "./support/scoring";

const URDU_TEAM = "لاہور قلندرز";
const FORTY_CHARACTERS = "Muhammad Abdul Rahman Siddiqui Al-Hashmi";

const contexts: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
});

async function viewerPage(browser: Browser, baseURL: string | undefined): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  contexts.push(context);
  return context.newPage();
}

async function syncedMatch(page: Page, names: Parameters<typeof startMatch>[1] = {}): Promise<string> {
  const matchId = await startMatch(page, names);
  await runs(page, 1, 1);
  await expect(score(page)).toHaveText("2/0 (0.2)");
  await expect(page.getByTestId("sync-chip")).toHaveText("Synced");
  return matchCode(page, matchId);
}

async function openShare(page: Page) {
  await page.getByRole("button", { name: "Match menu" }).click();
  await page.getByRole("dialog", { name: "Match menu" }).getByRole("button", { name: "Share", exact: true }).click();
  return page.getByRole("dialog", { name: "Share this match" });
}

async function pngSize(response: APIResponse): Promise<{ width: number; height: number }> {
  const bytes = await response.body();
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("share waits for the first sync", async ({ page }) => {
  await page.route(/\/(auth|rest)\/v1\//, (route) => route.abort());
  await startMatch(page);
  await page.getByRole("button", { name: "Match menu" }).click();
  const menu = page.getByRole("dialog", { name: "Match menu" });

  await expect(menu.getByRole("button", { name: "Share", exact: true })).toBeDisabled();
  await expect(menu.getByText("Sharing opens once this match has synced.")).toBeVisible();
});

type Browserish = {
  share: "accept" | "refuse" | "cancel" | "missing";
  canShare?: boolean;
  popups?: "allowed" | "blocked";
};

type Shared = { text?: string; files?: { name: string; type: string }[] };

type StubbedWindow = { __shared: Shared[]; __opened: string[]; __popups: string };

async function stubBrowser(page: Page, options: Browserish): Promise<void> {
  await page.addInitScript((stub) => {
    const stubbed = window as unknown as StubbedWindow;
    stubbed.__shared = [];
    stubbed.__opened = [];
    stubbed.__popups = stub.popups ?? "allowed";
    const actions = {
      accept: async (data: { text?: string; files?: File[] }) => {
        stubbed.__shared.push({ text: data.text, files: data.files?.map((file) => ({ name: file.name, type: file.type })) });
      },
      refuse: async () => {
        throw new DOMException("Must be handling a user gesture", "NotAllowedError");
      },
      cancel: async () => {
        throw new DOMException("Share canceled", "AbortError");
      },
      missing: undefined,
    };
    Object.defineProperty(navigator, "share", { value: actions[stub.share], configurable: true });
    Object.defineProperty(navigator, "canShare", { value: stub.canShare ? () => true : undefined, configurable: true });
    window.open = (url) => {
      stubbed.__opened.push(String(url));
      return stubbed.__popups === "allowed" ? ({} as Window) : null;
    };
  }, options);
}

async function stubCard(page: Page): Promise<string[]> {
  const requests: string[] = [];
  await page.route(/\/m\/[^/]+\/card$/, (route) => {
    requests.push(route.request().url());
    return route.fulfill({ body: TINY_PNG, contentType: "image/png" });
  });
  return requests;
}

function shared(page: Page): Promise<Shared[]> {
  return page.evaluate(() => (window as unknown as StubbedWindow).__shared);
}

function opened(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as StubbedWindow).__opened);
}

test.describe("sharing when the browser or the connection is not helping", () => {
  const WHATSAPP_MISSED = "WhatsApp didn't open. Tap to try again.";
  const SHEET_MISSED = "Your phone didn't open the share sheet.";

  test("the card is ready when the share sheet opens, so the tap shares it at once", async ({ page }) => {
    await fakeSync(page);
    await stubBrowser(page, { share: "accept", canShare: true });
    const cardRequests = await stubCard(page);
    const code = await syncedMatch(page);

    const sheet = await openShare(page);
    await expect.poll(() => cardRequests.length).toBe(1);
    await sheet.getByRole("button", { name: "Share result poster" }).click();

    await expect.poll(async () => (await shared(page)).length).toBe(1);
    expect(cardRequests).toHaveLength(1);
    expect((await shared(page))[0].files).toEqual([{ name: `scorecard-${code}.png`, type: "image/png" }]);
  });

  test("a slow sync is waited for before the text is shared", async ({ page }) => {
    const sync = await fakeSync(page);
    await stubBrowser(page, { share: "accept" });
    await stubCard(page);
    await syncedMatch(page);
    sync.delayPushes(1500);
    await runs(page, 1);
    await expect(score(page)).toHaveText("3/0 (0.3)");

    const sheet = await openShare(page);
    await sheet.getByRole("link", { name: "Share on WhatsApp" }).click();

    await expect.poll(async () => (await shared(page)).length, { timeout: 10_000 }).toBe(1);
    expect((await shared(page))[0].text).toContain("Lions 3/0 (0.3 ov)");
  });

  test("a refused share sheet offers WhatsApp again", async ({ page }) => {
    await fakeSync(page);
    await stubBrowser(page, { share: "refuse", popups: "blocked" });
    await stubCard(page);
    await syncedMatch(page);
    const sheet = await openShare(page);

    await sheet.getByRole("link", { name: "Share on WhatsApp" }).click();
    await expect(page.getByText(WHATSAPP_MISSED)).toBeVisible();

    await page.evaluate(() => ((window as unknown as StubbedWindow).__popups = "allowed"));
    await page.getByRole("button", { name: "Open WhatsApp" }).click();
    expect((await opened(page)).at(-1)).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });

  test("a blocked popup offers WhatsApp again", async ({ page }) => {
    await fakeSync(page);
    await stubBrowser(page, { share: "missing", popups: "blocked" });
    await stubCard(page);
    await syncedMatch(page);
    const sheet = await openShare(page);

    await sheet.getByRole("link", { name: "Share on WhatsApp" }).click();
    await expect(page.getByText(WHATSAPP_MISSED)).toBeVisible();
    expect(await opened(page)).toHaveLength(1);

    await page.evaluate(() => ((window as unknown as StubbedWindow).__popups = "allowed"));
    await page.getByRole("button", { name: "Open WhatsApp" }).click();
    expect(await opened(page)).toHaveLength(2);
  });

  test("a scorecard image the phone refuses to share can be saved", async ({ page }) => {
    await fakeSync(page);
    await stubBrowser(page, { share: "refuse", canShare: true });
    await stubCard(page);
    const code = await syncedMatch(page);
    const sheet = await openShare(page);

    await sheet.getByRole("button", { name: "Share result poster" }).click();
    await expect(page.getByText(SHEET_MISSED)).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save image" }).click();
    expect((await download).suggestedFilename()).toBe(`scorecard-${code}.png`);
  });

  test("cancelling the share sheet says nothing", async ({ page }) => {
    await fakeSync(page);
    await stubBrowser(page, { share: "cancel", canShare: true });
    await stubCard(page);
    await syncedMatch(page);
    const sheet = await openShare(page);

    await sheet.getByRole("link", { name: "Share on WhatsApp" }).click();
    await sheet.getByRole("button", { name: "Share result poster" }).click();

    await expect(sheet.getByRole("button", { name: "Share result poster" })).toBeEnabled();
    await expect(page.getByText(WHATSAPP_MISSED)).toHaveCount(0);
    await expect(page.getByText(SHEET_MISSED)).toHaveCount(0);
  });

  test("a card that cannot be made says so", async ({ page }) => {
    await fakeSync(page);
    await stubBrowser(page, { share: "accept", canShare: true });
    await page.route(/\/m\/[^/]+\/card$/, (route) => route.fulfill({ status: 500, body: "{}" }));
    await syncedMatch(page);
    const sheet = await openShare(page);

    await sheet.getByRole("button", { name: "Share result poster" }).click();

    await expect(page.getByText("Couldn't make the result poster.")).toBeVisible();
    expect(await shared(page)).toHaveLength(0);
  });
});

test.describe("with a backend", () => {
  test.skip(process.env.E2E_BACKEND !== "1", "needs a Supabase project: set E2E_BACKEND=1");

  test("card renders Urdu and long names", async ({ page, request }) => {
    const code = await syncedMatch(page, {
      names: { teamA: URDU_TEAM, striker: FORTY_CHARACTERS, nonStriker: "عثمان 🏏", bowler: "ٹیپو سلطان" },
    });

    const card = await request.get(`/m/${code}/card`);
    expect(card.status()).toBe(200);
    expect(card.headers()["content-type"]).toBe("image/png");
    expect(await pngSize(card)).toEqual({ width: 1080, height: 1350 });

    const preview = await request.get(`/m/${code}/opengraph-image`);
    expect(preview.status()).toBe(200);
    expect(preview.headers()["content-type"]).toBe("image/png");
    expect(await pngSize(preview)).toEqual({ width: 1200, height: 630 });
  });

  test("unknown codes have no images", async ({ request }) => {
    expect((await request.get("/m/zzzzzzzz/card")).status()).toBe(404);
    expect((await request.get("/m/zzzzzzzz/opengraph-image")).status()).toBe(404);
    expect((await request.get("/m/not-a-code/card")).status()).toBe(404);
  });

  test("the live page links the preview image", async ({ page, browser, baseURL }) => {
    const code = await syncedMatch(page);
    const viewer = await viewerPage(browser, baseURL);
    await viewer.goto(`/m/${code}`);

    await expect(viewer.locator('meta[property="og:image"]')).toHaveAttribute("content", new RegExp(`/m/${code}/opengraph-image`));
  });

  test("WhatsApp fallback link", async ({ page, browser, baseURL }) => {
    const code = await syncedMatch(page);
    const viewer = await viewerPage(browser, baseURL);
    await viewer.addInitScript(() => {
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
      Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
    });
    await viewer.context().route("https://wa.me/**", (route) => route.fulfill({ body: "ok", contentType: "text/plain" }));
    await viewer.goto(`/m/${code}`);

    const link = viewer.getByRole("link", { name: "Share on WhatsApp" });
    const href = (await link.getAttribute("href")) ?? "";
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    const text = decodeURIComponent(href.slice("https://wa.me/?text=".length));
    expect(text).toMatch(new RegExp(`^Lions vs Tigers\\nLions 2/0 \\(0\\.2 ov\\)\\nLive: .+/m/${code}$`));

    const opened = viewer.context().waitForEvent("page");
    await link.click();
    expect((await opened).url()).toBe(href);
  });

  test("the live page fetches the card when the image button is pressed and shares that file", async ({ page, browser, baseURL }) => {
    const code = await syncedMatch(page);
    const viewer = await viewerPage(browser, baseURL);
    await stubBrowser(viewer, { share: "accept", canShare: true });
    const cardRequests: string[] = [];
    viewer.on("request", (request) => {
      if (request.url().endsWith(`/m/${code}/card`)) cardRequests.push(request.url());
    });
    await viewer.goto(`/m/${code}`);
    expect(cardRequests).toHaveLength(0);

    const button = viewer.getByRole("button", { name: "Share result poster" });
    await button.dispatchEvent("pointerdown");
    await expect.poll(() => cardRequests.length).toBe(1);
    await button.click();

    await expect.poll(async () => (await shared(viewer)).length).toBe(1);
    expect(cardRequests).toHaveLength(1);
    expect((await shared(viewer))[0].files).toEqual([{ name: `scorecard-${code}.png`, type: "image/png" }]);
  });

  test("the scoring screen shares through the phone's share sheet", async ({ page }) => {
    await page.addInitScript(() => {
      const shared: { text?: string; files?: { name: string; type: string; size: number }[] }[] = [];
      Object.defineProperty(window, "__shared", { value: shared });
      Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data: { text?: string; files?: File[] }) => {
          shared.push({
            text: data.text,
            files: data.files?.map((file) => ({ name: file.name, type: file.type, size: file.size })),
          });
        },
      });
    });
    const code = await syncedMatch(page);
    const sheet = await openShare(page);

    await sheet.getByRole("link", { name: "Share on WhatsApp" }).click();
    await sheet.getByRole("button", { name: "Share result poster" }).click();

    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared.length))
      .toBe(2);
    const [text, image] = await page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared);
    expect(text).toMatchObject({ text: expect.stringMatching(new RegExp(`^Lions vs Tigers\\nLions 2/0 \\(0\\.2 ov\\)\\nLive: .+/m/${code}$`)) });
    expect(image).toMatchObject({ files: [{ name: `scorecard-${code}.png`, type: "image/png", size: expect.any(Number) }] });
  });

  test("the scorecard image downloads when files cannot be shared", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "canShare", { value: () => false, configurable: true });
    });
    const code = await syncedMatch(page);
    const sheet = await openShare(page);

    const download = page.waitForEvent("download");
    await sheet.getByRole("button", { name: "Share result poster" }).click();
    expect((await download).suggestedFilename()).toBe(`scorecard-${code}.png`);
  });
});
