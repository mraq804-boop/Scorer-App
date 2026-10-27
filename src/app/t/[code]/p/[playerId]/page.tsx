import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PlayerMatches, PlayerTotalsView } from "@/components/team-page/player-sections";
import { SeasonLinks } from "@/components/team-page/season-links";
import { t } from "@/lib/i18n";
import { getTeamPage, matchesInSeason, seasonQuery, selectedSeason, teamStats } from "@/server/team";

export const dynamic = "force-dynamic";

const loadPlayer = cache(async (code: string, playerId: string) => {
  const page = await getTeamPage(code);
  const player = page?.squad.find((candidate) => candidate.id === playerId);
  return page === null || player === undefined ? null : { page, player };
});

export async function generateMetadata({ params }: PageProps<"/t/[code]/p/[playerId]">): Promise<Metadata> {
  const { code, playerId } = await params;
  const loaded = await loadPlayer(code, playerId);
  if (loaded === null) return {};
  return { title: t("teamPage.playerTitle", { player: loaded.player.name, team: loaded.page.team.name }) };
}

export default async function PlayerPage({ params, searchParams }: PageProps<"/t/[code]/p/[playerId]">) {
  const { code, playerId } = await params;
  const loaded = await loadPlayer(code, playerId);
  if (loaded === null) notFound();
  const { page, player } = loaded;
  const seasonId = selectedSeason(page, (await searchParams).season, new Date());
  const stats = teamStats(page, seasonId);
  const totals = stats.players.find((candidate) => candidate.playerId === player.id);
  if (totals === undefined) notFound();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pt-4 pb-10">
      <a
        href={`/t/${page.team.code}${seasonQuery(seasonId)}`}
        className="-ms-2 flex min-h-11 min-w-0 items-center gap-1 self-start rounded-full pe-3 text-sm font-semibold text-muted-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ChevronLeft className="size-5 shrink-0 rtl:rotate-180" aria-hidden />
        <bdi className="truncate">{t("teamPage.back", { name: page.team.name })}</bdi>
      </a>
      <header className="flex flex-col gap-1">
        <h1 className="truncate text-3xl font-bold">
          <bdi>{player.name}</bdi>
        </h1>
        <p className="flex gap-2 text-muted-foreground">
          {player.role !== null && <span>{t(`squad.role.${player.role}`)}</span>}
          {!player.active && <span className="font-semibold">{t("teamPage.player.inactive")}</span>}
        </p>
      </header>
      <SeasonLinks basePath={`/t/${page.team.code}/p/${player.id}`} seasons={page.seasons} selected={seasonId} />
      <PlayerTotalsView totals={totals} />
      <PlayerMatches
        matches={matchesInSeason(page, seasonId)}
        playerId={player.id}
        potm={stats.potm}
        timeZone={page.team.timeZone}
      />
    </main>
  );
}
