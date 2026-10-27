import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalDb } from "@/lib/local/db";
import type { LocalMatch, StoredEvent } from "@/lib/local/db";
import { summarize } from "@/lib/share/summary";
import {
  addSquadPlayerOffline,
  cacheTeam,
  clearCachedTeam,
  getCachedTeam,
  getSquadOutbox,
  removeFromSquadOutbox,
} from "@/lib/team/local";
import { TestMatch } from "../../helpers/match";
import { cachedTeam } from "../../helpers/team";

const opened: Dexie[] = [];

function freshDb(): LocalDb {
  const db = new LocalDb(`test-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const db of opened.splice(0)) db.close();
});

describe("database version 2", () => {
  it("keeps every version 1 match, event and meta row and adds the team stores", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const v1 = new Dexie(name);
    opened.push(v1);
    v1.version(1).stores({
      matches: "id, code, updatedAt",
      events: "[matchId+seq], id, matchId",
      meta: "key",
    });
    const source = new TestMatch({ overs: 2 });
    source.ball({ runs: 4, boundary: true });
    const stamp = "2026-10-20T10:00:00.000Z";
    const match: LocalMatch = {
      id: "m1",
      code: "abcdefgh",
      createdAt: stamp,
      updatedAt: stamp,
      lastSeq: source.events.length,
      syncedSeq: 3,
      syncState: "pending",
      blockedReason: null,
      summary: summarize(source.state),
      rules: source.state.rules,
      teams: ["Lions", "Tigers"],
      title: "Lions v Tigers",
    };
    const events: StoredEvent[] = source.events.map((event) => ({ ...event, matchId: "m1" }));
    await v1.table("matches").put(match);
    await v1.table("events").bulkPut(events);
    await v1.table("meta").put({ key: "deviceId", value: "device-1" });
    v1.close();

    const db = new LocalDb(name);
    opened.push(db);
    await db.open();

    expect(db.verno).toBe(2);
    expect(db.tables.map((table) => table.name).sort()).toEqual(["events", "matches", "meta", "squadOutbox", "team"]);
    expect(await db.matches.toArray()).toEqual([match]);
    expect(await db.matches.orderBy("updatedAt").keys()).toEqual([stamp]);
    expect(await db.matches.where("code").equals("abcdefgh").count()).toBe(1);
    expect(await db.events.where("[matchId+seq]").between(["m1", 1], ["m1", Infinity]).toArray()).toEqual(events);
    expect(await db.events.where("id").equals(events[2].id).count()).toBe(1);
    expect(await db.meta.get("deviceId")).toEqual({ key: "deviceId", value: "device-1" });
    expect(await getCachedTeam(db)).toBeUndefined();
    expect(await db.squadOutbox.count()).toBe(0);
  });
});

describe("cached team", () => {
  it("is empty until a team is cached", async () => {
    expect(await getCachedTeam(freshDb())).toBeUndefined();
  });

  it("stores the team and reads it back", async () => {
    const db = freshDb();
    const team = cachedTeam();

    await cacheTeam(db, team);

    expect(await getCachedTeam(db)).toEqual(team);
  });

  it("replaces the previous team instead of keeping both", async () => {
    const db = freshDb();
    await cacheTeam(db, cachedTeam({ name: "Lions" }));
    const other = cachedTeam({ id: "33333333-3333-4333-8333-333333333333", name: "Tigers", code: "wxyz6789" });

    await cacheTeam(db, other);

    expect(await db.team.count()).toBe(1);
    expect(await getCachedTeam(db)).toEqual(other);
  });

  it("clears the cached team", async () => {
    const db = freshDb();
    await cacheTeam(db, cachedTeam());

    await clearCachedTeam(db);

    expect(await getCachedTeam(db)).toBeUndefined();
  });
});

describe("addSquadPlayerOffline", () => {
  it("adds a new active player to the cached squad and the outbox", async () => {
    const db = freshDb();
    const team = cachedTeam();
    await cacheTeam(db, team);

    const player = await addSquadPlayerOffline(db, { name: "Zain", role: "keeper" });

    expect(player).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), name: "Zain", role: "keeper", active: true });
    expect((await getCachedTeam(db))?.squad).toEqual([...team.squad, player]);
    expect(await db.squadOutbox.toArray()).toEqual([{ ...player, teamId: team.id }]);
    expect(await getSquadOutbox(db, team.id)).toEqual([player]);
  });

  it("gives every player its own id, even with the same name", async () => {
    const db = freshDb();
    await cacheTeam(db, cachedTeam());

    const first = await addSquadPlayerOffline(db, { name: "Ali", role: null });
    const second = await addSquadPlayerOffline(db, { name: "Ali", role: null });

    expect(first.id).not.toBe(second.id);
    expect(await db.squadOutbox.count()).toBe(2);
  });

  it("writes both stores or neither", async () => {
    const db = freshDb();
    const team = cachedTeam();
    await cacheTeam(db, team);
    vi.spyOn(db.squadOutbox, "add").mockRejectedValue(new Error("disk full"));

    await expect(addSquadPlayerOffline(db, { name: "Zain", role: null })).rejects.toThrow("disk full");

    expect(await getCachedTeam(db)).toEqual(team);
    expect(await db.squadOutbox.count()).toBe(0);
  });

  it("refuses when no team is cached", async () => {
    const db = freshDb();

    await expect(addSquadPlayerOffline(db, { name: "Zain", role: null })).rejects.toThrow("No cached team");

    expect(await db.squadOutbox.count()).toBe(0);
  });
});

describe("squad outbox", () => {
  it("lists only the players added for that team", async () => {
    const db = freshDb();
    await cacheTeam(db, cachedTeam());
    const mine = await addSquadPlayerOffline(db, { name: "Zain", role: null });
    await db.squadOutbox.put({ id: crypto.randomUUID(), name: "Stray", role: null, active: true, teamId: "someone-else" });

    expect(await getSquadOutbox(db, cachedTeam().id)).toEqual([mine]);
  });

  it("removes exactly the given ids", async () => {
    const db = freshDb();
    await cacheTeam(db, cachedTeam());
    const first = await addSquadPlayerOffline(db, { name: "Zain", role: null });
    const second = await addSquadPlayerOffline(db, { name: "Bilal", role: null });

    await removeFromSquadOutbox(db, [first.id, crypto.randomUUID()]);

    expect(await getSquadOutbox(db, cachedTeam().id)).toEqual([second]);
  });
});
