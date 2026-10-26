import { loadSharedMatch } from "@/server/share/match";
import { notFound, renderPng } from "@/server/share/render";
import { CARD_SIZE, ScorecardImage } from "@/server/share/scorecard-image";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: RouteContext<"/m/[code]/card">) {
  const shared = await loadSharedMatch((await params).code);
  if (shared === null) return notFound();
  return renderPng(<ScorecardImage state={shared.state} code={shared.code} />, CARD_SIZE, "private, no-store");
}
