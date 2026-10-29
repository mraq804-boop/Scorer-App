import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AppBar } from "@/components/app/app-bar";
import { RememberTeam } from "@/components/app/remember-team";
import { ShareLinkButton } from "@/components/app/share-link-button";
import { Copyright } from "@/components/copyright";
import { InstallIcon } from "@/components/pwa/install-app";
import { SeasonLinks } from "@/components/team-page/season-links";
import { ShareTeam } from "@/components/team-page/share-team";
import { TeamHero } from "@/components/team-page/team-hero";
import { Leaderboards, Milestones, NextFixtures, RecentResults } from "@/components/team-page/team-sections";
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
  const colour = colourFor(page.team.colour, page.team.name);
  const playerHref = (playerId: string) => `/t/${page.team.code}/p/${playerId}${seasonQuery(seasonId)}`;
  const photoOf = (playerId: string) => photoUrl(page.team.code, playerId, photos.get(playerId));

  return (
    <>
      <AppBar
        title={page.team.name}
        back="/"
        actions={
          <>
            <InstallIcon />
            <ShareLinkButton url={url} title={page.team.name} />
          </>
        }
      />
      <main className="app-screen mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-6 pb-10">
        <RememberTeam code={page.team.code} />
        <TeamHero page={page} record={stats.record} form={teamForm(matches)} />
        <SeasonLinks basePath={`/t/${page.team.code}`} seasons={page.seasons} selected={seasonId} />
        <NextFixtures fixtures={page.fixtures} timeZone={page.team.timeZone} now={now} />
        <RecentResults matches={matches} timeZone={page.team.timeZone} />
        <Milestones stats={stats} names={names} playerHref={playerHref} colour={colour} photoOf={photoOf} />
        <Leaderboards stats={stats} names={names} playerHref={playerHref} colour={colour} photoOf={photoOf} />
        <ShareTeam text={t("team.link.shareText", { name: page.team.name, url })} />
        <Copyright />
      </main>
    </>
  );
}
