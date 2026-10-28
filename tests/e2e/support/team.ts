import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { CachedFixture, CachedTeam } from "@/lib/local/db";
import type { SquadPlayer } from "@/lib/team";
import { CORS, fakeSession, fulfillJson } from "./fake-sync";

export const TEAM_ID = "11111111-1111-4111-8111-111111111111";

type Store = "matches" | "events" | "team" | "squadOutbox";

export function player(id: string, name: string, role: SquadPlayer["role"] = null, active = true): SquadPlayer {
  return { id, name, role, active };
}

export const ALI = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const HAMZA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const USMAN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const BILAL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
export const RAZA = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

export const FIXTURE: CachedFixture = {
  id: "33333333-3333-4333-8333-333333333333",
  startsAt: "2026-11-01T09:30:00.000Z",
  opponent: "Kites",
  ground: "Model Town Ground",
  homeAway: "away",
  overs: 15,
  status: "scheduled",
  matchCode: null,
  notes: null,
};

export function team(overrides: Partial<CachedTeam> = {}): CachedTeam {
  return {
    id: TEAM_ID,
    role: "owner",
    code: "abcd2345",
    name: "Lions",
    homeGround: "Gaddafi Stadium",
    timeZone: "Asia/Karachi",
    squad: [
      player(ALI, "Ali", "batter"),
      player(HAMZA, "Hamza", "bowler"),
      player(USMAN, "Usman", "allrounder"),
      player(BILAL, "Bilal"),
      player(RAZA, "Raza", "batter", false),
    ],
    seasons: [],
    fixtures: [FIXTURE],
    fetchedAt: "2026-10-27T08:00:00.000Z",
    ...overrides,
  };
}

export async function seedTeam(page: Page, value: CachedTeam): Promise<void> {
  await page.evaluate(
    (cached) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("cricket-scorer");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("team", "readwrite");
          const store = tx.objectStore("team");
          store.clear();
          store.put(cached);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    value,
  );
}

export function readStore<T>(page: Page, store: Store): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = indexedDB.open("cricket-scorer");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const all = db.transaction(name).objectStore(name).getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = () => {
            db.close();
            resolve(all.result);
          };
        };
      }),
    store,
  ) as Promise<T[]>;
}

export async function openNewMatch(page: Page, url = "/new"): Promise<void> {
  await page.goto(url);
  await expect(page.getByRole("button", { name: "Start match" })).toBeVisible();
}

export async function openWithTeam(page: Page, value: CachedTeam = team(), url = "/new"): Promise<void> {
  await openNewMatch(page);
  await seedTeam(page, value);
  await openNewMatch(page, url);
}

export function xiGroup(page: Page) {
  return page.getByRole("group", { name: "Playing XI" });
}

export async function fakeAccount(page: Page, kind: "google" | "guest", server: CachedTeam | null) {
  const calls = { myTeam: 0 };
  await page.route(/\/(auth|rest)\/v1\//, (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (request.url().includes("/auth/v1/")) return fulfillJson(route, fakeSession(kind === "guest"));
    if (!request.url().endsWith("/rpc/get_my_team")) return fulfillJson(route, 0);
    calls.myTeam += 1;
    if (server === null) return fulfillJson(route, null);
    const { id, code, name, homeGround, timeZone, colour, logoVersion } = server;
    return fulfillJson(route, {
      role: server.role,
      team: { id, code, name, homeGround, timeZone, colour: colour ?? null, logoVersion: logoVersion ?? null },
      squad: server.squad,
      seasons: server.seasons,
      fixtures: server.fixtures,
    });
  });
  return calls;
}

export async function waitForSession(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.cookie.includes("auth-token"))).toBe(true);
}
