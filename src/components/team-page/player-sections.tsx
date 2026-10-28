import { Star } from "lucide-react";
import { ShareImageLink } from "@/components/share/share-image-link";
import { t } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";
import type { TeamColour } from "@/lib/brand";
import { formatAverage, formatBest, formatHighest, formatRate, playerBadges } from "@/lib/i18n/team";
import { formatOvers } from "@/lib/scoring";
import { matchPoints } from "@/lib/team";
import type { PlayerMatchStats, PlayerTotals, SquadPlayer, TeamPageMatch, TeamStats } from "@/lib/team";
import { Avatar } from "./avatar";
import { MatchLink } from "./match-list";
import { HeroStripes } from "./team-hero";

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
            <li key={match.code} className="flex flex-col">
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
              <ShareImageLink
                href={`/m/${match.code}/poster/${playerId}`}
                fileName={`poster-${match.code}.png`}
                className="h-11 self-end rounded-xl px-3 text-sm text-primary hover:bg-muted"
              >
                {t("share.poster")}
              </ShareImageLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type PlayerHeroProps = { player: SquadPlayer; totals: PlayerTotals; colour: TeamColour; photoUrl: string | null };

export function PlayerHero({ player, totals, colour, photoUrl }: PlayerHeroProps) {
  const badges = playerBadges(totals);
  return (
    <header className="relative -mx-4 overflow-hidden px-4 pt-5 pb-5" style={{ background: colour.base, color: colour.on }}>
      <HeroStripes colour={colour} />
      <div className="relative flex items-center gap-4">
        <Avatar name={player.name} url={photoUrl} size={96} colour={colour} alt={player.name} className="ring-4 ring-haldi" />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="truncate text-3xl font-extrabold">
            <bdi>{player.name}</bdi>
          </h1>
          <p className="flex gap-2 text-sm font-medium">
            {player.role !== null && <span>{t(`squad.role.${player.role}`)}</span>}
            {!player.active && <span className="font-bold">{t("teamPage.player.inactive")}</span>}
          </p>
        </div>
      </div>
      {badges.length > 0 && (
        <ul className="relative mt-4 flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <li key={badge.key} className="pop-in rounded-full bg-haldi px-3 py-1 text-sm font-bold text-[#412402]">
              {badge.text}
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
