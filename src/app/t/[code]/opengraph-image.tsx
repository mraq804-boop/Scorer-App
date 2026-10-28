import { t } from "@/lib/i18n";
import { embedImages } from "@/server/share/images";
import { PREVIEW_SIZE } from "@/server/share/preview-image";
import { notFound, renderPng } from "@/server/share/render";
import { TeamPreviewImage, teamPreviewImageUrls } from "@/server/share/team-image";
import { TEAM_PAGE_CACHE_SECONDS, getTeamPage, selectedSeason, teamStats } from "@/server/team";

export const dynamic = "force-dynamic";
export const alt = t("teamPage.image.alt");
export const size = PREVIEW_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const page = await getTeamPage((await params).code);
  if (page === null) return notFound();
  const stats = teamStats(page, selectedSeason(page, undefined, new Date()));
  const images = await embedImages(teamPreviewImageUrls(page, stats));
  return renderPng(
    <TeamPreviewImage page={page} stats={stats} images={images} />,
    size,
    `public, s-maxage=${TEAM_PAGE_CACHE_SECONDS}, stale-while-revalidate=${TEAM_PAGE_CACHE_SECONDS}`,
  );
}
