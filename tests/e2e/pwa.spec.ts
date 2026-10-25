import { expect, test } from "@playwright/test";

test("manifest is installable", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ id: "/", name: "Cricket Scorer", start_url: "/", display: "standalone" });
  expect(manifest.shortcuts).toEqual(expect.arrayContaining([expect.objectContaining({ name: "New match", url: "/new" })]));
  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  for (const icon of manifest.icons) {
    const img = await request.get(icon.src);
    expect(img.headers()["content-type"]).toBe("image/png");
  }
});

test("service worker is served uncached", async ({ request }) => {
  const res = await request.get("/sw.js");
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(res.headers()["content-type"]).toContain("javascript");
});

test("scoring shell loads offline", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

  await context.setOffline(true);
  const response = await page.goto("/score?m=unknown");
  expect(response?.ok()).toBe(true);
  expect(await response?.text()).toContain('data-testid="score-shell"');
  await expect(page.getByTestId("score-shell")).toBeVisible();
  await expect(page.locator('[data-match-id="unknown"]')).toBeVisible();
  await context.setOffline(false);
});

test("pages outside the shell fall back to the offline screen", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

  await context.setOffline(true);
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await context.setOffline(false);
});

test("the install precaches every shell page, the offline screen and every asset they reference", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

  const { cached, referenced, uncached } = await page.evaluate(async () => {
    const names = await caches.keys();
    const shell = await caches.open(names.find((name) => name.startsWith("cs-shell-"))!);
    const assets = await caches.open(names.find((name) => name.startsWith("cs-static-"))!);
    const cachedPaths: string[] = [];
    for (const name of names) {
      for (const request of await (await caches.open(name)).keys()) cachedPaths.push(new URL(request.url).pathname);
    }
    const cachedAssets = new Set((await assets.keys()).map((request) => new URL(request.url).pathname + new URL(request.url).search));
    const urls = new Set<string>();
    for (const path of ["/", "/new", "/score", "/offline"]) {
      const html = await (await shell.match(path))!.text();
      for (const url of html.match(/\/_next\/static\/[^"'\s)<>\\]+/g) ?? []) urls.add(url);
    }
    return { cached: cachedPaths, referenced: [...urls], uncached: [...urls].filter((url) => !cachedAssets.has(url)) };
  });

  for (const path of ["/", "/new", "/score", "/offline", "/manifest.webmanifest", "/icons/192", "/icons/512"]) {
    expect(cached).toContain(path);
  }
  expect(referenced.some((url) => url.endsWith(".js"))).toBe(true);
  expect(referenced.some((url) => url.endsWith(".css"))).toBe(true);
  expect(uncached).toEqual([]);
});

test("live match pages do not install the service worker", async ({ page }) => {
  await page.goto("/m/abcd2345");
  await page.waitForTimeout(1500);
  const registrations = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
  expect(registrations).toBe(0);
});
