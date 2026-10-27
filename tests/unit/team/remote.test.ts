import "fake-indexeddb/auto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalDb } from "@/lib/local/db";
import {
  TeamRemoteError,
  acceptScorerInvite,
  createScorerInvite,
  createTeam,
  fetchScorers,
  fetchTeamPage,
  fetchMyTeam,
  refreshTeamCache,
  refreshTeamCacheInBackground,
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

type SessionKind = "member" | "guest" | "none";

function sessionOf(kind: SessionKind) {
  const session = kind === "none" ? null : { user: { id: "user-1", is_anonymous: kind === "guest" } };
  return { data: { session }, error: null };
}

function clientWith(
  reply: (name: string, args: unknown) => Reply | Promise<Reply>,
  session: SessionKind | (() => SessionKind) = "member",
) {
  const rpc = vi.fn(async (name: string, args?: unknown) => reply(name, args));
  const getSession = vi.fn(async () => sessionOf(typeof session === "function" ? session() : session));
  return { client: { rpc, auth: { getSession } } as unknown as SupabaseClient, rpc, getSession };
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

  it("never touches the cache or the outbox under a guest session, even though the server would answer not a member", async () => {
    const db = freshDb();
    const team = cachedTeam();
    await cacheTeam(db, team);
    const waiting = await addSquadPlayerOffline(db, { name: "Zain", role: null });
    const { client, rpc } = clientWith(() => ok(null), "guest");

    await expect(refreshTeamCache(client, db)).rejects.toMatchObject({ name: "TeamRemoteError", code: "not_signed_in" });

    expect(rpc).not.toHaveBeenCalled();
    expect((await getCachedTeam(db))?.squad).toEqual([...team.squad, waiting]);
    expect(await getSquadOutbox(db, TEAM_ID)).toEqual([waiting]);
  });

  it("keeps the cache and the outbox when the session turns into a guest's before a not-a-member answer is applied", async () => {
    const db = freshDb();
    const team = cachedTeam();
    await cacheTeam(db, team);
    const waiting = await addSquadPlayerOffline(db, { name: "Zain", role: null });
    let checks = 0;
    const { client, rpc } = clientWith(
      () => ok(null),
      () => ((checks += 1) === 1 ? "member" : "guest"),
    );

    await expect(refreshTeamCache(client, db)).rejects.toMatchObject({ name: "TeamRemoteError", code: "not_signed_in" });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect((await getCachedTeam(db))?.squad).toEqual([...team.squad, waiting]);
    expect(await getSquadOutbox(db, TEAM_ID)).toEqual([waiting]);
  });

  it("refreshes under a Google session", async () => {
    const db = freshDb();
    await cacheTeam(db, cachedTeam({ name: "Old name" }));
    const { client, rpc } = clientWith(() => ok(myTeamJson(cachedTeam({ name: "Lions" }))), "member");

    expect((await refreshTeamCache(client, db))?.name).toBe("Lions");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("refreshTeamCacheInBackground", () => {
  it("refreshes the cache under a Google session", async () => {
    const db = freshDb();
    await cacheTeam(db, cachedTeam({ name: "Old name" }));
    const { client, rpc } = clientWith(() => ok(myTeamJson(cachedTeam({ name: "Lions" }))));

    await refreshTeamCacheInBackground(client, db);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect((await getCachedTeam(db))?.name).toBe("Lions");
  });

  it("does not call the server for a guest or when nobody is signed in", async () => {
    for (const session of ["guest", "none"] as const) {
      const db = freshDb();
      const team = cachedTeam();
      await cacheTeam(db, team);
      const { client, rpc } = clientWith(() => ok(null), session);

      await refreshTeamCacheInBackground(client, db);

      expect(rpc).not.toHaveBeenCalled();
      expect(await getCachedTeam(db)).toEqual(team);
    }
  });

  it("swallows a failure and keeps the cache", async () => {
    const db = freshDb();
    const team = cachedTeam();
    await cacheTeam(db, team);
    const { client } = clientWith(() => fail("Bad Gateway", 502));

    await expect(refreshTeamCacheInBackground(client, db)).resolves.toBeUndefined();
    expect(await getCachedTeam(db)).toEqual(team);
  });

  it("swallows a session that cannot be read", async () => {
    const db = freshDb();
    const client = {
      rpc: vi.fn(),
      auth: {
        getSession: async () => {
          throw new Error("storage unavailable");
        },
      },
    } as unknown as SupabaseClient;

    await expect(refreshTeamCacheInBackground(client, db)).resolves.toBeUndefined();
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

  it("fetchScorers reads the owner's scorer list from get_my_team", async () => {
    const scorers = [{ userId: "user-2", addedAt: "2026-10-27T08:00:00.000Z" }];
    const { client, rpc } = clientWith(() => ok({ ...myTeamJson(), scorers: [...scorers, { userId: 7 }] }));

    expect(await fetchScorers(client)).toEqual({ ok: true, value: scorers });
    expect(rpc).toHaveBeenCalledWith("get_my_team", undefined);
  });

  it("fetchScorers is empty for a scorer, who gets no list", async () => {
    const { client } = clientWith(() => ok({ ...myTeamJson(), role: "scorer" }));

    expect(await fetchScorers(client)).toEqual({ ok: true, value: [] });
  });

  it("fetchTeamPage reads the public page by team code", async () => {
    const { client, rpc } = clientWith(() =>
      ok({ team: { code: "abcd2345", name: "Lions", homeGround: null, timeZone: "Asia/Karachi" }, squad: [], seasons: [], fixtures: [], matches: [] }),
    );

    expect(await fetchTeamPage(client, "abcd2345")).toMatchObject({ ok: true, value: { team: { name: "Lions" }, matches: [] } });
    expect(rpc).toHaveBeenCalledWith("get_team_page", { p_code: "abcd2345" });
  });

  it("fetchTeamPage treats a missing team as unknown", async () => {
    const { client } = clientWith(() => ok(null));

    expect(await fetchTeamPage(client, "abcd2345")).toEqual({ ok: false, error: "unknown" });
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
  const OTHER_TEAM = "55555555-5555-4555-8555-555555555555";
  const CHECK_VIOLATION = 'new row for relation "squad_players" violates check constraint "squad_players_name_check"';

  async function teamWithOutbox(names: string[]) {
    const db = freshDb();
    await cacheTeam(db, cachedTeam());
    const players = [];
    for (const name of names) players.push(await addSquadPlayerOffline(db, { name, role: null }));
    return { db, players };
  }

  async function queueFor(db: LocalDb, teamId: string, name: string) {
    const player = squadPlayer(name);
    await db.squadOutbox.put({ ...player, teamId });
    return player;
  }

  function sentTo(rpc: { mock: { calls: unknown[][] } }) {
    return rpc.mock.calls.map(([, args]) => {
      const { p_team, p_players } = args as { p_team: string; p_players: Array<{ name: string }> };
      return { team: p_team, names: p_players.map((player) => player.name).sort() };
    });
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
      auth: { getSession: async () => sessionOf("member") },
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

  it("sends each team's players to that team, even after the cache moved to another team", async () => {
    const { db } = await teamWithOutbox(["Zain"]);
    await queueFor(db, OTHER_TEAM, "Elsewhere");
    const { client, rpc } = clientWith(() => ok(1));

    expect(await supabaseSquadPush(client)(db)).toBe(true);

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(sentTo(rpc)).toEqual(
      expect.arrayContaining([
        { team: TEAM_ID, names: ["Zain"] },
        { team: OTHER_TEAM, names: ["Elsewhere"] },
      ]),
    );
    expect(await db.squadOutbox.count()).toBe(0);
  });

  it("sends the players to the team they were added for when no team is cached", async () => {
    const db = freshDb();
    await queueFor(db, TEAM_ID, "Zain");
    const { client, rpc } = clientWith(() => ok(1));

    expect(await supabaseSquadPush(client)(db)).toBe(true);

    expect(sentTo(rpc)).toEqual([{ team: TEAM_ID, names: ["Zain"] }]);
    expect(await db.squadOutbox.count()).toBe(0);
  });

  it("drops the players of a team the person no longer belongs to, but retries the cached team", async () => {
    const { db } = await teamWithOutbox(["Zain"]);
    await queueFor(db, OTHER_TEAM, "Left behind");
    const { client, rpc } = clientWith((_name, args) => {
      const team = (args as { p_team: string }).p_team;
      return team === OTHER_TEAM ? fail("not_team_owner", 400, "P0001") : ok(1);
    });

    expect(await supabaseSquadPush(client)(db)).toBe(true);
    expect(await db.squadOutbox.toArray()).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(2);

    const cachedRefused = clientWith(() => fail("not_team_owner", 400, "P0001"));
    await addSquadPlayerOffline(db, { name: "Kept", role: null });

    expect(await supabaseSquadPush(cachedRefused.client)(db)).toBe(false);
    expect(await db.squadOutbox.count()).toBe(1);
  });

  it("keeps every row and makes no call while the session is a guest's", async () => {
    const { db } = await teamWithOutbox(["Zain"]);
    await queueFor(db, OTHER_TEAM, "Elsewhere");
    const { client, rpc } = clientWith(() => fail("not_team_owner", 400, "P0001"), "guest");

    expect(await supabaseSquadPush(client)(db)).toBe(false);

    expect(rpc).not.toHaveBeenCalled();
    expect((await db.squadOutbox.toArray()).map((row) => row.name).sort()).toEqual(["Elsewhere", "Zain"]);
  });

  it("keeps every row and makes no call while there is no session", async () => {
    const { db } = await teamWithOutbox(["Zain"]);
    const { client, rpc } = clientWith(() => ok(1), "none");

    expect(await supabaseSquadPush(client)(db)).toBe(false);

    expect(rpc).not.toHaveBeenCalled();
    expect(await db.squadOutbox.count()).toBe(1);
  });

  it("keeps every row when the session cannot be read", async () => {
    const { db } = await teamWithOutbox(["Zain"]);
    const { client, rpc } = clientWith(() => ok(1));
    Object.assign(client, {
      auth: {
        getSession: async () => {
          throw new Error("storage unavailable");
        },
      },
    });

    expect(await supabaseSquadPush(client)(db)).toBe(false);

    expect(rpc).not.toHaveBeenCalled();
    expect(await db.squadOutbox.count()).toBe(1);
  });

  it("keeps another team's rows when the session turns into a guest's before the not_team_owner answer is acted on", async () => {
    const { db } = await teamWithOutbox(["Zain"]);
    await queueFor(db, OTHER_TEAM, "Left behind");
    let checks = 0;
    const { client } = clientWith(
      (_name, args) => ((args as { p_team: string }).p_team === OTHER_TEAM ? fail("not_team_owner", 400, "P0001") : ok(1)),
      () => ((checks += 1) === 1 ? "member" : "guest"),
    );

    expect(await supabaseSquadPush(client)(db)).toBe(false);

    expect((await db.squadOutbox.toArray()).map((row) => row.name)).toEqual(["Left behind"]);
  });

  it("keeps pushing other teams when one team's push fails", async () => {
    const { db } = await teamWithOutbox(["Zain"]);
    await queueFor(db, OTHER_TEAM, "Elsewhere");
    const { client } = clientWith((_name, args) =>
      (args as { p_team: string }).p_team === TEAM_ID ? fail("Bad Gateway", 502) : ok(1),
    );

    expect(await supabaseSquadPush(client)(db)).toBe(false);

    expect((await db.squadOutbox.toArray()).map((row) => row.name)).toEqual(["Zain"]);
  });

  it("falls back to one player at a time when the batch is refused, so good rows land and the bad one is parked", async () => {
    const { db, players } = await teamWithOutbox(["Zain", "Bad", "Bilal"]);
    const { client, rpc } = clientWith((_name, args) => {
      const sent = (args as { p_players: Array<{ name: string }> }).p_players;
      return sent.some((player) => player.name === "Bad") ? fail(CHECK_VIOLATION, 400, "23514") : ok(sent.length);
    });

    expect(await supabaseSquadPush(client)(db)).toBe(true);

    expect(rpc).toHaveBeenCalledTimes(4);
    const singles = sentTo(rpc).slice(1);
    expect(singles.map((call) => call.names)).toEqual(expect.arrayContaining([["Zain"], ["Bad"], ["Bilal"]]));
    expect(singles.every((call) => call.names.length === 1)).toBe(true);
    expect(await db.squadOutbox.count()).toBe(0);
    expect((await getCachedTeam(db))?.squad).toEqual(expect.arrayContaining(players));
  });

  it("parks the players the server turns away for the squad limit and lands the ones that fit", async () => {
    const { db } = await teamWithOutbox(["One", "Two", "Three"]);
    let room = 2;
    const { client } = clientWith((_name, args) => {
      const sent = (args as { p_players: unknown[] }).p_players;
      if (sent.length > room) return fail("quota_exceeded", 400, "P0001");
      room -= sent.length;
      return ok(sent.length);
    });

    expect(await supabaseSquadPush(client)(db)).toBe(true);

    expect(room).toBe(0);
    expect(await db.squadOutbox.count()).toBe(0);
  });

  it("parks a lone refused player", async () => {
    const { db } = await teamWithOutbox(["Bad"]);
    const { client } = clientWith(() => fail(CHECK_VIOLATION, 400, "23514"));

    expect(await supabaseSquadPush(client)(db)).toBe(true);

    expect(await db.squadOutbox.count()).toBe(0);
  });

  it("stops the one-by-one fallback on a transient failure and keeps the rest for later", async () => {
    const { db } = await teamWithOutbox(["Zain", "Bad", "Bilal"]);
    let single = 0;
    const { client } = clientWith((_name, args) => {
      const sent = (args as { p_players: unknown[] }).p_players;
      if (sent.length > 1) return fail(CHECK_VIOLATION, 400, "23514");
      single += 1;
      return single === 1 ? ok(1) : fail("Bad Gateway", 502);
    });

    expect(await supabaseSquadPush(client)(db)).toBe(false);

    expect(await db.squadOutbox.count()).toBe(2);
  });
});
