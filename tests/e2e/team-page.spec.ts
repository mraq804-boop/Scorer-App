import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const FORBIDDEN_MODULES = [
  "/src/components/scoring/",
  "/src/components/guest-session",
  "/src/lib/local/",
  "/src/lib/sync/",
  "/src/lib/identity/",
  "/node_modules/dexie/",
  "/node_modules/@supabase/",
];

const FORBIDDEN_CODE: Record<string, RegExp> = {
  dexie: /Dexie/,
  "supabase-js": /supabase-js|GoTrueClient/,
  turnstile: /challenges\.cloudflare\.com/,
  scoring: /sync-chip/,
};

type Manifest = { clientModules: Record<string, unknown>; entryJSFiles: Record<string, string[]> };

function clientBundle(route: string): { modules: string[]; code: string } {
  const source = readFileSync(join(".next", "server", "app", ...route.split("/"), "page_client-reference-manifest.js"), "utf8");
  const manifest = JSON.parse(/= (\{.*\});?\s*$/s.exec(source)?.[1] ?? "{}") as Manifest;
  const entry = Object.keys(manifest.entryJSFiles).find((key) => key.endsWith(`/src/app/${route}/page`));
  const files = entry === undefined ? [] : manifest.entryJSFiles[entry];
  return {
    modules: Object.keys(manifest.clientModules),
    code: files.map((file) => readFileSync(join(".next", file), "utf8")).join("\n"),
  };
}

test("a malformed team code is a 404 without a database", async ({ page, request }) => {
  expect((await page.goto("/t/not-a-code"))?.status()).toBe(404);
  expect((await page.goto("/t/not-a-code/p/not-a-player"))?.status()).toBe(404);
  expect((await request.get("/t/not-a-code/opengraph-image")).status()).toBe(404);
});

for (const route of ["t/[code]", "t/[code]/p/[playerId]"]) {
  test(`the public page ${route} ships no scoring, storage or sign-in code`, () => {
    const { modules, code } = clientBundle(route);
    expect(code.length).toBeGreaterThan(0);
    expect(modules.filter((module) => FORBIDDEN_MODULES.some((path) => module.includes(path)))).toEqual([]);
    expect(Object.keys(FORBIDDEN_CODE).filter((name) => FORBIDDEN_CODE[name].test(code))).toEqual([]);
  });
}

test.describe("with a backend", () => {
  test.skip(
    process.env.E2E_BACKEND !== "1" || process.env.E2E_TEAM_CODE === undefined,
    "needs a Supabase project and a team: set E2E_BACKEND=1 and E2E_TEAM_CODE",
  );

  test("the team page renders an existing team", async ({ page }) => {
    const response = await page.goto(`/t/${process.env.E2E_TEAM_CODE}?season=all`);
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Recent results" })).toBeVisible();
    for (const group of ["Batting", "Bowling", "Fielding", "MVP"]) {
      await expect(page.getByRole("region", { name: group })).toBeVisible();
    }
  });
});
