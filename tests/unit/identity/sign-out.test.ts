import "fake-indexeddb/auto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SIGNED_OUT_KEY, resumeAfterSignIn, signOutHere } from "@/lib/identity/session";
import { LocalDb } from "@/lib/local/db";
import { createLocalMatch } from "@/lib/local/matches";
import { defaultRules } from "@/lib/scoring";
import { addSquadPlayerOffline, cacheTeam, getCachedTeam } from "@/lib/team/local";
import { cachedTeam } from "../../helpers/team";

const opened: LocalDb[] = [];

function freshDb(): LocalDb {
  const db = new LocalDb(`test-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
}

type Failure = { error: Error; dropsSession: boolean };

function fakeClient(user: { id: string; is_anonymous: boolean } | null, failure: Failure | null = null) {
  let current = user;
  const signOut = vi.fn(async () => {
    if (failure === null || failure.dropsSession) current = null;
    return { error: failure?.error ?? null };
  });
  const getSession = vi.fn(async () => ({ data: { session: current === null ? null : { user: current } }, error: null }));
  return { client: { auth: { signOut, getSession } } as unknown as SupabaseClient, signOut };
}

function newMatch(db: LocalDb) {
  return createLocalMatch(db, {
    teams: ["Lions", "Tigers"],
    rules: defaultRules("tape", 10),
    toss: { winner: "A", choice: "bat" },
    striker: "Ali",
    nonStriker: "Usman",
    bowler: "Hamza",
  });
}

afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

describe("signOutHere", () => {
  it("signs out on this phone only, drops My team and keeps the matches", async () => {
    const db = freshDb();
    const match = await newMatch(db);
    await cacheTeam(db, cachedTeam());
    await addSquadPlayerOffline(db, { name: "Zain", role: null });
    const { client, signOut } = fakeClient({ id: "google-1", is_anonymous: false });

    expect(await signOutHere(client, db)).toBe(true);

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(await getCachedTeam(db)).toBeUndefined();
    expect(await db.squadOutbox.count()).toBe(1);
    expect((await db.matches.get(match.id))?.code).toBe(match.code);
    expect(await db.meta.get(SIGNED_OUT_KEY)).toEqual({ key: SIGNED_OUT_KEY, value: "google-1" });
  });

  it("counts as signed out when the server can't be reached but the session is gone", async () => {
    const db = freshDb();
    await cacheTeam(db, cachedTeam());
    const { client } = fakeClient({ id: "google-1", is_anonymous: false }, { error: new Error("Failed to fetch"), dropsSession: true });

    expect(await signOutHere(client, db)).toBe(true);

    expect(await getCachedTeam(db)).toBeUndefined();
    expect(await db.meta.get(SIGNED_OUT_KEY)).toEqual({ key: SIGNED_OUT_KEY, value: "google-1" });
  });

  it("keeps everything when the session is still there after a failed sign-out", async () => {
    const db = freshDb();
    await cacheTeam(db, cachedTeam());
    const { client } = fakeClient({ id: "google-1", is_anonymous: false }, { error: new Error("Server error"), dropsSession: false });

    expect(await signOutHere(client, db)).toBe(false);

    expect(await getCachedTeam(db)).toBeDefined();
    expect(await db.meta.get(SIGNED_OUT_KEY)).toBeUndefined();
  });
});

describe("resumeAfterSignIn", () => {
  it("lets matches refused while signed out sync again once a Google account is back", async () => {
    const db = freshDb();
    const refused = await newMatch(db);
    const moved = await newMatch(db);
    await db.matches.update(refused.id, { syncState: "blocked", blockedReason: "not_owner" });
    await db.matches.update(moved.id, { syncState: "blocked", blockedReason: "scoring_moved" });
    await db.meta.put({ key: SIGNED_OUT_KEY, value: "google-1" });
    const { client } = fakeClient({ id: "google-1", is_anonymous: false });

    expect(await resumeAfterSignIn(client, db)).toBe(1);

    expect(await db.matches.get(refused.id)).toMatchObject({ syncState: "pending", blockedReason: null });
    expect(await db.matches.get(moved.id)).toMatchObject({ syncState: "blocked", blockedReason: "scoring_moved" });
    expect(await db.meta.get(SIGNED_OUT_KEY)).toBeUndefined();
  });

  it("waits while the phone is still a guest, and does nothing without a sign-out", async () => {
    const db = freshDb();
    const refused = await newMatch(db);
    await db.matches.update(refused.id, { syncState: "blocked", blockedReason: "not_owner" });
    await db.meta.put({ key: SIGNED_OUT_KEY, value: "google-1" });

    expect(await resumeAfterSignIn(fakeClient({ id: "guest-1", is_anonymous: true }).client, db)).toBe(0);
    expect(await db.matches.get(refused.id)).toMatchObject({ syncState: "blocked" });
    expect(await db.meta.get(SIGNED_OUT_KEY)).toBeDefined();

    await db.meta.delete(SIGNED_OUT_KEY);
    expect(await resumeAfterSignIn(fakeClient({ id: "google-1", is_anonymous: false }).client, db)).toBe(0);
    expect(await db.matches.get(refused.id)).toMatchObject({ syncState: "blocked" });
  });
});
