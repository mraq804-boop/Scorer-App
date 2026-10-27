import { t } from "@/lib/i18n";
import { LEADERBOARD_GROUPS, LEADERBOARD_TITLES, formatFixtureTime, formatLeaderboardValue, formatRecord } from "@/lib/i18n/team";
import type { Fixture, LeaderboardKey, LeaderboardRow, TeamPageData, TeamPageMatch, TeamRecord, TeamStats } from "@/lib/team";
import { MatchLink } from "./match-list";

const RECENT_RESULTS = 10;
const NEXT_FIXTURES = 3;

export function TeamHeader({ page, record }: { page: TeamPageData; record: TeamRecord }) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="truncate text-3xl font-bold">
        <bdi>{page.team.name}</bdi>
      </h1>
      {page.team.homeGround !== null && (
        <p className="truncate text-muted-foreground">
          <bdi>{page.team.homeGround}</bdi>
        </p>
      )}
      <p className="num text-sm font-semibold">{formatRecord(record)}</p>
    </header>
  );
}

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

type BoardProps = {
  board: LeaderboardKey;
  rows: LeaderboardRow[];
  names: ReadonlyMap<string, string>;
  playerHref: (playerId: string) => string;
};

function Board({ board, rows, names, playerHref }: BoardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border bg-card p-4">
      <h3 className="text-sm font-semibold text-muted-foreground">{t(LEADERBOARD_TITLES[board])}</h3>
      <ol className="flex flex-col">
        {rows.map((row, index) => (
          <li key={row.playerId} className="flex min-h-10 items-center gap-3">
            <span className="num w-5 shrink-0 text-sm text-muted-foreground">{index + 1}</span>
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

type LeaderboardsProps = { stats: TeamStats; names: ReadonlyMap<string, string>; playerHref: (playerId: string) => string };

export function Leaderboards({ stats, names, playerHref }: LeaderboardsProps) {
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
                <Board key={board} board={board} rows={stats.leaderboards[board]} names={names} playerHref={playerHref} />
              ))
            )}
          </section>
        );
      })}
    </>
  );
}
