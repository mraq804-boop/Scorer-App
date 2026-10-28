import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, createDb, expectDbError, type Actor } from "./db";

const A = { sub: "00000000-0000-0000-0000-0000000000a1" };
const B = { sub: "00000000-0000-0000-0000-0000000000b2" };
const C = { sub: "00000000-0000-0000-0000-0000000000c3" };
const STRANGER = { sub: "00000000-0000-0000-0000-0000000000d4" };
const GUEST = { sub: "00000000-0000-0000-0000-0000000000e5", anonymous: true };
const OTHER_GUEST = { sub: "00000000-0000-0000-0000-0000000000f6", anonymous: true };
const BUSY_GUEST = { sub: "00000000-0000-0000-0000-0000000000a7", anonymous: true };
const CLAIM_GUEST = { sub: "00000000-0000-0000-0000-0000000000b8", anonymous: true };
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const D1 = "00000000-0000-0000-0000-00000000d001";
const D2 = "00000000-0000-0000-0000-00000000d002";
const AT = "2026-10-23T10:15:30.250Z";

type WireEvent = { id: string; seq: number; at: string; type: string; payload: Record<string, unknown> };
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
type LiveEvent = Record<string, unknown> & { id: string; seq: number; at: string; type: string };

let db: PGlite;

function wire(seq: number, type = "strike_swapped", payload: Record<string, unknown> = {}): WireEvent {
  return { id: crypto.randomUUID(), seq, at: AT, type, payload };
}

function delivery(seq: number): WireEvent {
  return wire(seq, "delivery", {
    striker: "p1",
    nonStriker: "p2",
    bowler: "p3",
    kind: "legal",
    runs: 4,
    runsAs: "bat",
    boundary: true,
    penalty: 0,
    wicket: null,
  });
}

function newMatch(code: string, id: string = crypto.randomUUID()): MatchInput {
  return {
    id,
    code,
    title: "Lions v Tigers",
    teamA: "Lions",
    teamB: "Tigers",
    rules: { ballsPerOver: 6, oversPerInnings: 10 },
    status: "in_progress",
    summary: { lines: ["Lions 4/0 (0.1 ov)"] },
  };
}

const m1 = newMatch("abcdefgh");
const m1Events = [
  wire(1, "match_created", { title: m1.title, teams: { A: { name: "Lions" }, B: { name: "Tigers" } } }),
  wire(2, "player_added", { player: { id: "p1", name: "Ali", team: "A" } }),
  delivery(3),
];

async function rpc<T = Record<string, unknown>>(actor: Actor, sql: string, params: unknown[] = []) {
  return as(db, actor, async (tx) => (await tx.query<T>(sql, params)).rows);
}

async function push(actor: Actor, match: MatchInput, device: string | null, events: WireEvent[]) {
  const [row] = await rpc<{ last_seq: number }>(actor, `select public.push_match_events($1, $2, $3) as last_seq`, [
    JSON.stringify(match),
    device,
    JSON.stringify(events),
  ]);
  return row.last_seq;
}

async function count(actor: Actor, sql: string, params: unknown[] = []) {
  const [row] = await rpc<{ n: number }>(actor, `select count(*)::int as n from ${sql}`, params);
  return row.n;
}

async function eventCount(matchId: string) {
  return (await db.query<{ n: number }>(`select count(*)::int as n from public.match_events where match_id = $1`, [matchId])).rows[0].n;
}

async function setVisibility(matchId: string, visibility: "link" | "private") {
  await rpc("service", `update public.matches set visibility = $2 where id = $1`, [matchId, visibility]);
}

async function liveMatch(code: string) {
  const [row] = await rpc<{ live: { match: Record<string, unknown>; events: LiveEvent[] } | null }>(
    "anon",
    `select public.get_live_match($1) as live`,
    [code],
  );
  return row.live;
}

async function ownerEvents(actor: Actor, matchId: string, after: number) {
  const [row] = await rpc<{ events: LiveEvent[] }>(actor, `select public.get_owner_events($1, $2) as events`, [matchId, after]);
  return row.events;
}

async function liveEvents(code: string, after: number) {
  const [row] = await rpc<{ events: LiveEvent[] }>("anon", `select public.get_live_events($1, $2) as events`, [code, after]);
  return row.events;
}

async function topicMessages(actor: Actor, topic: string) {
  return as(db, actor, async (tx) => {
    await tx.query(`select set_config('realtime.topic', $1, true)`, [topic]);
    return (await tx.query<{ n: number }>(`select count(*)::int as n from realtime.messages where topic = $1`, [topic])).rows[0].n;
  });
}

async function createToken(actor: Actor) {
  const [row] = await rpc<{ token: string }>(actor, `select public.create_claim_token() as token`);
  return row.token;
}

async function claim(actor: Actor, token: string) {
  const [row] = await rpc<{ moved: number }>(actor, `select public.claim_matches($1) as moved`, [token]);
  return row.moved;
}

function flat(e: WireEvent) {
  return { id: e.id, seq: e.seq, at: e.at, type: e.type, ...e.payload };
}

beforeAll(async () => {
  db = await createDb();
  for (const u of [A, B, C, STRANGER, GUEST, OTHER_GUEST, BUSY_GUEST, CLAIM_GUEST]) {
    await db.query(`insert into auth.users (id) values ($1)`, [u.sub]);
  }
}, 60_000);

describe("push_match_events", () => {
  it("push creates the match and returns last_seq", async () => {
    expect(await push(A, m1, D1, [m1Events[2], m1Events[0], m1Events[1]])).toBe(3);
    const [row] = (await db.query(`select * from public.matches where id = $1`, [m1.id])).rows;
    expect(row).toMatchObject({
      owner_id: A.sub,
      scoring_device: D1,
      code: "abcdefgh",
      title: "Lions v Tigers",
      team_a: "Lions",
      team_b: "Tigers",
      rules: m1.rules,
      status: "in_progress",
      visibility: "link",
      summary: m1.summary,
      last_seq: 3,
    });
    const events = (await db.query(`select id, seq, client_at from public.match_events where match_id = $1 order by seq`, [m1.id])).rows;
    expect(events).toEqual(m1Events.map((e) => ({ id: e.id, seq: e.seq, client_at: new Date(AT) })));
  });

  it("re-push is idempotent", async () => {
    expect(await push(A, { ...m1, summary: { lines: ["again"] } }, D1, m1Events)).toBe(3);
    expect(await eventCount(m1.id)).toBe(3);
    const [row] = (await db.query(`select summary from public.matches where id = $1`, [m1.id])).rows;
    expect(row).toEqual({ summary: { lines: ["again"] } });
  });

  it("push stops at a gap", async () => {
    expect(await push(A, m1, D1, [wire(5)])).toBe(3);
    expect(await eventCount(m1.id)).toBe(3);
  });

  it("stranger cannot push", async () => {
    await expectDbError(push(STRANGER, m1, D1, [wire(4)]), /not_owner/);
  });

  it("second device is rejected until it takes over", async () => {
    const m2 = newMatch("jkmnpqrs");
    expect(await push(C, m2, D1, [wire(1)])).toBe(1);
    await expectDbError(push(C, m2, D2, [wire(2)]), /scoring_moved/);
    await expectDbError(push(C, m2, null, [wire(2)]), /scoring_moved/);
    await expectDbError(rpc(STRANGER, `select public.take_over_scoring($1, $2)`, [m2.id, D2]), /not_owner/);

    const [{ last_seq }] = await rpc<{ last_seq: number }>(C, `select public.take_over_scoring($1, $2) as last_seq`, [m2.id, D2]);
    expect(last_seq).toBe(1);
    expect(await push(C, m2, D2, [wire(2)])).toBe(2);
    await expectDbError(push(C, m2, D1, [wire(3)]), /scoring_moved/);
  });

  it("anon cannot push", async () => {
    await expectDbError(push("anon", m1, D1, [wire(4)]), /permission denied|not_signed_in/);
  });

  it("invalid type and too many events", async () => {
    await expectDbError(push(A, m1, D1, [wire(4, "bogus")]), /invalid_event/);
    await expectDbError(push(A, m1, D1, Array.from({ length: 501 }, (_, i) => wire(4 + i))), /too_many_events/);
    expect(await eventCount(m1.id)).toBe(3);
  });

  it("malformed events are invalid", async () => {
    const malformed: unknown[] = [
      { ...wire(4), id: "not-a-uuid" },
      { ...wire(4), seq: 0 },
      { ...wire(4), seq: 4.5 },
      { ...wire(4), at: "half past ten" },
      { ...wire(4), payload: [1, 2] },
      { ...wire(4), payload: { note: "x".repeat(4100) } },
      { id: crypto.randomUUID(), seq: 4, type: "strike_swapped", payload: {} },
      "strike_swapped",
    ];
    for (const e of malformed) {
      await expectDbError(push(A, m1, D1, [e as WireEvent]), /invalid_event/);
    }
    expect(await eventCount(m1.id)).toBe(3);
  });

  it("a different event at a synced seq is invalid", async () => {
    await expectDbError(push(A, m1, D1, [wire(3)]), /invalid_event/);
    expect(await eventCount(m1.id)).toBe(3);
  });

  it("code collision", async () => {
    await expectDbError(push(A, newMatch(m1.code), D1, [wire(1)]), /code_taken/);
    expect(await count("service", `public.matches where code = $1`, [m1.code])).toBe(1);
  });

  it("caps the size of rules and summary", async () => {
    const big = { ...newMatch("hjkmnpqr"), rules: { note: "x".repeat(4100) } };
    await expectDbError(push(A, big, D1, [wire(1)]), /matches_rules_size/);
    expect(await count("service", `public.matches where id = $1`, [big.id])).toBe(0);

    await expectDbError(push(A, { ...m1, summary: { note: "x".repeat(8200) } }, D1, []), /matches_summary_size/);
    const [row] = (await db.query(`select summary from public.matches where id = $1`, [m1.id])).rows;
    expect(row).toEqual({ summary: m1.summary });
  });

  it("rejects events past seq 5000 before writing anything", async () => {
    const fresh = newMatch("hjkmnpqs");
    await expectDbError(push(A, fresh, D1, [wire(1), wire(5001)]), /quota_exceeded/);
    expect(await count("service", `public.matches where id = $1`, [fresh.id])).toBe(0);

    await expectDbError(push(A, m1, D1, [wire(4), wire(5001)]), /quota_exceeded/);
    expect(await push(A, m1, D1, [wire(5000)])).toBe(3);
    expect(await eventCount(m1.id)).toBe(3);
  });

  it("limits each caller to 20 new matches a day", async () => {
    const matches = [...CODE_ALPHABET.slice(0, 21)].map((c) => newMatch(`qqqqqqq${c}`));
    for (const m of matches.slice(0, 20)) {
      expect(await push(BUSY_GUEST, m, D1, [wire(1)])).toBe(1);
    }
    const extra = matches[20];
    await expectDbError(push(BUSY_GUEST, extra, D1, [wire(1)]), /quota_exceeded/);
    expect(await count("service", `public.matches where id = $1`, [extra.id])).toBe(0);
    expect(await push(BUSY_GUEST, matches[0], D1, [wire(2)])).toBe(2);

    await rpc("service", `update public.matches set created_at = now() - interval '25 hours' where id = $1`, [matches[0].id]);
    expect(await push(BUSY_GUEST, extra, D1, [wire(1)])).toBe(1);
  });
});

describe("privileges", () => {
  it("every function is a definer with an empty search_path, granted only as listed", async () => {
    const fns = (
      await db.query<{ name: string; definer: boolean; config: string[] | null; anon: boolean; authenticated: boolean }>(
        `select p.proname as name, p.prosecdef as definer, p.proconfig as config,
                has_function_privilege('anon', p.oid, 'execute') as anon,
                has_function_privilege('authenticated', p.oid, 'execute') as authenticated
         from pg_proc p where p.pronamespace = 'public'::regnamespace order by p.proname`,
      )
    ).rows;
    expect(fns.filter((f) => !f.definer || f.config?.join() !== 'search_path=""').map((f) => f.name)).toEqual([]);
    expect(fns.filter((f) => f.anon).map((f) => f.name)).toEqual([
      "get_live_events",
      "get_live_match",
      "get_team_page",
      "match_topic_readable",
    ]);
    expect(fns.filter((f) => f.authenticated).map((f) => f.name)).toEqual([
      "accept_scorer_invite",
      "claim_matches",
      "create_claim_token",
      "create_scorer_invite",
      "create_team",
      "get_live_events",
      "get_live_match",
      "get_my_team",
      "get_owner_events",
      "get_team_page",
      "match_topic_readable",
      "my_team_ids",
      "owned_team_code",
      "push_match_events",
      "remove_scorer",
      "set_player_photo",
      "set_potm",
      "set_result_override",
      "set_team_colour",
      "set_team_logo",
      "take_over_scoring",
      "update_team",
      "upsert_fixture",
      "upsert_season",
      "upsert_squad_players",
    ]);
  });

  it("tables have RLS on and no write privileges for anon or authenticated", async () => {
    const tables = (
      await db.query<{ name: string; rls: boolean }>(
        `select relname as name, relrowsecurity as rls from pg_class
         where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`,
      )
    ).rows;
    expect(tables).toEqual([
      { name: "fixtures", rls: true },
      { name: "match_claims", rls: true },
      { name: "match_events", rls: true },
      { name: "matches", rls: true },
      { name: "seasons", rls: true },
      { name: "squad_players", rls: true },
      { name: "team_invites", rls: true },
      { name: "team_scorers", rls: true },
      { name: "teams", rls: true },
    ]);
    const writes = (
      await db.query<{ entry: string }>(
        `select c.relname || ':' || r.role || ':' || p.priv as entry
         from pg_class c
         cross join unnest(array['anon', 'authenticated']) r(role)
         cross join unnest(array['insert', 'update', 'delete', 'truncate']) p(priv)
         where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and has_table_privilege(r.role, c.oid, p.priv)`,
      )
    ).rows;
    expect(writes).toEqual([]);
  });
});

describe("table access", () => {
  it("events cannot be updated or deleted", async () => {
    await expectDbError(rpc(A, `update public.match_events set seq = seq + 10 where match_id = $1`, [m1.id]), /permission denied/);
    await expectDbError(rpc(A, `delete from public.match_events where match_id = $1`, [m1.id]), /permission denied/);
    await expectDbError(rpc(A, `update public.matches set owner_id = $2 where id = $1`, [m1.id, STRANGER.sub]), /permission denied/);
    await expectDbError(rpc(A, `delete from public.matches where id = $1`, [m1.id]), /permission denied/);
    expect(await eventCount(m1.id)).toBe(3);
  });

  it("no direct inserts", async () => {
    await expectDbError(
      rpc(
        A,
        `insert into public.matches (id, code, owner_id, scoring_device, title, team_a, team_b, rules, status)
         values ($1, 'zzzzzzzz', $2, $3, 't', 'a', 'b', '{}', 'in_progress')`,
        [crypto.randomUUID(), A.sub, D1],
      ),
      /permission denied/,
    );
    await expectDbError(
      rpc(A, `insert into public.match_events (id, match_id, seq, type, payload, client_at) values ($1, $2, 4, 'strike_swapped', '{}', now())`, [
        crypto.randomUUID(),
        m1.id,
      ]),
      /permission denied/,
    );
    await expectDbError(
      rpc(A, `insert into public.match_claims (token_hash, from_user, expires_at) values ('x', $1, now() + interval '1 hour')`, [A.sub]),
      /permission denied/,
    );
  });

  it("matches cannot be enumerated", async () => {
    expect(await count("anon", "public.matches")).toBe(0);
    expect(await count("anon", "public.match_events")).toBe(0);
    expect(await count(STRANGER, "public.matches")).toBe(0);
    expect(await count(STRANGER, "public.match_events")).toBe(0);
    expect(await count(A, "public.matches")).toBe(1);
    expect(await count(A, "public.match_events")).toBe(3);
  });
});

describe("live reads", () => {
  it("live reads", async () => {
    const live = await liveMatch(m1.code);
    expect(live?.match).toEqual({
      id: m1.id,
      code: m1.code,
      title: m1.title,
      teamA: "Lions",
      teamB: "Tigers",
      status: "in_progress",
      updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      team: null,
    });
    expect(live?.events).toEqual(m1Events.map(flat));

    expect((await liveEvents(m1.code, 2)).map((e) => e.seq)).toEqual([3]);
    expect(await liveMatch("zzzzzzzz")).toBeNull();
    expect(await liveEvents("zzzzzzzz", 0)).toEqual([]);

    await setVisibility(m1.id, "private");
    expect(await liveMatch(m1.code)).toBeNull();
    expect(await liveEvents(m1.code, 0)).toEqual([]);
    await setVisibility(m1.id, "link");
  });
});

describe("get_owner_events", () => {
  it("gives the owner flat events after a seq, whatever the visibility", async () => {
    expect(await ownerEvents(A, m1.id, 1)).toEqual(m1Events.slice(1).map(flat));
    await setVisibility(m1.id, "private");
    expect((await ownerEvents(A, m1.id, 0)).map((e) => e.seq)).toEqual([1, 2, 3]);
    await setVisibility(m1.id, "link");
  });

  it("refuses everyone but the owner", async () => {
    await expectDbError(ownerEvents(STRANGER, m1.id, 0), /not_owner/);
    await expectDbError(ownerEvents(A, crypto.randomUUID(), 0), /not_owner/);
    await expectDbError(ownerEvents("anon", m1.id, 0), /permission denied/);
  });

  it("pages long matches 1000 events at a time", async () => {
    const long = newMatch("rstuvwxy");
    for (let from = 1; from <= 1001; from += 500) {
      const batch = Array.from({ length: Math.min(500, 1002 - from) }, (_, i) => wire(from + i));
      expect(await push(C, long, D1, batch)).toBe(from + batch.length - 1);
    }
    const page = await ownerEvents(C, long.id, 0);
    expect(page.map((e) => e.seq)).toEqual(Array.from({ length: 1000 }, (_, i) => i + 1));
    expect((await ownerEvents(C, long.id, 1000)).map((e) => e.seq)).toEqual([1001]);
  });
});

describe("realtime", () => {
  it("realtime", async () => {
    const topic = `match:${m1.id}`;
    const next = delivery(4);
    expect(await push(A, m1, D1, [next])).toBe(4);

    const messages = (
      await db.query(`select event, payload, private, extension from realtime.messages where topic = $1 order by id`, [topic])
    ).rows;
    expect(messages).toHaveLength(4);
    expect(messages[3]).toEqual({ event: "event", payload: flat(next), private: true, extension: "broadcast" });

    expect(await topicMessages("anon", topic)).toBe(4);
    expect(await topicMessages(STRANGER, topic)).toBe(4);
    expect(await topicMessages("anon", `match:${crypto.randomUUID()}`)).toBe(0);
    expect(await topicMessages("anon", "match:not-a-uuid")).toBe(0);

    await expectDbError(
      rpc("anon", `insert into realtime.messages (topic, event, payload, private) values ($1, 'event', '{}', true)`, [topic]),
      /row-level security/,
    );
    await expectDbError(
      as(db, STRANGER, async (tx) => {
        await tx.query(`select set_config('realtime.topic', $1, true)`, [topic]);
        await tx.query(`insert into realtime.messages (topic, event, payload, private) values ($1, 'event', '{}', true)`, [topic]);
      }),
      /row-level security/,
    );

    await setVisibility(m1.id, "private");
    expect(await topicMessages("anon", topic)).toBe(0);
    await setVisibility(m1.id, "link");
  });
});

describe("claim_matches", () => {
  it("claim moves only the right guest's matches", async () => {
    const g1 = newMatch("tuvwxyz2");
    const g2 = newMatch("23456789");
    const other = newMatch("abcd2345");
    await push(GUEST, g1, D1, [wire(1)]);
    await push(GUEST, g2, D1, [wire(1)]);
    await push(OTHER_GUEST, other, D2, [wire(1)]);

    const token = await createToken(GUEST);
    expect(await claim(B, token)).toBe(2);
    const owners = (await db.query<{ id: string; owner_id: string }>(`select id, owner_id from public.matches`)).rows;
    expect(Object.fromEntries(owners.map((r) => [r.id, r.owner_id]))).toMatchObject({
      [g1.id]: B.sub,
      [g2.id]: B.sub,
      [other.id]: OTHER_GUEST.sub,
      [m1.id]: A.sub,
    });

    await expectDbError(claim(B, token), /claim_invalid/);
    await expectDbError(claim(B, crypto.randomUUID() + crypto.randomUUID()), /claim_invalid/);

    const otherToken = await createToken(OTHER_GUEST);
    await expectDbError(claim(GUEST, otherToken), /claim_invalid/);

    await rpc("service", `update public.match_claims set expires_at = now() - interval '1 minute' where from_user = $1`, [OTHER_GUEST.sub]);
    await expectDbError(claim(B, otherToken), /claim_invalid/);
    const [row] = (await db.query(`select owner_id from public.matches where id = $1`, [other.id])).rows;
    expect(row).toEqual({ owner_id: OTHER_GUEST.sub });
  });

  it("creating a token drops the caller's earlier tokens and every expired one", async () => {
    const first = await createToken(CLAIM_GUEST);
    const second = await createToken(CLAIM_GUEST);
    expect(await count("service", `public.match_claims where from_user = $1`, [CLAIM_GUEST.sub])).toBe(1);
    await expectDbError(claim(C, first), /claim_invalid/);

    await createToken(OTHER_GUEST);
    await rpc(
      "service",
      `insert into public.match_claims (token_hash, from_user, expires_at) values ('expired-token-hash', $1, now() - interval '1 second')`,
      [BUSY_GUEST.sub],
    );
    const third = await createToken(CLAIM_GUEST);

    expect(await count("service", `public.match_claims where token_hash = 'expired-token-hash'`)).toBe(0);
    expect(await count("service", `public.match_claims where from_user = $1`, [OTHER_GUEST.sub])).toBe(1);
    expect(await count("service", `public.match_claims where from_user = $1`, [CLAIM_GUEST.sub])).toBe(1);
    await expectDbError(claim(C, second), /claim_invalid/);
    expect(await claim(C, third)).toBe(0);
  });

  it("stores only the token's hash", async () => {
    const token = await createToken(GUEST);
    const hash = createHash("sha256").update(token).digest("hex");
    expect(await count("service", `public.match_claims where token_hash = $1`, [hash])).toBe(1);
    expect(await count("service", `public.match_claims where token_hash = $1`, [token])).toBe(0);
    expect(await count(GUEST, "public.match_claims")).toBe(0);
  });
});
