"use client";

import { useEffect, useState } from "react";
import { publicEnv } from "@/lib/env";
import type { MatchEvent } from "@/lib/scoring";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { startLiveFeed } from "./feed";

export function useLiveEvents(matchId: string, code: string, initial: MatchEvent[]): MatchEvent[] {
  const [seed] = useState(initial);
  const [events, setEvents] = useState(initial);

  useEffect(() => {
    let stop: (() => void) | undefined;
    const start = setTimeout(() => {
      stop = startLiveFeed({
        createClient: createSupabaseBrowser,
        matchId,
        code,
        initial: seed,
        pollMs: publicEnv.NEXT_PUBLIC_POLL_MS,
        isVisible: () => document.visibilityState === "visible",
        onChange: setEvents,
      });
    }, 0);
    return () => {
      clearTimeout(start);
      stop?.();
    };
  }, [matchId, code, seed]);

  return events;
}
