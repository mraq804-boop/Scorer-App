import type { CachedFixture, CachedTeam } from "@/lib/local/db";
import type { SquadPlayer } from "@/lib/team";

export const TEAM_ID = "11111111-1111-4111-8111-111111111111";
export const FETCHED_AT = "2026-10-27T08:00:00.000Z";

export function squadPlayer(name: string, overrides: Partial<SquadPlayer> = {}): SquadPlayer {
  return { id: crypto.randomUUID(), name, role: null, active: true, ...overrides };
}

export function cachedFixture(overrides: Partial<CachedFixture> = {}): CachedFixture {
  return {
    id: crypto.randomUUID(),
    startsAt: "2026-11-01T09:30:00.000Z",
    opponent: "Tigers",
    ground: null,
    homeAway: null,
    overs: 20,
    status: "scheduled",
    matchCode: null,
    notes: null,
    ...overrides,
  };
}

export function cachedTeam(overrides: Partial<CachedTeam> = {}): CachedTeam {
  return {
    id: TEAM_ID,
    role: "owner",
    code: "abcd2345",
    name: "Lions",
    homeGround: "Gaddafi Stadium",
    timeZone: "Asia/Karachi",
    squad: [squadPlayer("Ali", { role: "batter" }), squadPlayer("Hamza", { role: "bowler" })],
    seasons: [{ id: "22222222-2222-4222-8222-222222222222", name: "2026", startsOn: "2026-01-01", endsOn: "2026-12-31" }],
    fixtures: [cachedFixture()],
    fetchedAt: FETCHED_AT,
    ...overrides,
  };
}
