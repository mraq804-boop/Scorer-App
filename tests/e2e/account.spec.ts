import { expect, test } from "@playwright/test";

test("account shows Google sign-in for guests", async ({ page }) => {
  await page.goto("/account");

  await expect(page.getByRole("heading", { name: "Sign in with Google to keep your matches" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeEnabled();
  await expect(page.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/");
});

test("account does not start a guest session or the sync loop", async ({ page }) => {
  const authRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/auth/v1/")) authRequests.push(request.url());
  });

  await page.goto("/account");
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  await page.waitForTimeout(500);

  expect(authRequests).toEqual([]);
});

test("a failed Google sign-in is explained and can be retried", async ({ page }) => {
  await page.goto("/account?error=auth");

  await expect(page.getByRole("alert").filter({ hasText: "Google sign-in didn't work. Please try again." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeEnabled();
});

test("the sign-in button sends the guest to Google and back to the account page", async ({ page, baseURL }) => {
  const authorize = page.waitForRequest((request) => request.url().includes("/auth/v1/authorize"));
  await page.route("**/auth/v1/authorize*", (route) => route.fulfill({ contentType: "text/html", body: "<title>stub</title>" }));
  await page.goto("/account");

  await page.getByRole("button", { name: "Sign in with Google" }).click();

  const url = new URL((await authorize).url());
  expect(url.searchParams.get("provider")).toBe("google");
  expect(url.searchParams.get("redirect_to")).toBe(`${baseURL}/auth/callback?next=/account`);
});
