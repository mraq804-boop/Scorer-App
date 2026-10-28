import type { Fixture, PlayerMatchStats, Season, SquadPlayer, TeamMatchRecord, TeamPageData, TeamPageMatch } from "./types";

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isText = (value: unknown): value is string => typeof value === "string";
const textOrNull = (value: unknown): string | null => (isText(value) ? value : null);

function rows<T>(value: unknown, read: (row: Row) => T | undefined): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    const parsed = isRow(row) ? read(row) : undefined;
    return parsed === undefined ? [] : [parsed];
  });
}

function readPlayer(row: Row): SquadPlayer | undefined {
  if (!isText(row.id) || !isText(row.name) || typeof row.active !== "boolean") return undefined;
  const role =
    row.role === "batter" || row.role === "bowler" || row.role === "allrounder" || row.role === "keeper" ? row.role : null;
  return { id: row.id, name: row.name, role, active: row.active, ...(isCount(row.photoVersion) ? { photoVersion: row.photoVersion } : {}) };
}

function readSeason(row: Row): Season | undefined {
  if (!isText(row.id) || !isText(row.name) || !isText(row.startsOn) || !isText(row.endsOn)) return undefined;
  return { id: row.id, name: row.name, startsOn: row.startsOn, endsOn: row.endsOn };
}

function readFixture(row: Row): Fixture | undefined {
  if (!isText(row.id) || !isText(row.startsAt) || !isText(row.opponent)) return undefined;
  if (row.status !== "scheduled" && row.status !== "played" && row.status !== "cancelled") return undefined;
  return {
    id: row.id,
    startsAt: row.startsAt,
    opponent: row.opponent,
    ground: textOrNull(row.ground),
    homeAway: row.homeAway === "home" || row.homeAway === "away" ? row.homeAway : null,
    overs: typeof row.overs === "number" ? row.overs : null,
    status: row.status,
    matchCode: textOrNull(row.matchCode),
  };
}

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function hasCounts(row: unknown, keys: readonly string[]): row is Row {
  return isRow(row) && keys.every((key) => isCount(row[key]));
}

function readStats(row: Row): PlayerMatchStats | undefined {
  const { playerId, batting, bowling, fielding } = row;
  if (!isText(playerId) || !hasCounts(fielding, ["catches", "runOuts", "stumpings"])) return undefined;
  const battingOk = batting === null || (hasCounts(batting, ["runs", "balls", "fours", "sixes"]) && typeof batting.notOut === "boolean");
  const bowlingOk = bowling === null || hasCounts(bowling, ["legalBalls", "runs", "wickets", "maidens", "dots"]);
  if (!battingOk || !bowlingOk) return undefined;
  return row as PlayerMatchStats;
}

function readRecord(value: unknown): TeamMatchRecord | null {
  if (!isRow(value) || value.version !== 1) return null;
  if ((value.side !== "A" && value.side !== "B") || !isText(value.playedAt) || !isText(value.opponent)) return null;
  if (!Number.isFinite(Date.parse(value.playedAt)) || !Array.isArray(value.xi)) return null;
  const outcome = value.outcome;
  if (outcome !== null && outcome !== "won" && outcome !== "lost" && outcome !== "tied") return null;
  return {
    version: 1,
    side: value.side,
    opponent: value.opponent,
    playedAt: value.playedAt,
    xi: value.xi.filter(isText),
    outcome,
    players: rows(value.players, readStats),
  };
}

function readMatch(row: Row): TeamPageMatch | undefined {
  if (!isText(row.code) || (row.status !== "in_progress" && row.status !== "complete")) return undefined;
  const summary = isRow(row.summary) ? row.summary : {};
  return {
    code: row.code,
    title: isText(row.title) ? row.title : "",
    status: row.status,
    resultOverride: row.resultOverride === "no_result" ? "no_result" : null,
    potmPlayerId: textOrNull(row.potmPlayerId),
    lines: Array.isArray(summary.lines) ? summary.lines.filter(isText) : [],
    result: textOrNull(summary.result),
    record: readRecord(row.record),
  };
}

const playedAt = (match: TeamPageMatch) => match.record?.playedAt ?? "";

export function parseTeamPage(data: unknown): TeamPageData | null {
  if (!isRow(data) || !isRow(data.team)) return null;
  const { code, name, homeGround, timeZone, colour, logoVersion } = data.team;
  if (!isText(code) || !isText(name) || !isText(timeZone)) return null;
  const matches = rows(data.matches, readMatch);
  return {
    team: {
      code,
      name,
      homeGround: textOrNull(homeGround),
      timeZone,
      ...(isText(colour) ? { colour } : {}),
      ...(isCount(logoVersion) ? { logoVersion } : {}),
    },
    squad: rows(data.squad, readPlayer),
    seasons: rows(data.seasons, readSeason),
    fixtures: rows(data.fixtures, readFixture),
    matches: [...matches].sort((a, b) => (playedAt(a) < playedAt(b) ? 1 : playedAt(a) > playedAt(b) ? -1 : 0)),
  };
}
