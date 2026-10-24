import "fake-indexeddb/auto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultRules, deliveryDraft, replay } from "@/lib/scoring";
import type { EventDraft, MatchEvent } from "@/lib/scoring";
import { CODE_RE } from "@/lib/local/code";
import { LocalDb } from "@/lib/local/db";
import { appendEvents, createLocalMatch, getDeviceId, loadEvents } from "@/lib/local/matches";
import type { MatchSetup } from "@/lib/local/matches";
import { supabasePush } from "@/lib/sync/push";
import type { PushFn, PushResult } from "@/lib/sync/push";
import { nextDelay, requestSync, startSyncLoop, syncAll, syncMatch } from "@/lib/sync/sync";
import { fromWire, toWire } from "@/lib/sync/wire";
import { TestMatch } from "../../helpers/match";

type PushCall = Parameters<PushFn>[0];

const opened: LocalDb[] = [];
const stops: Array<() => void> = [];

const NETWORK: PushResult = { ok: false, error: "network" };

function freshDb(): LocalDb {
  const db = new LocalDb(`test-${crypto.randomUUID()}`);
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

async function addBalls(db: LocalDb, matchId: string, count: number): Promise<void> {
  for (let i = 0; i < count; i++) await appendEvents(db, matchId, [await dotBall(db, matchId)]);
}

function server(responses: PushResult[] = [], initialSeq = 0) {
  const calls: PushCall[] = [];
  const queue = [...responses];
  let serverSeq = initialSeq;
  const push: PushFn = async (args) => {
    calls.push(args);
    const scripted = queue.shift();
    if (scripted !== undefined) {
      if (scripted.ok) serverSeq = scripted.lastSeq;
      return scripted;
    }
    for (const event of args.events) if (event.seq === serverSeq + 1) serverSeq = event.seq;
    return { ok: true, lastSeq: serverSeq };
  };
  return { push, calls, seqs: () => calls.map((call) => call.events.map((e) => e.seq)) };
}

async function until(condition: () => boolean | Promise<boolean>): Promise<void> {
  for (let i = 0; i < 500; i++) {
    if (await condition()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("condition was never met");
}

async function settle(): Promise<void> {
  for (let i = 0; i < 50; i++) await new Promise<void>((resolve) => setImmediate(resolve));
}

async function seedFromEvents(db: LocalDb, events: MatchEvent[]): Promise<string> {
  const id = crypto.randomUUID();
  const state = replay(events);
  const now = new Date().toISOString();
  await db.matches.add({
    id,
    code: "abcdefgh",
    createdAt: now,
    updatedAt: now,
    lastSeq: events.length,
    syncedSeq: 0,
    syncState: "pending",
    blockedReason: null,
    summary: { title: state.title, teams: [state.teams.A.name, state.teams.B.name], status: state.status, lines: [], result: null },
    rules: state.rules,
    teams: [state.teams.A.name, state.teams.B.name],
    title: state.title,
  });
  await db.events.bulkAdd(events.map((event) => ({ ...event, matchId: id })));
  return id;
}

function startLoop(options: Parameters<typeof startSyncLoop>[0]): () => void {
  const stop = startSyncLoop(options);
  stops.push(stop);
  return stop;
}

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  for (const db of opened.splice(0)) db.close();
});

describe("wire format", () => {
  function sampleEvents(): MatchEvent[] {
    const m = new TestMatch({ overs: 1 });
    m.ball({ runs: 4, boundary: true });
    m.ball({ runs: 0, wicket: { kind: "caught", fielderName: "Zain" } });
    m.batter("Bilal");
    m.push({ type: "strike_swapped" });
    m.push({ type: "settings_changed", oversPerInnings: 2, playersPerSide: { A: 8 }, target: null });
    m.undo();
    m.correct(m.events.find((e) => e.type === "delivery")!.id, { runs: 2, boundary: false });
    return m.events;
  }

  it("round-trips wire format", () => {
    const events = sampleEvents();
    expect(events.map((e) => e.type)).toContain("settings_changed");
    for (const event of events) {
      expect(fromWire(toWire(event))).toEqual(event);
      expect(fromWire(JSON.parse(JSON.stringify(toWire(event))))).toEqual(event);
    }
  });

  it("nests everything except id, seq, at and type under payload", () => {
    const [created, , , , innings] = sampleEvents();
    expect(toWire(created)).toEqual({
      id: created.id,
      seq: 1,
      at: created.at,
      type: "match_created",
      payload: { title: "Lions v Tigers", teams: { A: { name: "Lions" }, B: { name: "Tigers" } }, rules: expect.any(Object), toss: { winner: "A", choice: "bat" } },
    });
    expect(Object.keys(toWire(innings).payload).sort()).toEqual(["battingTeam", "bowler", "innings", "nonStriker", "striker"]);
  });
});

describe("supabasePush", () => {
  const args: PushCall = {
    match: {
      id: "m1",
      code: "abcdefgh",
      title: "Lions v Tigers",
      teamA: "Lions",
      teamB: "Tigers",
      rules: defaultRules("tape", 10),
      status: "in_progress",
      summary: { title: "Lions v Tigers", teams: ["Lions", "Tigers"], status: "in_progress", lines: [], result: null },
    },
    device: "device-1",
    events: new TestMatch().events,
  };

  function clientWith(rpc: (name: string, params: unknown) => Promise<unknown>): SupabaseClient {
    return { rpc } as unknown as SupabaseClient;
  }

  it("calls push_match_events with the match, device and wire events", async () => {
    const rpc = vi.fn(async () => ({ data: 5, error: null, status: 200 }));
    const result = await supabasePush(clientWith(rpc))(args);

    expect(result).toEqual({ ok: true, lastSeq: 5 });
    expect(rpc).toHaveBeenCalledWith("push_match_events", {
      p_match: args.match,
      p_device: "device-1",
      p_events: args.events.map(toWire),
    });
  });

  it.each(["not_signed_in", "not_owner", "scoring_moved", "code_taken"] as const)("maps the %s exception", async (message) => {
    const client = clientWith(async () => ({ data: null, error: { message }, status: 400 }));
    expect(await supabasePush(client)(args)).toEqual({ ok: false, error: message });
  });

  it.each(["quota_exceeded", "invalid_event", "too_many_events", 'new row for relation "matches" violates check constraint "matches_rules_size"'])(
    "maps every other server error (%s) to unknown",
    async (message) => {
      const client = clientWith(async () => ({ data: null, error: { message }, status: 400 }));
      expect(await supabasePush(client)(args)).toEqual({ ok: false, error: "unknown" });
    },
  );

  it("maps a failed fetch to network", async () => {
    const failed = clientWith(async () => ({ data: null, error: { message: "TypeError: Failed to fetch" }, status: 0 }));
    const thrown = clientWith(async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(await supabasePush(failed)(args)).toEqual({ ok: false, error: "network" });
    expect(await supabasePush(thrown)(args)).toEqual({ ok: false, error: "network" });
  });

  it("treats a non-numeric response as unknown", async () => {
    const client = clientWith(async () => ({ data: null, error: null, status: 200 }));
    expect(await supabasePush(client)(args)).toEqual({ ok: false, error: "unknown" });
  });
});

describe("syncMatch", () => {
  it("pushes unsynced events in order and marks synced", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server();

    expect(await syncMatch(db, match.id, fake.push)).toBe("synced");

    expect(fake.seqs()).toEqual([[1, 2, 3, 4, 5]]);
    expect(await db.matches.get(match.id)).toMatchObject({ syncedSeq: 5, syncState: "synced", blockedReason: null });
  });

  it("sends the match, device and replayed rules with each push", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup({ title: "Friday final" }));
    await appendEvents(db, match.id, [{ type: "settings_changed", oversPerInnings: 6 }]);
    const fake = server();

    await syncMatch(db, match.id, fake.push);

    const [call] = fake.calls;
    expect(call.device).toBe(await getDeviceId(db));
    expect(call.match).toEqual({
      id: match.id,
      code: match.code,
      title: "Friday final",
      teamA: "Lions",
      teamB: "Tigers",
      rules: { ...match.rules, oversPerInnings: 6 },
      status: "in_progress",
      summary: (await db.matches.get(match.id))!.summary,
    });
  });

  it("sends status complete once the replayed match is complete", async () => {
    const db = freshDb();
    const m = new TestMatch({ overs: 1 });
    m.over([1, 1, 1, 1, 1, 1]);
    m.endInnings("overs");
    m.startInnings2(["Bilal", "Zain"], "Kamran");
    m.over([1, 1, 0, 0, 0, 0]);
    m.endInnings("overs");
    const id = await seedFromEvents(db, m.events);
    const fake = server();

    await syncMatch(db, id, fake.push);

    expect(fake.calls[0].match.status).toBe("complete");
  });

  it("pushes nothing when the match is already synced", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server();
    await syncMatch(db, match.id, fake.push);

    expect(await syncMatch(db, match.id, fake.push)).toBe("synced");
    expect(fake.calls).toHaveLength(1);
  });

  it("pushes only the events after syncedSeq", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server();
    await syncMatch(db, match.id, fake.push);
    await addBalls(db, match.id, 2);
    expect((await db.matches.get(match.id))?.syncState).toBe("pending");

    expect(await syncMatch(db, match.id, fake.push)).toBe("synced");

    expect(fake.seqs()).toEqual([[1, 2, 3, 4, 5], [6, 7]]);
    expect(await db.matches.get(match.id)).toMatchObject({ syncedSeq: 7, syncState: "synced" });
  });

  it("network error keeps events pending", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server([NETWORK]);

    expect(await syncMatch(db, match.id, fake.push)).toBe("pending");

    expect(await db.matches.get(match.id)).toMatchObject({ syncedSeq: 0, syncState: "pending", blockedReason: null });
    expect(await loadEvents(db, match.id)).toHaveLength(5);
  });

  it.each(["not_signed_in", "unknown"] as const)("leaves the match pending on %s", async (error) => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server([{ ok: false, error }]);

    expect(await syncMatch(db, match.id, fake.push)).toBe("pending");

    expect(await db.matches.get(match.id)).toMatchObject({ syncedSeq: 0, syncState: "pending", blockedReason: null });
  });

  it.each(["scoring_moved", "not_owner"] as const)("%s blocks without deleting", async (error) => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const before = await loadEvents(db, match.id);
    const fake = server([{ ok: false, error }]);

    expect(await syncMatch(db, match.id, fake.push)).toBe("blocked");

    expect(await db.matches.get(match.id)).toMatchObject({ syncState: "blocked", blockedReason: error, syncedSeq: 0 });
    expect(await loadEvents(db, match.id)).toEqual(before);
  });

  it("does not push a blocked match", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    await db.matches.update(match.id, { syncState: "blocked", blockedReason: "scoring_moved" });
    const fake = server();

    expect(await syncMatch(db, match.id, fake.push)).toBe("blocked");
    expect(fake.calls).toHaveLength(0);
  });

  it("resends from server lastSeq", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server([{ ok: true, lastSeq: 2 }]);

    expect(await syncMatch(db, match.id, fake.push)).toBe("synced");

    expect(fake.seqs()).toEqual([[1, 2, 3, 4, 5], [3, 4, 5]]);
    expect(await db.matches.get(match.id)).toMatchObject({ syncedSeq: 5, syncState: "synced" });
  });

  it("gives up after three resend rounds with no progress", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const stuck: PushResult = { ok: true, lastSeq: 0 };
    const fake = server([stuck, stuck, stuck, stuck, stuck]);

    expect(await syncMatch(db, match.id, fake.push)).toBe("pending");

    expect(fake.calls).toHaveLength(4);
    expect(await db.matches.get(match.id)).toMatchObject({ syncedSeq: 0, syncState: "pending" });
  });

  it("batches of 200", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    await appendEvents(db, match.id, Array.from({ length: 445 }, (): EventDraft => ({ type: "strike_swapped" })));
    const fake = server();

    expect(await syncMatch(db, match.id, fake.push)).toBe("synced");

    expect(fake.calls).toHaveLength(3);
    expect(fake.calls.map((call) => call.events.length)).toEqual([200, 200, 50]);
    expect(fake.seqs().flat()).toEqual(Array.from({ length: 450 }, (_, i) => i + 1));
    expect(await db.matches.get(match.id)).toMatchObject({ syncedSeq: 450, lastSeq: 450, syncState: "synced" });
  });

  it("keeps a ball appended while a push is in flight and syncs it in the same run", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server();
    const push: PushFn = async (args) => {
      const result = await fake.push(args);
      if (fake.calls.length === 1) await appendEvents(db, match.id, [await dotBall(db, match.id)]);
      return result;
    };

    expect(await syncMatch(db, match.id, push)).toBe("synced");

    expect(fake.seqs()).toEqual([[1, 2, 3, 4, 5], [6]]);
    expect(await db.matches.get(match.id)).toMatchObject({ syncedSeq: 6, lastSeq: 6, syncState: "synced" });
  });

  it("does not mark synced when a ball was appended during the push", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server();
    let pushes = 0;
    const push: PushFn = async (args) => {
      pushes += 1;
      if (pushes === 2) return NETWORK;
      const result = await fake.push(args);
      await appendEvents(db, match.id, [await dotBall(db, match.id)]);
      return result;
    };

    expect(await syncMatch(db, match.id, push)).toBe("pending");

    const stored = await db.matches.get(match.id);
    expect(stored).toMatchObject({ syncedSeq: 5, lastSeq: 6, syncState: "pending" });
    expect(stored?.summary.lines[0]).toBe("Lions 0/0 (0.1 ov)");
  });

  it("never records more than the local lastSeq", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server([{ ok: true, lastSeq: 99 }]);
    const written: number[] = [];
    db.matches.hook("updating", (changes) => {
      if ("syncedSeq" in changes) written.push((changes as { syncedSeq: number }).syncedSeq);
    });

    expect(await syncMatch(db, match.id, fake.push)).toBe("synced");

    expect(written).toEqual([5]);
    expect(fake.calls).toHaveLength(1);
    expect(await db.matches.get(match.id)).toMatchObject({ syncedSeq: 5, lastSeq: 5, syncState: "synced" });
  });

  it("code_taken regenerates the code once", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server([{ ok: false, error: "code_taken" }]);

    expect(await syncMatch(db, match.id, fake.push)).toBe("synced");

    const stored = await db.matches.get(match.id);
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[0].match.code).toBe(match.code);
    expect(fake.calls[1].match.code).toBe(stored?.code);
    expect(stored?.code).not.toBe(match.code);
    expect(CODE_RE.test(stored!.code)).toBe(true);
  });

  it("stays pending when the regenerated code is taken as well", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const taken: PushResult = { ok: false, error: "code_taken" };
    const fake = server([taken, taken]);

    expect(await syncMatch(db, match.id, fake.push)).toBe("pending");

    expect(fake.calls).toHaveLength(2);
    expect(await db.matches.get(match.id)).toMatchObject({ syncState: "pending", syncedSeq: 0 });
  });

  it("rejects an unknown match", async () => {
    await expect(syncMatch(freshDb(), "missing", server().push)).rejects.toThrow();
  });
});

describe("claim before push", () => {
  it("claim runs before any push", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    await db.meta.put({ key: "pendingClaim", value: "token" });
    const order: string[] = [];
    const fake = server();
    const push: PushFn = async (args) => {
      order.push("push");
      return fake.push(args);
    };
    const claim = async () => {
      order.push("claim");
      await db.meta.delete("pendingClaim");
    };

    expect(await syncAll(db, push, { claim })).toBe("synced");

    expect(order).toEqual(["claim", "push"]);
    expect((await db.matches.get(match.id))?.syncState).toBe("synced");
  });

  it("never pushes when the claim throws", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    await db.meta.put({ key: "pendingClaim", value: "token" });
    const fake = server();
    const claim = vi.fn(async () => {
      throw new Error("claim failed");
    });

    expect(await syncAll(db, fake.push, { claim })).toBe("pending");
    expect(await syncMatch(db, match.id, fake.push, { claim })).toBe("pending");

    expect(claim).toHaveBeenCalledTimes(2);
    expect(fake.calls).toHaveLength(0);
    expect((await db.matches.get(match.id))?.syncedSeq).toBe(0);
  });

  it("never pushes while a claim is pending and no claim function is given", async () => {
    const db = freshDb();
    await createLocalMatch(db, setup());
    await db.meta.put({ key: "pendingClaim", value: "token" });
    const fake = server();

    expect(await syncAll(db, fake.push, {})).toBe("pending");
    expect(fake.calls).toHaveLength(0);
  });

  it("does not call claim when there is no pending claim", async () => {
    const db = freshDb();
    await createLocalMatch(db, setup());
    const claim = vi.fn(async () => {});

    await syncAll(db, server().push, { claim });

    expect(claim).not.toHaveBeenCalled();
  });

  it("claims once per syncAll pass however many matches follow", async () => {
    const db = freshDb();
    await createLocalMatch(db, setup());
    await createLocalMatch(db, setup());
    await db.meta.put({ key: "pendingClaim", value: "token" });
    const claim = vi.fn(async () => {});

    await syncAll(db, server().push, { claim });

    expect(claim).toHaveBeenCalledTimes(1);
  });
});

describe("syncAll", () => {
  it("syncs every pending match and skips blocked and already synced ones", async () => {
    const db = freshDb();
    const pendingA = await createLocalMatch(db, setup());
    const pendingB = await createLocalMatch(db, setup());
    const blocked = await createLocalMatch(db, setup());
    const done = await createLocalMatch(db, setup());
    await db.matches.update(blocked.id, { syncState: "blocked", blockedReason: "not_owner" });
    await db.matches.update(done.id, { syncState: "synced", syncedSeq: done.lastSeq });
    const fake = server();

    expect(await syncAll(db, fake.push, {})).toBe("synced");

    expect(fake.calls.map((call) => call.match.id).sort()).toEqual([pendingA.id, pendingB.id].sort());
    expect((await db.matches.get(blocked.id))?.syncState).toBe("blocked");
  });

  it("reports pending when any match could not be synced", async () => {
    const db = freshDb();
    await createLocalMatch(db, setup());
    const fake = server([NETWORK]);

    expect(await syncAll(db, fake.push, {})).toBe("pending");
  });

  it("is synced when nothing needs pushing", async () => {
    const fake = server();
    expect(await syncAll(freshDb(), fake.push, {})).toBe("synced");
    expect(fake.calls).toHaveLength(0);
  });
});

describe("nextDelay", () => {
  it("backs off exponentially up to a minute", () => {
    expect([0, 1, 2, 5, 10].map(nextDelay)).toEqual([2000, 4000, 8000, 60000, 60000]);
  });
});

describe("startSyncLoop", () => {
  const ready = () => true;
  const claim = async () => {};

  function fakeDom(visibility: "visible" | "hidden" = "visible") {
    const windowTarget = new EventTarget();
    const documentTarget = Object.assign(new EventTarget(), { visibilityState: visibility });
    vi.stubGlobal("window", windowTarget);
    vi.stubGlobal("document", documentTarget);
    return { windowTarget, documentTarget };
  }

  it("syncs on start and again on requestSync", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server();
    startLoop({ db, push: fake.push, claim, isReady: ready });
    await until(async () => (await db.matches.get(match.id))?.syncState === "synced");

    await addBalls(db, match.id, 1);
    requestSync();
    await until(async () => (await db.matches.get(match.id))?.syncedSeq === 6);

    expect(fake.seqs()).toEqual([[1, 2, 3, 4, 5], [6]]);
  });

  it("requestSync is a no-op without a running loop", () => {
    expect(() => requestSync()).not.toThrow();
  });

  it("syncs when the phone comes online or the page becomes visible, not when it is hidden", async () => {
    const dom = fakeDom();
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server();
    startLoop({ db, push: fake.push, claim, isReady: ready });
    await until(async () => (await db.matches.get(match.id))?.syncedSeq === 5);
    await settle();

    await addBalls(db, match.id, 1);
    dom.documentTarget.visibilityState = "hidden";
    dom.documentTarget.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(fake.calls).toHaveLength(1);

    dom.documentTarget.visibilityState = "visible";
    dom.documentTarget.dispatchEvent(new Event("visibilitychange"));
    await until(async () => (await db.matches.get(match.id))?.syncedSeq === 6);

    await addBalls(db, match.id, 1);
    dom.windowTarget.dispatchEvent(new Event("online"));
    await until(async () => (await db.matches.get(match.id))?.syncedSeq === 7);
    expect(fake.seqs()).toEqual([[1, 2, 3, 4, 5], [6], [7]]);
  });

  it("only one loop runs at a time", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server();
    startLoop({ db, push: fake.push, claim, isReady: ready });
    startLoop({ db, push: fake.push, claim, isReady: ready });
    await until(async () => (await db.matches.get(match.id))?.syncState === "synced");

    await addBalls(db, match.id, 1);
    requestSync();
    await until(async () => (await db.matches.get(match.id))?.syncedSeq === 6);
    await settle();

    expect(fake.seqs()).toEqual([[1, 2, 3, 4, 5], [6]]);
  });

  it("a stale stop function does not stop the replacement loop", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server();
    const first = startLoop({ db, push: fake.push, claim, isReady: ready });
    startLoop({ db, push: fake.push, claim, isReady: ready });
    await until(async () => (await db.matches.get(match.id))?.syncState === "synced");

    first();
    await addBalls(db, match.id, 1);
    requestSync();

    await until(async () => (await db.matches.get(match.id))?.syncedSeq === 6);
  });

  it("backs off while pending and resets after a fully successful pass", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const first = server([NETWORK, NETWORK, NETWORK]);
    let current = first;
    startLoop({ db, push: (args) => current.push(args), claim, isReady: ready });

    await until(() => first.calls.length === 1 && vi.getTimerCount() === 1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(first.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await until(() => first.calls.length === 2 && vi.getTimerCount() === 1);

    await vi.advanceTimersByTimeAsync(3999);
    expect(first.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    await until(() => first.calls.length === 3 && vi.getTimerCount() === 1);

    await vi.advanceTimersByTimeAsync(7999);
    expect(first.calls).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);
    await until(async () => (await db.matches.get(match.id))?.syncState === "synced");
    await settle();
    expect(vi.getTimerCount()).toBe(0);

    const failing = server([NETWORK], 5);
    current = failing;
    await addBalls(db, match.id, 1);
    requestSync();
    await until(() => failing.calls.length === 1 && vi.getTimerCount() === 1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(failing.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await until(async () => (await db.matches.get(match.id))?.syncedSeq === 6);
  });

  it("requestSync during a pass runs another pass right after it, without waiting for the backoff", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fake = server();
    let pushes = 0;
    const push: PushFn = async (args) => {
      pushes += 1;
      if (pushes > 1) return fake.push(args);
      await gate;
      return NETWORK;
    };
    startLoop({ db, push, claim, isReady: ready });
    await until(() => pushes === 1);

    requestSync();
    release();

    await until(async () => (await db.matches.get(match.id))?.syncState === "synced");
    expect(pushes).toBe(2);
  });

  it("requestSync during the backoff wait syncs immediately and clears the timer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server([NETWORK]);
    startLoop({ db, push: fake.push, claim, isReady: ready });
    await until(() => fake.calls.length === 1 && vi.getTimerCount() === 1);

    requestSync();

    await until(async () => (await db.matches.get(match.id))?.syncState === "synced");
    await settle();
    expect(vi.getTimerCount()).toBe(0);
    expect(fake.calls).toHaveLength(2);
  });

  it("waits for isReady and syncs once a session exists", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server();
    let session = false;
    startLoop({ db, push: fake.push, claim, isReady: () => session });

    await until(() => vi.getTimerCount() === 1);
    expect(fake.calls).toHaveLength(0);

    session = true;
    await vi.advanceTimersByTimeAsync(2000);
    await until(async () => (await db.matches.get(match.id))?.syncState === "synced");
    expect(fake.seqs()).toEqual([[1, 2, 3, 4, 5]]);
  });

  it("sets no timer when it is not ready but nothing is waiting to sync", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const db = freshDb();
    const isReady = vi.fn(async () => false);
    startLoop({ db, push: server().push, claim, isReady });

    await until(() => isReady.mock.calls.length === 1);
    await settle();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries a failing claim with backoff and never pushes meanwhile", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const db = freshDb();
    await createLocalMatch(db, setup());
    await db.meta.put({ key: "pendingClaim", value: "token" });
    const fake = server();
    const failingClaim = vi.fn(async () => {
      throw new Error("offline");
    });
    startLoop({ db, push: fake.push, claim: failingClaim, isReady: ready });

    await until(() => failingClaim.mock.calls.length === 1 && vi.getTimerCount() === 1);
    await vi.advanceTimersByTimeAsync(2000);
    await until(() => failingClaim.mock.calls.length === 2);

    expect(fake.calls).toHaveLength(0);
  });

  it("keeps going after a pass throws", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server();
    let attempts = 0;
    const isReady = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("session lookup failed");
      return true;
    };
    startLoop({ db, push: fake.push, claim, isReady });

    await until(() => attempts === 1 && vi.getTimerCount() === 1);
    await vi.advanceTimersByTimeAsync(2000);
    await until(async () => (await db.matches.get(match.id))?.syncState === "synced");
  });

  it("stop cancels the timer and removes the listeners", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const dom = fakeDom();
    const db = freshDb();
    await createLocalMatch(db, setup());
    const fake = server([NETWORK]);
    const stop = startLoop({ db, push: fake.push, claim, isReady: ready });
    await until(() => fake.calls.length === 1 && vi.getTimerCount() === 1);

    const removed = vi.spyOn(dom.windowTarget, "removeEventListener");
    const removedFromDocument = vi.spyOn(dom.documentTarget, "removeEventListener");

    stop();
    expect(removed).toHaveBeenCalledWith("online", expect.any(Function));
    expect(removedFromDocument).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    dom.windowTarget.dispatchEvent(new Event("online"));
    dom.documentTarget.dispatchEvent(new Event("visibilitychange"));
    requestSync();
    await vi.advanceTimersByTimeAsync(120000);
    await settle();

    expect(fake.calls).toHaveLength(1);
  });
});
