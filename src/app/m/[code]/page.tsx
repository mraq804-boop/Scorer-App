import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Copyright } from "@/components/copyright";
import { LiveView } from "@/components/live/live-view";
import { formatScoreLine } from "@/lib/i18n/cricket";
import { CODE_RE } from "@/lib/local/code";
import { currentInnings, replay } from "@/lib/scoring";
import { getLiveMatch } from "@/server/live";

export const dynamic = "force-dynamic";

const loadMatch = cache(async (code: string) => (CODE_RE.test(code) ? getLiveMatch(code) : null));

export async function generateMetadata({ params }: PageProps<"/m/[code]">): Promise<Metadata> {
  const live = await loadMatch((await params).code);
  if (live === null) return {};
  const state = replay(live.events);
  const innings = currentInnings(state) ?? state.innings.at(-1);
  return { title: innings === undefined ? live.match.title : formatScoreLine(innings, state) };
}

export default async function LivePage({ params }: PageProps<"/m/[code]">) {
  const live = await loadMatch((await params).code);
  if (live === null) notFound();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-2 pb-safe">
      <LiveView key={live.match.id} match={live.match} initialEvents={live.events} />
      <Copyright />
    </main>
  );
}
