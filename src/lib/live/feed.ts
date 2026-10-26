import type { RealtimeClient } from "@supabase/realtime-js";
import type { MatchEvent } from "@/lib/scoring";
import { contiguousPrefix, mergeEvents } from "./merge";

export const SUBSCRIBE_TIMEOUT_MS = 5000;
export const PAGE_LIMIT = 1000;

const REQUEST_TIMEOUT_POLLS = 2;

type FeedClient = Pick<RealtimeClient, "channel" | "removeChannel" | "disconnect">;

export type LiveFeedOptions = {
  createClient: () => FeedClient;
  matchId: string;
  code: string;
  initial: readonly MatchEvent[];
  pollMs: number;
  isVisible: () => boolean;
  onChange: (events: MatchEvent[]) => void;
};

function isMatchEvent(value: unknown): value is MatchEvent {
  if (typeof value !== "object" || value === null) return false;
  const { id, seq, type } = value as Record<string, unknown>;
  return typeof id === "string" && typeof seq === "number" && typeof type === "string";
}

async function fetchEventsAfter(code: string, after: number, signal: AbortSignal): Promise<MatchEvent[]> {
  const response = await fetch(`/api/m/${encodeURIComponent(code)}/events?after=${after}`, { cache: "no-cache", signal });
  if (!response.ok) throw new Error(`events request failed with ${response.status}`);
  const body: unknown = await response.json();
  const events = typeof body === "object" && body !== null ? (body as { events?: unknown }).events : undefined;
  if (!Array.isArray(events)) throw new Error("events response has no list of events");
  return events.filter(isMatchEvent);
}

export function startLiveFeed({ createClient, matchId, code, initial, pollMs, isVisible, onChange }: LiveFeedOptions): () => void {
  let events = mergeEvents([], initial).events;
  let settledSeq = contiguousPrefix(events).length;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let inFlight: AbortController | undefined;
  let teardown: (() => void) | undefined;
  let fetching = false;
  let fetchAgain = false;
  let fallback = false;
  let fetchFailed = false;
  let stopped = false;

  function syncPolling(): void {
    if (stopped) return;
    if (fallback || fetchFailed || events.length !== settledSeq) {
      pollTimer ??= setInterval(poll, pollMs);
    } else {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  }

  function ingest(incoming: readonly MatchEvent[]): boolean {
    const merged = mergeEvents(events, incoming);
    events = merged.events;
    const settled = contiguousPrefix(events);
    if (settled.length !== settledSeq) {
      settledSeq = settled.length;
      onChange(settled);
    }
    syncPolling();
    return merged.gap;
  }

  async function catchUp(): Promise<void> {
    if (stopped) return;
    if (fetching) {
      fetchAgain = true;
      return;
    }
    fetching = true;
    const request = new AbortController();
    inFlight = request;
    const timeout = setTimeout(() => request.abort(), REQUEST_TIMEOUT_POLLS * pollMs);
    const before = settledSeq;
    const fetched = await fetchEventsAfter(code, settledSeq, request.signal).catch(() => null);
    clearTimeout(timeout);
    inFlight = undefined;
    fetching = false;
    if (stopped) return;
    fetchFailed = fetched === null;
    if (fetched === null) syncPolling();
    else ingest(fetched);
    const pageFull = fetched !== null && fetched.length >= PAGE_LIMIT && settledSeq > before;
    if (fetchAgain || pageFull) {
      fetchAgain = false;
      await catchUp();
    }
  }

  function poll(): void {
    if (isVisible() && !fetching) void catchUp();
  }

  function enterFallback(): void {
    if (stopped || fallback) return;
    fallback = true;
    syncPolling();
    poll();
  }

  function onStatus(status: string): void {
    if (stopped) return;
    if (status !== "SUBSCRIBED") {
      enterFallback();
      return;
    }
    clearTimeout(subscribeTimer);
    fallback = false;
    syncPolling();
    void catchUp();
  }

  function onBroadcast(message: { payload?: unknown }): void {
    if (stopped || !isMatchEvent(message.payload)) return;
    if (ingest([message.payload])) void catchUp();
  }

  const subscribeTimer = setTimeout(enterFallback, SUBSCRIBE_TIMEOUT_MS);
  try {
    const client = createClient();
    const channel = client
      .channel(`match:${matchId}`, { config: { private: true } })
      .on("broadcast", { event: "event" }, onBroadcast)
      .subscribe(onStatus);
    teardown = () => {
      void client
        .removeChannel(channel)
        .catch(() => undefined)
        .then(() => client.disconnect());
    };
  } catch {
    enterFallback();
  }

  return () => {
    stopped = true;
    inFlight?.abort();
    clearTimeout(subscribeTimer);
    clearInterval(pollTimer);
    pollTimer = undefined;
    teardown?.();
  };
}
