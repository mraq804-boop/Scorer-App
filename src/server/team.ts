import "server-only";
import { unstable_cache } from "next/cache";
import { CODE_RE } from "@/lib/local/code";
import { aggregateTeamStats, parseTeamPage, seasonOf } from "@/lib/team";
import type { TeamPageData, TeamPageMatch, TeamStats } from "@/lib/team";
import { createSupabasePublic } from "./supabase/public";

export const TEAM_PAGE_CACHE_SECONDS = 60;

const fetchTeamPage = unstable_cache(
  async (code: string): Promise<TeamPageData | null> => {
    const { data, error } = await createSupabasePublic().rpc("get_team_page", { p_code: code });
    if (error !== null) throw new Error(`get_team_page failed: ${error.message}`);
    return parseTeamPage(data);
  },
  ["team-page"],
  { revalidate: TEAM_PAGE_CACHE_SECONDS },
);

export async function getTeamPage(code: string): Promise<TeamPageData | null> {
  return CODE_RE.test(code) ? fetchTeamPage(code) : null;
}

export function selectedSeason(page: TeamPageData, param: string | string[] | undefined, now: Date): string | null {
  if (param === "all") return null;
  if (typeof param === "string" && page.seasons.some((season) => season.id === param)) return param;
  return seasonOf(now.toISOString(), page.seasons, page.team.timeZone);
}

export function teamStats(page: TeamPageData, seasonId: string | null): TeamStats {
  return aggregateTeamStats(page.matches, page.squad, { seasonId, seasons: page.seasons, timeZone: page.team.timeZone });
}

export function matchesInSeason(page: TeamPageData, seasonId: string | null): TeamPageMatch[] {
  if (seasonId === null) return page.matches;
  return page.matches.filter(
    (match) => match.record !== null && seasonOf(match.record.playedAt, page.seasons, page.team.timeZone) === seasonId,
  );
}

export function seasonQuery(seasonId: string | null): string {
  return `?season=${seasonId ?? "all"}`;
}
