import { describe, expect, it } from "vitest";
import { parseTeamPage } from "@/lib/team/page-data";

const record = (playedAt: string) => ({
  version: 1,
  side: "A",
  opponent: "Kites",
  playedAt,
  xi: ["sq-ali", "sq-hamza"],
  outcome: "won",
  players: [],
});

const payload = {
  team: { code: "abcd2345", name: "Lions", homeGround: null, timeZone: "Asia/Karachi" },
  squad: [{ id: "sq-ali", name: "Ali", role: "batter", active: true }],
  seasons: [{ id: "s-1", name: "Winter 2026", startsOn: "2026-11-01", endsOn: "2027-02-28" }],
  fixtures: [
    {
      id: "f-1",
      startsAt: "2026-11-08T09:30:00+00:00",
      opponent: "Kites",
      ground: null,
      homeAway: "home",
      overs: 15,
      status: "scheduled",
      matchCode: null,
    },
  ],
  matches: [
    {
      code: "mmmm2222",
      status: "complete",
      summary: { lines: ["Lions 120/4 (15)"], result: "Lions won by 20 runs" },
      resultOverride: null,
      potmPlayerId: null,
      record: record("2026-11-01T10:00:00.000Z"),
      title: "Lions vs Kites",
    },
    {
      code: "mmmm3333",
      status: "in_progress",
      summary: null,
      resultOverride: "no_result",
      potmPlayerId: "sq-ali",
      record: record("2026-11-02T10:00:00.000Z"),
      title: "Lions vs Hawks",
    },
  ],
};

describe("parseTeamPage", () => {
  it("returns null when the team doesn't exist", () => {
    expect(parseTeamPage(null)).toBeNull();
    expect(parseTeamPage({ team: null })).toBeNull();
  });

  it("reads the team, squad, seasons, fixtures and matches, newest match first", () => {
    const page = parseTeamPage(payload);
    expect(page?.team).toEqual(payload.team);
    expect(page?.squad).toEqual(payload.squad);
    expect(page?.seasons).toEqual(payload.seasons);
    expect(page?.fixtures).toEqual(payload.fixtures);
    expect(page?.matches.map((match) => match.code)).toEqual(["mmmm3333", "mmmm2222"]);
    expect(page?.matches[1]).toEqual({
      code: "mmmm2222",
      title: "Lions vs Kites",
      status: "complete",
      resultOverride: null,
      potmPlayerId: null,
      lines: ["Lions 120/4 (15)"],
      result: "Lions won by 20 runs",
      record: record("2026-11-01T10:00:00.000Z"),
    });
    expect(page?.matches[0]).toMatchObject({ lines: [], result: null, resultOverride: "no_result", potmPlayerId: "sq-ali" });
  });

  it("keeps a match whose record is missing or from an unknown version, without the record", () => {
    const page = parseTeamPage({
      ...payload,
      matches: [
        { ...payload.matches[0], code: "nnnn2222", record: null },
        { ...payload.matches[0], code: "nnnn3333", record: { ...record("2026-11-03T10:00:00.000Z"), version: 2 } },
      ],
    });
    expect(page?.matches.map((match) => [match.code, match.record])).toEqual([
      ["nnnn2222", null],
      ["nnnn3333", null],
    ]);
  });

  it("drops rows it can't read", () => {
    const page = parseTeamPage({
      ...payload,
      squad: [...payload.squad, { id: 7 }],
      matches: [...payload.matches, { status: "complete" }],
    });
    expect(page?.squad).toHaveLength(1);
    expect(page?.matches).toHaveLength(2);
  });
});
