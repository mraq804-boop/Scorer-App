import { describe, expect, it } from "vitest";
import { t } from "@/lib/i18n";
import { validateFixture, validatePlayer, validateSeason, validateTeam, zonedParts } from "@/lib/validation/team";

function teamErrors(input: Parameters<typeof validateTeam>[0]) {
  const result = validateTeam(input);
  if (result.ok) throw new Error("expected validation to fail");
  return result.errors;
}

function seasonErrors(input: Parameters<typeof validateSeason>[0]) {
  const result = validateSeason(input);
  if (result.ok) throw new Error("expected validation to fail");
  return result.errors;
}

const team = {
  name: "Lions",
  homeGround: "Model Town Ground",
  timeZone: "Asia/Karachi",
};
const player = {
  id: "sq-ali",
  name: "Ali",
  role: "batter" as const,
  active: true,
};
const season = {
  id: "s-winter",
  name: "Winter 2026",
  startsOn: "2026-11-01",
  endsOn: "2027-02-28",
};

describe("validateTeam", () => {
  it("trims the name and ground and keeps the time zone", () => {
    expect(
      validateTeam({
        name: "  Lions ",
        homeGround: " Model Town Ground\t",
        timeZone: "Asia/Karachi",
      }),
    ).toEqual({
      ok: true,
      value: team,
    });
  });

  it("stores a blank home ground as null", () => {
    expect(validateTeam({ ...team, homeGround: "   " })).toEqual({
      ok: true,
      value: { ...team, homeGround: null },
    });
  });

  it("requires a team name", () => {
    expect(teamErrors({ ...team, name: "  " })).toEqual({
      name: t("setup.error.required"),
    });
  });

  it("counts code points: 40 allowed, 41 rejected", () => {
    expect(validateTeam({ ...team, name: "🏏".repeat(40) }).ok).toBe(true);
    expect(teamErrors({ ...team, name: "🏏".repeat(41) })).toEqual({
      name: t("setup.error.tooLong"),
    });
  });

  it("allows a 60-character ground and rejects 61", () => {
    expect(validateTeam({ ...team, homeGround: "g".repeat(60) }).ok).toBe(true);
    expect(teamErrors({ ...team, homeGround: "g".repeat(61) })).toEqual({
      homeGround: t("team.error.groundTooLong"),
    });
  });

  it("rejects a missing or unknown time zone", () => {
    expect(teamErrors({ ...team, timeZone: "" })).toEqual({
      timeZone: t("team.error.timeZone"),
    });
    expect(teamErrors({ ...team, timeZone: "Mars/Olympus" })).toEqual({
      timeZone: t("team.error.timeZone"),
    });
  });
});

describe("validatePlayer", () => {
  it("trims the name and keeps id, role and active", () => {
    expect(validatePlayer({ ...player, name: " Ali  ", active: false })).toEqual({
      ok: true,
      value: { ...player, active: false },
    });
  });

  it("requires a name of at most 40 code points", () => {
    expect(validatePlayer({ ...player, name: "" })).toEqual({
      ok: false,
      errors: { name: t("setup.error.required") },
    });
    expect(validatePlayer({ ...player, name: "ب".repeat(40) }).ok).toBe(true);
    expect(validatePlayer({ ...player, name: "ب".repeat(41) })).toEqual({
      ok: false,
      errors: { name: t("setup.error.tooLong") },
    });
  });
});

describe("validateSeason", () => {
  it("trims the name and accepts a one-day season", () => {
    expect(validateSeason({ ...season, name: " Winter 2026 " })).toEqual({
      ok: true,
      value: season,
    });
    expect(validateSeason({ ...season, endsOn: season.startsOn }).ok).toBe(true);
  });

  it("rejects an end before the start", () => {
    expect(seasonErrors({ ...season, endsOn: "2026-10-31" })).toEqual({
      endsOn: t("team.error.seasonEnd"),
    });
  });

  it("requires real dates", () => {
    expect(seasonErrors({ ...season, startsOn: "", endsOn: "2026-02-30" })).toEqual({
      startsOn: t("team.error.date"),
      endsOn: t("team.error.date"),
    });
    expect(seasonErrors({ ...season, startsOn: "2026/11/01" })).toEqual({
      startsOn: t("team.error.date"),
    });
  });

  it("requires a name of at most 40 code points", () => {
    expect(seasonErrors({ ...season, name: " " })).toEqual({
      name: t("setup.error.required"),
    });
    expect(seasonErrors({ ...season, name: "s".repeat(41) })).toEqual({
      name: t("setup.error.tooLong"),
    });
  });
});

const fixture = {
  id: "f-kites",
  day: "2026-11-01",
  time: "14:30",
  opponent: " Kites ",
  ground: " Model Town ",
  homeAway: "away" as const,
  overs: "15",
  notes: " Bring the new ball ",
  status: "scheduled" as const,
};

function fixtureErrors(input: Parameters<typeof validateFixture>[0], timeZone = "Asia/Karachi") {
  const result = validateFixture(input, timeZone);
  if (result.ok) throw new Error("expected validation to fail");
  return result.errors;
}

describe("validateFixture", () => {
  it("turns the team's local date and time into UTC and trims the text", () => {
    expect(validateFixture(fixture, "Asia/Karachi")).toEqual({
      ok: true,
      value: {
        id: "f-kites",
        startsAt: "2026-11-01T09:30:00.000Z",
        opponent: "Kites",
        ground: "Model Town",
        homeAway: "away",
        overs: 15,
        notes: "Bring the new ball",
        status: "scheduled",
      },
    });
  });

  it("leaves blank optional fields empty", () => {
    expect(validateFixture({ ...fixture, ground: " ", homeAway: "", overs: "", notes: "  " }, "Asia/Karachi")).toMatchObject({
      ok: true,
      value: { ground: null, homeAway: null, overs: null, notes: null },
    });
  });

  it("requires an opponent of at most 40 code points", () => {
    expect(fixtureErrors({ ...fixture, opponent: "  " })).toEqual({ opponent: t("setup.error.required") });
    expect(fixtureErrors({ ...fixture, opponent: "k".repeat(41) })).toEqual({ opponent: t("setup.error.tooLong") });
  });

  it("takes whole overs from 1 to 100", () => {
    expect(validateFixture({ ...fixture, overs: "1" }, "Asia/Karachi").ok).toBe(true);
    expect(validateFixture({ ...fixture, overs: "100" }, "Asia/Karachi").ok).toBe(true);
    for (const overs of ["0", "101", "12.5", "ten"]) {
      expect(fixtureErrors({ ...fixture, overs })).toEqual({ overs: t("setup.error.overs") });
    }
  });

  it("allows 280 characters of notes and rejects 281", () => {
    expect(validateFixture({ ...fixture, notes: "n".repeat(280) }, "Asia/Karachi").ok).toBe(true);
    expect(fixtureErrors({ ...fixture, notes: "n".repeat(281) })).toEqual({ notes: t("team.error.notesTooLong") });
  });

  it("allows a 60-character ground and rejects 61", () => {
    expect(fixtureErrors({ ...fixture, ground: "g".repeat(61) })).toEqual({ ground: t("team.error.groundTooLong") });
  });

  it("requires a real date and time", () => {
    expect(fixtureErrors({ ...fixture, day: "", time: "25:00" })).toEqual({
      day: t("team.error.date"),
      time: t("team.error.time"),
    });
  });

  it("follows daylight saving in the team's time zone", () => {
    expect(validateFixture({ ...fixture, day: "2026-03-28", time: "12:00" }, "Europe/London")).toMatchObject({
      value: { startsAt: "2026-03-28T12:00:00.000Z" },
    });
    expect(validateFixture({ ...fixture, day: "2026-03-29", time: "12:00" }, "Europe/London")).toMatchObject({
      value: { startsAt: "2026-03-29T11:00:00.000Z" },
    });
  });
});

describe("zonedParts", () => {
  it("shows a UTC time as the team's local date and time", () => {
    expect(zonedParts("2026-11-01T09:30:00.000Z", "Asia/Karachi")).toEqual({ day: "2026-11-01", time: "14:30" });
    expect(zonedParts("2026-10-31T20:00:00.000Z", "Asia/Karachi")).toEqual({ day: "2026-11-01", time: "01:00" });
  });
});
