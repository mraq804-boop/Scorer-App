import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, createDb, expectDbError, type Actor } from "./db";

const OWNER = { sub: "00000000-0000-0000-0000-000000000a01", anonymous: false };
const OTHER_OWNER = { sub: "00000000-0000-0000-0000-000000000a02", anonymous: false };
const QUOTA_OWNER = { sub: "00000000-0000-0000-0000-000000000a03", anonymous: false };
const SCORER = { sub: "00000000-0000-0000-0000-000000000b01", anonymous: false };
const LATE_SCORER = { sub: "00000000-0000-0000-0000-000000000b02", anonymous: false };
const STRANGER = { sub: "00000000-0000-0000-0000-000000000c01", anonymous: false };
const GUEST = { sub: "00000000-0000-0000-0000-000000000e01", anonymous: true };
const FILLERS = Array.from({ length: 10 }, (_, i) => `00000000-0000-0000-0000-000000000f0${i}`);
const D1 = "00000000-0000-0000-0000-00000000d001";
const AT = "2026-10-23T10:15:30.250Z";
const DAY = 86_400_000;
const CODE = /^[a-hjkmnp-z2-9]{8}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

type Team = { id: string; code: string };
type Player = { id: string; name: string; role: string | null; active: boolean };
type Fixture = {
  id?: string;
  startsAt: string;
  opponent: string;
  ground: string | null;
  homeAway: "home" | "away" | null;
  overs: number | null;
  notes: string | null;
  status: "scheduled" | "played" | "cancelled";
};
type MatchInput = {
  id: string;
  code: string;
  title: string;
  teamA: string;
  teamB: string;
  rules: Record<string, unknown>;
  status: "in_progress" | "complete";
  summary: Record<string, unknown>;
};
type TeamLink = { id: string; side: string; fixtureId: string | null; record: Record<string, unknown> | null };

let db: PGlite;
let lions: Team;
let eagles: Team;
let quota: Team;
let matchCount = 0;

const ali: Player = { id: crypto.randomUUID(), name: "Ali", role: "batter", active: true };
const usman: Player = { id: crypto.randomUUID(), name: "Usman", role: "allrounder", active: true };
const hamza: Player = { id: crypto.randomUUID(), name: "Hamza", role: "bowler", active: true };

async function rpc<T = Record<string, unknown>>(actor: Actor, sql: string, params: unknown[] = []) {
  return as(db, actor, async (tx) => (await tx.query<T>(sql, params)).rows);
}

async function call<T = unknown>(actor: Actor, fn: string, args: unknown[] = []): Promise<T> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  const [row] = await rpc<{ result: T }>(actor, `select public.${fn}(${placeholders}) as result`, args);
  return row.result;
}

async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}

async function teamOf(owner: { sub: string }): Promise<Team> {
  const [team] = await rows<Team>(`select id, code from public.teams where owner_id = $1`, [owner.sub]);
  return team;
}

function createTeam(actor: Actor, name: string, ground: string | null, timeZone: string | null) {
  return call<string>(actor, "create_team", [name, ground, timeZone]);
}

function upsertSquad(actor: Actor, teamId: string, players: Player[]) {
  return call<number>(actor, "upsert_squad_players", [teamId, JSON.stringify(players)]);
}

function upsertSeason(actor: Actor, season: Record<string, unknown>) {
  return call<string>(actor, "upsert_season", [JSON.stringify(season)]);
}

function upsertFixture(actor: Actor, fixture: Fixture) {
  return call<string>(actor, "upsert_fixture", [JSON.stringify(fixture)]);
}

function createInvite(actor: Actor) {
  return call<string>(actor, "create_scorer_invite");
}

function acceptInvite(actor: Actor, token: string) {
  return call<string>(actor, "accept_scorer_invite", [token]);
}

function myTeam(actor: Actor) {
  return call<Record<string, unknown> | null>(actor, "get_my_team");
}

function teamPage(code: string) {
  return call<Record<string, unknown> | null>("anon", "get_team_page", [code]);
}

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function isoIn(days: number) {
  return new Date(Date.now() + days * DAY).toISOString();
}

function fixture(days: number, overrides: Partial<Fixture> = {}): Fixture {
  return {
    startsAt: isoIn(days),
    opponent: "Tigers",
    ground: "Model Town",
    homeAway: "home",
    overs: 20,
    notes: "Bring the new ball",
    status: "scheduled",
    ...overrides,
  };
}

function newMatch(): MatchInput {
  const n = matchCount++;
  return {
    id: crypto.randomUUID(),
    code: `matchx${CODE_ALPHABET[Math.floor(n / 31)]}${CODE_ALPHABET[n % 31]}`,
    title: "Lions v Tigers",
    teamA: "Lions",
    teamB: "Tigers",
    rules: { ballsPerOver: 6, oversPerInnings: 20 },
    status: "complete",
    summary: { lines: ["Lions 120/4 (20 ov)"] },
  };
}

function wire(seq: number) {
  return { id: crypto.randomUUID(), seq, at: AT, type: "strike_swapped", payload: {} };
}

function record(xi: string[]) {
  return {
    version: 1,
    side: "A",
    opponent: "Tigers",
    playedAt: AT,
    xi,
    outcome: "won",
    players: xi.map((playerId) => ({ playerId, batting: null, bowling: null, fielding: { catches: 0, runOuts: 0, stumpings: 0 } })),
  };
}

function link(team: Team, fixtureId: string | null = null, xi = [ali.id, usman.id]): TeamLink {
  return { id: team.id, side: "A", fixtureId, record: record(xi) };
}

async function push(actor: Actor, match: MatchInput, seqs: number[], team?: unknown) {
  return call<number>(actor, "push_match_events", [
    JSON.stringify(team === undefined ? match : { ...match, team }),
    D1,
    JSON.stringify(seqs.map(wire)),
  ]);
}

async function matchRow(id: string) {
  const [row] = await rows<{
    team_id: string | null;
    team_side: string | null;
    fixture_id: string | null;
    player_stats: Record<string, unknown> | null;
    potm_player_id: string | null;
    result_override: string | null;
    last_seq: number;
  }>(`select team_id, team_side, fixture_id, player_stats, potm_player_id, result_override, last_seq from public.matches where id = $1`, [id]);
  return row;
}

function keysDeep(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysDeep);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [k, ...keysDeep(v)]);
  }
  return [];
}

beforeAll(async () => {
  db = await createDb();
  for (const sub of [OWNER, OTHER_OWNER, QUOTA_OWNER, SCORER, LATE_SCORER, STRANGER, GUEST].map((u) => u.sub).concat(FILLERS)) {
    await db.query(`insert into auth.users (id) values ($1)`, [sub]);
  }
}, 60_000);

describe("create_team", () => {
  it("a Google user creates one team with a short code", async () => {
    const code = await createTeam(OWNER, "Lions", "Model Town Ground", null);
    expect(code).toMatch(CODE);
    lions = await teamOf(OWNER);
    expect(lions.code).toBe(code);
    const [row] = await rows(`select name, home_ground, time_zone from public.teams where id = $1`, [lions.id]);
    expect(row).toEqual({ name: "Lions", home_ground: "Model Town Ground", time_zone: "Asia/Karachi" });

    await expectDbError(createTeam(OWNER, "Lions again", null, null), /team_exists/);
    await expectDbError(createTeam(GUEST, "Guests", null, null), /not_team_owner|permission/);
    await expectDbError(createTeam("anon", "Nobody", null, null), /not_team_owner|permission/);

    expect(await createTeam(OTHER_OWNER, "Eagles", "", "Europe/London")).toMatch(CODE);
    eagles = await teamOf(OTHER_OWNER);
    const [other] = await rows(`select home_ground, time_zone from public.teams where id = $1`, [eagles.id]);
    expect(other).toEqual({ home_ground: null, time_zone: "Europe/London" });
    expect(await rows(`select 1 from public.teams`)).toHaveLength(2);
  });

  it("checks the time zone and name length in code points", async () => {
    await expectDbError(createTeam(STRANGER, "Hawks", null, "Mars/Olympus_Mons"), /invalid_time_zone/);
    await expectDbError(createTeam(STRANGER, "x".repeat(41), null, null), /teams_name_check/);
    await expectDbError(createTeam(STRANGER, "Hawks", "g".repeat(61), null), /teams_home_ground_check/);
    expect(await teamOf(STRANGER)).toBeUndefined();

    expect(await createTeam(QUOTA_OWNER, "🏏".repeat(40), "g".repeat(60), "UTC")).toMatch(CODE);
    quota = await teamOf(QUOTA_OWNER);
  });
});

describe("scorer invites", () => {
  it("an invite makes one Google user a scorer, once", async () => {
    const token = await createInvite(OWNER);
    expect(await rows(`select 1 from public.team_invites where token_hash = $1`, [hash(token)])).toHaveLength(1);
    expect(await rows(`select 1 from public.team_invites where token_hash = $1`, [token])).toHaveLength(0);

    await expectDbError(acceptInvite(GUEST, token), /invite_invalid/);
    await expectDbError(acceptInvite(OWNER, token), /invite_invalid/);
    expect(await acceptInvite(SCORER, token)).toBe(lions.code);
    await expectDbError(acceptInvite(STRANGER, token), /invite_invalid/);
    await expectDbError(acceptInvite(SCORER, crypto.randomUUID()), /invite_invalid/);

    expect(await rows(`select team_id, user_id from public.team_scorers`)).toEqual([{ team_id: lions.id, user_id: SCORER.sub }]);
    expect(await myTeam(SCORER)).toMatchObject({ role: "scorer", team: { id: lions.id, code: lions.code } });
  });

  it("an expired invite is invalid", async () => {
    const token = await createInvite(OWNER);
    await rpc("service", `update public.team_invites set expires_at = now() - interval '1 minute' where token_hash = $1`, [hash(token)]);
    await expectDbError(acceptInvite(LATE_SCORER, token), /invite_invalid/);
    expect(await rows(`select 1 from public.team_scorers where user_id = $1`, [LATE_SCORER.sub])).toHaveLength(0);
  });

  it("only owners create invites and remove scorers", async () => {
    await expectDbError(createInvite(STRANGER), /not_team_owner/);
    await expectDbError(createInvite(SCORER), /not_team_owner/);
    await expectDbError(createInvite(GUEST), /not_team_owner/);
    await expectDbError(call(SCORER, "remove_scorer", [SCORER.sub]), /not_team_owner/);
    await call(OTHER_OWNER, "remove_scorer", [SCORER.sub]);
    expect(await rows(`select 1 from public.team_scorers where user_id = $1`, [SCORER.sub])).toHaveLength(1);
  });

  it("limits live invites to 5 and scorers to 10", async () => {
    for (let i = 0; i < 5; i++) await createInvite(QUOTA_OWNER);
    await expectDbError(createInvite(QUOTA_OWNER), /quota_exceeded/);
    await rpc(
      "service",
      `update public.team_invites set expires_at = now() - interval '1 second'
       where token_hash = (select token_hash from public.team_invites where team_id = $1 limit 1)`,
      [quota.id],
    );
    const token = await createInvite(QUOTA_OWNER);
    expect(await rows(`select 1 from public.team_invites where team_id = $1`, [quota.id])).toHaveLength(5);

    for (const user of FILLERS) {
      await rpc("service", `insert into public.team_scorers (team_id, user_id) values ($1, $2)`, [quota.id, user]);
    }
    await expectDbError(acceptInvite(STRANGER, token), /quota_exceeded/);
    await expectDbError(createInvite(QUOTA_OWNER), /quota_exceeded/);
    expect(await rows(`select 1 from public.team_scorers where team_id = $1`, [quota.id])).toHaveLength(10);
  });
});

describe("squad", () => {
  it("owners and scorers add players; only the owner changes them", async () => {
    expect(await upsertSquad(OWNER, lions.id, [ali, usman])).toBe(2);
    expect(await upsertSquad(OWNER, lions.id, [ali, usman])).toBe(0);
    expect(await upsertSquad(SCORER, lions.id, [hamza])).toBe(1);
    expect(await upsertSquad(SCORER, lions.id, [{ ...ali, name: "Renamed", active: false }])).toBe(0);
    expect(await rows(`select id, name, role, active from public.squad_players where team_id = $1 order by name`, [lions.id])).toEqual([
      ali,
      hamza,
      usman,
    ]);

    ali.name = "Ali Khan";
    usman.active = false;
    expect(await upsertSquad(OWNER, lions.id, [ali, usman, hamza])).toBe(2);
    expect(await rows(`select id, name, active from public.squad_players where id = any($1::uuid[]) order by name`, [[ali.id, usman.id]])).toEqual([
      { id: ali.id, name: "Ali Khan", active: true },
      { id: usman.id, name: "Usman", active: false },
    ]);

    await expectDbError(upsertSquad(STRANGER, lions.id, [{ ...hamza, id: crypto.randomUUID() }]), /not_team_owner/);
    await expectDbError(upsertSquad(GUEST, lions.id, [{ ...hamza, id: crypto.randomUUID() }]), /not_team_owner/);
    expect(await upsertSquad(OTHER_OWNER, eagles.id, [{ ...ali, name: "Stolen" }])).toBe(0);
    expect(await rows(`select team_id, name from public.squad_players where id = $1`, [ali.id])).toEqual([
      { team_id: lions.id, name: "Ali Khan" },
    ]);
    await expectDbError(upsertSquad(OWNER, lions.id, [{ ...hamza, id: crypto.randomUUID(), name: "n".repeat(41) }]), /squad_players_name_check/);
    await expectDbError(upsertSquad(OWNER, lions.id, [{ ...hamza, id: crypto.randomUUID(), role: "captain" }]), /squad_players_role_check/);
  });

  it("caps the squad at 60 players", async () => {
    const players = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: crypto.randomUUID(), name: `Player ${i}`, role: null, active: true }));
    expect(await upsertSquad(QUOTA_OWNER, quota.id, players(59))).toBe(59);
    expect(await upsertSquad({ sub: FILLERS[0], anonymous: false }, quota.id, players(1))).toBe(1);
    await expectDbError(upsertSquad(QUOTA_OWNER, quota.id, players(1)), /quota_exceeded/);
    expect(await rows(`select 1 from public.squad_players where team_id = $1`, [quota.id])).toHaveLength(60);
  });
});

describe("seasons and fixtures", () => {
  it("only the owner edits seasons", async () => {
    const winter = { name: "Winter 2026", startsOn: "2026-11-01", endsOn: "2027-02-28" };
    const id = await upsertSeason(OWNER, winter);
    expect(await upsertSeason(OWNER, { ...winter, id, name: "Winter 26/27" })).toBe(id);
    expect(await rows(`select team_id, name, starts_on::text, ends_on::text from public.seasons`)).toEqual([
      { team_id: lions.id, name: "Winter 26/27", starts_on: "2026-11-01", ends_on: "2027-02-28" },
    ]);

    for (const actor of [SCORER, STRANGER, GUEST, OTHER_OWNER]) {
      await expectDbError(upsertSeason(actor, { ...winter, id, name: "Hijacked" }), /not_team_owner/);
    }
    await expectDbError(upsertSeason(SCORER, winter), /not_team_owner/);
    await expectDbError(upsertSeason(OWNER, { ...winter, endsOn: "2026-10-31" }), /seasons_check|violates check/);
    expect(await rows(`select name from public.seasons`)).toEqual([{ name: "Winter 26/27" }]);
  });

  it("only the owner edits fixtures", async () => {
    const id = await upsertFixture(OWNER, fixture(7));
    expect(await upsertFixture(OWNER, fixture(7, { id, opponent: "Panthers" }))).toBe(id);
    expect(await rows(`select team_id, opponent from public.fixtures`)).toEqual([{ team_id: lions.id, opponent: "Panthers" }]);

    for (const actor of [SCORER, STRANGER, GUEST, OTHER_OWNER]) {
      await expectDbError(upsertFixture(actor, fixture(7, { id, opponent: "Hijacked" })), /not_team_owner/);
    }
    await expectDbError(upsertFixture(SCORER, fixture(8)), /not_team_owner/);
    await expectDbError(upsertFixture(OWNER, fixture(8, { notes: "n".repeat(281) })), /fixtures_notes_check/);
    await expectDbError(upsertFixture(OWNER, fixture(8, { overs: 0 })), /fixtures_overs_check/);
    await expectDbError(upsertFixture(OWNER, fixture(8, { status: "postponed" as Fixture["status"] })), /fixtures_status_check/);
    expect(await rows(`select opponent from public.fixtures`)).toEqual([{ opponent: "Panthers" }]);
  });

  it("caps seasons at 30 and fixtures at 300", async () => {
    for (let i = 0; i < 30; i++) {
      await upsertSeason(QUOTA_OWNER, { name: `Season ${i}`, startsOn: "2026-01-01", endsOn: "2026-12-31" });
    }
    await expectDbError(upsertSeason(QUOTA_OWNER, { name: "One more", startsOn: "2027-01-01", endsOn: "2027-12-31" }), /quota_exceeded/);

    await rpc(
      "service",
      `insert into public.fixtures (id, team_id, starts_at, opponent, status)
       select gen_random_uuid(), $1, now() + i * interval '1 day', 'Opponent ' || i, 'scheduled' from generate_series(1, 299) i`,
      [quota.id],
    );
    await upsertFixture(QUOTA_OWNER, fixture(1));
    await expectDbError(upsertFixture(QUOTA_OWNER, fixture(2)), /quota_exceeded/);
    expect(await rows(`select 1 from public.fixtures where team_id = $1`, [quota.id])).toHaveLength(300);
  });
});

describe("team matches", () => {
  it("an owner's push links the match and its fixture", async () => {
    const fixtureId = await upsertFixture(OWNER, fixture(-1, { opponent: "Tigers" }));
    const match = newMatch();
    expect(await push(OWNER, match, [1, 2], link(lions, fixtureId))).toBe(2);
    expect(await matchRow(match.id)).toMatchObject({
      team_id: lions.id,
      team_side: "A",
      fixture_id: fixtureId,
      player_stats: record([ali.id, usman.id]),
      last_seq: 2,
    });
    expect(await rows(`select status, match_id from public.fixtures where id = $1`, [fixtureId])).toEqual([
      { status: "played", match_id: match.id },
    ]);
  });

  it("a push without the team block keeps the match's link", async () => {
    const fixtureId = await upsertFixture(OWNER, fixture(-2, { opponent: "Jaguars" }));
    const match = newMatch();
    await push(OWNER, match, [1], link(lions, fixtureId));
    expect(await push(OWNER, match, [2])).toBe(2);
    expect(await matchRow(match.id)).toMatchObject({
      team_id: lions.id,
      team_side: "A",
      fixture_id: fixtureId,
      player_stats: record([ali.id, usman.id]),
      last_seq: 2,
    });
  });

  it("a scorer's push links the match, but not another team's fixture", async () => {
    const theirs = await upsertFixture(OTHER_OWNER, fixture(-1));
    const match = newMatch();
    expect(await push(SCORER, match, [1], link(lions, theirs))).toBe(1);
    expect(await matchRow(match.id)).toMatchObject({ team_id: lions.id, team_side: "A", fixture_id: null });
    expect(await rows(`select status, match_id from public.fixtures where id = $1`, [theirs])).toEqual([
      { status: "scheduled", match_id: null },
    ]);
  });

  it("a non-member's team match syncs unlinked", async () => {
    const strangers = newMatch();
    expect(await push(STRANGER, strangers, [1, 2, 3], link(lions))).toBe(3);
    expect(await matchRow(strangers.id)).toMatchObject({ team_id: null, team_side: null, player_stats: null, fixture_id: null, last_seq: 3 });

    const token = await createInvite(OWNER);
    await acceptInvite(LATE_SCORER, token);
    const fixtureId = await upsertFixture(OWNER, fixture(0));
    const late = newMatch();
    expect(await push(LATE_SCORER, late, [1], link(lions, fixtureId))).toBe(1);
    expect(await matchRow(late.id)).toMatchObject({ team_id: lions.id, fixture_id: fixtureId });

    await call(OWNER, "remove_scorer", [LATE_SCORER.sub]);
    expect(await myTeam(LATE_SCORER)).toBeNull();
    expect(await push(LATE_SCORER, late, [2, 3], link(lions, fixtureId))).toBe(3);
    expect(await matchRow(late.id)).toMatchObject({ team_id: null, player_stats: null, fixture_id: null, last_seq: 3 });

    const malformed = newMatch();
    expect(await push(OWNER, malformed, [1], { id: "not-a-uuid", side: "A", fixtureId: null, record: {} })).toBe(1);
    expect(await push(OWNER, malformed, [2], { ...link(lions), side: "C" })).toBe(2);
    expect(await matchRow(malformed.id)).toMatchObject({ team_id: null, last_seq: 2 });
  });

  it("caps the record size", async () => {
    const match = newMatch();
    await expectDbError(push(OWNER, match, [1], { ...link(lions), record: { note: "x".repeat(16400) } }), /matches_player_stats_size/);
    expect(await rows(`select 1 from public.matches where id = $1`, [match.id])).toHaveLength(0);
  });
});

describe("match outcomes", () => {
  let match: MatchInput;

  beforeAll(async () => {
    match = newMatch();
    await push(SCORER, match, [1], link(lions, null, [ali.id, hamza.id]));
  });

  it("set_potm accepts only an XI player, from the owner", async () => {
    await expectDbError(call(OWNER, "set_potm", [match.code, usman.id]), /not_in_xi/);
    await call(OWNER, "set_potm", [match.code, hamza.id]);
    expect((await matchRow(match.id)).potm_player_id).toBe(hamza.id);

    await expectDbError(call(SCORER, "set_potm", [match.code, ali.id]), /not_team_owner/);
    await expectDbError(call(OTHER_OWNER, "set_potm", [match.code, ali.id]), /not_team_owner/);
    await expectDbError(call(OWNER, "set_potm", ["zzzzzzzz", ali.id]), /not_team_owner/);
    expect((await matchRow(match.id)).potm_player_id).toBe(hamza.id);

    await call(OWNER, "set_potm", [match.code, null]);
    expect((await matchRow(match.id)).potm_player_id).toBeNull();
  });

  it("set_result_override toggles No result", async () => {
    await call(OWNER, "set_result_override", [match.code, true]);
    expect((await matchRow(match.id)).result_override).toBe("no_result");
    await expectDbError(call(SCORER, "set_result_override", [match.code, false]), /not_team_owner/);
    await expectDbError(call(STRANGER, "set_result_override", [match.code, false]), /not_team_owner/);
    expect((await matchRow(match.id)).result_override).toBe("no_result");
    await call(OWNER, "set_result_override", [match.code, false]);
    expect((await matchRow(match.id)).result_override).toBeNull();

    const unlinked = newMatch();
    await push(OWNER, unlinked, [1]);
    await expectDbError(call(OWNER, "set_result_override", [unlinked.code, true]), /not_team_owner/);
  });
});

describe("get_my_team", () => {
  it("gives the owner the team with fixture notes and scorers", async () => {
    const recent = await upsertFixture(OWNER, fixture(-10, { opponent: "Recent", notes: null, ground: null, homeAway: null, overs: null }));
    const cancelled = await upsertFixture(OWNER, fixture(3, { opponent: "Called off", status: "cancelled" }));
    await upsertFixture(OWNER, fixture(-40, { opponent: "Long ago" }));

    const team = await myTeam(OWNER);
    expect(team).toMatchObject({
      role: "owner",
      team: { id: lions.id, code: lions.code, name: "Lions", homeGround: "Model Town Ground", timeZone: "Asia/Karachi" },
      squad: [ali, usman, hamza],
      seasons: [{ id: expect.any(String), name: "Winter 26/27", startsOn: "2026-11-01", endsOn: "2027-02-28" }],
      scorers: [{ userId: SCORER.sub, addedAt: expect.stringMatching(ISO) }],
    });
    const fixtures = team?.fixtures as Record<string, unknown>[];
    expect(fixtures.map((f) => f.opponent)).toEqual(["Recent", "Jaguars", "Tigers", "Tigers", "Called off", "Panthers"]);
    expect(fixtures[0]).toEqual({
      id: recent,
      startsAt: expect.stringMatching(ISO),
      opponent: "Recent",
      ground: null,
      homeAway: null,
      overs: null,
      notes: null,
      status: "scheduled",
      matchCode: null,
    });
    expect(fixtures[4]).toMatchObject({ id: cancelled, status: "cancelled", notes: "Bring the new ball", ground: "Model Town", homeAway: "home", overs: 20 });
    expect(fixtures[2]).toMatchObject({ status: "played", matchCode: expect.stringMatching(CODE) });
  });

  it("gives a scorer the team without the scorer list, and others nothing", async () => {
    const team = await myTeam(SCORER);
    expect(team).toMatchObject({ role: "scorer", team: { id: lions.id }, squad: [ali, usman, hamza] });
    expect(team).not.toHaveProperty("scorers");
    expect(await myTeam(STRANGER)).toBeNull();
    expect(await myTeam(GUEST)).toBeNull();
  });
});

describe("get_team_page", () => {
  it("shows the public team without events, notes, private matches or cancelled fixtures", async () => {
    const hidden = newMatch();
    await push(OWNER, hidden, [1], link(lions));
    await rpc("service", `update public.matches set visibility = 'private' where id = $1`, [hidden.id]);

    const page = await teamPage(lions.code);
    expect(page?.team).toEqual({ code: lions.code, name: "Lions", homeGround: "Model Town Ground", timeZone: "Asia/Karachi" });
    expect(page?.squad).toEqual([ali, usman, hamza]);
    expect(page?.seasons).toEqual([{ id: expect.any(String), name: "Winter 26/27", startsOn: "2026-11-01", endsOn: "2027-02-28" }]);
    expect(keysDeep(page)).not.toContain("events");
    expect(keysDeep(page?.fixtures)).not.toContain("notes");
    const fixtures = page?.fixtures as Record<string, unknown>[];
    expect(fixtures.map((f) => f.opponent)).toEqual(["Long ago", "Recent", "Jaguars", "Tigers", "Tigers", "Panthers"]);

    const linked = await rows<{ code: string; status: string; summary: unknown; result_override: string | null; potm_player_id: string | null; player_stats: unknown; title: string }>(
      `select code, status, summary, result_override, potm_player_id, player_stats, title from public.matches
       where team_id = $1 and visibility = 'link' order by created_at desc, id`,
      [lions.id],
    );
    expect(linked.length).toBeGreaterThan(0);
    expect(page?.matches).toEqual(
      linked.map((m) => ({
        code: m.code,
        status: m.status,
        summary: m.summary,
        resultOverride: m.result_override,
        potmPlayerId: m.potm_player_id,
        record: m.player_stats,
        title: m.title,
      })),
    );
    expect((page?.matches as { code: string }[]).map((m) => m.code)).not.toContain(hidden.code);
    expect(await teamPage("zzzzzzzz")).toBeNull();
  });
});

describe("access", () => {
  it("members read their own team's rows; nobody writes tables directly", async () => {
    const tables = ["teams", "team_scorers", "team_invites", "squad_players", "seasons", "fixtures"];
    const visible = async (actor: Actor) => {
      const counts: Record<string, number> = {};
      for (const t of tables) {
        const [row] = await rpc<{ n: number }>(actor, `select count(*)::int as n from public.${t}`);
        counts[t] = row.n;
      }
      return counts;
    };
    const fixtureCount = (await rows(`select 1 from public.fixtures where team_id = $1`, [lions.id])).length;
    expect(await visible(OWNER)).toEqual({ teams: 1, team_scorers: 1, team_invites: 0, squad_players: 3, seasons: 1, fixtures: fixtureCount });
    expect(await visible(SCORER)).toEqual({ teams: 1, team_scorers: 1, team_invites: 0, squad_players: 3, seasons: 1, fixtures: fixtureCount });
    expect(await visible(STRANGER)).toEqual({ teams: 0, team_scorers: 0, team_invites: 0, squad_players: 0, seasons: 0, fixtures: 0 });
    expect(await visible("anon")).toEqual({ teams: 0, team_scorers: 0, team_invites: 0, squad_players: 0, seasons: 0, fixtures: 0 });

    await expectDbError(
      rpc(STRANGER, `insert into public.teams (owner_id, code, name) values ($1, 'abcdefgh', 'Mine')`, [STRANGER.sub]),
      /permission denied/,
    );
    await expectDbError(rpc(SCORER, `update public.squad_players set name = 'x'`), /permission denied/);
    await expectDbError(rpc(OWNER, `delete from public.team_scorers`), /permission denied/);
    await expectDbError(rpc(OWNER, `insert into public.team_scorers (team_id, user_id) values ($1, $2)`, [lions.id, STRANGER.sub]), /permission denied/);
    await expectDbError(rpc(OWNER, `update public.matches set potm_player_id = null`), /permission denied/);
  });

  it("every team function is a definer with an empty search_path and exactly these grants", async () => {
    const expected: Record<string, string[]> = {
      "accept_scorer_invite(p_token text)": ["authenticated"],
      "create_scorer_invite()": ["authenticated"],
      "create_team(p_name text, p_home_ground text, p_time_zone text)": ["authenticated"],
      "fixture_json(f fixtures)": [],
      "get_my_team()": ["authenticated"],
      "get_team_page(p_code text)": ["anon", "authenticated"],
      "lock_owned_team()": [],
      "my_team_ids()": ["authenticated"],
      "push_match_events(p_match jsonb, p_device uuid, p_events jsonb)": ["authenticated"],
      "remove_scorer(p_user uuid)": ["authenticated"],
      "set_potm(p_code text, p_player uuid)": ["authenticated"],
      "set_result_override(p_code text, p_no_result boolean)": ["authenticated"],
      "team_seasons_json(p_team uuid)": [],
      "team_squad_json(p_team uuid)": [],
      "upsert_fixture(p_fixture jsonb)": ["authenticated"],
      "upsert_season(p_season jsonb)": ["authenticated"],
      "upsert_squad_players(p_team uuid, p_players jsonb)": ["authenticated"],
    };
    const names = Object.keys(expected).map((sig) => sig.slice(0, sig.indexOf("(")));
    const fns = await rows<{ sig: string; definer: boolean; config: string[] | null; anon: boolean; authenticated: boolean }>(
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig, p.prosecdef as definer, p.proconfig as config,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated
       from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname::text = any($1::text[]) order by 1`,
      [names],
    );
    expect(fns.filter((f) => !f.definer || f.config?.join() !== 'search_path=""').map((f) => f.sig)).toEqual([]);
    expect(
      Object.fromEntries(fns.map((f) => [f.sig, (["anon", "authenticated"] as const).filter((role) => f[role])])),
    ).toEqual(expected);
  });
});
