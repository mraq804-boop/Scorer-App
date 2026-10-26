import type { Page, Route } from "@playwright/test";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
const USER_ID = "11111111-1111-4111-8111-111111111111";

export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

export type FakeSync = { delayPushes(ms: number): void };

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function session() {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const claims = { sub: USER_ID, role: "authenticated", aud: "authenticated", exp: expiresAt, is_anonymous: true };
  return {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.signature`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: "refresh",
    user: { id: USER_ID, aud: "authenticated", role: "authenticated", is_anonymous: true, app_metadata: {}, user_metadata: {} },
  };
}

function fulfillJson(route: Route, body: unknown): Promise<void> {
  return route.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });
}

export async function fakeSync(page: Page): Promise<FakeSync> {
  let delay = 0;
  await page.route(/\/(auth|rest)\/v1\//, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (request.url().includes("/auth/v1/")) return fulfillJson(route, session());
    const { p_events: events } = request.postDataJSON() as { p_events: { seq: number }[] };
    await new Promise((resolve) => setTimeout(resolve, delay));
    return fulfillJson(route, Math.max(0, ...events.map((event) => event.seq)));
  });
  return { delayPushes: (ms) => (delay = ms) };
}
