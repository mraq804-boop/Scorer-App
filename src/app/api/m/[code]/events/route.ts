import type { NextRequest } from "next/server";
import { CODE_RE } from "@/lib/local/code";
import { serverEnv } from "@/server/env";
import { getLiveEvents, getLiveMatch } from "@/server/live";

const MAX_SEQ = 2_147_483_647;

function parseAfter(value: string | null): number | null {
  if (value === null) return 0;
  if (!/^\d+$/.test(value)) return null;
  const after = Number(value);
  return after <= MAX_SEQ ? after : null;
}

export async function GET(request: NextRequest, { params }: RouteContext<"/api/m/[code]/events">) {
  const after = parseAfter(request.nextUrl.searchParams.get("after"));
  if (after === null) return Response.json({ error: "invalid_after" }, { status: 400 });

  const { code } = await params;
  if (!CODE_RE.test(code)) return Response.json({ error: "not_found" }, { status: 404 });

  const events = await getLiveEvents(code, after);
  if (events.length === 0 && after === 0 && (await getLiveMatch(code)) === null) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json(
    { events },
    { headers: { "Cache-Control": `public, s-maxage=${serverEnv().LIVE_CACHE_SECONDS}, stale-while-revalidate=10` } },
  );
}
