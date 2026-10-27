import { t } from "@/lib/i18n";
import { formatRecord } from "@/lib/i18n/team";
import type { LeaderboardRow, TeamPageData, TeamStats } from "@/lib/team";
import { imageText } from "@/lib/share/image-text";
import { Brand, Clip, FONT_FAMILY, HALDI, INK, PAPER, WHITE } from "./parts";

const TOP = 3;

type TopListProps = {
  title: string;
  rows: LeaderboardRow[];
  names: ReadonlyMap<string, string>;
  value: (row: LeaderboardRow) => string;
};

function TopList({ title, rows, names, value }: TopListProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 14 }}>
      <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: HALDI }}>{title}</div>
      {rows.slice(0, TOP).map((row) => (
        <div key={row.playerId} style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Clip size={36} color={WHITE}>
            {imageText(names.get(row.playerId) ?? "")}
          </Clip>
          <div style={{ display: "flex", fontSize: 36, fontWeight: 700, color: PAPER }}>{value(row)}</div>
        </div>
      ))}
    </div>
  );
}

export function TeamPreviewImage({ page, stats }: { page: TeamPageData; stats: TeamStats }) {
  const names = new Map(page.squad.map((player) => [player.id, player.name]));
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: 56,
        gap: 28,
        background: INK,
        color: PAPER,
        fontFamily: FONT_FAMILY,
      }}
    >
      <Brand size={56} color={PAPER} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex" }}>
          <Clip size={68} weight={700} color={WHITE}>
            {imageText(page.team.name)}
          </Clip>
        </div>
        <div style={{ display: "flex", fontSize: 32, color: PAPER, opacity: 0.85 }}>{formatRecord(stats.record)}</div>
      </div>
      <div style={{ display: "flex", flex: 1, gap: 56 }}>
        <TopList
          title={t("teamPage.image.topRuns")}
          rows={stats.leaderboards.runs}
          names={names}
          value={(row) => t("teamPage.image.runs", { n: row.value })}
        />
        <TopList
          title={t("teamPage.image.topWickets")}
          rows={stats.leaderboards.wickets}
          names={names}
          value={(row) => t("teamPage.image.wickets", { n: row.value })}
        />
      </div>
    </div>
  );
}
