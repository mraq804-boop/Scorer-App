import "fake-indexeddb/auto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultRules, deliveryDraft, replay } from "@/lib/scoring";
import type { EventDraft, MatchEvent } from "@/lib/scoring";
import { matchRecord } from "@/lib/team";
import { CODE_RE } from "@/lib/local/code";
import { LocalDb } from "@/lib/local/db";
import type { LocalMatch } from "@/lib/local/db";
import { appendEvents, createLocalMatch, getDeviceId, loadEvents } from "@/lib/local/matches";
import type { MatchSetup } from "@/lib/local/matches";
import { supabasePush } from "@/lib/sync/push";
import type { PushError, PushFn, PushResult } from "@/lib/sync/push";
import { REFUSED_DELAY_MS, nextDelay, requestSync, startSyncLoop, syncAll, syncMatch } from "@/lib/sync/sync";
import { fromWire, toWire } from "@/lib/sync/wire";
import { TestMatch } from "../../helpers/match";
import { TEAM_ID } from "../../helpers/team";

type PushCall = Parameters<PushFn>[0];

const opened: LocalDb[] = [];
const stops: Array<() => void> = [];

const NETWORK: PushResult = { ok: false, error: "network" };
const REFUSED: PushResult = { ok: false, error: "refused" };
const UNKNOWN: PushResult = { ok: false, error: "unknown" };

function strikeSwaps(count: number): EventDraft[] {
  return Array.from({ length: count }, (): EventDraft => ({ type: "strike_swapped" }));
}

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

  type ErrorCase = [name: string, status: number, error: { message: string; code?: string }, expected: PushError];

  const MAPPING: ErrorCase[] = [
    ["a request that never reached the server", 0, { message: "TypeError: Failed to fetch" }, "network"],
    ["a request timeout", 408, { message: "Request Timeout" }, "network"],
    ["too many requests", 429, { message: "Too Many Requests" }, "network"],
    ["an internal server error", 500, { message: "internal error", code: "XX000" }, "network"],
    ["a bad gateway", 502, { message: "<html>Bad Gateway</html>" }, "network"],
    ["a schema cache reload", 503, { message: "Could not query the database for the schema cache. Retrying.", code: "PGRST002" }, "network"],
    ["a gateway timeout", 504, { message: "Gateway Timeout" }, "network"],
    ["a Cloudflare unknown error", 520, { message: "error code: 520" }, "network"],
    ["a Cloudflare timeout", 524, { message: "error code: 524" }, "network"],
    ["an expired token", 401, { message: "JWT expired", code: "PGRST301" }, "not_signed_in"],
    ["a call made without a session", 401, { message: "permission denied for function push_match_events", code: "42501" }, "not_signed_in"],
    ["the RPC's own not_signed_in", 400, { message: "not_signed_in", code: "P0001" }, "not_signed_in"],
    ["not_owner", 400, { message: "not_owner", code: "P0001" }, "not_owner"],
    ["scoring_moved", 400, { message: "scoring_moved", code: "P0001" }, "scoring_moved"],
    ["code_taken", 400, { message: "code_taken", code: "P0001" }, "code_taken"],
    ["invalid_event", 400, { message: "invalid_event", code: "P0001" }, "refused"],
    ["too_many_events", 400, { message: "too_many_events", code: "P0001" }, "refused"],
    ["quota_exceeded", 400, { message: "quota_exceeded", code: "P0001" }, "refused"],
    ["a check constraint violation", 400, { message: 'new row for relation "matches" violates check constraint "matches_rules_size"', code: "23514" }, "refused"],
    ["a not-null violation", 400, { message: 'null value in column "title" violates not-null constraint', code: "23502" }, "refused"],
    ["a unique violation", 409, { message: 'duplicate key value violates unique constraint "match_events_pkey"', code: "23505" }, "refused"],
    ["a foreign key violation", 409, { message: 'insert or update violates foreign key constraint "match_events_match_id_fkey"', code: "23503" }, "refused"],
    ["a conflict without an error code", 409, { message: "Conflict" }, "refused"],
    ["a constraint message without an error code", 400, { message: 'new row for relation "matches" violates check constraint "matches_rules_size"' }, "refused"],
    ["an unexpected bad request", 400, { message: "something nobody planned for", code: "XX000" }, "unknown"],
    ["a function missing from the schema cache", 404, { message: "Could not find the function public.push_match_events in the schema cache", code: "PGRST202" }, "unknown"],
    ["a forbidden call", 403, { message: "permission denied", code: "42501" }, "unknown"],
    ["an unreadable error body", 400, { message: "" }, "unknown"],
  ];

  it.each(MAPPING)("maps %s (status %i) to the right code", async (_name, status, error, expected) => {
    const client = clientWith(async () => ({ data: null, error, status }));
    expect(await supabasePush(client)(args)).toEqual({ ok: false, error: expected });
  });

  it("maps a thrown fetch to network", async () => {
    const thrown = clientWith(async () => {
      throw new TypeError("Failed to fetch");
    });

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

  it.each(["not_signed_in", "unknown", "refused"] as const)("leaves the match pending on %s", async (error) => {
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

  it("batches of 50", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    await appendEvents(db, match.id, strikeSwaps(445));
    const fake = server();

    expect(await syncMatch(db, match.id, fake.push)).toBe("synced");

    expect(fake.calls.map((call) => call.events.length)).toEqual([50, 50, 50, 50, 50, 50, 50, 50, 50]);
    expect(fake.seqs().flat()).toEqual(Array.from({ length: 450 }, (_, i) => i + 1));
    expect(await db.matches.get(match.id)).toMatchObject({ syncedSeq: 450, lastSeq: 450, syncState: "synced" });
  });

  it("halves the next batch after each network failure down to 10, and goes back to 50 after a success", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    await appendEvents(db, match.id, strikeSwaps(295));
    const fake = server([NETWORK, NETWORK, NETWORK, NETWORK, NETWORK]);

    for (let attempt = 0; attempt < 5; attempt++) expect(await syncMatch(db, match.id, fake.push)).toBe("pending");
    expect(await syncMatch(db, match.id, fake.push)).toBe("synced");

    expect(fake.calls.map((call) => call.events.length)).toEqual([50, 25, 12, 10, 10, 10, 50, 50, 50, 50, 50, 40]);
    expect(fake.seqs().slice(5).flat()).toEqual(Array.from({ length: 300 }, (_, i) => i + 1));
    expect(await db.matches.get(match.id)).toMatchObject({ syncedSeq: 300, lastSeq: 300, syncState: "synced" });
    expect(await loadEvents(db, match.id)).toHaveLength(300);
  });

  it("keeps the smaller batch for the next pass and the next push of the same match", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    await appendEvents(db, match.id, strikeSwaps(95));
    const fake = server([NETWORK]);

    expect(await syncAll(db, fake.push, {})).toBe("pending");
    expect(await syncAll(db, fake.push, {})).toBe("synced");

    expect(fake.calls.map((call) => call.events.length)).toEqual([50, 25, 50, 25]);
  });

  it("sizes batches per match, so another match's success does not undo a shrunken batch", async () => {
    const db = freshDb();
    const backlog = await createLocalMatch(db, setup());
    await appendEvents(db, backlog.id, strikeSwaps(95));
    await db.matches.update(backlog.id, { updatedAt: "2098-01-01T00:00:00.000Z" });
    const live = await createLocalMatch(db, setup());
    const fake = server([NETWORK]);
    const sent = () => fake.calls.map((call) => [call.match.id === backlog.id ? "backlog" : "live", call.events.length]);

    expect(await syncAll(db, fake.push, {})).toBe("pending");
    await addBalls(db, live.id, 1);
    await db.matches.update(live.id, { updatedAt: "2099-01-01T00:00:00.000Z" });
    expect(await syncAll(db, fake.push, {})).toBe("synced");

    expect(sent()).toEqual([["backlog", 50], ["live", 5], ["live", 1], ["backlog", 25], ["backlog", 50], ["backlog", 25]]);
  });

  it.each([
    ["not_signed_in", { ok: false, error: "not_signed_in" }],
    ["unknown", UNKNOWN],
    ["refused", REFUSED],
    ["code_taken", { ok: false, error: "code_taken" }],
  ] as const)("does not shrink the batch after %s", async (_name, failure) => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    await appendEvents(db, match.id, strikeSwaps(95));
    const fake = server([failure, failure]);

    await syncMatch(db, match.id, fake.push);
    await syncMatch(db, match.id, fake.push);

    expect(fake.calls[0].events).toHaveLength(50);
    expect(fake.calls[1].events).toHaveLength(50);
  });

  it("does not drop or change a ball when it resends smaller batches", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    await appendEvents(db, match.id, strikeSwaps(95));
    const before = await loadEvents(db, match.id);
    const fake = server([NETWORK, NETWORK]);

    await syncMatch(db, match.id, fake.push);
    await syncMatch(db, match.id, fake.push);
    await syncMatch(db, match.id, fake.push);

    expect(fake.calls.slice(2).flatMap((call) => call.events)).toEqual(before);
    expect(await loadEvents(db, match.id)).toEqual(before);
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

  it("never records more than the lastSeq the local copy has when the ack lands", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server();
    const written: number[] = [];
    db.matches.hook("updating", (changes) => {
      if ("syncedSeq" in changes) written.push((changes as { syncedSeq: number }).syncedSeq);
    });
    const push: PushFn = async (args) => {
      const result = await fake.push(args);
      await db.matches.update(match.id, { lastSeq: 3 });
      return result;
    };

    expect(await syncMatch(db, match.id, push)).toBe("synced");

    expect(written).toEqual([3]);
    expect(await db.matches.get(match.id)).toMatchObject({ syncedSeq: 3, lastSeq: 3, syncState: "synced" });
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

  it("holds back a match the server refused for 15 minutes and keeps its balls", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server([REFUSED]);

    expect(await syncAll(db, fake.push, {})).toBe("pending");
    expect(await syncAll(db, fake.push, {})).toBe("pending");
    vi.advanceTimersByTime(REFUSED_DELAY_MS - 1);
    expect(await syncAll(db, fake.push, {})).toBe("pending");
    expect(fake.calls).toHaveLength(1);
    expect(await db.matches.get(match.id)).toMatchObject({ syncedSeq: 0, syncState: "pending", blockedReason: null });
    expect(await loadEvents(db, match.id)).toHaveLength(5);

    vi.advanceTimersByTime(1);
    expect(await syncAll(db, fake.push, {})).toBe("synced");
    expect(fake.seqs()).toEqual([[1, 2, 3, 4, 5], [1, 2, 3, 4, 5]]);
    expect(REFUSED_DELAY_MS).toBe(15 * 60_000);
  });

  it("keeps syncing the other matches while one is held back", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const db = freshDb();
    const refused = await createLocalMatch(db, setup());
    await db.matches.update(refused.id, { updatedAt: "2099-01-01T00:00:00.000Z" });
    const other = await createLocalMatch(db, setup());
    const fake = server([REFUSED]);

    expect(await syncAll(db, fake.push, {})).toBe("pending");
    await addBalls(db, other.id, 1);
    expect(await syncAll(db, fake.push, {})).toBe("pending");

    expect(fake.calls.map((call) => call.match.id)).toEqual([refused.id, other.id, other.id]);
    expect(await db.matches.get(other.id)).toMatchObject({ syncedSeq: 6, syncState: "synced" });
  });

  it.each([NETWORK, UNKNOWN, { ok: false, error: "not_signed_in" } as const])("holds nothing back after %o: the next pass retries at once", async (failure) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const db = freshDb();
    await createLocalMatch(db, setup());
    const fake = server([failure]);

    expect(await syncAll(db, fake.push, {})).toBe("pending");
    expect(await syncAll(db, fake.push, {})).toBe("synced");
    expect(fake.calls).toHaveLength(2);
  });
});

describe("syncAll with the real push error mapping", () => {
  it.each([
    [429, { message: "Too Many Requests" }],
    [502, { message: "Bad Gateway" }],
    [503, { message: "Could not query the database for the schema cache. Retrying.", code: "PGRST002" }],
    [524, { message: "error code: 524" }],
    [401, { message: "JWT expired", code: "PGRST301" }],
    [404, { message: "Could not find the function public.push_match_events in the schema cache", code: "PGRST202" }],
  ])("sends the same balls again at once after HTTP %i, with no 15 minute hold", async (status, error) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const replies = [{ data: null, error, status }, { data: 5, error: null, status: 200 }];
    const rpc = vi.fn(async () => replies.shift());
    const push = supabasePush({ rpc } as unknown as SupabaseClient);

    expect(await syncAll(db, push, {})).toBe("pending");
    expect(await syncAll(db, push, {})).toBe("synced");

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(await db.matches.get(match.id)).toMatchObject({ syncedSeq: 5, syncState: "synced", blockedReason: null });
  });

  it.each([
    [400, { message: "quota_exceeded", code: "P0001" }],
    [400, { message: "invalid_event", code: "P0001" }],
    [409, { message: "duplicate key value violates unique constraint", code: "23505" }],
  ])("holds a match the server refused (HTTP %i %o) for 15 minutes and then sends every ball", async (status, error) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const before = await loadEvents(db, match.id);
    const replies = [{ data: null, error, status }, { data: 5, error: null, status: 200 }];
    const rpc = vi.fn(async () => replies.shift());
    const push = supabasePush({ rpc } as unknown as SupabaseClient);

    expect(await syncAll(db, push, {})).toBe("pending");
    vi.advanceTimersByTime(REFUSED_DELAY_MS - 1);
    expect(await syncAll(db, push, {})).toBe("pending");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(await loadEvents(db, match.id)).toEqual(before);

    vi.advanceTimersByTime(1);
    expect(await syncAll(db, push, {})).toBe("synced");
    expect(rpc).toHaveBeenCalledTimes(2);
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

  it("does not re-send a refused match on every backoff, only after 15 minutes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server([REFUSED]);
    const refusedAt = Date.now();
    startLoop({ db, push: fake.push, claim, isReady: ready });
    await until(() => fake.calls.length === 1 && vi.getTimerCount() === 1);

    let passes = 0;
    while (fake.calls.length === 1 && Date.now() - refusedAt < 2 * REFUSED_DELAY_MS) {
      await vi.advanceTimersByTimeAsync(nextDelay(10));
      await settle();
      passes += 1;
    }

    expect(Date.now() - refusedAt).toBeGreaterThanOrEqual(REFUSED_DELAY_MS);
    expect(passes).toBeGreaterThan(10);
    await until(async () => (await db.matches.get(match.id))?.syncState === "synced");
    expect(fake.calls).toHaveLength(2);
  });

  it("retries an unexpected error on the normal backoff instead of holding the match for 15 minutes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server([UNKNOWN]);
    startLoop({ db, push: fake.push, claim, isReady: ready });
    await until(() => fake.calls.length === 1 && vi.getTimerCount() === 1);

    await vi.advanceTimersByTimeAsync(nextDelay(0));

    await until(async () => (await db.matches.get(match.id))?.syncState === "synced");
    expect(fake.calls).toHaveLength(2);
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

describe("team matches", () => {
  const XI = ["p-Ali", "p-Usman", "p-Zain", "p-Faisal"];
  const FIXTURE_ID = "44444444-4444-4444-8444-444444444444";

  function finished(): TestMatch {
    const m = new TestMatch({ overs: 1 });
    for (let i = 0; i < 6; i++) m.ball({ runs: 1 });
    m.endInnings("overs");
    m.startInnings2(["Zain", "Faisal"], "Usman");
    for (let i = 0; i < 6; i++) m.ball({ runs: 0 });
    m.endInnings("overs");
    return m;
  }

  function team(side: "A" | "B", fixtureId: string | null = FIXTURE_ID): NonNullable<LocalMatch["team"]> {
    return { id: TEAM_ID, side, fixtureId, xi: XI.map((id) => ({ id, name: id.slice(2) })) };
  }

  async function seedTeamMatch(db: LocalDb, events: MatchEvent[], linked?: LocalMatch["team"]): Promise<string> {
    const id = await seedFromEvents(db, events);
    if (linked !== undefined) await db.matches.update(id, { team: linked });
    return id;
  }

  it("sends the team link with the record computed from the replayed match", async () => {
    const db = freshDb();
    const m = finished();
    const id = await seedTeamMatch(db, m.events, team("A"));
    const fake = server();

    expect(await syncMatch(db, id, fake.push)).toBe("synced");

    const [call] = fake.calls;
    expect(call.match.team).toEqual({
      id: TEAM_ID,
      side: "A",
      fixtureId: FIXTURE_ID,
      record: matchRecord(replay(m.events), "A", XI, m.events[0].at),
    });
    expect(call.match.team?.record).toMatchObject({
      version: 1,
      side: "A",
      opponent: "Tigers",
      playedAt: m.events[0].at,
      xi: XI,
      outcome: "won",
    });
    expect(call.match.team?.record.players.map((player) => player.playerId)).toEqual(XI);
    expect(call.match.team?.record.players.find((player) => player.playerId === "p-Ali")?.batting).toMatchObject({ runs: expect.any(Number) });
  });

  it("works out the outcome from the team's own side", async () => {
    const db = freshDb();
    const m = finished();
    const id = await seedTeamMatch(db, m.events, team("B", null));
    const fake = server();

    await syncMatch(db, id, fake.push);

    expect(fake.calls[0].match.team).toMatchObject({ side: "B", fixtureId: null, record: { side: "B", opponent: "Lions", outcome: "lost" } });
  });

  it("has no outcome while the match is still being played", async () => {
    const db = freshDb();
    const m = new TestMatch({ overs: 2 });
    m.ball({ runs: 1 });
    const id = await seedTeamMatch(db, m.events, team("A"));
    const fake = server();

    await syncMatch(db, id, fake.push);

    expect(fake.calls[0].match.team?.record.outcome).toBeNull();
    expect(fake.calls[0].match.status).toBe("in_progress");
  });

  it("recomputes the record on every push, so later balls reach the server", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const ali = Object.values(replay(await loadEvents(db, match.id)).players).find((player) => player.name === "Ali");
    if (ali === undefined) throw new Error("no Ali");
    await db.matches.update(match.id, { team: { id: TEAM_ID, side: "A", fixtureId: null, xi: [{ id: ali.id, name: "Ali" }] } });
    const fake = server();
    await syncMatch(db, match.id, fake.push);
    await appendEvents(db, match.id, [deliveryDraft(replay(await loadEvents(db, match.id)), { runs: 4, boundary: true })]);

    await syncMatch(db, match.id, fake.push);

    const [first, second] = fake.calls.map((call) => call.match.team?.record.players[0]);
    expect(first).toMatchObject({ playerId: ali.id, batting: { runs: 0, balls: 0 } });
    expect(second).toMatchObject({ playerId: ali.id, batting: { runs: 4, balls: 1, fours: 1 } });
  });

  it("sends no team for a match that has none", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server();

    await syncMatch(db, match.id, fake.push);

    expect("team" in fake.calls[0].match).toBe(false);
  });

  it("still sends a team match's balls in the usual batches", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    await db.matches.update(match.id, { team: { id: TEAM_ID, side: "A", fixtureId: null, xi: [] } });
    await appendEvents(db, match.id, strikeSwaps(95));
    const fake = server();

    await syncMatch(db, match.id, fake.push);

    expect(fake.seqs().map((seqs) => seqs.length)).toEqual([50, 50]);
    expect(fake.calls.every((call) => call.match.team?.id === TEAM_ID)).toBe(true);
  });
});

describe("squad outbox in the sync loop", () => {
  const ready = () => true;
  const claim = async () => {};

  it("starts the squad push before the match pushes in the same pass", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const order: string[] = [];
    const fake = server();
    const pushSquad = vi.fn(async (target: LocalDb) => {
      expect(target).toBe(db);
      order.push("squad");
      return true;
    });
    startLoop({
      db,
      push: async (args) => {
        order.push("match");
        return fake.push(args);
      },
      claim,
      isReady: ready,
      pushSquad,
    });

    await until(async () => (await db.matches.get(match.id))?.syncState === "synced");

    expect(order).toEqual(["squad", "match"]);
  });

  it("pushes the squad again on every triggered pass, even when no match needs syncing", async () => {
    const db = freshDb();
    const pushSquad = vi.fn(async () => true);
    startLoop({ db, push: server().push, claim, isReady: ready, pushSquad });
    await until(() => pushSquad.mock.calls.length === 1);

    requestSync();
    await until(() => pushSquad.mock.calls.length === 2);
  });

  it("does not make the balls wait for a slow squad push", async () => {
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    let release: (done: boolean) => void = () => {};
    const pushSquad = vi.fn(() => new Promise<boolean>((resolve) => (release = resolve)));
    const fake = server();
    startLoop({ db, push: fake.push, claim, isReady: ready, pushSquad });

    await until(async () => (await db.matches.get(match.id))?.syncState === "synced");

    expect(pushSquad).toHaveBeenCalledTimes(1);
    expect(fake.seqs()).toEqual([[1, 2, 3, 4, 5]]);

    await addBalls(db, match.id, 1);
    requestSync();
    await until(async () => (await db.matches.get(match.id))?.syncedSeq === 6);
    expect(pushSquad).toHaveBeenCalledTimes(1);

    release(true);
    await until(() => pushSquad.mock.calls.length === 2);
  });

  it("still pushes every match when the squad push throws, and retries the squad on its own backoff", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server();
    let attempts = 0;
    const pushSquad = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("offline");
      return true;
    });
    startLoop({ db, push: fake.push, claim, isReady: ready, pushSquad });

    await until(async () => (await db.matches.get(match.id))?.syncState === "synced");
    await until(() => vi.getTimerCount() === 1);
    expect(fake.seqs()).toEqual([[1, 2, 3, 4, 5]]);
    expect(pushSquad).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(nextDelay(0));
    await until(() => pushSquad.mock.calls.length === 2);
    await settle();

    expect(vi.getTimerCount()).toBe(0);
    expect(fake.calls).toHaveLength(1);
  });

  it("backs off a squad push that could not send everything, on a counter of its own", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server();
    const pushSquad = vi.fn(async () => false);
    startLoop({ db, push: fake.push, claim, isReady: ready, pushSquad });

    await until(async () => (await db.matches.get(match.id))?.syncState === "synced");
    await until(() => vi.getTimerCount() === 1);
    await vi.advanceTimersByTimeAsync(nextDelay(0) - 1);
    expect(pushSquad).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await until(() => pushSquad.mock.calls.length === 2);
    await until(() => vi.getTimerCount() === 1);
    await vi.advanceTimersByTimeAsync(nextDelay(1) - 1);
    expect(pushSquad).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await until(() => pushSquad.mock.calls.length === 3);
  });

  it("does not let a stuck squad push slow the retry of a failing match", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server();
    let failNext = false;
    const push: PushFn = async (args) => {
      if (!failNext) return fake.push(args);
      failNext = false;
      fake.calls.push(args);
      return NETWORK;
    };
    const pushSquad = vi.fn(async () => false);
    startLoop({ db, push, claim, isReady: ready, pushSquad });
    await until(async () => (await db.matches.get(match.id))?.syncState === "synced");
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(nextDelay(i));
      await until(() => pushSquad.mock.calls.length === i + 2);
    }

    failNext = true;
    await addBalls(db, match.id, 1);
    const before = fake.calls.length;
    requestSync();
    await until(() => fake.calls.length === before + 1);
    await settle();

    await vi.advanceTimersByTimeAsync(nextDelay(0) - 1);
    expect(fake.calls).toHaveLength(before + 1);
    await vi.advanceTimersByTimeAsync(1);
    await until(async () => (await db.matches.get(match.id))?.syncedSeq === 6);
    expect(fake.calls).toHaveLength(before + 2);
  });

  it("leaves a squad push alone while a failing match retries on its own backoff", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server([NETWORK, NETWORK]);
    const pushSquad = vi.fn(async () => false);
    startLoop({ db, push: fake.push, claim, isReady: ready, pushSquad });
    await until(() => fake.calls.length === 1 && pushSquad.mock.calls.length === 1);

    await vi.advanceTimersByTimeAsync(nextDelay(0));
    await until(() => fake.calls.length === 2 && pushSquad.mock.calls.length === 2);
    await vi.advanceTimersByTimeAsync(nextDelay(1));
    await until(async () => (await db.matches.get(match.id))?.syncState === "synced");
    await until(() => pushSquad.mock.calls.length === 3);

    expect(fake.calls).toHaveLength(3);
  });

  it("does not re-run a squad push that went well just because a match is retrying", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const db = freshDb();
    const match = await createLocalMatch(db, setup());
    const fake = server([NETWORK, NETWORK]);
    const pushSquad = vi.fn(async () => true);
    startLoop({ db, push: fake.push, claim, isReady: ready, pushSquad });
    await until(() => fake.calls.length === 1 && vi.getTimerCount() === 1);

    await vi.advanceTimersByTimeAsync(nextDelay(0));
    await until(() => fake.calls.length === 2 && vi.getTimerCount() === 1);
    await vi.advanceTimersByTimeAsync(nextDelay(1));
    await until(async () => (await db.matches.get(match.id))?.syncState === "synced");

    expect(fake.calls).toHaveLength(3);
    expect(pushSquad).toHaveBeenCalledTimes(1);
  });

  it("runs a waiting squad retry at once when something asks for a sync", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const db = freshDb();
    const pushSquad = vi.fn(async () => false);
    startLoop({ db, push: server().push, claim, isReady: ready, pushSquad });
    await until(() => pushSquad.mock.calls.length === 1 && vi.getTimerCount() === 1);

    requestSync();

    await until(() => pushSquad.mock.calls.length === 2);
    await until(() => vi.getTimerCount() === 1);
  });

  it("does not push the squad before a session exists", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const db = freshDb();
    await createLocalMatch(db, setup());
    const pushSquad = vi.fn(async () => true);
    let session = false;
    startLoop({ db, push: server().push, claim, isReady: () => session, pushSquad });

    await until(() => vi.getTimerCount() === 1);
    expect(pushSquad).not.toHaveBeenCalled();

    session = true;
    await vi.advanceTimersByTimeAsync(2000);
    await until(() => pushSquad.mock.calls.length === 1);
  });

  it("does not retry a failed squad push once the session is gone", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const db = freshDb();
    const pushSquad = vi.fn(async () => false);
    let session = true;
    startLoop({ db, push: server().push, claim, isReady: () => session, pushSquad });
    await until(() => pushSquad.mock.calls.length === 1 && vi.getTimerCount() === 1);

    session = false;
    await vi.advanceTimersByTimeAsync(nextDelay(0));
    await settle();

    expect(pushSquad).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stop cancels a waiting squad retry", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const db = freshDb();
    const pushSquad = vi.fn(async () => false);
    const stop = startLoop({ db, push: server().push, claim, isReady: ready, pushSquad });
    await until(() => pushSquad.mock.calls.length === 1 && vi.getTimerCount() === 1);

    stop();
    await vi.advanceTimersByTimeAsync(120000);
    await settle();

    expect(vi.getTimerCount()).toBe(0);
    expect(pushSquad).toHaveBeenCalledTimes(1);
  });

  it("does not push the squad after the loop is stopped while it waited for isReady", async () => {
    const db = freshDb();
    const pushSquad = vi.fn(async () => true);
    let release: (value: boolean) => void = () => {};
    const isReady = () => new Promise<boolean>((resolve) => (release = resolve));
    const stop = startLoop({ db, push: server().push, claim, isReady, pushSquad });
    await settle();

    stop();
    release(true);
    await settle();

    expect(pushSquad).not.toHaveBeenCalled();
  });
});
