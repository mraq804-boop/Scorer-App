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

const { REQUEST_TIMEOUT_MS, createSupabaseBrowser, fetchWithTimeout } = await import("@/lib/supabase/browser");

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

describe("fetchWithTimeout", () => {
  it("gives up on a request that has not finished after 15 seconds", async () => {
    const fetchMock = hangingFetch();
    const request = outcome(fetchWithTimeout("https://project.supabase.co/rest/v1/rpc/push_match_events", { method: "POST" }));

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    expect(request.settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(request.error).toBeInstanceOf(Error);
    expect(REQUEST_TIMEOUT_MS).toBe(15_000);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/rpc/push_match_events",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }),
    );
  });

  it("still stops when the caller aborts first", async () => {
    hangingFetch();
    const caller = new AbortController();
    const request = outcome(fetchWithTimeout("https://project.supabase.co/auth/v1/user", { signal: caller.signal }));

    caller.abort();
    await vi.advanceTimersByTimeAsync(0);

    expect(request.error).toBeDefined();
  });

  it("returns a response that arrives in time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true })),
    );

    const response = await fetchWithTimeout("https://project.supabase.co/rest/v1/matches");
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);

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
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    expect(sync.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await until(() => sync.settled);

    expect(sync.value).toBe("pending");
    expect(await push.mock.results[0]?.value).toEqual({ ok: false, error: "network" });
    expect(await db.matches.get(match.id)).toMatchObject({ syncState: "pending", syncedSeq: 0, lastSeq: 5 });
    expect(await loadEvents(db, match.id)).toHaveLength(5);
  });
});
