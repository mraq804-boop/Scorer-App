import { describe, expect, it } from "vitest";
import { t } from "@/lib/i18n";
import { validatePlayer, validateSeason, validateTeam } from "@/lib/validation/team";

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
