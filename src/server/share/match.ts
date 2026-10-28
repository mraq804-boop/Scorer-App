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

export type PhotoPicker = (state: MatchState, side: TeamSide) => readonly string[];

async function brandFor(team: LiveTeam | null, state: MatchState, pick: PhotoPicker): Promise<MatchBrand> {
  if (team === null) return null;
  const logo = logoUrl(team.code, team.logoVersion);
  const photoOf = (playerId: string) => photoUrl(team.code, playerId, team.photos[playerId]);
  const wanted = pick(state, team.side).filter((playerId) => team.xi.includes(playerId));
  const images = await embedImages([logo, ...wanted.map(photoOf)]);
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

export async function loadSharedMatch(code: string, pick: PhotoPicker = () => []): Promise<SharedMatch | null> {
  if (!CODE_RE.test(code)) return null;
  const live = await getLiveMatch(code);
  if (live === null) return null;
  const state = replay(live.events);
  return { code, state, brand: await brandFor(live.match.team ?? null, state, pick) };
}
