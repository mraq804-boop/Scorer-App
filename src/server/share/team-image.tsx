import { Trophy } from "@/components/art/cricket-art";
import { colourFor, logoUrl, photoUrl } from "@/lib/brand";
import type { TeamColour } from "@/lib/brand";
import { t } from "@/lib/i18n";
import { formatRecord } from "@/lib/i18n/team";
import type { LeaderboardRow, TeamPageData, TeamStats } from "@/lib/team";
import { imageText } from "@/lib/share/image-text";
import { Brand, Clip, PAPER, WHITE } from "./parts";
import type { ImageMap } from "./images";
import { Disc, PALE_GOLD, Stage } from "./poster-parts";
import { PREVIEW_SIZE } from "./preview-image";

const TOP = 3;

type TopListProps = {
  title: string;
  rows: LeaderboardRow[];
  page: TeamPageData;
  colour: TeamColour;
  images: ImageMap;
  value: (row: LeaderboardRow) => string;
};

function TopList({ title, rows, page, colour, images, value }: TopListProps) {
  const players = new Map(page.squad.map((player) => [player.id, player]));
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 12 }}>
      <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: PALE_GOLD }}>{title}</div>
      {rows.slice(0, TOP).map((row) => {
        const player = players.get(row.playerId);
        const name = player?.name ?? "";
        return (
          <div key={row.playerId} style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Disc
              size={56}
              colour={colour}
              name={name}
              photoUrl={images.get(photoUrl(page.team.code, row.playerId, player?.photoVersion) ?? "") ?? null}
            />
            <Clip size={32} weight={700} color={WHITE}>
              {imageText(name)}
            </Clip>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: PAPER }}>{value(row)}</div>
          </div>
        );
      })}
    </div>
  );
}

export function teamPreviewImageUrls(page: TeamPageData, stats: TeamStats): (string | null)[] {
  const photos = new Map(page.squad.map((player) => [player.id, player.photoVersion]));
  const leaders = [...stats.leaderboards.runs.slice(0, TOP), ...stats.leaderboards.wickets.slice(0, TOP)];
  return [
    logoUrl(page.team.code, page.team.logoVersion),
    ...leaders.map((row) => photoUrl(page.team.code, row.playerId, photos.get(row.playerId))),
  ];
}

export function TeamPreviewImage({ page, stats, images }: { page: TeamPageData; stats: TeamStats; images: ImageMap }) {
  const colour = colourFor(page.team.colour, page.team.name);
  const { width, height } = PREVIEW_SIZE;
  return (
    <Stage width={width} height={height} confetti={stats.record.won > 0}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 24, padding: "32px 48px" }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Brand size={48} color={PAPER} />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            padding: "16px 24px",
            borderRadius: 28,
            background: colour.base,
            color: colour.on,
          }}
        >
          <Disc
            size={96}
            colour={colour}
            name={page.team.name}
            photoUrl={images.get(logoUrl(page.team.code, page.team.logoVersion) ?? "") ?? null}
            ring={5}
          />
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 4 }}>
            <Clip size={52} weight={700} color={colour.on}>
              {imageText(page.team.name)}
            </Clip>
            <div style={{ display: "flex", fontSize: 28 }}>{formatRecord(stats.record)}</div>
          </div>
          <Trophy width={64} height={68} />
        </div>
        <div style={{ display: "flex", gap: 48 }}>
          <TopList
            title={t("teamPage.image.topRuns")}
            rows={stats.leaderboards.runs}
            page={page}
            colour={colour}
            images={images}
            value={(row) => t("teamPage.image.runs", { n: row.value })}
          />
          <TopList
            title={t("teamPage.image.topWickets")}
            rows={stats.leaderboards.wickets}
            page={page}
            colour={colour}
            images={images}
            value={(row) => t("teamPage.image.wickets", { n: row.value })}
          />
        </div>
      </div>
    </Stage>
  );
}
