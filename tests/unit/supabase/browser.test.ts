import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultRules } from "@/lib/scoring";
import { LocalDb } from "@/lib/local/db";
import { createLocalMatch, loadEvents } from "@/lib/local/matches";
import { supabasePush } from "@/lib/sync/push";
import { syncMatch } from "@/lib/sync/sync";

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_for_tests_only_0000");

const createBrowserClient = vi.hoisted(() => vi.fn());

vi.mock("@supabase/ssr", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  createBrowserClient.mockImplementation((url: string, key: string, options: Record<string, unknown>) =>
    createClient(url, key, { ...options, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }),
  );
  return { createBrowserClient };
});

const { BASE_TIMEOUT_MS, createSupabaseBrowser, fetchWithTimeout, requestTimeoutMs } = await import("@/lib/supabase/browser");

const opened: LocalDb[] = [];

function hangingFetch() {
  const fetchMock = vi.fn(
    (_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) reject(signal.reason);
        signal?.addEventListener("abort", () => reject(signal.reason));
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function outcome<T>(promise: Promise<T>) {
  const seen: { settled: boolean; value?: T; error?: unknown } = { settled: false };
  promise.then(
    (value) => Object.assign(seen, { settled: true, value }),
    (error: unknown) => Object.assign(seen, { settled: true, error }),
  );
  return seen;
}

async function until(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 500; i++) {
    if (condition()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("condition was never met");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const db of opened.splice(0)) db.close();
});

describe("requestTimeoutMs", () => {
  it("is 20 seconds plus one second per KB of body", () => {
    expect(BASE_TIMEOUT_MS).toBe(20_000);
    expect(requestTimeoutMs(undefined)).toBe(20_000);
    expect(requestTimeoutMs(null)).toBe(20_000);
    expect(requestTimeoutMs("")).toBe(20_000);
    expect(requestTimeoutMs("x".repeat(1024))).toBe(21_000);
    expect(requestTimeoutMs("x".repeat(1025))).toBe(22_000);
    expect(requestTimeoutMs("x".repeat(70 * 1024))).toBe(90_000);
  });

  it("counts bytes, not characters", () => {
    expect(requestTimeoutMs("ا".repeat(1024))).toBe(22_000);
  });

  it("counts binary bodies by their size", () => {
    expect(requestTimeoutMs(new Blob(["x".repeat(3 * 1024)]))).toBe(23_000);
    expect(requestTimeoutMs(new ArrayBuffer(4 * 1024))).toBe(24_000);
    expect(requestTimeoutMs(new Uint8Array(5 * 1024))).toBe(25_000);
  });

  it("falls back to the base for a body it cannot measure", () => {
    expect(requestTimeoutMs(new URLSearchParams({ a: "b" }))).toBe(20_000);
  });
});

describe("fetchWithTimeout", () => {
  it("gives up on a request without a body that has not finished after 20 seconds", async () => {
    const fetchMock = hangingFetch();
    const request = outcome(fetchWithTimeout("https://project.supabase.co/rest/v1/matches"));

    await vi.advanceTimersByTimeAsync(19_999);
    expect(request.settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(request.error).toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/matches",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("waits one more second for every KB of body", async () => {
    hangingFetch();
    const body = "x".repeat(50 * 1024);
    const request = outcome(
      fetchWithTimeout("https://project.supabase.co/rest/v1/rpc/push_match_events", { method: "POST", body }),
    );

    await vi.advanceTimersByTimeAsync(69_999);
    expect(request.settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(request.error).toBeInstanceOf(Error);
  });

  it("leaves a request that brings its own signal to that signal", async () => {
    const fetchMock = hangingFetch();
    const caller = new AbortController();
    const request = outcome(
      fetchWithTimeout("https://project.supabase.co/rest/v1/rpc/get_owner_events", {
        method: "POST",
        body: "{}",
        signal: caller.signal,
      }),
    );

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(request.settled).toBe(false);
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(caller.signal);

    caller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(request.error).toBeDefined();
  });

  it("honours a caller signal that is already aborted", async () => {
    hangingFetch();
    const caller = new AbortController();
    caller.abort();

    const request = outcome(fetchWithTimeout("https://project.supabase.co/auth/v1/user", { signal: caller.signal }));
    await vi.advanceTimersByTimeAsync(0);

    expect(request.error).toBeDefined();
  });

  it("applies the default timeout when the caller's signal is null", async () => {
    hangingFetch();
    const request = outcome(fetchWithTimeout("https://project.supabase.co/auth/v1/user", { signal: null }));

    await vi.advanceTimersByTimeAsync(BASE_TIMEOUT_MS);

    expect(request.error).toBeInstanceOf(Error);
  });

  it("returns a response that arrives in time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true })),
    );

    const response = await fetchWithTimeout("https://project.supabase.co/rest/v1/matches");
    await vi.advanceTimersByTimeAsync(BASE_TIMEOUT_MS);

    expect(await response.json()).toEqual({ ok: true });
  });
});

describe("createSupabaseBrowser", () => {
  it("gives supabase-js the timed fetch for every request", () => {
    createSupabaseBrowser();

    expect(createBrowserClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "sb_publishable_for_tests_only_0000",
      { global: { fetch: fetchWithTimeout } },
    );
  });

  it("turns a push that hangs into a network error and keeps the balls pending", async () => {
    const fetchMock = hangingFetch();
    const db = new LocalDb(`test-${crypto.randomUUID()}`);
    opened.push(db);
    const match = await createLocalMatch(db, {
      teams: ["Lions", "Tigers"],
      rules: defaultRules("tape", 10),
      toss: { winner: "A", choice: "bat" },
      striker: "Ali",
      nonStriker: "Usman",
      bowler: "Hamza",
    });
    const push = vi.fn(supabasePush(createSupabaseBrowser()));

    const sync = outcome(syncMatch(db, match.id, push));
    await until(() => fetchMock.mock.calls.length === 1);
    const timeout = requestTimeoutMs(fetchMock.mock.calls[0][1]?.body);
    expect(timeout).toBeGreaterThan(BASE_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(timeout - 1);
    expect(sync.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await until(() => sync.settled);

    expect(sync.value).toBe("pending");
    expect(await push.mock.results[0]?.value).toEqual({ ok: false, error: "network" });
    expect(await db.matches.get(match.id)).toMatchObject({ syncState: "pending", syncedSeq: 0, lastSeq: 5 });
    expect(await loadEvents(db, match.id)).toHaveLength(5);
  });
});
