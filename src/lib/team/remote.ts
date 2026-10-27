import type { SupabaseClient } from "@supabase/supabase-js";
import type { CachedFixture, CachedTeam, LocalDb } from "@/lib/local/db";
import { isConstraintViolation, isTransient } from "@/lib/sync/push";
import type { RpcError, SquadPushFn } from "@/lib/sync/push";
import {
  cacheTeam,
  clearCachedTeam,
  getCachedTeam,
  getSquadOutbox,
  getSquadOutboxByTeam,
  removeFromSquadOutbox,
} from "./local";
import type { Season, SquadPlayer } from "./types";

export type TeamError =
  | "network"
  | "not_signed_in"
  | "not_team_owner"
  | "team_exists"
  | "invite_invalid"
  | "quota_exceeded"
  | "invalid_time_zone"
  | "not_in_xi"
  | "refused"
  | "unknown";

export type TeamResult<T> = { ok: true; value: T } | { ok: false; error: TeamError };

export type NewTeam = { name: string; homeGround: string | null; timeZone: string };
export type FixtureInput = Omit<CachedFixture, "matchCode">;

export class TeamRemoteError extends Error {
  readonly code: TeamError;

  constructor(code: TeamError) {
    super(code);
    this.name = "TeamRemoteError";
    this.code = code;
  }
}

const SERVER_ERRORS: readonly TeamError[] = [
  "not_team_owner",
  "team_exists",
  "invite_invalid",
  "quota_exceeded",
  "invalid_time_zone",
  "not_in_xi",
];

function failure(error: RpcError, status: number): TeamError {
  if (isTransient(status)) return "network";
  if (status === 401) return "not_signed_in";
  const known = SERVER_ERRORS.find((code) => code === error.message);
  if (known !== undefined) return known;
  return isConstraintViolation(error, status) ? "refused" : "unknown";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function call<T>(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown> | undefined,
  read: (data: unknown) => { value: T } | undefined,
): Promise<TeamResult<T>> {
  try {
    const { data, error, status } = await client.rpc(name, args);
    if (error !== null) return { ok: false, error: failure(error, status) };
    const parsed = read(data);
    return parsed === undefined ? { ok: false, error: "unknown" } : { ok: true, value: parsed.value };
  } catch {
    return { ok: false, error: "network" };
  }
}

const readNothing = () => ({ value: undefined });
const readText = (data: unknown) => (typeof data === "string" ? { value: data } : undefined);
const readCount = (data: unknown) => (typeof data === "number" ? { value: data } : undefined);

function parseMyTeam(data: unknown, fetchedAt: string): CachedTeam | undefined {
  if (!isObject(data) || !isObject(data.team)) return undefined;
  const { team, role, squad, seasons, fixtures } = data;
  if (
    (role !== "owner" && role !== "scorer") ||
    typeof team.id !== "string" ||
    typeof team.code !== "string" ||
    typeof team.name !== "string" ||
    typeof team.timeZone !== "string" ||
    !Array.isArray(squad) ||
    !Array.isArray(seasons) ||
    !Array.isArray(fixtures)
  ) {
    return undefined;
  }
  return {
    id: team.id,
    role,
    code: team.code,
    name: team.name,
    homeGround: typeof team.homeGround === "string" ? team.homeGround : null,
    timeZone: team.timeZone,
    squad: squad as SquadPlayer[],
    seasons: seasons as Season[],
    fixtures: fixtures as CachedFixture[],
    fetchedAt,
  };
}

export async function fetchMyTeam(client: SupabaseClient): Promise<CachedTeam | null> {
  const result = await call<CachedTeam | null>(client, "get_my_team", undefined, (data) => {
    if (data === null) return { value: null };
    const team = parseMyTeam(data, new Date().toISOString());
    return team === undefined ? undefined : { value: team };
  });
  if (!result.ok) throw new TeamRemoteError(result.error);
  return result.value;
}

export async function refreshTeamCache(client: SupabaseClient, db: LocalDb): Promise<CachedTeam | null> {
  const team = await fetchMyTeam(client);
  if (team === null) {
    await clearCachedTeam(db);
    return null;
  }
  return db.transaction("rw", db.team, db.squadOutbox, async () => {
    const onServer = new Set(team.squad.map((player) => player.id));
    const waiting = await getSquadOutbox(db, team.id);
    await removeFromSquadOutbox(db, waiting.filter((player) => onServer.has(player.id)).map((player) => player.id));
    const unsent = waiting.filter((player) => !onServer.has(player.id));
    const merged = unsent.length === 0 ? team : { ...team, squad: [...team.squad, ...unsent] };
    await cacheTeam(db, merged);
    return merged;
  });
}

export function createTeam(client: SupabaseClient, input: NewTeam): Promise<TeamResult<string>> {
  return call(
    client,
    "create_team",
    { p_name: input.name, p_home_ground: input.homeGround, p_time_zone: input.timeZone },
    readText,
  );
}

export function upsertSeason(client: SupabaseClient, season: Season): Promise<TeamResult<string>> {
  return call(client, "upsert_season", { p_season: season }, readText);
}

export function upsertFixture(client: SupabaseClient, fixture: FixtureInput): Promise<TeamResult<string>> {
  return call(client, "upsert_fixture", { p_fixture: fixture }, readText);
}

export function setPotm(client: SupabaseClient, code: string, playerId: string | null): Promise<TeamResult<void>> {
  return call(client, "set_potm", { p_code: code, p_player: playerId }, readNothing);
}

export function setResultOverride(client: SupabaseClient, code: string, noResult: boolean): Promise<TeamResult<void>> {
  return call(client, "set_result_override", { p_code: code, p_no_result: noResult }, readNothing);
}

export function createScorerInvite(client: SupabaseClient): Promise<TeamResult<string>> {
  return call(client, "create_scorer_invite", undefined, readText);
}

export function acceptScorerInvite(client: SupabaseClient, token: string): Promise<TeamResult<string>> {
  return call(client, "accept_scorer_invite", { p_token: token }, readText);
}

export function removeScorer(client: SupabaseClient, userId: string): Promise<TeamResult<void>> {
  return call(client, "remove_scorer", { p_user: userId }, readNothing);
}

export function upsertSquadPlayers(
  client: SupabaseClient,
  teamId: string,
  players: SquadPlayer[],
): Promise<TeamResult<number>> {
  return call(client, "upsert_squad_players", { p_team: teamId, p_players: players }, readCount);
}

type SendOutcome = "done" | "retry" | "refused";

async function sendSquad(
  client: SupabaseClient,
  db: LocalDb,
  teamId: string,
  players: SquadPlayer[],
  isCurrent: boolean,
): Promise<SendOutcome> {
  const result = await upsertSquadPlayers(client, teamId, players);
  const ids = players.map((player) => player.id);
  if (result.ok) {
    await removeFromSquadOutbox(db, ids);
    return "done";
  }
  switch (result.error) {
    case "refused":
    case "quota_exceeded":
      return "refused";
    case "not_team_owner":
      if (isCurrent) return "retry";
      await removeFromSquadOutbox(db, ids);
      return "done";
    default:
      return "retry";
  }
}

async function pushTeamSquad(
  client: SupabaseClient,
  db: LocalDb,
  teamId: string,
  players: SquadPlayer[],
  isCurrent: boolean,
): Promise<boolean> {
  const batch = await sendSquad(client, db, teamId, players, isCurrent);
  if (batch !== "refused") return batch === "done";
  for (const player of players) {
    const single = await sendSquad(client, db, teamId, [player], isCurrent);
    if (single === "retry") return false;
    if (single === "refused") await removeFromSquadOutbox(db, [player.id]);
  }
  return true;
}

export function supabaseSquadPush(client: SupabaseClient): SquadPushFn {
  return async (db) => {
    const groups = await getSquadOutboxByTeam(db);
    if (groups.size === 0) return true;
    const currentId = (await getCachedTeam(db))?.id;
    let settled = true;
    for (const [teamId, players] of groups) {
      if (!(await pushTeamSquad(client, db, teamId, players, teamId === currentId))) settled = false;
    }
    return settled;
  };
}
