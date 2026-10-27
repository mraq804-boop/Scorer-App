import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { defaultRules, replay } from "@/lib/scoring";
import { LocalDb } from "@/lib/local/db";
import { createLocalMatch, loadEvents } from "@/lib/local/matches";
import type { MatchSetup } from "@/lib/local/matches";
import { squadPlayer } from "../../helpers/team";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TEAM_ID = "11111111-1111-4111-8111-111111111111";
const FIXTURE_ID = "33333333-3333-4333-8333-333333333333";

const opened: LocalDb[] = [];

function freshDb(): LocalDb {
  const db = new LocalDb(`test-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
}

function setup(overrides: Partial<MatchSetup> = {}): MatchSetup {
  return {
    teams: ["Lions", "Tigers"],
    rules: defaultRules("tape", 10),
    toss: { winner: "A", choice: "bat" },
    striker: "Ali",
    nonStriker: "Usman",
    bowler: "Hamza",
    ...overrides,
  };
}

function squad() {
  const [ali, usman, hamza] = ["Ali", "Usman", "Hamza"].map((name) => ({ id: squadPlayer(name).id, name }));
  const spare = { id: squadPlayer("Bilal").id, name: "Bilal" };
  return { ali, usman, hamza, spare, xi: [ali, usman, hamza, spare] };
}

afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

describe("createLocalMatch for a team", () => {
  it("uses the squad ids for the team's batters and wires them into the innings", async () => {
    const db = freshDb();
    const { ali, usman, xi } = squad();

    const match = await createLocalMatch(
      db,
      setup({ striker: ali, nonStriker: usman, bowler: "Kamran", team: { id: TEAM_ID, fixtureId: null, xi } }),
    );
    const events = await loadEvents(db, match.id);
    const added = events.flatMap((event) => (event.type === "player_added" ? [event.player] : []));
    const started = events.find((event) => event.type === "innings_started");

    expect(added.map((player) => player.id).slice(0, 2)).toEqual([ali.id, usman.id]);
    expect(added.map((player) => [player.name, player.team])).toEqual([
      ["Ali", "A"],
      ["Usman", "A"],
      ["Kamran", "B"],
    ]);
    expect(added[2].id).toMatch(UUID);
    expect(xi.map((player) => player.id)).not.toContain(added[2].id);
    expect(started).toMatchObject({ battingTeam: "A", striker: ali.id, nonStriker: usman.id, bowler: added[2].id });
  });

  it("uses the squad id for the opening bowler when the team fields first", async () => {
    const db = freshDb();
    const { hamza, xi } = squad();

    const match = await createLocalMatch(
      db,
      setup({
        toss: { winner: "A", choice: "bowl" },
        striker: "Kamran",
        nonStriker: "Zain",
        bowler: hamza,
        team: { id: TEAM_ID, fixtureId: null, xi },
      }),
    );
    const state = replay(await loadEvents(db, match.id));
    const [innings] = state.innings;

    expect(innings).toMatchObject({ battingTeam: "B", bowlingTeam: "A", bowler: hamza.id });
    expect(state.players[hamza.id]).toEqual({ id: hamza.id, name: "Hamza", team: "A" });
    expect(state.players[innings.striker!].name).toBe("Kamran");
    expect(state.players[innings.striker!].id).toMatch(UUID);
  });

  it("stores the team link with side A, the fixture and the playing XI", async () => {
    const db = freshDb();
    const { ali, usman, xi } = squad();

    const match = await createLocalMatch(
      db,
      setup({ striker: ali, nonStriker: usman, team: { id: TEAM_ID, fixtureId: FIXTURE_ID, xi } }),
    );

    expect(match.team).toEqual({ id: TEAM_ID, side: "A", fixtureId: FIXTURE_ID, xi });
    expect((await db.matches.get(match.id))?.team).toEqual({ id: TEAM_ID, side: "A", fixtureId: FIXTURE_ID, xi });
  });

  it("stores a team link without a fixture as null", async () => {
    const db = freshDb();
    const { ali, usman, xi } = squad();

    const match = await createLocalMatch(db, setup({ striker: ali, nonStriker: usman, team: { id: TEAM_ID, fixtureId: null, xi } }));

    expect(match.team?.fixtureId).toBeNull();
  });

  it("keeps only the id and name of each playing XI player", async () => {
    const db = freshDb();
    const { ali, usman, xi } = squad();
    const withRole = xi.map((player) => ({ ...player, role: "batter", active: true }));

    const match = await createLocalMatch(
      db,
      setup({ striker: ali, nonStriker: usman, team: { id: TEAM_ID, fixtureId: null, xi: withRole } }),
    );

    expect(match.team?.xi).toEqual(xi);
  });
});

describe("createLocalMatch without a team", () => {
  it("gives every typed player a fresh uuid and stores no team link", async () => {
    const db = freshDb();

    const match = await createLocalMatch(db, setup());
    const events = await loadEvents(db, match.id);
    const added = events.flatMap((event) => (event.type === "player_added" ? [event.player] : []));

    expect(added.map((player) => player.name)).toEqual(["Ali", "Usman", "Hamza"]);
    for (const player of added) expect(player.id).toMatch(UUID);
    expect(new Set(added.map((player) => player.id)).size).toBe(3);
    expect(Object.keys(match)).not.toContain("team");
    expect(Object.keys((await db.matches.get(match.id))!)).not.toContain("team");
  });
});
