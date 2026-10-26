"use client";

import { useEffect, useState } from "react";
import type { MatchEvent } from "@/lib/scoring";
import { startLiveFeed } from "./feed";

const DEFAULT_POLL_MS = 5000;

function pollMs(): number {
  const configured = Number(process.env.NEXT_PUBLIC_POLL_MS);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_POLL_MS;
}

export function realtimeUrl(supabaseUrl: string): string {
  const url = new URL("realtime/v1", supabaseUrl.endsWith("/") ? supabaseUrl : `${supabaseUrl}/`);
  url.protocol = url.protocol.replace("http", "ws");
  return url.href;
}

async function loadRealtimeClient() {
  try {
    return (await import("@supabase/realtime-js")).RealtimeClient;
  } catch {
    return null;
  }
}

export function useLiveEvents(matchId: string, code: string, initial: MatchEvent[]): MatchEvent[] {
  const [seed] = useState(initial);
  const [events, setEvents] = useState(initial);

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    void loadRealtimeClient().then((RealtimeClient) => {
      if (cancelled) return;
      stop = startLiveFeed({
        createClient: () => {
          if (RealtimeClient === null) throw new Error("realtime is unavailable");
          const apikey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
          return new RealtimeClient(realtimeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""), {
            params: { apikey },
            accessToken: async () => apikey,
          });
        },
        matchId,
        code,
        initial: seed,
        pollMs: pollMs(),
        isVisible: () => document.visibilityState === "visible",
        onChange: setEvents,
      });
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [matchId, code, seed]);

  return events;
}
