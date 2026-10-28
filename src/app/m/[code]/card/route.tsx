import { topPerformers } from "@/lib/team";
import { loadSharedMatch } from "@/server/share/match";
import { notFound, renderPng } from "@/server/share/render";
import { RESULT_POSTER_SIZE, ResultPoster } from "@/server/share/result-poster";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: RouteContext<"/m/[code]/card">) {
  const shared = await loadSharedMatch((await params).code, (state, side) =>
    topPerformers(state)
      .filter((performer) => performer.side === side)
      .map((performer) => performer.playerId),
  );
  if (shared === null) return notFound();
  return renderPng(<ResultPoster state={shared.state} brand={shared.brand} />, RESULT_POSTER_SIZE, "private, no-store");
}
