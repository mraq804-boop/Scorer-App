import { t } from "@/lib/i18n";
import { serverEnv } from "@/server/env";
import { loadSharedMatch } from "@/server/share/match";
import { PREVIEW_SIZE, PreviewImage } from "@/server/share/preview-image";
import { notFound, renderPng } from "@/server/share/render";

export const dynamic = "force-dynamic";
export const alt = t("share.imageAlt");
export const size = PREVIEW_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const shared = await loadSharedMatch((await params).code);
  if (shared === null) return notFound();
  const seconds = serverEnv().LIVE_CACHE_SECONDS;
  return renderPng(<PreviewImage state={shared.state} brand={shared.brand} />, size, `public, s-maxage=${seconds}, stale-while-revalidate=10`);
}
