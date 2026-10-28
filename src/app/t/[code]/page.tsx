import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Copyright } from "@/components/copyright";
import { SeasonLinks } from "@/components/team-page/season-links";
import { ShareTeam } from "@/components/team-page/share-team";
import { TeamHero } from "@/components/team-page/team-hero";
import { Leaderboards, NextFixtures, RecentResults } from "@/components/team-page/team-sections";
import { colourFor, photoUrl } from "@/lib/brand";
import { t } from "@/lib/i18n";
import { teamForm } from "@/lib/team";
import { teamUrl } from "@/lib/site-url";
import { getTeamPage, matchesInSeason, seasonQuery, selectedSeason, teamStats } from "@/server/team";

export const dynamic = "force-dynamic";

const loadTeam = cache((code: string) => getTeamPage(code));

export async function generateMetadata({ params }: PageProps<"/t/[code]">): Promise<Metadata> {
  const page = await loadTeam((await params).code);
  if (page === null) return {};
  return {
    title: t("teamPage.title", { name: page.team.name }),
    description: t("teamPage.description", { name: page.team.name }),
  };
}

export default async function TeamPublicPage({ params, searchParams }: PageProps<"/t/[code]">) {
  const { code } = await params;
  const page = await loadTeam(code);
  if (page === null) notFound();
  const now = new Date();
  const seasonId = selectedSeason(page, (await searchParams).season, now);
  const stats = teamStats(page, seasonId);
  const names = new Map(page.squad.map((player) => [player.id, player.name]));
  const photos = new Map(page.squad.map((player) => [player.id, player.photoVersion]));
  const matches = matchesInSeason(page, seasonId);
  const url = teamUrl(page.team.code);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pt-6 pb-10">
      <TeamHero page={page} record={stats.record} form={teamForm(matches)} />
      <SeasonLinks basePath={`/t/${page.team.code}`} seasons={page.seasons} selected={seasonId} />
      <NextFixtures fixtures={page.fixtures} timeZone={page.team.timeZone} now={now} />
      <RecentResults matches={matches} timeZone={page.team.timeZone} />
      <Leaderboards
        stats={stats}
        names={names}
        playerHref={(playerId) => `/t/${page.team.code}/p/${playerId}${seasonQuery(seasonId)}`}
        colour={colourFor(page.team.colour, page.team.name)}
        photoOf={(playerId) => photoUrl(page.team.code, playerId, photos.get(playerId))}
      />
      <ShareTeam text={t("team.link.shareText", { name: page.team.name, url })} />
      <Copyright />
    </main>
  );
}
