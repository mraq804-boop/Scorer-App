import "server-only";
import { logoUrl, photoUrl } from "@/lib/brand";
import { CODE_RE } from "@/lib/local/code";
import { replay } from "@/lib/scoring";
import type { MatchState, TeamSide } from "@/lib/scoring";
import { getLiveMatch } from "@/server/live";
import type { LiveTeam } from "@/server/live";
import { embedImages } from "./images";

export type MatchBrand = {
  side: TeamSide;
  colour: string | null;
  logoUrl: string | null;
  potmPlayerId: string | null;
  resultOverride: "no_result" | null;
  xi: string[];
  photoUrlOf: (playerId: string) => string | null;
} | null;

export type SharedMatch = { code: string; state: MatchState; brand: MatchBrand };

async function brandFor(team: LiveTeam | null): Promise<MatchBrand> {
  if (team === null) return null;
  const logo = logoUrl(team.code, team.logoVersion);
  const photoOf = (playerId: string) => photoUrl(team.code, playerId, team.photos[playerId]);
  const images = await embedImages([logo, ...team.xi.map(photoOf)]);
  const embedded = (url: string | null) => (url === null ? null : (images.get(url) ?? null));
  return {
    side: team.side,
    colour: team.colour,
    logoUrl: embedded(logo),
    potmPlayerId: team.potmPlayerId,
    resultOverride: team.resultOverride,
    xi: team.xi,
    photoUrlOf: (playerId) => embedded(photoOf(playerId)),
  };
}

export async function loadSharedMatch(code: string): Promise<SharedMatch | null> {
  if (!CODE_RE.test(code)) return null;
  const live = await getLiveMatch(code);
  if (live === null) return null;
  return { code, state: replay(live.events), brand: await brandFor(live.match.team ?? null) };
}
