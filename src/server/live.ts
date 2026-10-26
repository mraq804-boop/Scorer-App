import "server-only";
import type { MatchEvent } from "@/lib/scoring";
import { createSupabasePublic } from "./supabase/public";

export type LiveMatchHeader = {
  id: string;
  code: string;
  title: string;
  teamA: string;
  teamB: string;
  status: "in_progress" | "complete";
  updatedAt: string;
};

export type LiveMatch = { match: LiveMatchHeader; events: MatchEvent[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function getLiveMatch(code: string): Promise<LiveMatch | null> {
  const { data, error } = await createSupabasePublic().rpc("get_live_match", { p_code: code });
  if (error !== null) throw new Error(`get_live_match failed: ${error.message}`);
  if (data === null) return null;
  if (!isRecord(data) || !isRecord(data.match) || !Array.isArray(data.events)) {
    throw new Error("get_live_match returned an unexpected shape");
  }
  return data as LiveMatch;
}

export async function getLiveEvents(code: string, after: number): Promise<MatchEvent[]> {
  const { data, error } = await createSupabasePublic().rpc("get_live_events", { p_code: code, p_after: after });
  if (error !== null) throw new Error(`get_live_events failed: ${error.message}`);
  if (!Array.isArray(data)) throw new Error("get_live_events returned an unexpected shape");
  return data as MatchEvent[];
}
