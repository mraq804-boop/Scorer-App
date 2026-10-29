import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AppBar } from "@/components/app/app-bar";
import { RememberTeam } from "@/components/app/remember-team";
import { ShareLinkButton } from "@/components/app/share-link-button";
import { Copyright } from "@/components/copyright";
import { InstallIcon } from "@/components/pwa/install-app";
import { PlayerHero, PlayerMatches, PlayerTotalsView } from "@/components/team-page/player-sections";
import { colourFor, photoUrl } from "@/lib/brand";
import { SeasonLinks } from "@/components/team-page/season-links";
import { t } from "@/lib/i18n";
import { teamUrl } from "@/lib/site-url";
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
  const playerUrl = `${teamUrl(page.team.code)}/p/${player.id}`;

  return (
    <>
      <AppBar
        title={player.name}
        back={`/t/${page.team.code}${seasonQuery(seasonId)}`}
        actions={
          <>
            <InstallIcon />
            <ShareLinkButton url={playerUrl} title={player.name} />
          </>
        }
      />
      <main className="app-screen mx-auto flex w-full max-w-md flex-col gap-6 px-4 pb-10">
        <RememberTeam code={page.team.code} />
        <PlayerHero
          player={player}
          totals={totals}
          colour={colourFor(page.team.colour, page.team.name)}
          photoUrl={photoUrl(page.team.code, player.id, player.photoVersion)}
        />
        <SeasonLinks basePath={`/t/${page.team.code}/p/${player.id}`} seasons={page.seasons} selected={seasonId} />
        <PlayerTotalsView totals={totals} />
        <PlayerMatches
          matches={matchesInSeason(page, seasonId)}
          playerId={player.id}
          potm={stats.potm}
          timeZone={page.team.timeZone}
        />
        <Copyright />
      </main>
    </>
  );
}
