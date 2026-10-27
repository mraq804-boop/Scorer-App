import "fake-indexeddb/auto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalDb } from "@/lib/local/db";
import {
  TeamRemoteError,
  acceptScorerInvite,
  createScorerInvite,
  createTeam,
  fetchMyTeam,
  refreshTeamCache,
  removeScorer,
  setPotm,
  setResultOverride,
  supabaseSquadPush,
  upsertFixture,
  upsertSeason,
  upsertSquadPlayers,
} from "@/lib/team/remote";
import type { TeamError } from "@/lib/team/remote";
import { addSquadPlayerOffline, cacheTeam, getCachedTeam, getSquadOutbox } from "@/lib/team/local";
import { TEAM_ID, cachedFixture, cachedTeam, squadPlayer } from "../../helpers/team";

type Reply = { data: unknown; error: { message: string; code?: string } | null; status: number };

const opened: LocalDb[] = [];

function freshDb(): LocalDb {
  const db = new LocalDb(`test-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
}

function ok(data: unknown): Reply {
  return { data, error: null, status: 200 };
}

function fail(message: string, status = 400, code?: string): Reply {
  return { data: null, error: { message, code }, status };
}

function clientWith(reply: (name: string, args: unknown) => Reply | Promise<Reply>) {
  const rpc = vi.fn(async (name: string, args?: unknown) => reply(name, args));
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

function myTeamJson(team = cachedTeam()) {
  return {
    role: team.role,
    team: { id: team.id, code: team.code, name: team.name, homeGround: team.homeGround, timeZone: team.timeZone },
    squad: team.squad,
    seasons: team.seasons,
    fixtures: team.fixtures,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const db of opened.splice(0)) db.close();
});

describe("fetchMyTeam", () => {
  it("maps get_my_team into the cached team shape and stamps the fetch time", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T12:00:00.000Z"));
    const team = cachedTeam({ role: "scorer", homeGround: null });
    const { client, rpc } = clientWith(() => ok({ ...myTeamJson(team), scorers: [{ userId: "u1", addedAt: "2026-10-01T00:00:00.000Z" }] }));

    const fetched = await fetchMyTeam(client);

    expect(rpc).toHaveBeenCalledWith("get_my_team", undefined);
    expect(fetched).toEqual({ ...team, fetchedAt: "2026-10-27T12:00:00.000Z" });
  });

  it("returns null when the person is not on a team", async () => {
    const { client } = clientWith(() => ok(null));

    expect(await fetchMyTeam(client)).toBeNull();
  });

  it("throws a typed error for a network failure instead of returning null", async () => {
    const { client } = clientWith(() => fail("TypeError: Failed to fetch", 0));

    await expect(fetchMyTeam(client)).rejects.toMatchObject({ name: "TeamRemoteError", code: "network" });
  });

  it("throws a typed error when the fetch itself throws", async () => {
    const client = {
      rpc: async () => {
        throw new TypeError("Failed to fetch");
      },
    } as unknown as SupabaseClient;

    const error = await fetchMyTeam(client).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(TeamRemoteError);
    expect(error).toMatchObject({ code: "network" });
  });

  it("throws unknown for a response that is not a team", async () => {
    for (const data of ["nope", 7, { role: "owner" }, { ...myTeamJson(), role: "admin" }, { ...myTeamJson(), squad: null }]) {
      const { client } = clientWith(() => ok(data));
      await expect(fetchMyTeam(client)).rejects.toMatchObject({ code: "unknown" });
    }
  });
});

describe("refreshTeamCache", () => {
  it("replaces the cached team with the server's and returns it", async () => {
    const db = freshDb();
    await cacheTeam(db, cachedTeam({ name: "Old name", squad: [squadPlayer("Gone")] }));
    const latest = cachedTeam({ name: "Lions", fixtures: [cachedFixture({ opponent: "Kites" })] });
    const { client } = clientWith(() => ok(myTeamJson(latest)));

    const refreshed = await refreshTeamCache(client, db);

    expect(refreshed).toEqual({ ...latest, fetchedAt: expect.any(String) });
    expect(await getCachedTeam(db)).toEqual(refreshed);
    expect(await db.team.count()).toBe(1);
  });

  it("returns null and clears the cache when the person is not a member", async () => {
    const db = freshDb();
    await cacheTeam(db, cachedTeam());
    const { client } = clientWith(() => ok(null));

    expect(await refreshTeamCache(client, db)).toBeNull();
    expect(await getCachedTeam(db)).toBeUndefined();
  });

  it("keeps the cached team when the network fails", async () => {
    const db = freshDb();
    const team = cachedTeam();
    await cacheTeam(db, team);
    const { client } = clientWith(() => fail("Bad Gateway", 502));

    await expect(refreshTeamCache(client, db)).rejects.toMatchObject({ code: "network" });
    expect(await getCachedTeam(db)).toEqual(team);
  });

  it("keeps players still waiting in the outbox in the refreshed squad", async () => {
    const db = freshDb();
    await cacheTeam(db, cachedTeam());
    const waiting = await addSquadPlayerOffline(db, { name: "Zain", role: "keeper" });
    const server = cachedTeam();
    const { client } = clientWith(() => ok(myTeamJson(server)));

    const refreshed = await refreshTeamCache(client, db);

    expect(refreshed?.squad).toEqual([...server.squad, waiting]);
    expect((await getCachedTeam(db))?.squad).toEqual([...server.squad, waiting]);
    expect(await getSquadOutbox(db, TEAM_ID)).toEqual([waiting]);
  });

  it("drops outbox players the server already has, so a stale copy never overwrites an edit", async () => {
    const db = freshDb();
    await cacheTeam(db, cachedTeam());
    const added = await addSquadPlayerOffline(db, { name: "Zain", role: null });
    const renamed = { ...added, name: "Zain Abbas" };
    const server = cachedTeam({ squad: [renamed] });
    const { client } = clientWith(() => ok(myTeamJson(server)));

    const refreshed = await refreshTeamCache(client, db);

    expect(refreshed?.squad).toEqual([renamed]);
    expect(await getSquadOutbox(db, TEAM_ID)).toEqual([]);
  });

  it("does not carry another team's outbox players into the squad or delete them", async () => {
    const db = freshDb();
    await cacheTeam(db, cachedTeam());
    await db.squadOutbox.put({ id: crypto.randomUUID(), name: "Stray", role: null, active: true, teamId: "someone-else" });
    const { client } = clientWith(() => ok(myTeamJson()));

    const refreshed = await refreshTeamCache(client, db);

    expect(refreshed?.squad.map((player) => player.name)).toEqual(["Ali", "Hamza"]);
    expect(await db.squadOutbox.count()).toBe(1);
  });

  it("leaves the outbox alone when it clears the cache", async () => {
    const db = freshDb();
    await cacheTeam(db, cachedTeam());
    await addSquadPlayerOffline(db, { name: "Zain", role: null });
    const { client } = clientWith(() => ok(null));

    await refreshTeamCache(client, db);

    expect(await db.squadOutbox.count()).toBe(1);
  });
});

describe("team calls", () => {
  it("createTeam sends the name, home ground and time zone and returns the code", async () => {
    const { client, rpc } = clientWith(() => ok("abcd2345"));

    const result = await createTeam(client, { name: "Lions", homeGround: null, timeZone: "Asia/Karachi" });

    expect(result).toEqual({ ok: true, value: "abcd2345" });
    expect(rpc).toHaveBeenCalledWith("create_team", { p_name: "Lions", p_home_ground: null, p_time_zone: "Asia/Karachi" });
  });

  it("upsertSeason sends the season and returns its id", async () => {
    const season = { id: crypto.randomUUID(), name: "Winter", startsOn: "2026-11-01", endsOn: "2027-02-28" };
    const { client, rpc } = clientWith(() => ok(season.id));

    expect(await upsertSeason(client, season)).toEqual({ ok: true, value: season.id });
    expect(rpc).toHaveBeenCalledWith("upsert_season", { p_season: season });
  });

  it("upsertFixture sends the fixture without the server-owned match code", async () => {
    const { matchCode, ...fixture } = cachedFixture({ ground: "Home", homeAway: "home", notes: "Bring the kit" });
    void matchCode;
    const { client, rpc } = clientWith(() => ok(fixture.id));

    expect(await upsertFixture(client, fixture)).toEqual({ ok: true, value: fixture.id });
    expect(rpc).toHaveBeenCalledWith("upsert_fixture", { p_fixture: fixture });
  });

  it("setPotm and setResultOverride name the match by code", async () => {
    const player = crypto.randomUUID();
    const { client, rpc } = clientWith(() => ok(null));

    expect(await setPotm(client, "abcd2345", player)).toEqual({ ok: true, value: undefined });
    expect(await setPotm(client, "abcd2345", null)).toEqual({ ok: true, value: undefined });
    expect(await setResultOverride(client, "abcd2345", true)).toEqual({ ok: true, value: undefined });

    expect(rpc.mock.calls).toEqual([
      ["set_potm", { p_code: "abcd2345", p_player: player }],
      ["set_potm", { p_code: "abcd2345", p_player: null }],
      ["set_result_override", { p_code: "abcd2345", p_no_result: true }],
    ]);
  });

  it("createScorerInvite returns the token and acceptScorerInvite returns the team code", async () => {
    const { client, rpc } = clientWith((name) => ok(name === "create_scorer_invite" ? "token-1" : "abcd2345"));

    expect(await createScorerInvite(client)).toEqual({ ok: true, value: "token-1" });
    expect(await acceptScorerInvite(client, "token-1")).toEqual({ ok: true, value: "abcd2345" });

    expect(rpc.mock.calls).toEqual([
      ["create_scorer_invite", undefined],
      ["accept_scorer_invite", { p_token: "token-1" }],
    ]);
  });

  it("removeScorer sends the user id", async () => {
    const { client, rpc } = clientWith(() => ok(null));

    expect(await removeScorer(client, "user-1")).toEqual({ ok: true, value: undefined });
    expect(rpc).toHaveBeenCalledWith("remove_scorer", { p_user: "user-1" });
  });

  it("upsertSquadPlayers sends the team and players and returns the number written", async () => {
    const players = [squadPlayer("Zain", { role: "keeper" }), squadPlayer("Bilal", { active: false })];
    const { client, rpc } = clientWith(() => ok(2));

    expect(await upsertSquadPlayers(client, TEAM_ID, players)).toEqual({ ok: true, value: 2 });
    expect(rpc).toHaveBeenCalledWith("upsert_squad_players", { p_team: TEAM_ID, p_players: players });
  });

  it("treats a response of the wrong type as unknown", async () => {
    expect(await createTeam(clientWith(() => ok(null)).client, { name: "Lions", homeGround: null, timeZone: "Asia/Karachi" })).toEqual({
      ok: false,
      error: "unknown",
    });
    expect(await upsertSquadPlayers(clientWith(() => ok("2")).client, TEAM_ID, [])).toEqual({ ok: false, error: "unknown" });
  });

  type ErrorCase = [name: string, reply: Reply, expected: TeamError];

  const MAPPING: ErrorCase[] = [
    ["a request that never reached the server", fail("TypeError: Failed to fetch", 0), "network"],
    ["a request timeout", fail("Request Timeout", 408), "network"],
    ["too many requests", fail("Too Many Requests", 429), "network"],
    ["a bad gateway", fail("<html>Bad Gateway</html>", 502), "network"],
    ["a schema cache reload", fail("Could not query the database for the schema cache. Retrying.", 503, "PGRST002"), "network"],
    ["an expired token", fail("JWT expired", 401, "PGRST301"), "not_signed_in"],
    ["a call without a session", fail("permission denied for function create_team", 401, "42501"), "not_signed_in"],
    ["not_team_owner", fail("not_team_owner", 400, "P0001"), "not_team_owner"],
    ["team_exists", fail("team_exists", 400, "P0001"), "team_exists"],
    ["invite_invalid", fail("invite_invalid", 400, "P0001"), "invite_invalid"],
    ["quota_exceeded", fail("quota_exceeded", 400, "P0001"), "quota_exceeded"],
    ["invalid_time_zone", fail("invalid_time_zone", 400, "P0001"), "invalid_time_zone"],
    ["not_in_xi", fail("not_in_xi", 400, "P0001"), "not_in_xi"],
    ["a check constraint violation", fail('new row for relation "teams" violates check constraint "teams_name_check"', 400, "23514"), "refused"],
    ["a unique violation", fail('duplicate key value violates unique constraint "teams_code_key"', 409, "23505"), "refused"],
    ["a constraint message without an error code", fail('new row for relation "fixtures" violates check constraint "fixtures_overs_check"'), "refused"],
    ["an unexpected bad request", fail("something nobody planned for", 400, "XX000"), "unknown"],
    ["a function missing from the schema cache", fail("Could not find the function public.set_potm", 404, "PGRST202"), "unknown"],
    ["an unreadable error body", fail("", 400), "unknown"],
  ];

  it.each(MAPPING)("maps %s to the right error on every call", async (_name, reply, expected) => {
    const { client } = clientWith(() => reply);
    const failed = { ok: false, error: expected };

    expect(await createTeam(client, { name: "Lions", homeGround: null, timeZone: "Asia/Karachi" })).toEqual(failed);
    expect(await upsertSeason(client, { id: crypto.randomUUID(), name: "S", startsOn: "2026-01-01", endsOn: "2026-02-01" })).toEqual(failed);
    expect(await upsertFixture(client, { id: crypto.randomUUID(), startsAt: "2026-11-01T09:30:00.000Z", opponent: "Kites", ground: null, homeAway: null, overs: null, status: "scheduled", notes: null })).toEqual(failed);
    expect(await setPotm(client, "abcd2345", null)).toEqual(failed);
    expect(await setResultOverride(client, "abcd2345", false)).toEqual(failed);
    expect(await createScorerInvite(client)).toEqual(failed);
    expect(await acceptScorerInvite(client, "token")).toEqual(failed);
    expect(await removeScorer(client, "user-1")).toEqual(failed);
    expect(await upsertSquadPlayers(client, TEAM_ID, [])).toEqual(failed);
    await expect(fetchMyTeam(client)).rejects.toMatchObject({ code: expected });
  });

  it("maps a thrown fetch to network on every call", async () => {
    const client = {
      rpc: async () => {
        throw new TypeError("Failed to fetch");
      },
    } as unknown as SupabaseClient;
    const failed = { ok: false, error: "network" };

    expect(await createTeam(client, { name: "Lions", homeGround: null, timeZone: "Asia/Karachi" })).toEqual(failed);
    expect(await setPotm(client, "abcd2345", null)).toEqual(failed);
    expect(await upsertSquadPlayers(client, TEAM_ID, [])).toEqual(failed);
  });
});

describe("supabaseSquadPush", () => {
  async function teamWithOutbox(names: string[]) {
    const db = freshDb();
    await cacheTeam(db, cachedTeam());
    const players = [];
    for (const name of names) players.push(await addSquadPlayerOffline(db, { name, role: null }));
    return { db, players };
  }

  it("sends the outbox to the cached team and clears what it sent", async () => {
    const { db, players } = await teamWithOutbox(["Zain", "Bilal"]);
    const { client, rpc } = clientWith(() => ok(2));

    expect(await supabaseSquadPush(client)(db)).toBe(true);

    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0] as [string, { p_team: string; p_players: unknown[] }];
    expect(name).toBe("upsert_squad_players");
    expect(args.p_team).toBe(TEAM_ID);
    expect(args.p_players).toHaveLength(2);
    expect(args.p_players).toEqual(expect.arrayContaining(players));
    expect(await getSquadOutbox(db, TEAM_ID)).toEqual([]);
  });

  it("keeps a player added while the push was in flight", async () => {
    const { db, players } = await teamWithOutbox(["Zain"]);
    let late: Awaited<ReturnType<typeof addSquadPlayerOffline>> | undefined;
    const { client } = clientWith(async () => {
      late = await addSquadPlayerOffline(db, { name: "Late", role: null });
      return ok(1);
    });

    expect(await supabaseSquadPush(client)(db)).toBe(true);

    expect(players).toHaveLength(1);
    expect(await getSquadOutbox(db, TEAM_ID)).toEqual([late]);
  });

  it("keeps the whole outbox when the server does not acknowledge it", async () => {
    const { db, players } = await teamWithOutbox(["Zain", "Bilal"]);
    const { client } = clientWith(() => fail("Bad Gateway", 502));

    expect(await supabaseSquadPush(client)(db)).toBe(false);

    expect(await getSquadOutbox(db, TEAM_ID)).toEqual(expect.arrayContaining(players));
    expect(await db.squadOutbox.count()).toBe(2);
  });

  it("keeps the outbox when the call throws", async () => {
    const { db } = await teamWithOutbox(["Zain"]);
    const client = {
      rpc: async () => {
        throw new TypeError("Failed to fetch");
      },
    } as unknown as SupabaseClient;

    expect(await supabaseSquadPush(client)(db)).toBe(false);
    expect(await db.squadOutbox.count()).toBe(1);
  });

  it("makes no call when the outbox is empty", async () => {
    const db = freshDb();
    await cacheTeam(db, cachedTeam());
    const { client, rpc } = clientWith(() => ok(0));

    expect(await supabaseSquadPush(client)(db)).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("makes no call and keeps the outbox when no team is cached", async () => {
    const db = freshDb();
    await db.squadOutbox.put({ id: crypto.randomUUID(), name: "Zain", role: null, active: true, teamId: TEAM_ID });
    const { client, rpc } = clientWith(() => ok(1));

    expect(await supabaseSquadPush(client)(db)).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    expect(await db.squadOutbox.count()).toBe(1);
  });

  it("never sends players that were added for another team", async () => {
    const { db } = await teamWithOutbox(["Zain"]);
    const stray = { id: crypto.randomUUID(), name: "Stray", role: null, active: true, teamId: "someone-else" } as const;
    await db.squadOutbox.put(stray);
    const { client, rpc } = clientWith(() => ok(1));

    await supabaseSquadPush(client)(db);

    const [, args] = rpc.mock.calls[0] as [string, { p_players: Array<{ name: string }> }];
    expect(args.p_players.map((player) => player.name)).toEqual(["Zain"]);
    expect(await db.squadOutbox.toArray()).toEqual([stray]);
  });
});
