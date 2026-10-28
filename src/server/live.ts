import "server-only";
import { isColourKey } from "@/lib/brand";
import type { ColourKey } from "@/lib/brand";
import type { MatchEvent, TeamSide } from "@/lib/scoring";
import { createSupabasePublic } from "./supabase/public";

export type LiveTeam = {
  code: string;
  name: string;
  colour: ColourKey | null;
  logoVersion: number | null;
  side: TeamSide;
  potmPlayerId: string | null;
  resultOverride: "no_result" | null;
  xi: string[];
  photos: Record<string, number>;
};

export type LiveMatchHeader = {
  id: string;
  code: string;
  title: string;
  teamA: string;
  teamB: string;
  status: "in_progress" | "complete";
  updatedAt: string;
  team: LiveTeam | null;
};

export type LiveMatch = { match: LiveMatchHeader; events: MatchEvent[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function version(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : null;
}

function parseLiveTeam(value: unknown): LiveTeam | null {
  if (!isRecord(value)) return null;
  const { code, name, side } = value;
  if (typeof code !== "string" || typeof name !== "string" || (side !== "A" && side !== "B")) return null;
  const photos = isRecord(value.photos) ? value.photos : {};
  return {
    code,
    name,
    colour: isColourKey(value.colour) ? value.colour : null,
    logoVersion: version(value.logoVersion),
    side,
    potmPlayerId: typeof value.potmPlayerId === "string" ? value.potmPlayerId : null,
    resultOverride: value.resultOverride === "no_result" ? "no_result" : null,
    xi: Array.isArray(value.xi) ? value.xi.filter((id): id is string => typeof id === "string") : [],
    photos: Object.fromEntries(
      Object.entries(photos).flatMap(([id, photo]) => {
        const parsed = version(photo);
        return parsed === null ? [] : [[id, parsed]];
      }),
    ),
  };
}

export async function getLiveMatch(code: string): Promise<LiveMatch | null> {
  const { data, error } = await createSupabasePublic().rpc("get_live_match", { p_code: code });
  if (error !== null) throw new Error(`get_live_match failed: ${error.message}`);
  if (data === null) return null;
  if (!isRecord(data) || !isRecord(data.match) || !Array.isArray(data.events)) {
    throw new Error("get_live_match returned an unexpected shape");
  }
  const live = data as LiveMatch;
  return { ...live, match: { ...live.match, team: parseLiveTeam(data.match.team) } };
}

export async function getLiveEvents(code: string, after: number): Promise<MatchEvent[]> {
  const { data, error } = await createSupabasePublic().rpc("get_live_events", { p_code: code, p_after: after });
  if (error !== null) throw new Error(`get_live_events failed: ${error.message}`);
  if (!Array.isArray(data)) throw new Error("get_live_events returned an unexpected shape");
  return data as MatchEvent[];
}
