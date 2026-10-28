import { loadSharedMatch } from "@/server/share/match";
import { PLAYER_POSTER_SIZE, PlayerPoster, posterBrand } from "@/server/share/player-poster";
import { notFound, renderPng } from "@/server/share/render";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: RouteContext<"/m/[code]/poster/[playerId]">) {
  const { code, playerId } = await params;
  const shared = await loadSharedMatch(code);
  const brand = shared === null ? null : posterBrand(shared, playerId);
  if (shared === null || brand === null) return notFound();
  return renderPng(
    <PlayerPoster state={shared.state} brand={brand} playerId={playerId} />,
    PLAYER_POSTER_SIZE,
    "public, s-maxage=60",
  );
}
