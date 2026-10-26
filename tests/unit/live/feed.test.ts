import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUBSCRIBE_TIMEOUT_MS, startLiveFeed } from "@/lib/live/feed";
import type { LiveFeedOptions } from "@/lib/live/feed";
import type { MatchEvent } from "@/lib/scoring";

const MATCH_ID = "0b1c2d3e-0000-4000-8000-000000000001";
const CODE = "abcd2345";
const POLL_MS = 5000;
const PAGE_LIMIT = 1000;

type Message = { payload?: unknown };

function event(seq: number): MatchEvent {
  return { id: `e${seq}`, seq, at: "2026-10-23T10:00:00.000Z", type: "strike_swapped" };
}

function upTo(seq: number): MatchEvent[] {
  return Array.from({ length: seq }, (_, index) => event(index + 1));
}

function seqs(events: readonly MatchEvent[]): number[] {
  return events.map((e) => e.seq);
}

function eventsUrl(after: number): string {
  return `/api/m/${CODE}/events?after=${after}`;
}

function fakeRealtime() {
  let onBroadcast: ((message: Message) => void) | undefined;
  let onStatus: ((status: string) => void) | undefined;
  const channel = {
    on: vi.fn((_type: string, _filter: unknown, callback: (message: Message) => void) => {
      onBroadcast = callback;
      return channel;
    }),
    subscribe: vi.fn((callback: (status: string) => void) => {
      onStatus = callback;
      return channel;
    }),
  };
  const client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => "ok"),
    disconnect: vi.fn(async () => ({ error: null })),
  };
  return {
    channel,
    client,
    createClient: () => client as unknown as ReturnType<LiveFeedOptions["createClient"]>,
    deliver: (payload: unknown) => onBroadcast?.({ payload }),
    status: (status: string) => onStatus?.(status),
  };
}

function fakeServer(events: MatchEvent[]) {
  const urls: string[] = [];
  const inits: Array<RequestInit | undefined> = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    urls.push(url);
    inits.push(init);
    const after = Number(new URL(url, "http://localhost").searchParams.get("after"));
    return Response.json({ events: events.filter((e) => e.seq > after).slice(0, PAGE_LIMIT) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { events, urls, inits, fetchMock };
}

function requested(server: ReturnType<typeof fakeServer>): string[] {
  return server.fetchMock.mock.calls.map(([input]) => String(input));
}

function start(initial: MatchEvent[], realtime = fakeRealtime(), page = { visible: true }) {
  const onChange = vi.fn<(events: MatchEvent[]) => void>();
  const stop = startLiveFeed({
    createClient: realtime.createClient,
    matchId: MATCH_ID,
    code: CODE,
    initial,
    pollMs: POLL_MS,
    isVisible: () => page.visible,
    onChange,
  });
  return { realtime, onChange, stop };
}

function lastPublished(onChange: ReturnType<typeof vi.fn<(events: MatchEvent[]) => void>>): number[] {
  return seqs(onChange.mock.calls.at(-1)?.[0] ?? []);
}

async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("startLiveFeed realtime", () => {
  it("subscribes to the private topic for the match", () => {
    fakeServer([]);
    const { realtime } = start(upTo(2));
    expect(realtime.client.channel).toHaveBeenCalledWith(`match:${MATCH_ID}`, { config: { private: true } });
    expect(realtime.channel.on).toHaveBeenCalledWith("broadcast", { event: "event" }, expect.any(Function));
  });

  it("publishes each new event once and ignores duplicates", () => {
    fakeServer([]);
    const { realtime, onChange } = start(upTo(2));
    realtime.status("SUBSCRIBED");

    realtime.deliver(event(3));
    realtime.deliver(event(3));
    realtime.deliver(event(2));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(lastPublished(onChange)).toEqual([1, 2, 3]);
  });

  it("ignores payloads that are not events", () => {
    fakeServer([]);
    const { realtime, onChange } = start(upTo(1));
    realtime.deliver(null);
    realtime.deliver({ seq: 2 });
    realtime.deliver("event");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("holds back events after a gap until the missing ones are fetched, once", async () => {
    const server = fakeServer(upTo(1));
    const { realtime, onChange } = start(upTo(1));
    realtime.status("SUBSCRIBED");
    await flush();
    server.events.push(event(2), event(3), event(4));
    server.urls.length = 0;

    realtime.deliver(event(4));
    expect(onChange).not.toHaveBeenCalled();
    await flush();

    expect(server.urls).toEqual([eventsUrl(1)]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(lastPublished(onChange)).toEqual([1, 2, 3, 4]);
  });

  it("fetches again when another gap shows up while a fetch is in flight", async () => {
    const resolvers: Array<(events: MatchEvent[]) => void> = [];
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        urls.push(String(input));
        return new Promise<Response>((resolve) => {
          resolvers.push((events) => resolve(Response.json({ events })));
        });
      }),
    );
    const { realtime, onChange } = start(upTo(1));
    realtime.status("SUBSCRIBED");
    resolvers.shift()?.([]);
    await flush();
    urls.length = 0;

    realtime.deliver(event(3));
    realtime.deliver(event(5));
    expect(urls).toEqual([eventsUrl(1)]);

    resolvers.shift()?.([event(2)]);
    await flush();
    expect(lastPublished(onChange)).toEqual([1, 2, 3]);
    expect(urls).toEqual([eventsUrl(1), eventsUrl(3)]);

    resolvers.shift()?.([event(4), event(5)]);
    await flush();
    expect(lastPublished(onChange)).toEqual([1, 2, 3, 4, 5]);
    expect(urls).toHaveLength(2);
  });

  it("catches up once when the channel subscribes and does not poll", async () => {
    const server = fakeServer(upTo(3));
    const { realtime, onChange } = start(upTo(2));

    realtime.status("SUBSCRIBED");
    await flush();
    expect(server.urls).toEqual([eventsUrl(2)]);
    expect(lastPublished(onChange)).toEqual([1, 2, 3]);

    await vi.advanceTimersByTimeAsync(SUBSCRIBE_TIMEOUT_MS + POLL_MS * 4);
    expect(server.urls).toHaveLength(1);
  });
});

describe("startLiveFeed recovery while subscribed", () => {
  async function subscribed(initial: MatchEvent[], serverEvents: MatchEvent[]) {
    const server = fakeServer(serverEvents);
    const feed = start(initial);
    feed.realtime.status("SUBSCRIBED");
    await flush();
    server.fetchMock.mockClear();
    return { server, ...feed };
  }

  it("retries a failed catch-up on the poll interval until it works, then stops polling", async () => {
    const server = fakeServer(upTo(3));
    server.fetchMock.mockRejectedValueOnce(new TypeError("network"));
    const { realtime, onChange } = start(upTo(2));

    realtime.status("SUBSCRIBED");
    await flush();
    expect(server.fetchMock).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(requested(server)).toEqual([eventsUrl(2), eventsUrl(2)]);
    expect(lastPublished(onChange)).toEqual([1, 2, 3]);

    await vi.advanceTimersByTimeAsync(POLL_MS * 4);
    expect(server.fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a failed gap fill", async () => {
    const { server, realtime, onChange } = await subscribed(upTo(1), upTo(1));
    server.events.push(event(2), event(3), event(4));
    server.fetchMock.mockRejectedValueOnce(new TypeError("network"));

    realtime.deliver(event(4));
    await flush();
    expect(requested(server)).toEqual([eventsUrl(1)]);
    expect(onChange).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(requested(server)).toEqual([eventsUrl(1), eventsUrl(1)]);
    expect(lastPublished(onChange)).toEqual([1, 2, 3, 4]);

    await vi.advanceTimersByTimeAsync(POLL_MS * 4);
    expect(server.fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps retrying while the gap is still open, for example behind a stale cached copy", async () => {
    const { server, realtime, onChange } = await subscribed(upTo(1), upTo(1));
    server.events.push(event(2));

    realtime.deliver(event(4));
    await flush();
    expect(requested(server)).toEqual([eventsUrl(1)]);
    expect(lastPublished(onChange)).toEqual([1, 2]);

    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(requested(server)).toEqual([eventsUrl(1), eventsUrl(2)]);

    server.events.push(event(3), event(4));
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(requested(server)).toEqual([eventsUrl(1), eventsUrl(2), eventsUrl(2)]);
    expect(lastPublished(onChange)).toEqual([1, 2, 3, 4]);

    await vi.advanceTimersByTimeAsync(POLL_MS * 4);
    expect(server.fetchMock).toHaveBeenCalledTimes(3);
  });

  it("pages past the 1000 event cap without waiting for the next poll", async () => {
    const server = fakeServer(upTo(2500));
    const { realtime, onChange } = start(upTo(1));

    realtime.status("SUBSCRIBED");
    for (let i = 0; i < 5; i++) await flush();

    expect(requested(server)).toEqual([eventsUrl(1), eventsUrl(1001), eventsUrl(2001)]);
    expect(lastPublished(onChange)).toHaveLength(2500);

    await vi.advanceTimersByTimeAsync(POLL_MS * 4);
    expect(server.fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops paging when a full page does not move the feed forward", async () => {
    const server = fakeServer(upTo(1).concat(Array.from({ length: PAGE_LIMIT }, (_, i) => event(i + 5))));
    const { realtime } = start(upTo(1));

    realtime.status("SUBSCRIBED");
    for (let i = 0; i < 5; i++) await flush();

    expect(server.fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("startLiveFeed polling fallback", () => {
  it("polls from the last contiguous seq every interval when the channel has not subscribed in 5 s", async () => {
    const server = fakeServer(upTo(2));
    const { onChange } = start(upTo(2));

    await vi.advanceTimersByTimeAsync(SUBSCRIBE_TIMEOUT_MS - 1);
    expect(server.urls).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(server.urls).toEqual([eventsUrl(2)]);
    expect(server.fetchMock).toHaveBeenCalledWith(eventsUrl(2), expect.objectContaining({ cache: "no-cache" }));
    expect(server.inits.every((init) => init?.signal instanceof AbortSignal)).toBe(true);

    server.events.push(event(3));
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(server.urls.at(-1)).toBe(eventsUrl(2));
    expect(lastPublished(onChange)).toEqual([1, 2, 3]);

    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(server.urls.at(-1)).toBe(eventsUrl(3));
  });

  it.each(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"])(
    "starts polling right away when the channel reports %s",
    async (status) => {
      const server = fakeServer(upTo(3));
      const { realtime, onChange } = start(upTo(2));

      realtime.status(status);
      await flush();

      expect(server.urls).toEqual([eventsUrl(2)]);
      expect(lastPublished(onChange)).toEqual([1, 2, 3]);
    },
  );

  it("polls when the realtime client cannot be created", async () => {
    const server = fakeServer(upTo(3));
    const onChange = vi.fn<(events: MatchEvent[]) => void>();
    startLiveFeed({
      createClient: () => {
        throw new Error("no websocket");
      },
      matchId: MATCH_ID,
      code: CODE,
      initial: upTo(2),
      pollMs: POLL_MS,
      isVisible: () => true,
      onChange,
    });
    await flush();
    expect(server.urls).toEqual([eventsUrl(2)]);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("pauses while the page is hidden and resumes when it is visible", async () => {
    const server = fakeServer(upTo(2));
    const page = { visible: true };
    const { realtime } = start(upTo(2), fakeRealtime(), page);
    realtime.status("CLOSED");
    await flush();
    expect(server.urls).toHaveLength(1);

    page.visible = false;
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(server.urls).toHaveLength(1);

    page.visible = true;
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(server.urls).toHaveLength(2);
  });

  it("keeps polling after a failed request", async () => {
    const server = fakeServer(upTo(3));
    server.fetchMock.mockRejectedValueOnce(new TypeError("network"));
    const { realtime, onChange } = start(upTo(2));

    realtime.status("CLOSED");
    await flush();
    expect(onChange).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(lastPublished(onChange)).toEqual([1, 2, 3]);
  });

  it("treats a non-OK response as a failure and tries again on the next poll", async () => {
    const server = fakeServer(upTo(3));
    server.fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    const { realtime, onChange } = start(upTo(2));

    realtime.status("CLOSED");
    await flush();
    expect(server.fetchMock).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(lastPublished(onChange)).toEqual([1, 2, 3]);
  });

  it("stops polling once the channel subscribes late", async () => {
    const server = fakeServer(upTo(3));
    const { realtime } = start(upTo(2));

    await vi.advanceTimersByTimeAsync(SUBSCRIBE_TIMEOUT_MS);
    expect(server.urls).toHaveLength(1);

    realtime.status("SUBSCRIBED");
    await flush();
    const afterSubscribe = server.urls.length;
    await vi.advanceTimersByTimeAsync(POLL_MS * 4);
    expect(server.urls).toHaveLength(afterSubscribe);
  });
});

describe("startLiveFeed hung requests", () => {
  it("aborts a request that takes longer than twice the poll interval and polls again", async () => {
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal;
      signals.push(signal);
      if (signals.length > 1) return Promise.resolve(Response.json({ events: [event(3)] }));
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { realtime, onChange } = start(upTo(2));

    realtime.status("CLOSED");
    await flush();
    await vi.advanceTimersByTimeAsync(POLL_MS * 2 - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(signals[0].aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(signals[0].aborted).toBe(true);

    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(lastPublished(onChange)).toEqual([1, 2, 3]);
  });
});

describe("startLiveFeed stop", () => {
  it("removes the channel, closes the socket and ignores later events, timers and statuses", async () => {
    const server = fakeServer(upTo(3));
    const { realtime, onChange, stop } = start(upTo(2));

    stop();
    realtime.deliver(event(3));
    realtime.status("CLOSED");
    await vi.advanceTimersByTimeAsync(SUBSCRIBE_TIMEOUT_MS + POLL_MS * 3);

    expect(realtime.client.removeChannel).toHaveBeenCalledWith(realtime.channel);
    expect(realtime.client.disconnect).toHaveBeenCalledTimes(1);
    expect(server.urls).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("drops a response that arrives after it was stopped", async () => {
    let resolve: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((r) => (resolve = r))),
    );
    const { realtime, onChange, stop } = start(upTo(2));
    realtime.status("CLOSED");

    stop();
    resolve(Response.json({ events: [event(3)] }));
    await flush();

    expect(onChange).not.toHaveBeenCalled();
  });
});
