import "fake-indexeddb/auto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { completeClaim, startGoogleSignIn } from "@/lib/identity/google";
import { ensureGuestSession, guestSessionKeeper } from "@/lib/identity/guest";
import { takeOverScoring } from "@/lib/identity/takeover";
import { LocalDb } from "@/lib/local/db";
import type { StoredEvent } from "@/lib/local/db";
import { appendEvents, createLocalMatch, getDeviceId, loadEvents } from "@/lib/local/matches";
import type { MatchSetup } from "@/lib/local/matches";
import { defaultRules, deliveryDraft, replay } from "@/lib/scoring";
import type { MatchEvent, Rules } from "@/lib/scoring";
import { summarize } from "@/lib/share/summary";
import type { PushFn } from "@/lib/sync/push";
import { nextDelay, requestSync, startSyncLoop } from "@/lib/sync/sync";
import { TestMatch } from "../../helpers/match";

type Reply = { data: unknown; error: { message: string } | null; status?: number };
type FakeSession = { user: { id: string; is_anonymous?: boolean } };

type OwnerRow = { code: string; title: string; team_a: string; team_b: string; rules: Rules };

type FakeOptions = {
  session?: FakeSession | null;
  sessionError?: Error;
  rpc?: Record<string, (args: Record<string, unknown>) => Reply | Promise<Reply>>;
  matchRow?: OwnerRow;
  signInError?: Error;
};

const opened: LocalDb[] = [];

const ANONYMOUS: FakeSession = { user: { id: "guest", is_anonymous: true } };
const GOOGLE: FakeSession = { user: { id: "owner", is_anonymous: false } };

function freshDb(): LocalDb {
  const db = new LocalDb(`test-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
}

function fakeClient(options: FakeOptions = {}) {
  const order: string[] = [];
  const select = vi.fn();
  const eq = vi.fn();
  const single = vi.fn(async () =>
    options.matchRow === undefined
      ? { data: null, error: { message: "not found" } }
      : { data: options.matchRow, error: null },
  );
  const builder = { select, eq, single };
  select.mockReturnValue(builder);
  eq.mockReturnValue(builder);
  const from = vi.fn((table: string) => {
    order.push(`from:${table}`);
    return builder;
  });
  const raw = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: options.session ?? null },
        error: options.sessionError ?? null,
      })),
      signInAnonymously: vi.fn(async () => {
        order.push("signInAnonymously");
        return { data: {}, error: options.signInError ?? null };
      }),
      signInWithOAuth: vi.fn(async () => {
        order.push("signInWithOAuth");
        return { data: {}, error: null };
      }),
    },
    rpc: vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
      order.push(`rpc:${name}`);
      const handler = options.rpc?.[name];
      if (handler === undefined) throw new Error(`unexpected rpc ${name}`);
      return handler(args);
    }),
    from,
  };
  return { client: raw as unknown as SupabaseClient, raw, order, select, eq };
}

function setup(): MatchSetup {
  return {
    teams: ["Lions", "Tigers"],
    rules: defaultRules("tape", 10),
    toss: { winner: "A", choice: "bat" },
    striker: "Ali",
    nonStriker: "Usman",
    bowler: "Hamza",
  };
}

function stubOnline(online: boolean): void {
  vi.stubGlobal("navigator", { onLine: online });
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(opened.splice(0).map((db) => db.delete()));
});

describe("ensureGuestSession", () => {
  it("does nothing with an existing session", async () => {
    stubOnline(true);
    const { client, raw } = fakeClient({ session: ANONYMOUS });
    expect(await ensureGuestSession(client)).toBe("existing");
    expect(raw.auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("returns offline without calling Supabase", async () => {
    stubOnline(false);
    const getCaptchaToken = vi.fn(async () => "token");
    const { client, raw } = fakeClient();
    expect(await ensureGuestSession(client, getCaptchaToken)).toBe("offline");
    expect(raw.auth.signInAnonymously).not.toHaveBeenCalled();
    expect(raw.rpc).not.toHaveBeenCalled();
    expect(getCaptchaToken).not.toHaveBeenCalled();
  });

  it("signs in anonymously with the captcha token", async () => {
    stubOnline(true);
    const { client, raw } = fakeClient();
    expect(await ensureGuestSession(client, async () => "turnstile-token")).toBe("created");
    expect(raw.auth.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(raw.auth.signInAnonymously).toHaveBeenCalledWith({ options: { captchaToken: "turnstile-token" } });
  });

  it("signs in anonymously without a captcha getter", async () => {
    stubOnline(true);
    const { client, raw } = fakeClient();
    expect(await ensureGuestSession(client)).toBe("created");
    expect(raw.auth.signInAnonymously).toHaveBeenCalledWith({ options: { captchaToken: undefined } });
  });

  it("does not mint a second guest when the stored session cannot be read", async () => {
    stubOnline(true);
    const { client, raw } = fakeClient({ sessionError: new Error("refresh failed") });
    await expect(ensureGuestSession(client)).rejects.toThrow("refresh failed");
    expect(raw.auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("rejects when anonymous sign-in fails", async () => {
    stubOnline(true);
    const { client } = fakeClient({ signInError: new Error("captcha failed") });
    await expect(ensureGuestSession(client, async () => "bad")).rejects.toThrow("captcha failed");
  });
});

describe("guestSessionKeeper", () => {
  function deferred<T>() {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  async function settle(): Promise<void> {
    for (let i = 0; i < 20; i++) await new Promise<void>((resolve) => setImmediate(resolve));
  }

  it("is ready without signing in when a session exists", async () => {
    stubOnline(true);
    const { client, raw } = fakeClient({ session: ANONYMOUS });
    const onSettled = vi.fn();
    const keeper = guestSessionKeeper(client, undefined, onSettled);

    expect(await keeper.isReady()).toBe(true);
    await settle();
    expect(raw.auth.signInAnonymously).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
  });

  it("signs in when the sync loop finds no session and the phone is online", async () => {
    stubOnline(true);
    const { client, raw } = fakeClient();
    const onSettled = vi.fn();
    const keeper = guestSessionKeeper(client, async () => "turnstile-token", onSettled);

    expect(await keeper.isReady()).toBe(false);
    await settle();

    expect(raw.auth.signInAnonymously).toHaveBeenCalledWith({ options: { captchaToken: "turnstile-token" } });
    expect(onSettled).toHaveBeenCalledWith("created");
  });

  it("does not try to sign in while the phone is offline", async () => {
    stubOnline(false);
    const getCaptchaToken = vi.fn(async () => "turnstile-token");
    const { client, raw } = fakeClient();
    const keeper = guestSessionKeeper(client, getCaptchaToken, vi.fn());

    expect(await keeper.isReady()).toBe(false);
    await settle();

    expect(getCaptchaToken).not.toHaveBeenCalled();
    expect(raw.auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("tries again on the next check after a sign-in fails", async () => {
    stubOnline(true);
    const options: FakeOptions = { signInError: new Error("rate limited") };
    const { client, raw } = fakeClient(options);
    const onSettled = vi.fn();
    const keeper = guestSessionKeeper(client, undefined, onSettled);

    await keeper.isReady();
    await settle();
    expect(onSettled).toHaveBeenLastCalledWith(undefined);

    delete options.signInError;
    await keeper.isReady();
    await settle();

    expect(raw.auth.signInAnonymously).toHaveBeenCalledTimes(2);
    expect(onSettled).toHaveBeenLastCalledWith("created");
  });

  it("keeps one sign-in waiting for its captcha token and uses the token when it comes", async () => {
    stubOnline(true);
    const token = deferred<string>();
    const getCaptchaToken = vi.fn(() => token.promise);
    const { client, raw } = fakeClient();
    const onSettled = vi.fn();
    const keeper = guestSessionKeeper(client, getCaptchaToken, onSettled);

    await keeper.isReady();
    await keeper.isReady();
    void keeper.ensure();
    await settle();
    expect(getCaptchaToken).toHaveBeenCalledTimes(1);
    expect(raw.auth.signInAnonymously).not.toHaveBeenCalled();

    token.resolve("late-token");
    await settle();

    expect(raw.auth.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(raw.auth.signInAnonymously).toHaveBeenCalledWith({ options: { captchaToken: "late-token" } });
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith("created");
  });

  it("retries a failed first sign-in on the sync loop's backoff until the balls sync", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      stubOnline(true);
      const db = freshDb();
      const match = await createLocalMatch(db, setup());
      const options: FakeOptions = { signInError: new Error("captcha timed out") };
      const { client, raw } = fakeClient(options);
      raw.auth.signInAnonymously.mockImplementation(async () => {
        if (options.signInError !== undefined) return { data: {}, error: options.signInError };
        options.session = ANONYMOUS;
        return { data: {}, error: null };
      });
      const pushed: number[][] = [];
      const push: PushFn = async ({ events }) => {
        pushed.push(events.map((event) => event.seq));
        return { ok: true, lastSeq: events.at(-1)?.seq ?? 0 };
      };
      const keeper = guestSessionKeeper(client, undefined, (outcome) => {
        if (outcome === "created") requestSync();
      });
      const stop = startSyncLoop({ db, push, claim: async () => {}, isReady: keeper.isReady });

      try {
        await vi.waitUntil(() => raw.auth.signInAnonymously.mock.calls.length === 1 && vi.getTimerCount() === 1);
        expect(pushed).toEqual([]);

        delete options.signInError;
        await vi.advanceTimersByTimeAsync(nextDelay(0));
        await vi.waitUntil(async () => (await db.matches.get(match.id))?.syncState === "synced");

        expect(raw.auth.signInAnonymously).toHaveBeenCalledTimes(2);
        expect(pushed).toEqual([[1, 2, 3, 4, 5]]);
      } finally {
        stop();
      }
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("startGoogleSignIn", () => {
  const ORIGIN = "https://score.example";
  const claimToken = { create_claim_token: () => ({ data: "claim-token", error: null }) };

  it("creates a claim token only for anonymous users with matches", async () => {
    const db = freshDb();
    await createLocalMatch(db, setup());
    const { client, order, raw } = fakeClient({ session: ANONYMOUS, rpc: claimToken });
    await startGoogleSignIn(client, db, ORIGIN);
    expect(order).toEqual(["rpc:create_claim_token", "signInWithOAuth"]);
    const { options, provider } = (raw.auth.signInWithOAuth.mock.calls[0] as unknown as [
      { provider: string; options: { redirectTo: string } },
    ])[0];
    expect(provider).toBe("google");
    expect(options.redirectTo).toBe(`${ORIGIN}/auth/callback?next=/account`);
    expect((await db.meta.get("pendingClaim"))?.value).toBe("claim-token");
  });

  it("skips the claim token when an anonymous user has no matches", async () => {
    const db = freshDb();
    const { client, order } = fakeClient({ session: ANONYMOUS, rpc: claimToken });
    await startGoogleSignIn(client, db, ORIGIN);
    expect(order).toEqual(["signInWithOAuth"]);
    expect(await db.meta.get("pendingClaim")).toBeUndefined();
  });

  it("skips the claim token for users who already signed in", async () => {
    const db = freshDb();
    await createLocalMatch(db, setup());
    const { client, order } = fakeClient({ session: GOOGLE, rpc: claimToken });
    await startGoogleSignIn(client, db, ORIGIN);
    expect(order).toEqual(["signInWithOAuth"]);
    expect(await db.meta.get("pendingClaim")).toBeUndefined();
  });

  it("does not start Google sign-in when the stored session cannot be read", async () => {
    const db = freshDb();
    await createLocalMatch(db, setup());
    const { client, order } = fakeClient({ sessionError: new Error("refresh failed"), rpc: claimToken });
    await expect(startGoogleSignIn(client, db, ORIGIN)).rejects.toThrow("refresh failed");
    expect(order).toEqual([]);
    expect(await db.meta.get("pendingClaim")).toBeUndefined();
  });

  it("does not start Google sign-in when the claim token cannot be created", async () => {
    const db = freshDb();
    await createLocalMatch(db, setup());
    const { client, order } = fakeClient({
      session: ANONYMOUS,
      rpc: { create_claim_token: () => ({ data: null, error: { message: "boom" }, status: 500 }) },
    });
    await expect(startGoogleSignIn(client, db, ORIGIN)).rejects.toThrow("boom");
    expect(order).toEqual(["rpc:create_claim_token"]);
    expect(await db.meta.get("pendingClaim")).toBeUndefined();
  });
});

describe("completeClaim", () => {
  async function withToken(): Promise<LocalDb> {
    const db = freshDb();
    await db.meta.put({ key: "pendingClaim", value: "claim-token" });
    return db;
  }

  it("resolves 0 without calling Supabase when no claim is pending", async () => {
    const db = freshDb();
    const { client, raw } = fakeClient({ session: GOOGLE });
    expect(await completeClaim(client, db)).toBe(0);
    expect(raw.rpc).not.toHaveBeenCalled();
  });

  it("keeps the token while the user is still anonymous", async () => {
    const db = await withToken();
    const { client, raw } = fakeClient({ session: ANONYMOUS });
    expect(await completeClaim(client, db)).toBe(0);
    expect(raw.rpc).not.toHaveBeenCalled();
    expect((await db.meta.get("pendingClaim"))?.value).toBe("claim-token");
  });

  it("keeps the token when there is no session", async () => {
    const db = await withToken();
    const { client, raw } = fakeClient({ session: null });
    expect(await completeClaim(client, db)).toBe(0);
    expect(raw.rpc).not.toHaveBeenCalled();
    expect((await db.meta.get("pendingClaim"))?.value).toBe("claim-token");
  });

  it("keeps the token when the session cannot be read", async () => {
    const db = await withToken();
    const { client, raw } = fakeClient({ sessionError: new Error("offline") });
    await expect(completeClaim(client, db)).rejects.toThrow("offline");
    expect(raw.rpc).not.toHaveBeenCalled();
    expect((await db.meta.get("pendingClaim"))?.value).toBe("claim-token");
  });

  it("clears the token on success and returns the count", async () => {
    const db = await withToken();
    const { client, raw } = fakeClient({
      session: GOOGLE,
      rpc: { claim_matches: () => ({ data: 3, error: null }) },
    });
    expect(await completeClaim(client, db)).toBe(3);
    expect(raw.rpc).toHaveBeenCalledWith("claim_matches", { p_token: "claim-token" });
    expect(await db.meta.get("pendingClaim")).toBeUndefined();
  });

  it("clears the token on claim_invalid and returns 0", async () => {
    const db = await withToken();
    const { client } = fakeClient({
      session: GOOGLE,
      rpc: { claim_matches: () => ({ data: null, error: { message: "claim_invalid" }, status: 400 }) },
    });
    expect(await completeClaim(client, db)).toBe(0);
    expect(await db.meta.get("pendingClaim")).toBeUndefined();
  });

  it.each([
    ["a network failure", () => ({ data: null, error: { message: "Failed to fetch" }, status: 0 })],
    ["an unknown server error", () => ({ data: null, error: { message: "internal" }, status: 500 })],
    ["an unexpected reply", () => ({ data: "three", error: null })],
  ])("rejects and keeps the token after %s", async (_name, reply) => {
    const db = await withToken();
    const { client } = fakeClient({ session: GOOGLE, rpc: { claim_matches: reply } });
    await expect(completeClaim(client, db)).rejects.toThrow();
    expect((await db.meta.get("pendingClaim"))?.value).toBe("claim-token");
  });

  it("rejects and keeps the token when the call throws", async () => {
    const db = await withToken();
    const { client } = fakeClient({
      session: GOOGLE,
      rpc: {
        claim_matches: () => {
          throw new TypeError("fetch failed");
        },
      },
    });
    await expect(completeClaim(client, db)).rejects.toThrow("fetch failed");
    expect((await db.meta.get("pendingClaim"))?.value).toBe("claim-token");
  });
});

describe("takeOverScoring", () => {
  const PAGE = 1000;

  function ownerRow(rules: Rules): OwnerRow {
    return { code: "abcd2345", title: "Lions v Tigers", team_a: "Lions", team_b: "Tigers", rules };
  }

  function serverMatch(balls: number): TestMatch {
    const match = new TestMatch({ overs: 250 });
    for (let i = 0; i < balls; i++) {
      if (i > 0 && i % 6 === 0) match.bowler(i % 12 === 0 ? "Hamza" : "Bilal");
      match.ball({ runs: i % 5 === 4 ? 4 : 1 });
    }
    return match;
  }

  function serverFor(events: MatchEvent[], rules: Rules, extra: FakeOptions["rpc"] = {}) {
    const pages: number[] = [];
    const fake = fakeClient({
      session: GOOGLE,
      matchRow: ownerRow(rules),
      rpc: {
        take_over_scoring: () => ({ data: events.length, error: null }),
        get_owner_events: (args) => {
          const after = args.p_after as number;
          pages.push(after);
          return { data: events.filter((event) => event.seq > after).slice(0, PAGE), error: null };
        },
        ...extra,
      },
    });
    return { ...fake, pages };
  }

  async function stored(db: LocalDb, matchId: string): Promise<StoredEvent[]> {
    return db.events.where("matchId").equals(matchId).sortBy("seq");
  }

  it("writes server events locally as synced", async () => {
    const db = freshDb();
    const match = serverMatch(8);
    const matchId = crypto.randomUUID();
    const { client, raw, order, select, eq } = serverFor(match.events, match.state.rules);

    await takeOverScoring(client, db, matchId);

    const device = await getDeviceId(db);
    expect(raw.rpc).toHaveBeenCalledWith("take_over_scoring", { p_match: matchId, p_device: device });
    expect(raw.rpc).toHaveBeenCalledWith("get_owner_events", { p_match: matchId, p_after: 0 });
    expect(order.slice(0, 3)).toEqual(["rpc:take_over_scoring", "from:matches", "rpc:get_owner_events"]);
    expect(select).toHaveBeenCalledWith("code, title, team_a, team_b, rules");
    expect(eq).toHaveBeenCalledWith("id", matchId);

    expect(await loadEvents(db, matchId)).toEqual(match.events);
    const local = await db.matches.get(matchId);
    expect(local).toMatchObject({
      id: matchId,
      code: "abcd2345",
      title: "Lions v Tigers",
      teams: ["Lions", "Tigers"],
      rules: match.state.rules,
      lastSeq: match.events.length,
      syncedSeq: match.events.length,
      syncState: "synced",
      blockedReason: null,
    });
    expect(local?.summary).toEqual(summarize(replay(match.events)));
    expect(await db.meta.toArray()).toEqual([{ key: "deviceId", value: device }]);
  });

  it("pages through owner events until a short page", async () => {
    const db = freshDb();
    const match = serverMatch(PAGE + 20);
    const matchId = crypto.randomUUID();
    const { client, pages } = serverFor(match.events, match.state.rules);

    await takeOverScoring(client, db, matchId);

    expect(pages).toEqual([0, PAGE, match.events.length]);
    const events = await loadEvents(db, matchId);
    expect(events).toHaveLength(match.events.length);
    expect(events.map((event) => event.seq)).toEqual(match.events.map((event) => event.seq));
    expect((await db.matches.get(matchId))?.syncedSeq).toBe(match.events.length);
  });

  it("replaces a fully synced local copy without orphaning anything", async () => {
    const db = freshDb();
    const local = await createLocalMatch(db, setup());
    await db.matches.update(local.id, { syncedSeq: local.lastSeq, syncState: "synced" });
    const match = serverMatch(12);
    const { client } = serverFor(match.events, match.state.rules);

    await takeOverScoring(client, db, local.id);

    expect(await loadEvents(db, local.id)).toEqual(match.events);
    expect((await db.matches.get(local.id))?.createdAt).toBe(local.createdAt);
    expect(await db.meta.get(`orphaned:${local.id}`)).toBeUndefined();
  });

  it("keeps unsynced local events under an orphaned key instead of dropping them", async () => {
    const db = freshDb();
    const local = await createLocalMatch(db, setup());
    const syncedSeq = local.lastSeq;
    await db.matches.update(local.id, { syncedSeq, syncState: "pending" });
    const state = replay(await loadEvents(db, local.id));
    await appendEvents(db, local.id, [deliveryDraft(state, { runs: 4 })]);
    await appendEvents(db, local.id, [deliveryDraft(replay(await loadEvents(db, local.id)), { runs: 1 })]);
    const unsynced = (await stored(db, local.id)).filter((event) => event.seq > syncedSeq);
    expect(unsynced).toHaveLength(2);

    const match = serverMatch(3);
    const { client } = serverFor(match.events, match.state.rules);
    await takeOverScoring(client, db, local.id);

    expect((await db.meta.get(`orphaned:${local.id}`))?.value).toEqual(unsynced);
    expect(await loadEvents(db, local.id)).toEqual(match.events);
    const replaced = await db.matches.get(local.id);
    expect(replaced).toMatchObject({ lastSeq: match.events.length, syncedSeq: match.events.length, syncState: "synced" });
  });

  it("keeps earlier orphaned events when the same match is taken over again", async () => {
    const db = freshDb();
    const local = await createLocalMatch(db, setup());
    const match = serverMatch(3);
    const { client } = serverFor(match.events, match.state.rules);

    async function scoreOffline(): Promise<string> {
      const events = await loadEvents(db, local.id);
      await db.matches.update(local.id, { syncedSeq: events.length, syncState: "pending" });
      const [event] = await appendEvents(db, local.id, [deliveryDraft(replay(events), { runs: 2 })]);
      return event.id;
    }

    const first = await scoreOffline();
    await takeOverScoring(client, db, local.id);
    const second = await scoreOffline();
    await takeOverScoring(client, db, local.id);

    const kept = (await db.meta.get(`orphaned:${local.id}`))?.value as StoredEvent[];
    expect(kept.map((event) => event.id)).toEqual([first, second]);
    expect(await loadEvents(db, local.id)).toEqual(match.events);
  });

  it("refuses a take-over reply that carries no last_seq", async () => {
    const db = freshDb();
    const local = await createLocalMatch(db, setup());
    const { client, raw } = fakeClient({
      session: GOOGLE,
      rpc: { take_over_scoring: () => ({ data: null, error: null }) },
    });

    await expect(takeOverScoring(client, db, local.id)).rejects.toThrow("Unexpected take-over response");

    expect(raw.from).not.toHaveBeenCalled();
    expect(await db.matches.get(local.id)).toEqual(local);
  });

  it("writes nothing when the paged events stop short of the server's last_seq", async () => {
    const db = freshDb();
    const local = await createLocalMatch(db, setup());
    await db.matches.update(local.id, { syncedSeq: 2, syncState: "pending" });
    const before = await loadEvents(db, local.id);
    const beforeMatch = await db.matches.get(local.id);
    const match = serverMatch(3);
    const { client } = serverFor(match.events, match.state.rules, {
      take_over_scoring: () => ({ data: match.events.length + 4, error: null }),
    });

    await expect(takeOverScoring(client, db, local.id)).rejects.toThrow("incomplete");

    expect(await loadEvents(db, local.id)).toEqual(before);
    expect(await db.matches.get(local.id)).toEqual(beforeMatch);
    expect(await db.meta.get(`orphaned:${local.id}`)).toBeUndefined();
  });

  it("writes nothing when the local syncedSeq is ahead of the local lastSeq", async () => {
    const db = freshDb();
    const local = await createLocalMatch(db, setup());
    await db.matches.update(local.id, { syncedSeq: local.lastSeq + 2 });
    const before = await loadEvents(db, local.id);
    const beforeMatch = await db.matches.get(local.id);
    const match = serverMatch(3);
    const { client } = serverFor(match.events, match.state.rules);

    await expect(takeOverScoring(client, db, local.id)).rejects.toThrow("ahead of the local events");

    expect(await loadEvents(db, local.id)).toEqual(before);
    expect(await db.matches.get(local.id)).toEqual(beforeMatch);
    expect(await db.meta.get(`orphaned:${local.id}`)).toBeUndefined();
  });

  it("picks up events this device pushed late, after the take-over snapshot", async () => {
    const db = freshDb();
    const match = serverMatch(8);
    const matchId = crypto.randomUUID();
    const snapshot = match.events.slice(0, 10);
    let landed = false;
    const { client, raw } = serverFor(snapshot, match.state.rules, {
      get_owner_events: (args) => {
        const after = args.p_after as number;
        const visible = landed ? match.events : snapshot;
        landed = true;
        return { data: visible.filter((event) => event.seq > after), error: null };
      },
    });

    await takeOverScoring(client, db, matchId);

    expect(raw.rpc).toHaveBeenCalledWith("get_owner_events", { p_match: matchId, p_after: snapshot.length });
    expect(await loadEvents(db, matchId)).toEqual(match.events);
    const local = await db.matches.get(matchId);
    expect(local).toMatchObject({
      lastSeq: match.events.length,
      syncedSeq: match.events.length,
      syncState: "synced",
      blockedReason: null,
    });
    expect(local?.summary).toEqual(summarize(replay(match.events)));
  });

  it("leaves the local copy alone when the take-over is refused", async () => {
    const db = freshDb();
    const local = await createLocalMatch(db, setup());
    const before = await loadEvents(db, local.id);
    const { client, raw } = fakeClient({
      session: GOOGLE,
      rpc: { take_over_scoring: () => ({ data: null, error: { message: "not_owner" }, status: 400 }) },
    });

    await expect(takeOverScoring(client, db, local.id)).rejects.toThrow("not_owner");

    expect(raw.from).not.toHaveBeenCalled();
    expect(await loadEvents(db, local.id)).toEqual(before);
    expect(await db.matches.get(local.id)).toEqual(local);
  });
});
