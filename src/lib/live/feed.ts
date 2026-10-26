import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchEvent } from "@/lib/scoring";
import { contiguousPrefix, mergeEvents } from "./merge";

export const SUBSCRIBE_TIMEOUT_MS = 5000;

type FeedClient = Pick<SupabaseClient, "channel" | "removeChannel">;

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
  if (!response.ok) return [];
  const body: unknown = await response.json();
  const events = typeof body === "object" && body !== null ? (body as { events?: unknown }).events : undefined;
  return Array.isArray(events) ? events.filter(isMatchEvent) : [];
}

export function startLiveFeed({ createClient, matchId, code, initial, pollMs, isVisible, onChange }: LiveFeedOptions): () => void {
  const abort = new AbortController();
  let events = mergeEvents([], initial).events;
  let settledSeq = contiguousPrefix(events).length;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let teardown: (() => void) | undefined;
  let fetching = false;
  let fetchAgain = false;
  let stopped = false;

  function ingest(incoming: readonly MatchEvent[]): boolean {
    const merged = mergeEvents(events, incoming);
    events = merged.events;
    const settled = contiguousPrefix(events);
    if (settled.length !== settledSeq) {
      settledSeq = settled.length;
      onChange(settled);
    }
    return merged.gap;
  }

  async function catchUp(): Promise<void> {
    if (stopped) return;
    if (fetching) {
      fetchAgain = true;
      return;
    }
    fetching = true;
    const fetched = await fetchEventsAfter(code, settledSeq, abort.signal).catch(() => []);
    fetching = false;
    if (stopped) return;
    ingest(fetched);
    if (fetchAgain) {
      fetchAgain = false;
      await catchUp();
    }
  }

  function poll(): void {
    if (isVisible() && !fetching) void catchUp();
  }

  function startPolling(): void {
    if (stopped || pollTimer !== undefined) return;
    poll();
    pollTimer = setInterval(poll, pollMs);
  }

  function stopPolling(): void {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }

  function onStatus(status: string): void {
    if (stopped) return;
    if (status === "SUBSCRIBED") {
      clearTimeout(subscribeTimer);
      stopPolling();
      void catchUp();
      return;
    }
    startPolling();
  }

  function onBroadcast(message: { payload?: unknown }): void {
    if (stopped || !isMatchEvent(message.payload)) return;
    if (ingest([message.payload])) void catchUp();
  }

  const subscribeTimer = setTimeout(startPolling, SUBSCRIBE_TIMEOUT_MS);
  try {
    const client = createClient();
    const channel = client
      .channel(`match:${matchId}`, { config: { private: true } })
      .on("broadcast", { event: "event" }, onBroadcast)
      .subscribe(onStatus);
    teardown = () => void client.removeChannel(channel);
  } catch {
    startPolling();
  }

  return () => {
    stopped = true;
    abort.abort();
    clearTimeout(subscribeTimer);
    stopPolling();
    teardown?.();
  };
}
