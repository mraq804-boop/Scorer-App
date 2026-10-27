import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { CachedTeam } from "@/lib/local/db";
import { CORS, fulfillJson } from "./support/fake-sync";
import { fakeAccount, openNewMatch, team, waitForSession } from "./support/team";

const INVALID = "This invite link has expired or was already used. Ask the team owner for a new one.";

async function signedInWithInvite(page: Page, server: CachedTeam | null, accept: { status: number; body: unknown }) {
  await fakeAccount(page, "google", server);
  const tokens: string[] = [];
  await page.route("**/rest/v1/rpc/accept_scorer_invite", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    tokens.push((route.request().postDataJSON() as { p_token: string }).p_token);
    if (accept.status === 200) return fulfillJson(route, accept.body);
    return route.fulfill({
      status: accept.status,
      contentType: "application/json",
      headers: CORS,
      body: JSON.stringify(accept.body),
    });
  });
  await openNewMatch(page);
  await waitForSession(page);
  return tokens;
}

test("a guest opening an invite is asked to sign in with Google and comes back to it", async ({ page, baseURL }) => {
  const signups: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/auth/v1/signup")) signups.push(request.url());
  });
  const authorize = page.waitForRequest((request) => request.url().includes("/auth/v1/authorize"));
  await page.route("**/auth/v1/authorize*", (route) => route.fulfill({ contentType: "text/html", body: "<title>stub</title>" }));
  await page.goto("/team/join?token=tok-123");

  await expect(page.getByRole("heading", { name: "Sign in with Google to join as a scorer" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in with Google" }).click();

  const url = new URL((await authorize).url());
  expect(url.searchParams.get("redirect_to")).toBe(`${baseURL}/auth/callback?next=/team/join?token=tok-123`);
  expect(signups).toEqual([]);
});

test("an invalid invite shows a clear message", async ({ page }) => {
  const tokens = await signedInWithInvite(page, null, {
    status: 400,
    body: { code: "P0001", message: "invite_invalid", details: null, hint: null },
  });

  await page.goto("/team/join?token=used-token");

  await expect(page.getByRole("alert").filter({ hasText: INVALID })).toBeVisible();
  expect(tokens).toEqual(["used-token"]);
});

test("an invite link without a token explains itself", async ({ page }) => {
  await page.goto("/team/join");

  await expect(page.getByRole("alert").filter({ hasText: INVALID })).toBeVisible();
});

test("a valid invite makes this account a scorer and offers a match", async ({ page }) => {
  const tokens = await signedInWithInvite(page, team({ role: "scorer" }), { status: 200, body: "abcd2345" });

  await page.goto("/team/join?token=good-token");

  await expect(page.getByRole("heading", { name: "You score for Lions" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start a match" })).toHaveAttribute("href", "/new");
  expect(tokens).toEqual(["good-token"]);
});

test("the join page does not install the service worker", async ({ page }) => {
  await page.goto("/team/join?token=tok-123");
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  await page.waitForTimeout(1500);

  const registrations = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
  expect(registrations).toBe(0);
});
