import type {
  LeaderboardKey,
  LeaderboardRow,
  PlayerMatchStats,
  PlayerTotals,
  PosterHeadline,
  TeamPageMatch,
  TeamRecord,
} from "@/lib/team";
import { t } from "./index";
import type { MessageKey } from "./index";

const DASH = "–";
const LOCALE = "en-GB";

export type MatchOutcome = "won" | "lost" | "tied" | "noResult" | "live";

export function matchOutcome(match: TeamPageMatch): MatchOutcome {
  if (match.resultOverride === "no_result") return "noResult";
  if (match.status === "in_progress") return "live";
  return match.record?.outcome ?? "noResult";
}

export function formatMatchDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone, day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

export function formatFixtureTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function decimal(value: number | null): string {
  return value === null ? DASH : value.toFixed(2);
}

export function formatAverage(value: number | null): string {
  return decimal(value);
}

export function formatRate(value: number | null): string {
  return decimal(value);
}

export function formatBest(best: { wickets: number; runs: number } | null): string {
  return best === null ? DASH : t("teamPage.best", { wickets: best.wickets, runs: best.runs });
}

export function formatHighest(highest: { runs: number; notOut: boolean } | null): string {
  if (highest === null) return DASH;
  return highest.notOut ? t("teamPage.notOut", { runs: highest.runs }) : String(highest.runs);
}

export function formatLeaderboardValue(key: LeaderboardKey, row: LeaderboardRow): string {
  switch (key) {
    case "highest":
      return formatHighest({ runs: row.value, notOut: row.notOut ?? false });
    case "average":
      return formatAverage(row.value);
    case "strikeRate":
    case "economy":
      return formatRate(row.value);
    case "bestBowling":
      return formatBest({ wickets: row.value, runs: row.runs ?? 0 });
    default:
      return String(row.value);
  }
}

export function formatRecord(record: TeamRecord): string {
  return t("teamPage.record", { ...record });
}

export const LEADERBOARD_GROUPS: { title: MessageKey; boards: LeaderboardKey[] }[] = [
  { title: "teamPage.group.batting", boards: ["runs", "highest", "average", "strikeRate", "sixes", "fours"] },
  { title: "teamPage.group.bowling", boards: ["wickets", "bestBowling", "economy", "maidens", "dots"] },
  { title: "teamPage.group.fielding", boards: ["catches", "runOutsStumpings"] },
  { title: "teamPage.group.mvp", boards: ["mvp", "potm"] },
];

export const LEADERBOARD_TITLES: Record<LeaderboardKey, MessageKey> = {
  runs: "teamPage.board.runs",
  highest: "teamPage.board.highest",
  average: "teamPage.board.average",
  strikeRate: "teamPage.board.strikeRate",
  sixes: "teamPage.board.sixes",
  fours: "teamPage.board.fours",
  wickets: "teamPage.board.wickets",
  bestBowling: "teamPage.board.bestBowling",
  economy: "teamPage.board.economy",
  maidens: "teamPage.board.maidens",
  dots: "teamPage.board.dots",
  catches: "teamPage.board.catches",
  runOutsStumpings: "teamPage.board.runOutsStumpings",
  mvp: "teamPage.board.mvp",
  potm: "teamPage.board.potm",
};

export function formatPerformer(stats: PlayerMatchStats): string {
  const { batting, bowling } = stats;
  const batted =
    batting === null
      ? null
      : t(batting.notOut ? "teamPage.player.battedNotOut" : "teamPage.player.batted", { runs: batting.runs, balls: batting.balls });
  const bowled = bowling === null || bowling.legalBalls === 0 ? null : t("teamPage.best", { wickets: bowling.wickets, runs: bowling.runs });
  if (batted !== null && bowled !== null) return t("poster.figures", { batting: batted, bowling: bowled });
  return batted ?? bowled ?? "";
}

const HEADLINES: Record<PosterHeadline, MessageKey> = {
  potm: "poster.headline.potm",
  hundred: "poster.headline.hundred",
  fifty: "poster.headline.fifty",
  fiveWickets: "poster.headline.fiveWickets",
  hatTrick: "poster.headline.hatTrick",
  threeWickets: "poster.headline.threeWickets",
};

export function headlineLabel(headline: PosterHeadline): string {
  return t(HEADLINES[headline]);
}

type BadgeKey = "hundreds" | "fifties" | "fiveFors" | "hatTricks" | "potm";

export function playerBadges(totals: PlayerTotals): { key: BadgeKey; text: string }[] {
  const counts: [BadgeKey, number][] = [
    ["hundreds", totals.hundreds],
    ["fifties", totals.fifties],
    ["fiveFors", totals.fiveFors],
    ["hatTricks", totals.hatTricks],
    ["potm", totals.potmAwards],
  ];
  return counts
    .filter(([, n]) => n > 0)
    .map(([key, n]) => ({ key, text: t(`badge.${key}.${n === 1 ? "one" : "other"}`, { n }) }));
}
