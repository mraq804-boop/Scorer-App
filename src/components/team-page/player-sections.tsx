import { Star } from "lucide-react";
import { t } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";
import { formatAverage, formatBest, formatHighest, formatRate } from "@/lib/i18n/team";
import { formatOvers } from "@/lib/scoring";
import { matchPoints } from "@/lib/team";
import type { PlayerMatchStats, PlayerTotals, TeamPageMatch, TeamStats } from "@/lib/team";
import { MatchLink } from "./match-list";

const BALLS_PER_OVER = 6;

type Stat = [MessageKey, string | number];

function StatGroup({ id, title, stats }: { id: string; title: MessageKey; stats: Stat[] }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="text-lg font-bold">
        {t(title)}
      </h2>
      <dl className="grid grid-cols-3 gap-2">
        {stats.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-muted p-3">
            <dt className="truncate text-xs text-muted-foreground">{t(label)}</dt>
            <dd className="num text-lg font-bold">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function PlayerTotalsView({ totals }: { totals: PlayerTotals }) {
  return (
    <>
      <StatGroup
        id="player-batting"
        title="teamPage.group.batting"
        stats={[
          ["teamPage.stat.matches", totals.matches],
          ["teamPage.stat.innings", totals.innings],
          ["teamPage.stat.notOuts", totals.notOuts],
          ["teamPage.stat.runs", totals.runs],
          ["teamPage.stat.balls", totals.balls],
          ["teamPage.stat.highest", formatHighest(totals.highest)],
          ["teamPage.stat.average", formatAverage(totals.average)],
          ["teamPage.stat.strikeRate", formatRate(totals.strikeRate)],
          ["teamPage.stat.fours", totals.fours],
          ["teamPage.stat.sixes", totals.sixes],
          ["teamPage.stat.thirties", totals.thirties],
          ["teamPage.stat.fifties", totals.fifties],
        ]}
      />
      <StatGroup
        id="player-bowling"
        title="teamPage.group.bowling"
        stats={[
          ["teamPage.stat.overs", formatOvers(totals.legalBalls, BALLS_PER_OVER)],
          ["teamPage.stat.maidens", totals.maidens],
          ["teamPage.stat.runsConceded", totals.runsConceded],
          ["teamPage.stat.wickets", totals.wickets],
          ["teamPage.stat.economy", formatRate(totals.economy)],
          ["teamPage.stat.best", formatBest(totals.best)],
          ["teamPage.stat.dots", totals.dots],
        ]}
      />
      <StatGroup
        id="player-fielding"
        title="teamPage.group.fielding"
        stats={[
          ["teamPage.stat.catches", totals.catches],
          ["teamPage.stat.runOuts", totals.runOuts],
          ["teamPage.stat.stumpings", totals.stumpings],
        ]}
      />
      <StatGroup
        id="player-mvp"
        title="teamPage.group.mvp"
        stats={[
          ["teamPage.stat.points", totals.points],
          ["teamPage.stat.potm", totals.potmAwards],
        ]}
      />
    </>
  );
}

function figures(stats: PlayerMatchStats | undefined): string[] {
  if (stats === undefined) return [t("teamPage.player.dnb")];
  const { batting, bowling, fielding } = stats;
  const parts = [
    batting === null
      ? t("teamPage.player.dnb")
      : t(batting.notOut ? "teamPage.player.battedNotOut" : "teamPage.player.batted", {
          runs: batting.runs,
          balls: batting.balls,
        }),
  ];
  if (bowling !== null && bowling.legalBalls > 0) {
    parts.push(
      t("teamPage.player.bowled", {
        wickets: bowling.wickets,
        runs: bowling.runs,
        overs: formatOvers(bowling.legalBalls, BALLS_PER_OVER),
      }),
    );
  }
  if (fielding.catches > 0) parts.push(t("teamPage.player.caught", { n: fielding.catches }));
  if (fielding.runOuts > 0) parts.push(t("teamPage.player.runOuts", { n: fielding.runOuts }));
  if (fielding.stumpings > 0) parts.push(t("teamPage.player.stumped", { n: fielding.stumpings }));
  parts.push(t("teamPage.player.points", { n: matchPoints(stats) }));
  return parts;
}

type PlayerMatchesProps = { matches: TeamPageMatch[]; playerId: string; potm: TeamStats["potm"]; timeZone: string };

export function PlayerMatches({ matches, playerId, potm, timeZone }: PlayerMatchesProps) {
  const played = matches.filter(
    (match) =>
      match.record !== null &&
      (match.status === "complete" || match.resultOverride === "no_result") &&
      match.record.xi.includes(playerId),
  );
  return (
    <section aria-labelledby="player-matches" className="flex flex-col gap-2">
      <h2 id="player-matches" className="text-lg font-bold">
        {t("teamPage.player.matches")}
      </h2>
      {played.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("teamPage.player.noMatches")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {played.map((match) => (
            <li key={match.code}>
              <MatchLink match={match} timeZone={timeZone}>
                <span className="num flex flex-wrap gap-x-3 text-sm">
                  {figures(match.record?.players.find((stats) => stats.playerId === playerId)).map((part) => (
                    <span key={part}>{part}</span>
                  ))}
                </span>
                {potm[match.code]?.playerId === playerId && (
                  <span className="flex items-center gap-1 text-sm font-semibold">
                    <Star className="size-4 fill-haldi text-haldi" aria-hidden />
                    {t("teamPage.player.potm")}
                  </span>
                )}
              </MatchLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
