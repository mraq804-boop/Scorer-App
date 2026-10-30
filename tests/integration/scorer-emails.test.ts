import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, createDb, expectDbError, type Actor } from "./db";

const OWNER = { sub: "00000000-0000-0000-0000-00000000aa01", anonymous: false };
const OTHER_OWNER = { sub: "00000000-0000-0000-0000-00000000aa02", anonymous: false };
const FRIEND = { sub: "00000000-0000-0000-0000-00000000bb01", anonymous: false };
const EARLY = { sub: "00000000-0000-0000-0000-00000000bb02", anonymous: false };
const IMPOSTOR = { sub: "00000000-0000-0000-0000-00000000bb03", anonymous: false };
const UNVERIFIED = { sub: "00000000-0000-0000-0000-00000000bb04", anonymous: false };
const UNSTATED = { sub: "00000000-0000-0000-0000-00000000bb05", anonymous: false };
const LINKED = { sub: "00000000-0000-0000-0000-00000000bb06", anonymous: false };
const GUEST = { sub: "00000000-0000-0000-0000-00000000ee01", anonymous: true };
const FILLERS = Array.from({ length: 10 }, (_, i) => `00000000-0000-0000-0000-0000000ff0${i.toString().padStart(2, "0")}`);

type Team = { id: string; code: string };
type Invite = { code: string; name: string; colour: string | null; logoVersion: number | null };

let db: PGlite;
let lions: Team;
let eagles: Team;
const ali = crypto.randomUUID();
const usman = crypto.randomUUID();
const hamza = crypto.randomUUID();
const zain = crypto.randomUUID();

async function call<T = unknown>(actor: Actor, fn: string, args: unknown[] = []): Promise<T> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  const [row] = await as(db, actor, async (tx) => (await tx.query<{ result: T }>(`select public.${fn}(${placeholders}) as result`, args)).rows);
  return row.result;
}

async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}

async function identity(sub: string, email: string, provider: string, data: Record<string, unknown>) {
  await rows(`insert into auth.identities (user_id, provider, identity_data) values ($1, $2, $3)`, [sub, provider, { email, ...data }]);
}

async function googleUser(sub: string, email: string, name: string) {
  await rows(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [sub, email, { full_name: name }]);
  await identity(sub, email, "google", { email_verified: true });
}

function allow(actor: Actor, player: string, email: string | null, canScore: boolean) {
  return call(actor, "set_player_scorer_email", [player, email, canScore]);
}

function invites(actor: Actor) {
  return call<Invite[]>(actor, "get_email_invites");
}

function join(actor: Actor, code: string) {
  return call<string>(actor, "accept_email_invite", [code]);
}

async function scorers(team: Team) {
  return (await rows<{ user_id: string }>(`select user_id from public.team_scorers where team_id = $1 order by user_id`, [team.id])).map(
    (row) => row.user_id,
  );
}

async function teamOf(owner: { sub: string }): Promise<Team> {
  const [team] = await rows<Team>(`select id, code from public.teams where owner_id = $1`, [owner.sub]);
  return team;
}

beforeAll(async () => {
  db = await createDb();
  await googleUser(OWNER.sub, "owner@gmail.com", "Owner Khan");
  await googleUser(OTHER_OWNER.sub, "eagle@gmail.com", "Eagle Shah");
  await googleUser(EARLY.sub, "early@gmail.com", "Early Bird");
  await googleUser(LINKED.sub, "linked@gmail.com", "Linked Raza");
  await rows(`insert into auth.users (id, email) values ($1, 'victim@gmail.com'), ($2, 'unverified@gmail.com'), ($3, 'unstated@gmail.com'), ($4, null)`, [
    IMPOSTOR.sub,
    UNVERIFIED.sub,
    UNSTATED.sub,
    GUEST.sub,
  ]);
  await identity(IMPOSTOR.sub, "victim@gmail.com", "email", { email_verified: true });
  await identity(UNVERIFIED.sub, "unverified@gmail.com", "google", { email_verified: false });
  await identity(UNSTATED.sub, "unstated@gmail.com", "google", {});

  await call(OWNER, "create_team", ["Lions", null, null]);
  await call(OTHER_OWNER, "create_team", ["Eagles", null, null]);
  lions = await teamOf(OWNER);
  eagles = await teamOf(OTHER_OWNER);
  const players = [ali, usman, hamza, zain].map((id, i) => ({ id, name: `Player ${i + 1}`, role: null, active: true }));
  await call(OWNER, "upsert_squad_players", [lions.id, JSON.stringify(players)]);
  await call(OTHER_OWNER, "upsert_squad_players", [eagles.id, JSON.stringify([{ id: crypto.randomUUID(), name: "Eagle", role: null, active: true }])]);
}, 60_000);

describe("scorer emails on squad players", () => {
  it("shows the invite to a Google user who signs in with the allowed email, and one tap on Join makes them a scorer", async () => {
    await allow(OWNER, ali, "  Friend@Gmail.com ", true);
    expect(await call(OWNER, "get_scorer_emails")).toEqual([{ playerId: ali, email: "friend@gmail.com", canScore: true, joined: false }]);

    await googleUser(FRIEND.sub, "friend@gmail.com", "Friend Ali");
    expect(await invites(FRIEND)).toEqual([{ code: lions.code, name: "Lions", colour: null, logoVersion: null }]);
    expect(await scorers(lions)).not.toContain(FRIEND.sub);

    expect(await join(FRIEND, lions.code)).toBe(lions.code);
    expect(await call(FRIEND, "get_my_team")).toMatchObject({ role: "scorer", team: { code: lions.code } });
    expect(await rows(`select display_name from public.team_scorers where user_id = $1`, [FRIEND.sub])).toEqual([
      { display_name: "Friend Ali" },
    ]);
    expect(await call(OWNER, "get_scorer_emails")).toEqual([{ playerId: ali, email: "friend@gmail.com", canScore: true, joined: true }]);
    expect(await invites(FRIEND)).toEqual([]);
  });

  it("never adds anyone or tells the owner anything until they tap Join", async () => {
    await allow(OWNER, usman, "early@gmail.com", true);
    expect(await scorers(lions)).not.toContain(EARLY.sub);
    expect(await call<{ joined: boolean }[]>(OWNER, "get_scorer_emails")).toContainEqual({
      playerId: usman,
      email: "early@gmail.com",
      canScore: true,
      joined: false,
    });
    expect((await invites(EARLY)).map((invite) => invite.code)).toEqual([lions.code]);
  });

  it("only a verified Google sign-in with that email gets the invite", async () => {
    await allow(OWNER, hamza, "victim@gmail.com", true);
    await allow(OWNER, zain, "unverified@gmail.com", true);
    for (const actor of [IMPOSTOR, UNVERIFIED, GUEST]) {
      expect(await invites(actor)).toEqual([]);
      await expectDbError(join(actor, lions.code), /invite_invalid/);
    }
    await allow(OWNER, zain, "unstated@gmail.com", true);
    expect(await invites(UNSTATED)).toEqual([]);
    await expectDbError(join(UNSTATED, lions.code), /invite_invalid/);
    expect(await scorers(lions)).toEqual([FRIEND.sub]);
    await expectDbError(invites("anon"), /permission denied/);
    await expectDbError(join("anon", lions.code), /permission denied/);
    await expectDbError(join(FRIEND, eagles.code), /invite_invalid/);
  });

  it("switching off, changing or clearing the email takes scoring away, and Remove scorer switches it off", async () => {
    await allow(OWNER, ali, "friend@gmail.com", false);
    expect(await scorers(lions)).not.toContain(FRIEND.sub);
    expect(await invites(FRIEND)).toEqual([]);

    await allow(OWNER, ali, "friend@gmail.com", true);
    expect(await scorers(lions)).not.toContain(FRIEND.sub);
    await join(FRIEND, lions.code);
    await allow(OWNER, ali, "someone.else@gmail.com", true);
    expect(await scorers(lions)).not.toContain(FRIEND.sub);

    await allow(OWNER, ali, "friend@gmail.com", true);
    await join(FRIEND, lions.code);
    await call(OWNER, "remove_scorer", [FRIEND.sub]);
    expect(await scorers(lions)).not.toContain(FRIEND.sub);
    expect(await call(OWNER, "get_scorer_emails")).toContainEqual({ playerId: ali, email: "friend@gmail.com", canScore: false, joined: false });
    expect(await invites(FRIEND)).toEqual([]);
    await expectDbError(join(FRIEND, lions.code), /invite_invalid/);

    await allow(OWNER, usman, null, false);
    expect((await call<{ playerId: string }[]>(OWNER, "get_scorer_emails")).map((row) => row.playerId)).not.toContain(usman);
  });

  it("editing an email that never allowed scoring leaves a scorer who joined by link alone", async () => {
    const token = await call<string>(OWNER, "create_scorer_invite");
    await call(LINKED, "accept_scorer_invite", [token]);
    expect(await scorers(lions)).toContain(LINKED.sub);

    await allow(OWNER, usman, "linked@gmail.com", false);
    await allow(OWNER, usman, "linked.raza@gmail.com", false);
    await allow(OWNER, usman, null, false);

    expect(await scorers(lions)).toContain(LINKED.sub);
  });

  it("can't be used to confirm which email a scorer who joined by link uses", async () => {
    await allow(OWNER, usman, "linked@gmail.com", true);
    expect(await call(OWNER, "get_scorer_emails")).toContainEqual({ playerId: usman, email: "linked@gmail.com", canScore: true, joined: false });

    await call(OWNER, "remove_scorer", [LINKED.sub]);
    expect(await call(OWNER, "get_scorer_emails")).toContainEqual({ playerId: usman, email: "linked@gmail.com", canScore: true, joined: false });
    await allow(OWNER, usman, null, false);
  });

  it("only the owner sets and reads emails, and refuses bad or repeated ones", async () => {
    await allow(OWNER, ali, "friend@gmail.com", true);
    await expectDbError(allow(FRIEND, ali, "x@gmail.com", true), /not_team_owner/);
    await expectDbError(allow(GUEST, ali, "x@gmail.com", true), /not_team_owner/);
    await expectDbError(allow(OTHER_OWNER, ali, "x@gmail.com", true), /not_team_owner/);
    await expectDbError(allow(OWNER, crypto.randomUUID(), "x@gmail.com", true), /not_team_owner/);
    await allow(OWNER, usman, "o'brien@club.ie", false);
    await allow(OWNER, usman, null, false);
    for (const bad of ["not-an-email", "ali?cc=x@gmail.com", "ali,bob@gmail.com", "ali%40@gmail.com", `${"a".repeat(250)}@gmail.com`]) {
      await expectDbError(allow(OWNER, usman, bad, true), /invalid_email/);
    }
    await expectDbError(allow(OWNER, usman, "FRIEND@gmail.com", true), /email_taken/);
    await expectDbError(call(FRIEND, "get_scorer_emails"), /not_team_owner/);
    await expectDbError(call("anon", "get_scorer_emails"), /permission denied/);
    await expectDbError(as(db, OWNER, (tx) => tx.query(`select * from public.squad_scorer_emails`)), /permission denied/);
  });

  it("never shows emails on the public team page, to scorers or in an invite", async () => {
    await join(FRIEND, lions.code);
    expect(JSON.stringify(await call(FRIEND, "get_team_page", [lions.code]))).not.toContain("@");
    expect(JSON.stringify(await call(FRIEND, "get_my_team"))).not.toContain("@");
    expect(JSON.stringify(await invites(EARLY))).not.toContain("@");
  });

  it("never invites an owner to their own team, and keeps each team's invite separate", async () => {
    await allow(OWNER, zain, "owner@gmail.com", true);
    expect(await invites(OWNER)).toEqual([]);
    await expectDbError(join(OWNER, lions.code), /invite_invalid/);

    const [eaglePlayer] = await rows<{ id: string }>(`select id from public.squad_players where team_id = $1`, [eagles.id]);
    await allow(OTHER_OWNER, eaglePlayer.id, "friend@gmail.com", true);
    expect(await invites(FRIEND)).toEqual([{ code: eagles.code, name: "Eagles", colour: null, logoVersion: null }]);
    expect(await join(FRIEND, eagles.code)).toBe(eagles.code);
    expect(await scorers(eagles)).toContain(FRIEND.sub);
  });

  it("refuses to join a team that already has 10 scorers", async () => {
    await rows(`delete from public.team_scorers where team_id = $1`, [lions.id]);
    for (const [i, sub] of FILLERS.entries()) {
      await googleUser(sub, `filler${i}@gmail.com`, `Filler ${i}`);
      await rows(`insert into public.team_scorers (team_id, user_id) values ($1, $2)`, [lions.id, sub]);
    }
    await allow(OWNER, ali, "friend@gmail.com", true);
    await expectDbError(join(FRIEND, lions.code), /quota_exceeded/);
    expect(await scorers(lions)).toHaveLength(10);
  });
});
