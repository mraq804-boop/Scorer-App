import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EngineError, defaultRules, deliveryDraft, replay } from "@/lib/scoring";
import type { EventDraft } from "@/lib/scoring";
import { CODE_RE, newMatchCode } from "@/lib/local/code";
import { LocalDb, checkStorage } from "@/lib/local/db";
import type { LocalMatch } from "@/lib/local/db";
import {
  appendEvents,
  backfillWinners,
  createLocalMatch,
  getDeviceId,
  loadEvents,
  recentPlayerNames,
  removeLocalMatch,
} from "@/lib/local/matches";
import type { MatchSetup } from "@/lib/local/matches";
import { summarize } from "@/lib/share/summary";
import { TestMatch } from "../../helpers/match";

const opened: LocalDb[] = [];

function freshDb(name = `test-${crypto.randomUUID()}`): LocalDb {
  const db = new LocalDb(name);
  opened.push(db);
  return db;
}

function setup(overrides: Partial<MatchSetup> = {}): MatchSetup {
  return {
    teams: ["Lions", "Tigers"],
    rules: defaultRules("tape", 10),
    toss: { winner: "A", choice: "bat" },
    striker: "Ali",
    nonStriker: "Usman",
    bowler: "Hamza",
    ...overrides,
  };
}

async function dotBall(db: LocalDb, matchId: string): Promise<EventDraft> {
  return deliveryDraft(replay(await loadEvents(db, matchId)), { runs: 0 });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  for (const db of opened.splice(0)) db.close();
});

describe("newMatchCode", () => {
  it("returns 8 unambiguous characters", () => {
    for (let i = 0; i < 500; i++) expect(CODE_RE.test(newMatchCode())).toBe(true);
  });

  it("CODE_RE rejects ambiguous characters and wrong lengths", () => {
    expect(CODE_RE.test("abcdefg0")).toBe(false);
    expect(CODE_RE.test("abcdefgi")).toBe(false);
    expect(CODE_RE.test("abcdefgl")).toBe(false);
    expect(CODE_RE.test("abcdefgo")).toBe(false);
    expect(CODE_RE.test("abcdefgA")).toBe(false);
    expect(CODE_RE.test("abcdefg")).toBe(false);
    expect(CODE_RE.test("abcdefghj")).toBe(false);
  });
});

describe("createLocalMatch", () => {
  it("createLocalMatch writes setup events", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const events = await loadEvents(db, match.id);

    expect(events.map((e) => e.type)).toEqual([
      "match_created",
      "player_added",
      "player_added",
      "player_added",
      "innings_started",
    ]);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(match.lastSeq).toBe(5);
    expect(CODE_RE.test(match.code)).toBe(true);
    expect(await db.matches.get(match.id)).toEqual(match);
  });

  it("defaults the title and records teams and rules", async () => {
    const db = freshDb();
    const rules = defaultRules("tennis", 8);
    const match = await createLocalMatch(db, setup({ rules }));

    expect(match).toMatchObject({
      title: "Lions vs Tigers",
      teams: ["Lions", "Tigers"],
      rules,
      syncedSeq: 0,
      syncState: "pending",
      blockedReason: null,
    });
    expect(match.summary).toMatchObject({ title: "Lions vs Tigers", status: "in_progress" });
  });

  it("uses a given title", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup({ title: "Friday final" }));
    expect(match.title).toBe("Friday final");
  });

  it("puts the batters on the batting team and the bowler on the other", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup({ toss: { winner: "A", choice: "bowl" } }));
    const state = replay(await loadEvents(db, match.id));
    const byName = Object.fromEntries(Object.values(state.players).map((p) => [p.name, p.team]));

    expect(byName).toEqual({ Ali: "B", Usman: "B", Hamza: "A" });
    expect(state.innings[0]).toMatchObject({ battingTeam: "B", bowlingTeam: "A" });
  });

  it("gives every player a distinct uuid and wires them into the innings", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const state = replay(await loadEvents(db, match.id));
    const [innings] = state.innings;

    expect(new Set(Object.keys(state.players)).size).toBe(3);
    expect(state.players[innings.striker!].name).toBe("Ali");
    expect(state.players[innings.nonStriker!].name).toBe("Usman");
    expect(state.players[innings.bowler!].name).toBe("Hamza");
  });
});

describe("appendEvents", () => {
  it("appendEvents assigns contiguous seq and updates summary", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const single = deliveryDraft(replay(await loadEvents(db, match.id)), { runs: 1 });
    const bystander: EventDraft = {
      type: "player_added",
      player: { id: crypto.randomUUID(), name: "Bilal", team: "B" },
    };

    const appended = await appendEvents(db, match.id, [single, bystander]);
    const stored = await db.matches.get(match.id);

    expect(appended.map((e) => e.seq)).toEqual([6, 7]);
    expect(new Set(appended.map((e) => e.id)).size).toBe(2);
    expect(stored?.lastSeq).toBe(7);
    expect(stored?.summary.lines[0]).toBe("Lions 1/0 (0.1 ov)");
    expect(stored?.syncState).toBe("pending");
    expect((await loadEvents(db, match.id)).map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("marks a synced match pending again and keeps a blocked match blocked", async () => {
    const db = freshDb();
    const synced = await createLocalMatch(db, setup());
    const blocked = await createLocalMatch(db, setup());
    await db.matches.update(synced.id, { syncState: "synced", syncedSeq: 5 });
    await db.matches.update(blocked.id, { syncState: "blocked", blockedReason: "scoring_moved" });

    await appendEvents(db, synced.id, [await dotBall(db, synced.id)]);
    await appendEvents(db, blocked.id, [await dotBall(db, blocked.id)]);

    expect(await db.matches.get(synced.id)).toMatchObject({ syncState: "pending", syncedSeq: 5 });
    expect(await db.matches.get(blocked.id)).toMatchObject({
      syncState: "blocked",
      blockedReason: "scoring_moved",
    });
  });

  it("rejects an unknown match", async () => {
    const db = freshDb();
    await expect(appendEvents(db, "missing", [{ type: "strike_swapped" }])).rejects.toThrow();
  });

  it("concurrent appendEvents get unique contiguous seq", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const tabA = freshDb(name);
    const tabB = freshDb(name);
    const match = await createLocalMatch(tabA, setup());
    const ball = await dotBall(tabA, match.id);

    const [first, second] = await Promise.all([
      appendEvents(tabA, match.id, [ball, ball]),
      appendEvents(tabB, match.id, [ball, ball]),
    ]);

    for (const batch of [first, second]) {
      expect(batch[1].seq).toBe(batch[0].seq + 1);
    }
    expect([...first, ...second].map((e) => e.seq).sort((a, b) => a - b)).toEqual([6, 7, 8, 9]);
    const stored = await loadEvents(tabA, match.id);
    expect(stored.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(new Set(stored.map((e) => e.id)).size).toBe(9);
    const after = await tabB.matches.get(match.id);
    expect(after?.lastSeq).toBe(9);
    expect(after?.summary.lines[0]).toBe("Lions 0/0 (0.4 ov)");
  });

  it("appendEvents is atomic when replay throws", async () => {
    const db = freshDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const rules = defaultRules("tape", 10);
    await db.matches.add({
      id,
      code: newMatchCode(),
      createdAt: now,
      updatedAt: now,
      lastSeq: 0,
      syncedSeq: 0,
      syncState: "synced",
      blockedReason: null,
      summary: { title: "T", teams: ["A", "B"], status: "setup", lines: [], result: null },
      rules,
      teams: ["A", "B"],
      title: "T",
    } satisfies LocalMatch);
    await appendEvents(db, id, [
      {
        type: "match_created",
        title: "T",
        teams: { A: { name: "A" }, B: { name: "B" } },
        rules,
        toss: { winner: "A", choice: "bat" },
      },
    ]);
    const before = await db.matches.get(id);

    const orphanBall: EventDraft = {
      type: "delivery",
      striker: "s",
      nonStriker: null,
      bowler: "b",
      kind: "legal",
      runs: 1,
      runsAs: "bat",
      boundary: false,
      penalty: 0,
      wicket: null,
    };
    const harmless: EventDraft = { type: "strike_swapped" };

    await expect(appendEvents(db, id, [harmless, orphanBall])).rejects.toBeInstanceOf(EngineError);

    expect(await db.events.where("matchId").equals(id).count()).toBe(1);
    expect(await db.matches.get(id)).toEqual(before);
    expect(before?.lastSeq).toBe(1);
    expect(before?.syncState).toBe("pending");
  });
});

describe("loadEvents", () => {
  it("returns one match's events in seq order without the storage matchId", async () => {
    const db = freshDb();
    const one = await createLocalMatch(db, setup());
    await createLocalMatch(db, setup());
    const events = await loadEvents(db, one.id);

    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(events.every((e) => !("matchId" in e))).toBe(true);
  });
});

describe("checkStorage", () => {
  it("checkStorage reports unavailable IndexedDB", async () => {
    const original = globalThis.indexedDB;
    Reflect.deleteProperty(globalThis, "indexedDB");
    try {
      expect(await checkStorage()).toEqual({ ok: false, reason: "unavailable" });
    } finally {
      globalThis.indexedDB = original;
    }
  });

  it("is ok when the storage estimate API is absent", async () => {
    vi.stubGlobal("navigator", {});
    expect(await checkStorage()).toEqual({ ok: true });
  });

  it("is ok at 95% of quota", async () => {
    vi.stubGlobal("navigator", { storage: { estimate: async () => ({ usage: 95, quota: 100 }) } });
    expect(await checkStorage()).toEqual({ ok: true });
  });

  it("reports quota above 95% of quota", async () => {
    vi.stubGlobal("navigator", { storage: { estimate: async () => ({ usage: 96, quota: 100 }) } });
    expect(await checkStorage()).toEqual({ ok: false, reason: "quota" });
  });
});

describe("getDeviceId", () => {
  it("getDeviceId is stable", async () => {
    const db = freshDb();
    const first = await getDeviceId(db);
    const second = await getDeviceId(db);

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(second).toBe(first);
  });

  it("is shared by concurrent first calls", async () => {
    const db = freshDb();
    const ids = await Promise.all([getDeviceId(db), getDeviceId(db), getDeviceId(db)]);
    expect(new Set(ids).size).toBe(1);
  });
});

describe("recentPlayerNames", () => {
  it("recentPlayerNames lists distinct names, most recent first, and respects limit", async () => {
    const db = freshDb();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    await createLocalMatch(db, setup());
    vi.setSystemTime(new Date("2026-01-02T10:00:00Z"));
    await createLocalMatch(db, setup({ striker: "Bilal", nonStriker: "Ali", bowler: "Zain" }));

    expect(await recentPlayerNames(db)).toEqual(["Zain", "Ali", "Bilal", "Hamza", "Usman"]);
    expect(await recentPlayerNames(db, 3)).toEqual(["Zain", "Ali", "Bilal"]);
    expect(await recentPlayerNames(db, 0)).toEqual([]);
  });

  it("includes players added while scoring", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    await appendEvents(db, match.id, [
      { type: "player_added", player: { id: crypto.randomUUID(), name: "Kamran", team: "A" } },
    ]);

    expect((await recentPlayerNames(db))[0]).toBe("Kamran");
  });

  it("is empty on a fresh database", async () => {
    expect(await recentPlayerNames(freshDb())).toEqual([]);
  });
});

describe("backfillWinners", () => {
  it("records the winner of matches finished before it was saved, once", async () => {
    const db = freshDb();
    const m = new TestMatch({ overs: 1 });
    m.ball({ runs: 4, boundary: true });
    m.endInnings("overs");
    m.startInnings2(["Zain", "Faisal"], "Usman");
    m.ball({ runs: 1 });
    m.endInnings("overs");
    const created = await createLocalMatch(db, setup());
    await db.events.where("matchId").equals(created.id).delete();
    await db.events.bulkAdd(m.events.map((event) => ({ ...event, matchId: created.id })));
    const { winner, ...older } = summarize(m.state);
    expect(winner).toBe("A");
    await db.matches.update(created.id, { summary: older });
    const before = await db.matches.get(created.id);

    expect(await backfillWinners(db)).toBe(1);
    const after = await db.matches.get(created.id);
    expect(after?.summary.winner).toBe("A");
    expect(after?.updatedAt).toBe(before?.updatedAt);
    expect(await backfillWinners(db)).toBe(0);
  });
});


describe("removeLocalMatch", () => {
  it("deletes the match with that code and only its events", async () => {
    const db = freshDb();
    const gone = await createLocalMatch(db, setup());
    const kept = await createLocalMatch(db, setup({ teams: ["Eagles", "Hawks"] }));
    await appendEvents(db, gone.id, [await dotBall(db, gone.id)]);
    const keptEvents = await loadEvents(db, kept.id);

    expect(await removeLocalMatch(db, gone.code)).toBe(true);

    expect(await db.matches.get(gone.id)).toBeUndefined();
    expect(await db.events.where("matchId").equals(gone.id).count()).toBe(0);
    expect((await db.matches.get(kept.id))?.code).toBe(kept.code);
    expect(await loadEvents(db, kept.id)).toEqual(keptEvents);
  });

  it("is false when no match on this phone has that code", async () => {
    const db = freshDb();
    const kept = await createLocalMatch(db, setup());

    expect(await removeLocalMatch(db, "zzzzzzzz")).toBe(false);

    expect(await db.matches.count()).toBe(1);
    expect((await db.matches.get(kept.id))?.code).toBe(kept.code);
  });
});
