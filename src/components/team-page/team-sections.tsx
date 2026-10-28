import { Crown } from "lucide-react";
import { colourFor } from "@/lib/brand";
import type { TeamColour } from "@/lib/brand";
import { t } from "@/lib/i18n";
import { LEADERBOARD_GROUPS, LEADERBOARD_TITLES, formatFixtureTime, formatLeaderboardValue } from "@/lib/i18n/team";
import type { Fixture, LeaderboardKey, LeaderboardRow, TeamPageMatch, TeamStats } from "@/lib/team";
import { Avatar } from "./avatar";
import { MatchLink } from "./match-list";

const RECENT_RESULTS = 10;
const NEXT_FIXTURES = 3;

function fixtureDetails(fixture: Fixture): string[] {
  return [
    fixture.ground,
    fixture.homeAway === null ? null : t(fixture.homeAway === "home" ? "team.fixtures.home" : "team.fixtures.away"),
    fixture.overs === null ? null : t("team.fixtures.oversValue", { n: fixture.overs }),
  ].filter((detail) => detail !== null);
}

export function NextFixtures({ fixtures, timeZone, now }: { fixtures: Fixture[]; timeZone: string; now: Date }) {
  const upcoming = fixtures
    .filter((fixture) => fixture.status === "scheduled" && Date.parse(fixture.startsAt) >= now.getTime())
    .slice(0, NEXT_FIXTURES);
  return (
    <section aria-labelledby="next-fixtures" className="flex flex-col gap-2">
      <h2 id="next-fixtures" className="text-lg font-bold">
        {t("teamPage.nextFixtures")}
      </h2>
      {upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("teamPage.noFixtures")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {upcoming.map((fixture) => (
            <li key={fixture.id} className="flex flex-col gap-0.5 rounded-2xl border bg-card p-3.5">
              <span className="num text-sm text-muted-foreground">{formatFixtureTime(fixture.startsAt, timeZone)}</span>
              <span className="truncate font-semibold">
                <bdi>{t("team.fixtures.vs", { opponent: fixture.opponent })}</bdi>
              </span>
              {fixtureDetails(fixture).length > 0 && (
                <span className="flex min-w-0 flex-wrap gap-x-2 text-sm text-muted-foreground">
                  {fixtureDetails(fixture).map((detail) => (
                    <bdi key={detail} className="truncate">
                      {detail}
                    </bdi>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RecentResults({ matches, timeZone }: { matches: TeamPageMatch[]; timeZone: string }) {
  const recent = matches.slice(0, RECENT_RESULTS);
  return (
    <section aria-labelledby="recent-results" className="flex flex-col gap-2">
      <h2 id="recent-results" className="text-lg font-bold">
        {t("teamPage.recentResults")}
      </h2>
      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("teamPage.noResults")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {recent.map((match) => (
            <li key={match.code}>
              <MatchLink match={match} timeZone={timeZone} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Look = { colour: TeamColour; photoOf: (playerId: string) => string | null };

type BoardProps = {
  board: LeaderboardKey;
  rows: LeaderboardRow[];
  names: ReadonlyMap<string, string>;
  playerHref: (playerId: string) => string;
  look: Look;
};

function Board({ board, rows, names, playerHref, look }: BoardProps) {
  const [leader, ...rest] = rows;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
      <h3 className="text-sm font-semibold text-muted-foreground">{t(LEADERBOARD_TITLES[board])}</h3>
      <ol className="flex flex-col">
        {leader !== undefined && (
          <li data-leader className="mb-1 flex items-center gap-3 rounded-xl bg-haldi/15 p-2.5">
            <Crown className="size-5 shrink-0 text-haldi" aria-hidden />
            <span className="sr-only">{t("teamPage.leader")}</span>
            <Avatar name={names.get(leader.playerId) ?? ""} url={look.photoOf(leader.playerId)} size={48} colour={look.colour} />
            <a href={playerHref(leader.playerId)} className="min-w-0 flex-1 truncate text-lg font-bold hover:underline">
              <bdi>{names.get(leader.playerId)}</bdi>
            </a>
            <span className="num shrink-0 text-2xl font-extrabold">{formatLeaderboardValue(board, leader)}</span>
          </li>
        )}
        {rest.map((row, index) => (
          <li key={row.playerId} className="flex min-h-11 items-center gap-3 px-2.5">
            <span className="num w-5 shrink-0 text-sm text-muted-foreground">{index + 2}</span>
            <Avatar name={names.get(row.playerId) ?? ""} url={look.photoOf(row.playerId)} size={28} colour={look.colour} />
            <a href={playerHref(row.playerId)} className="min-w-0 flex-1 truncate font-medium hover:underline">
              <bdi>{names.get(row.playerId)}</bdi>
            </a>
            <span className="num shrink-0 font-bold">{formatLeaderboardValue(board, row)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

type LeaderboardsProps = {
  stats: TeamStats;
  names: ReadonlyMap<string, string>;
  playerHref: (playerId: string) => string;
  colour?: TeamColour;
  photoOf?: (playerId: string) => string | null;
};

export function Leaderboards({ stats, names, playerHref, colour, photoOf }: LeaderboardsProps) {
  const look: Look = { colour: colour ?? colourFor(null, ""), photoOf: photoOf ?? (() => null) };
  return (
    <>
      {LEADERBOARD_GROUPS.map((group) => {
        const boards = group.boards.filter((board) => stats.leaderboards[board].length > 0);
        const id = group.title.replace(/\W/g, "-");
        return (
          <section key={group.title} aria-labelledby={id} className="flex flex-col gap-2">
            <h2 id={id} className="text-lg font-bold">
              {t(group.title)}
            </h2>
            {boards.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("teamPage.group.empty")}</p>
            ) : (
              boards.map((board) => (
                <Board
                  key={board}
                  board={board}
                  rows={stats.leaderboards[board]}
                  names={names}
                  playerHref={playerHref}
                  look={look}
                />
              ))
            )}
          </section>
        );
      })}
    </>
  );
}
